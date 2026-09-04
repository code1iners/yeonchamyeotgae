import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LeaveData } from "@yeoncha/core";
import electronExecutable from "electron";
import {
	type ElectronApplication,
	_electron as electron,
	type Page,
} from "playwright";
import { expect } from "vitest";

/** 제품 흐름이 실행할, electron-vite가 만든 메인 프로세스 번들 경로. */
const MAIN_ENTRY = path.resolve(import.meta.dirname, "../out/main/index.js");
/** 실제 Electron 제품 흐름에서 셸과 시드를 함께 고정할 조회일. */
const TEST_TODAY = "2025-12-01";
/** 제품 흐름이 창을 비활성 또는 전면으로 표시할 실행 모드. */
type ProductFlowMode = "inactive" | "foreground";
/** 명시적인 제품 실행 명령이 없으면 기존 전면 동작을 유지한다. */
const PRODUCT_FLOW_MODE: ProductFlowMode =
	process.env.YEONCHA_PRODUCT_FLOW_MODE === "inactive"
		? "inactive"
		: "foreground";
/** 시드와 같은 조회일을 실제 Electron의 메인 프로세스에 주입하는 환경. */
const TEST_ENV = {
	...process.env,
	NODE_ENV: "test",
	YEONCHA_TEST_TODAY: TEST_TODAY,
	YEONCHA_PRODUCT_FLOW_MODE: PRODUCT_FLOW_MODE,
};

/** 실행 하나의 격리된 앱·사용자 데이터·팝오버 페이지 묶음. */
export type ProductFlow = {
	/** 실제 Electron 앱 프로세스. */
	app: ElectronApplication;
	/** 사용자가 보는 팝오버 창. */
	page: Page;
	/** 앱이 읽고 쓰는 임시 사용자 데이터 디렉터리. */
	userDataDirectory: string;
};

/** 작업 영역 제한에 따른 팝오버 세로 스크롤을 판정할 실제 측정값. */
export type PopoverLayout = {
	/** 렌더러 문서의 실제 내용 높이(CSS px). */
	contentHeight: number;
	/** Electron 페이지 확대 배율. */
	zoomFactor: number;
	/** 팝오버가 속한 디스플레이 작업 영역 높이(DIP). */
	workAreaHeight: number;
};

/** 현재 내용이 작업 영역 제한으로 잘려 전체 팝오버 스크롤이 필요한지 판정한다. */
export function isPopoverContentCapped(layout: PopoverLayout): boolean {
	return (
		Math.round(layout.contentHeight * layout.zoomFactor) > layout.workAreaHeight
	);
}

/** 렌더러 내용과 네이티브 작업 영역의 세로 크기를 함께 읽는다. */
export async function readPopoverLayout(
	flow: ProductFlow,
): Promise<PopoverLayout> {
	/** 렌더러가 계산한 문서·뷰포트 높이. */
	const contentHeight = await flow.page.evaluate(() =>
		Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
	);
	/** 팝오버가 실제로 사용하는 확대 배율과 디스플레이 작업 영역. */
	const nativeLayout = await flow.app.evaluate(({ BrowserWindow, screen }) => {
		/** 제품 셸이 만든 유일한 팝오버 창. */
		const popover = BrowserWindow.getAllWindows()[0];
		if (!popover) {
			throw new Error("팝오버 창을 찾지 못했습니다");
		}
		/** 팝오버가 속한 디스플레이. */
		const display = screen.getDisplayMatching(popover.getBounds());
		return {
			workAreaHeight: display.workArea.height,
			zoomFactor: popover.webContents.getZoomFactor(),
		};
	});
	return { contentHeight, ...nativeLayout };
}

/** 격리된 사용자 데이터로 실제 빌드 Electron 앱을 연다. */
export async function launchProductFlow(
	seed: LeaveData | string | null,
): Promise<ProductFlow> {
	/** 운영체제의 실제 사용자 프로필과 분리할 임시 앱 데이터 경로. */
	const userDataDirectory = await mkdtemp(
		path.join(os.tmpdir(), "yeoncha-product-flow-"),
	);
	if (seed !== null) {
		await writeFile(
			path.join(userDataDirectory, "data.json"),
			typeof seed === "string" ? seed : JSON.stringify(seed),
			"utf8",
		);
	}

	/** 실행 중 실패해도 정리할 실제 Electron 앱 핸들. */
	let app: ElectronApplication | null = null;
	try {
		app = await electron.launch({
			executablePath: electronExecutable,
			args: [MAIN_ENTRY, `--user-data-dir=${userDataDirectory}`],
			env: TEST_ENV,
		});
		/** 앱이 만든 유일한 팝오버 페이지. */
		const page = await app.firstWindow();
		await page.locator("body").waitFor({ state: "visible" });
		await requestPopoverOpen(userDataDirectory);
		await waitForPopoverVisible(app);
		await expectInactivePopoverUnfocused(app);
		return { app, page, userDataDirectory };
	} catch (error) {
		await app?.close().catch(() => undefined);
		await rm(userDataDirectory, { recursive: true, force: true });
		throw error;
	}
}

/** 제품 흐름의 앱과 임시 사용자 데이터를 함께 정리한다. */
export async function closeProductFlow(flow: ProductFlow): Promise<void> {
	await flow.app.close().catch(() => undefined);
	await rm(flow.userDataDirectory, { recursive: true, force: true });
}

/** 두 번째 앱 실행이라는 실제 제품 경로로 첫 인스턴스의 팝오버 열기를 요청한다. */
async function requestPopoverOpen(userDataDirectory: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		/** 단일 인스턴스 락을 가진 앱에 열기 요청만 전달할 보조 프로세스. */
		const secondary = spawn(
			electronExecutable,
			[MAIN_ENTRY, `--user-data-dir=${userDataDirectory}`],
			{ env: TEST_ENV },
		);
		/** 보조 프로세스가 멈췄을 때 앱과 임시 데이터가 남지 않게 할 제한 시간. */
		const timeout = setTimeout(() => {
			secondary.kill();
			reject(new Error("팝오버 열기 요청이 제한 시간 안에 끝나지 않았습니다"));
		}, 5_000);
		/** 보조 프로세스의 종료 대기와 시간 제한을 함께 끝낸다. */
		const finish = (result: () => void) => {
			clearTimeout(timeout);
			result();
		};
		secondary.once("error", (error) => finish(() => reject(error)));
		secondary.once("exit", (code) => {
			if (code === 0) {
				finish(resolve);
				return;
			}
			finish(() =>
				reject(new Error(`팝오버 열기 요청이 종료 코드 ${code}로 끝났습니다`)),
			);
		});
	});
}

/** 네이티브 blur 이벤트로 팝오버의 실제 닫기 처리기를 실행한다. */
export async function triggerPopoverBlur(
	app: ElectronApplication,
): Promise<void> {
	await app.evaluate(({ BrowserWindow }) => {
		/** 제품 셸이 만든 유일한 팝오버 창. */
		const popover = BrowserWindow.getAllWindows()[0];
		if (!popover) {
			throw new Error("팝오버 창을 찾지 못했습니다");
		}
		popover.emit("blur");
	});
}

/** 팝오버가 운영체제에 실제로 보이는지 확인한다. */
export async function isPopoverVisible(
	app: ElectronApplication,
): Promise<boolean> {
	return app.evaluate(({ BrowserWindow }) => {
		/** 제품 셸이 만든 유일한 창. */
		const popover = BrowserWindow.getAllWindows()[0];
		return popover?.isVisible() ?? false;
	});
}

/** 비활성 제품 흐름에서 팝오버가 포커스를 요청하지 않았는지 확인한다. */
export async function expectInactivePopoverUnfocused(
	app: ElectronApplication,
): Promise<void> {
	if (PRODUCT_FLOW_MODE !== "inactive") {
		return;
	}
	/** 제품 셸 팝오버의 네이티브 포커스 상태. */
	const focused = await app.evaluate(({ BrowserWindow }) => {
		return BrowserWindow.getAllWindows()[0]?.isFocused() ?? false;
	});
	expect(focused).toBe(false);
}

/** 제품 경로가 연 팝오버가 운영체제에 표시될 때까지 기다린다. */
async function waitForPopoverVisible(app: ElectronApplication): Promise<void> {
	// 창 표시 이벤트가 반영될 최대 1초(20회 × 50ms)만 기다린다.
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (await isPopoverVisible(app)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("팝오버가 운영체제에 표시되지 않았습니다");
}

/** 제품 blur 경로가 팝오버를 숨길 때까지 기다린다. */
export async function waitForPopoverHidden(
	app: ElectronApplication,
): Promise<void> {
	// 창 숨김 이벤트가 반영될 최대 1초(20회 × 50ms)만 기다린다.
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await isPopoverVisible(app))) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("팝오버가 blur 뒤에도 숨겨지지 않았습니다");
}

/** 저장 커밋이 임시 파일에 반영되고 난 뒤 조건을 만족하는 데이터를 읽는다. */
export async function waitForStoredData(
	userDataDirectory: string,
	predicate: (data: LeaveData) => boolean,
): Promise<LeaveData> {
	/** 격리 저장 파일 경로. */
	const filePath = path.join(userDataDirectory, "data.json");
	// 원자적 저장 교체 순간의 읽기 실패나 이전 내용은 짧은 간격으로 다시 확인한다.
	for (let attempt = 0; attempt < 20; attempt += 1) {
		try {
			/** 현재 저장 파일. 원자적 교체 중이면 다음 시도에서 다시 읽는다. */
			const data = JSON.parse(await readFile(filePath, "utf8")) as LeaveData;
			if (predicate(data)) {
				return data;
			}
		} catch {
			// 쓰기 교체 순간의 짧은 읽기 실패는 다음 시도에서 확인한다.
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("저장 파일이 예상한 설정으로 갱신되지 않았습니다");
}

/** 사용자에게 보이는 요소가 나타날 때까지 기다린 뒤 가시성을 확인한다. */
export async function expectVisible(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	await locator.waitFor({ state: "visible", timeout: 1_000 });
	expect(await locator.isVisible()).toBe(true);
}

/** 탭 키로 도달한 조작의 실제 포커스와 브라우저의 표시 상태를 함께 확인한다. */
export async function expectKeyboardFocus(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	// 렌더러 효과와 네이티브 창 포커스가 정착될 때까지 확인한다.
	for (let attempt = 0; attempt < 20; attempt += 1) {
		/** 요소가 실제 문서 포커스를 가지고 있는가. */
		const hasFocus = await locator.evaluate(
			(element) => element === document.activeElement,
		);
		/** 브라우저가 키보드 포커스를 사용자에게 표시할 상태인가. */
		const hasVisibleFocus = await locator.evaluate((element) =>
			element.matches(":focus-visible"),
		);
		if (hasFocus && hasVisibleFocus) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("키보드 포커스와 포커스 표시를 확인하지 못했습니다");
}
