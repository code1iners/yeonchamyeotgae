import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import electronExecutable from "electron";
import {
	type ElectronApplication,
	_electron as electron,
	type Page,
} from "playwright";
import { afterEach, describe, expect, test } from "vitest";

/** 제품 흐름이 실행할, electron-vite가 만든 메인 프로세스 번들 경로. */
const MAIN_ENTRY = path.resolve(import.meta.dirname, "../out/main/index.js");
/** 개발 의존성으로 설치된 현재 운영체제용 실제 Electron 실행 파일 경로. */
const ELECTRON_EXECUTABLE = electronExecutable;

/** 정상 상태에서 요약·이력·설정 탭을 모두 여는 결정론적 저장 데이터. */
const NORMAL_DATA = {
	schemaVersion: 1,
	settings: { hireDate: "2020-01-01", grantBasis: "hireDate" },
	entries: [
		{
			id: "99999999-9999-4999-8999-999999999999",
			date: "2025-12-31",
			days: 1,
			note: "연말 휴가",
		},
	],
	adjustments: [],
};

/** 실행 하나의 격리된 앱·사용자 데이터·팝오버 페이지 묶음. */
type ProductFlow = {
	/** 실제 Electron 앱 프로세스. */
	app: ElectronApplication;
	/** 사용자가 보는 팝오버 창. */
	page: Page;
	/** 앱이 읽고 쓰는 임시 사용자 데이터 디렉터리. */
	userDataDirectory: string;
};

/** 현재 테스트가 열어 둔 제품 흐름. 실패해도 afterEach가 반드시 정리한다. */
let flow: ProductFlow | null = null;

afterEach(async () => {
	if (flow) {
		await flow.app.close().catch(() => undefined);
		await rm(flow.userDataDirectory, { recursive: true, force: true });
		flow = null;
	}
});

describe.sequential("Electron 제품 흐름", () => {
	test("공통 팝오버 셸이 제품명과 연결된 탭·패널 및 키보드 이동을 제공한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);

		await expectVisible(flow.page.getByRole("heading", { name: "연차몇개" }));
		await expectVisible(flow.page.getByRole("tablist", { name: "연차 화면" }));
		await flow.page.waitForFunction(
			() => document.documentElement.scrollHeight <= window.innerHeight,
		);
		/** 실제 팝오버 콘텐츠의 외부 치수. */
		const layout = await flow.page.evaluate(() => ({
			width: window.innerWidth,
			height: window.innerHeight,
			contentHeight: document.documentElement.scrollHeight,
		}));
		expect(layout.width).toBe(380);
		expect(layout.contentHeight).toBeLessThanOrEqual(layout.height);

		/** 요약 탭 버튼. */
		const summaryTab = flow.page.getByRole("tab", { name: "요약" });
		/** 이력 탭 버튼. */
		const historyTab = flow.page.getByRole("tab", { name: "이력" });
		/** 각 탭이 실제 패널을 가리키고 패널이 해당 탭으로 이름 붙었는지. */
		const tabPanelLinks = await flow.page.getByRole("tab").evaluateAll((tabs) =>
			tabs.map((tab) => {
				/** 탭이 가리키는 패널 식별자. */
				const controlledPanelId = tab.getAttribute("aria-controls");
				/** 탭이 제어하는 패널. */
				const panel = controlledPanelId
					? document.getElementById(controlledPanelId)
					: null;
				return {
					hasPanel: panel !== null,
					isNamedByTab: panel?.getAttribute("aria-labelledby") === tab.id,
				};
			}),
		);
		expect(tabPanelLinks).toEqual([
			{ hasPanel: true, isNamedByTab: true },
			{ hasPanel: true, isNamedByTab: true },
			{ hasPanel: true, isNamedByTab: true },
		]);

		await summaryTab.focus();
		await summaryTab.press("ArrowRight");
		expect(await historyTab.getAttribute("aria-selected")).toBe("true");
		expect(
			await historyTab.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);
		/** 현재 선택된 탭으로 이름 붙은 활성 패널. */
		const activePanel = await flow.page
			.getByRole("tabpanel")
			.evaluate((panel) => {
				/** 패널 이름의 출처인 탭 식별자. */
				const labelledBy = panel.getAttribute("aria-labelledby");
				/** 패널 이름을 제공하는 탭. */
				const tab = labelledBy ? document.getElementById(labelledBy) : null;
				return {
					label: tab?.textContent,
					selected: tab?.getAttribute("aria-selected"),
				};
			});
		expect(activePanel).toEqual({ label: "이력", selected: "true" });

		await flow.page.emulateMedia({ colorScheme: "dark" });
		await expectVisible(flow.page.getByRole("heading", { name: "연차몇개" }));
		expect(await flow.page.getByRole("tab").count()).toBe(3);
		expect(await historyTab.getAttribute("aria-selected")).toBe("true");
	});

	test("빌드 앱의 팝오버를 열고 닫은 뒤 정상 데이터의 세 탭을 사용자 문구와 역할로 확인한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);

		await expectVisible(flow.page.getByRole("tab", { name: "요약" }));
		await expectVisible(flow.page.getByText("잔여", { exact: true }).first());
		await expectVisible(flow.page.getByText("발생", { exact: true }));
		await expectVisible(flow.page.getByRole("button", { name: "휴가 등록" }));

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await expectVisible(flow.page.getByRole("button", { name: "리스트" }));

		await flow.page.getByRole("tab", { name: "설정" }).click();
		await expectVisible(flow.page.getByText("입사일", { exact: true }));
		await expectVisible(flow.page.getByText("기준방식", { exact: true }));

		expect(await isPopoverVisible(flow.app)).toBe(true);
		await triggerPopoverBlur(flow.app);
		await waitForPopoverHidden(flow.app);
	});

	test("입사일이 없는 격리 데이터에서는 설정 온보딩만 연다", async () => {
		flow = await launchProductFlow(null);

		await expectVisible(
			flow.page.getByText("입사일을 넣으면 연차를 계산합니다."),
		);
		expect(
			await flow.page.getByRole("tab", { name: "요약" }).isDisabled(),
		).toBe(true);
		expect(
			await flow.page.getByRole("tab", { name: "이력" }).isDisabled(),
		).toBe(true);
		expect(await flow.page.getByRole("tab", { name: "설정" }).isEnabled()).toBe(
			true,
		);
	});

	test("읽지 못하는 격리 저장 파일은 복구 화면을 열고 원본을 바꾸지 않는다", async () => {
		flow = await launchProductFlow("{ not valid JSON");

		await expectVisible(flow.page.getByText("저장 파일을 읽지 못했습니다"));
		await expectVisible(
			flow.page.getByText("파일이 JSON 형식이 아니거나 열 수 없습니다."),
		);
		await expectVisible(
			flow.page.getByRole("button", { name: "백업에서 복구" }),
		);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe("{ not valid JSON");
	});
});

/** 격리된 사용자 데이터로 실제 빌드 Electron 앱을 연다. */
async function launchProductFlow(
	seed: typeof NORMAL_DATA | string | null,
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
		/** 팝오버를 처음에는 숨긴 실제 Electron 앱. */
		app = await electron.launch({
			executablePath: ELECTRON_EXECUTABLE,
			args: [MAIN_ENTRY, `--user-data-dir=${userDataDirectory}`],
		});
		/** 앱이 만든 유일한 팝오버 페이지. */
		const page = await app.firstWindow();
		await page.locator("body").waitFor({ state: "visible" });
		await requestPopoverOpen(userDataDirectory);
		await waitForPopoverVisible(app);

		return { app, page, userDataDirectory };
	} catch (error) {
		await app?.close().catch(() => undefined);
		await rm(userDataDirectory, { recursive: true, force: true });
		throw error;
	}
}

/** 두 번째 앱 실행이라는 실제 제품 경로로 첫 인스턴스의 팝오버 열기를 요청한다. */
async function requestPopoverOpen(userDataDirectory: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		/** 단일 인스턴스 락을 가진 앱에 열기 요청만 전달할 보조 프로세스. */
		const secondary = spawn(ELECTRON_EXECUTABLE, [
			MAIN_ENTRY,
			`--user-data-dir=${userDataDirectory}`,
		]);
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
async function triggerPopoverBlur(app: ElectronApplication): Promise<void> {
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
async function isPopoverVisible(app: ElectronApplication): Promise<boolean> {
	return app.evaluate(({ BrowserWindow }) => {
		/** 제품 셸이 만든 유일한 창. */
		const popover = BrowserWindow.getAllWindows()[0];
		return popover?.isVisible() ?? false;
	});
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
async function waitForPopoverHidden(app: ElectronApplication): Promise<void> {
	// 창 숨김 이벤트가 반영될 최대 1초(20회 × 50ms)만 기다린다.
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!(await isPopoverVisible(app))) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("팝오버가 blur 뒤에도 숨겨지지 않았습니다");
}

/** 사용자에게 보이는 요소가 나타날 때까지 기다린 뒤 가시성을 확인한다. */
async function expectVisible(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	await locator.waitFor({ state: "visible", timeout: 1_000 });
	expect(await locator.isVisible()).toBe(true);
}
