import { spawn } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LeaveData } from "@yeoncha/core";
import electronExecutable from "electron";
import {
	type ElectronApplication,
	_electron as electron,
	type Page,
} from "playwright";
import { Temporal } from "temporal-polyfill";
import { afterEach, describe, expect, test } from "vitest";

/** 제품 흐름이 실행할, electron-vite가 만든 메인 프로세스 번들 경로. */
const MAIN_ENTRY = path.resolve(import.meta.dirname, "../out/main/index.js");
/** 개발 의존성으로 설치된 현재 운영체제용 실제 Electron 실행 파일 경로. */
const ELECTRON_EXECUTABLE = electronExecutable;

/** 실제 Electron 제품 흐름에서 셸과 시드를 함께 고정할 조회일. */
const TEST_TODAY = "2025-12-01";
/** 테스트 시드와 같은 조회일의 불변 날짜 객체. */
const TEST_TODAY_DATE = Temporal.PlainDate.from(TEST_TODAY);
/** 시드와 같은 조회일을 실제 Electron의 메인 프로세스에 주입하는 환경. */
const TEST_ENV = {
	...process.env,
	NODE_ENV: "test",
	YEONCHA_TEST_TODAY: TEST_TODAY,
};
/** 긴 발생분 시드가 공유하는 고정 기준 날짜. Temporal 날짜는 불변이라 재사용한다. */
const SUMMARY_GRANT_BASE_DATE = Temporal.PlainDate.from("2000-01-01");

/** 정상 상태에서 요약·이력·설정 탭을 모두 여는 결정론적 저장 데이터. */
const NORMAL_DATA: LeaveData = {
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

/** 오늘 빠른 등록 전후의 잔여와 이력을 확인할 최소 결정론적 저장 데이터. */
const QUICK_ENTRY_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: TEST_TODAY, grantBasis: "hireDate" },
	entries: [],
	adjustments: [
		{
			id: "quick-entry-adjustment",
			grantDate: TEST_TODAY,
			expiryDate: "2026-12-31",
			days: 10,
			note: "빠른 등록 시드",
		},
	],
};

/** 오늘 중복 안내와 다른 날짜 선택을 확인할 저장 데이터. */
const DUPLICATE_ENTRY_DATA: LeaveData = {
	...QUICK_ENTRY_DATA,
	entries: [
		{
			id: "already-taken-today",
			date: TEST_TODAY,
			days: 1,
			note: "이미 등록된 오늘",
		},
	],
};

/** 긴 목록의 위치와 고유 렌더링 key를 검증할 결정론적 저장 데이터. */
const LONG_SUMMARY_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: "2000-01-01", grantBasis: "hireDate" },
	entries: [],
	adjustments: Array.from({ length: 48 }, (_, index) => ({
		id: `summary-adjustment-${index}`,
		grantDate: summaryAdjustmentDate(index),
		expiryDate: "2999-12-31",
		days: 0.25,
		note: "",
	})),
};

/** 긴 목록의 각 조정에 고유한 발생일을 부여해 렌더링 key 충돌을 막는다. */
function summaryAdjustmentDate(index: number): string {
	return SUMMARY_GRANT_BASE_DATE.add({
		months: Math.floor(index / 4),
		days: index % 4,
	}).toString();
}

/** 예정 각주·소멸 임박·서로 다른 수량 폭을 한 화면에서 검증할 저장 데이터. */
const SUMMARY_DATA = summaryData();

/** 초과와 조정 진입 맥락을 검증할 결정론적 저장 데이터. */
const EXCESS_DATA = excessData();

/** 제품 흐름이 남길 첫 화면 스크린샷의 임시 경로. */
const SCREENSHOT_DIRECTORY = path.join(os.tmpdir(), "yeonchamyeotgae-e2e");

/** 실행 하나의 격리된 앱·사용자 데이터·팝오버 페이지 묶음. */
type ProductFlow = {
	/** 실제 Electron 앱 프로세스. */
	app: ElectronApplication;
	/** 사용자가 보는 팝오버 창. */
	page: Page;
	/** 앱이 읽고 쓰는 임시 사용자 데이터 디렉터리. */
	userDataDirectory: string;
};

/** 요약 표·각주·임박 표시를 한 번에 확인할 결정론적 상대 데이터. */
function summaryData(): LeaveData {
	/** 앱과 같은 시간대의 조회일. */
	const today = TEST_TODAY_DATE;
	/** 조회일 전날 — 사용 행을 만드는 날짜. */
	const yesterday = today.subtract({ days: 1 });
	/** 조회일 다음 날 — 미래 발생분의 예정 행을 만드는 날짜. */
	const tomorrow = today.add({ days: 1 });
	/** 현재 살아 있는 조정의 발생일. */
	const currentGrantDate = today.subtract({ days: 10 });
	/** 소멸 임박 조정의 소멸일. */
	const currentExpiryDate = today.add({ days: 30 });
	/** 미래 발생분의 소멸일. 배정 순서가 현재 조정보다 앞서도록 짧게 둔다. */
	const futureExpiryDate = today.add({ days: 15 });
	/** 조회일 입사일 — 계산으로 생기는 발생분 없이 조정 세 건만 검산한다. */
	const hireDate = today;

	return {
		schemaVersion: 1,
		settings: { hireDate: hireDate.toString(), grantBasis: "hireDate" },
		entries: [
			{
				id: "summary-used-entry",
				date: yesterday.toString(),
				days: 2.75,
				note: "사용한 휴가",
			},
			{
				id: "summary-planned-entry",
				date: tomorrow.toString(),
				days: 1.25,
				note: "예정한 휴가",
			},
		],
		adjustments: [
			{
				id: "summary-current-adjustment",
				grantDate: currentGrantDate.toString(),
				expiryDate: currentExpiryDate.toString(),
				days: 15,
				note: "이월",
			},
			{
				id: "summary-second-adjustment",
				grantDate: today.subtract({ days: 5 }).toString(),
				expiryDate: today.add({ days: 45 }).toString(),
				days: 1.5,
				note: "사규 추가분",
			},
			{
				id: "summary-future-adjustment",
				grantDate: tomorrow.toString(),
				expiryDate: futureExpiryDate.toString(),
				days: 5,
				note: "미래 발생분",
			},
		],
	};
}

/** 조정 15일보다 3일 많이 쓴 상태를 만드는 저장 데이터. */
function excessData(): LeaveData {
	/** 앱과 같은 시간대의 조회일. */
	const today = TEST_TODAY_DATE;
	/** 가장 이른 휴가 기록 날짜. */
	const firstEntryDate = today.subtract({ days: 18 });
	/** 조정 소멸일 — 추가 폼이 그대로 물려받을 값. */
	const expiryDate = today.add({ years: 1 }).subtract({ days: 1 });

	return {
		schemaVersion: 1,
		settings: { hireDate: today.toString(), grantBasis: "hireDate" },
		entries: Array.from({ length: 18 }, (_, index) => {
			/** 하루씩 이어지는 휴가 기록 날짜. */
			const date = firstEntryDate.add({ days: index });
			return {
				id: `excess-entry-${index}`,
				date: date.toString(),
				days: 1,
				note: "",
			};
		}),
		adjustments: [
			{
				id: "excess-adjustment",
				grantDate: today.subtract({ days: 30 }).toString(),
				expiryDate: expiryDate.toString(),
				days: 15,
				note: "기존 조정",
			},
		],
	};
}

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

	test("긴 발생분 목록에서도 잔여와 휴가 등록이 최초 뷰포트에 남는다", async () => {
		flow = await launchProductFlow(LONG_SUMMARY_DATA);

		/** 잔여 계산과 기록 시작 행동을 사용자에게 보이는 위치로 찾는다. */
		const balanceBox = await flow.page
			.getByText("잔여", { exact: true })
			.first()
			.boundingBox();
		const entryBox = await flow.page
			.getByRole("button", { name: "휴가 등록" })
			.boundingBox();
		/** 팝오버의 실제 뷰포트 높이. */
		const viewportHeight = await flow.page.evaluate(() => window.innerHeight);
		/** 요약 목록과 팝오버 외부의 스크롤 경계. */
		const grantRegion = flow.page.getByRole("region", {
			name: "살아 있는 발생분",
		});
		const scrollState = await grantRegion.evaluate((element) => ({
			regionScrollable: element.scrollHeight > element.clientHeight,
			pageScrollable:
				document.documentElement.scrollHeight > window.innerHeight,
		}));
		if (!balanceBox || !entryBox) {
			throw new Error("요약의 핵심 요소 위치를 읽지 못했습니다");
		}

		expect(balanceBox.y).toBeGreaterThanOrEqual(0);
		expect(entryBox.y + entryBox.height).toBeLessThanOrEqual(viewportHeight);
		expect(scrollState).toEqual({
			regionScrollable: true,
			pageScrollable: false,
		});
		await expectVisible(flow.page.getByRole("button", { name: "휴가 등록" }));
	});

	test("요약 원장이 고정된 수량 열과 상태 근거를 제공한다", async () => {
		flow = await launchProductFlow(SUMMARY_DATA);

		/** 사용자와 보조 기술이 함께 찾는 요약 원장. */
		const ledger = flow.page.getByRole("table", { name: "잔여 계산" });
		await expectVisible(ledger);
		await expectVisible(flow.page.getByText("13.75일", { exact: true }));

		/** 요약 행별로 확인할 독립적인 계산 결과. */
		const expectedRows = [
			["발생", "16.5"],
			["사용", "2.75"],
			["예정", "0"],
			["잔여", "13.75"],
		] as const;
		for (const [label, value] of expectedRows) {
			/** 라벨과 수량이 한 행에 있는지 확인한다. */
			const row = ledger.getByRole("row").filter({ hasText: label });
			await expectVisible(row);
			expect(await row.getByRole("cell").first().textContent()).toBe(value);
		}

		await expectVisible(
			flow.page.getByText(
				"등록한 예정 1.25일은 전부 아직 생기지 않은 발생분에서 나갑니다 — 지금 잔여에 없습니다",
			),
		);
		await expectVisible(flow.page.getByTitle("소멸 임박, D-30"));
		await expectVisible(flow.page.getByTitle("소멸 임박, D-45"));
		await captureSummaryScreenshot(flow.page);

		/** 모든 요약 행의 수량 셀이 같은 x 좌표에 서는지 확인한다. */
		const cellX = await Promise.all(
			expectedRows.map(
				async ([label]) =>
					(
						await ledger
							.getByRole("row")
							.filter({ hasText: label })
							.getByRole("cell")
							.first()
							.boundingBox()
					)?.x,
			),
		);
		expect(cellX.every((x) => x === cellX[0])).toBe(true);

		/** 서로 다른 길이의 발생분 수량 셀이 같은 열에 서는지 확인한다. */
		const amountLabels = ["12.25/15", "1.5/1.5"] as const;
		const amountX = await Promise.all(
			amountLabels.map(
				async (label) =>
					(await flow.page.getByText(label, { exact: true }).boundingBox())?.x,
			),
		);
		expect(amountX.every((x) => x === amountX[0])).toBe(true);

		/** D-day와 날짜가 바뀌어도 소멸일 셀이 같은 열에 서는지 확인한다. */
		const expiryX = await Promise.all(
			["D-30", "D-45"].map(
				async (label) =>
					(await flow.page.getByTitle(`소멸 임박, ${label}`).boundingBox())?.x,
			),
		);
		expect(expiryX.every((x) => x === expiryX[0])).toBe(true);
	});

	test("오늘 종일 빠른 등록이 두 조작으로 저장되고 잔여·이력을 갱신한다", async () => {
		flow = await launchProductFlow(QUICK_ENTRY_DATA);

		/** 등록 전 잔여. 오늘 조정 10일이 그대로 살아 있다. */
		await expectVisible(flow.page.getByText("10일", { exact: true }));
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();

		/** 기본값과 저장 버튼이 같은 등록면에 있는지 확인한다. */
		const sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await expectVisible(sheet);
		expect(await flow.page.getByLabel("날짜").inputValue()).toBe(TEST_TODAY);
		await expectVisible(flow.page.getByText("오늘", { exact: true }));
		expect(
			await flow.page
				.getByRole("button", { name: "종일", exact: true })
				.getAttribute("aria-pressed"),
		).toBe("true");
		await captureEntryScreenshot(flow.page);

		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		/** 저장 성공을 등록면에서 확인한 뒤 닫힘을 기다린다. */
		await expectVisible(
			flow.page.getByText("저장했습니다. 등록면을 닫습니다.", { exact: true }),
		);
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("9일", { exact: true }));

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await expectVisible(flow.page.getByText(TEST_TODAY, { exact: true }));
		await expectVisible(flow.page.getByText("종일", { exact: true }));
	});

	test("오늘 중복 등록은 막고 같은 등록면에서 다른 날짜를 고르게 한다", async () => {
		flow = await launchProductFlow(DUPLICATE_ENTRY_DATA);

		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		/** 오늘 중복 여부를 확인하고 바꿀 날짜를 입력하는 입력. */
		const dateInput = flow.page.getByLabel("날짜");
		/** 중복 날짜에서 재등록을 막는 버튼. */
		const submit = flow.page.getByRole("button", { name: "등록", exact: true });
		await expectVisible(
			flow.page.getByText(
				"오늘은 이미 휴가 기록이 있습니다. 다른 날짜를 선택하세요.",
			),
		);
		expect(await submit.isDisabled()).toBe(true);
		expect(await dateInput.getAttribute("aria-invalid")).toBe("true");

		await dateInput.fill("2025-12-02");
		expect(await submit.isEnabled()).toBe(true);
		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await expectVisible(flow.page.getByText("8일", { exact: true }));
	});

	test("기존 기간 등록은 같은 등록면에서 주말을 제외하고 여러 기록으로 저장한다", async () => {
		flow = await launchProductFlow(QUICK_ENTRY_DATA);

		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-05");
		await flow.page.getByLabel("종료일").fill("2025-12-09");
		expect(await flow.page.getByLabel("주말 제외").isChecked()).toBe(true);
		await expectVisible(
			flow.page.getByText("휴가 기록 3건을 종일로 등록합니다.", {
				exact: true,
			}),
		);

		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await expectVisible(flow.page.getByText("7일", { exact: true }));
	});

	test("등록면은 키보드로 열고 닫거나 기본값을 저장할 수 있다", async () => {
		flow = await launchProductFlow(QUICK_ENTRY_DATA);

		/** 마우스 없이 등록면을 여는 트리거. */
		const trigger = flow.page.getByRole("button", { name: "휴가 등록" });
		await trigger.focus();
		await trigger.press("Enter");
		/** 열린 등록면의 키보드 닫힘을 확인하는 대화상자. */
		const sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await expectVisible(sheet);
		expect(
			await flow.page
				.getByLabel("날짜")
				.evaluate((element) => element === document.activeElement),
		).toBe(true);

		await flow.page.keyboard.press("Escape");
		await sheet.waitFor({ state: "detached" });

		await trigger.focus();
		await trigger.press("Enter");
		/** 닫은 뒤 다시 연 등록면. */
		const reopenedSheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await expectVisible(reopenedSheet);
		/** 키보드 Enter로 기본 등록을 실행하는 버튼. */
		const submit = flow.page.getByRole("button", { name: "등록", exact: true });
		await submit.focus();
		await submit.press("Enter");
		await reopenedSheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("9일", { exact: true }));
	});

	test("등록 저장 실패 시 같은 등록면의 입력값과 맥락을 유지한다", async () => {
		flow = await launchProductFlow(QUICK_ENTRY_DATA);
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		/** 저장 실패 뒤에도 같은 등록면이 남아 있는지 확인하는 대화상자. */
		const sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		/** 저장 실패 뒤에도 보존되어야 하는 메모 입력. */
		const note = flow.page.getByLabel("메모");
		await note.fill("  저장 실패 뒤에도 남는 메모  ");

		// 저장 파일 디렉터리를 잠가 원자적 쓰기 실패를 실제 Electron 경로에서 만든다.
		await chmod(flow.userDataDirectory, 0o500);
		try {
			await flow.page
				.getByRole("button", { name: "등록", exact: true })
				.click();
			await expectVisible(
				flow.page.getByText(/저장하지 못했습니다/, { exact: false }),
			);
			expect(await sheet.isVisible()).toBe(true);
			expect(await flow.page.getByLabel("날짜").inputValue()).toBe(TEST_TODAY);
			expect(await note.inputValue()).toBe("  저장 실패 뒤에도 남는 메모  ");
			expect(
				await flow.page
					.getByRole("button", { name: "등록", exact: true })
					.isEnabled(),
			).toBe(true);
		} finally {
			await chmod(flow.userDataDirectory, 0o700);
		}
	});

	test("초과 원인에서 조정을 추가하면 현재 날짜 맥락을 보존한다", async () => {
		flow = await launchProductFlow(EXCESS_DATA);
		/** 앱과 같은 시간대의 조회일. */
		const today = TEST_TODAY_DATE;
		/** 기존 살아 있는 조정의 소멸일. */
		const expiryDate = today.add({ years: 1 }).subtract({ days: 1 });

		await expectVisible(
			flow.page.getByText(
				"초과 3일 — 어느 발생분에도 배정되지 못한 휴가입니다",
			),
		);
		/** 초과 수량을 보여주는 요약 행. 조정 폼으로 이동하기 전에 읽는다. */
		const excessRow = flow.page
			.getByRole("table", { name: "잔여 계산" })
			.getByRole("row")
			.filter({ hasText: "초과" });
		await expectVisible(excessRow);
		expect(await excessRow.getByRole("cell").first().textContent()).toBe("3");

		await flow.page.getByRole("button", { name: "조정을 추가" }).click();
		await expectVisible(flow.page.getByRole("tab", { name: "설정" }));
		expect(
			await flow.page
				.getByRole("tab", { name: "설정" })
				.getAttribute("aria-selected"),
		).toBe("true");
		await expectVisible(flow.page.getByRole("button", { name: "추가" }));
		expect(await flow.page.getByLabel("발생일").inputValue()).toBe(
			today.toString(),
		);
		expect(await flow.page.getByLabel("소멸일").inputValue()).toBe(
			expiryDate.toString(),
		);

		// 링크로 들어온 조정 폼은 일반 설정 진입과 구분되어야 한다.
		await flow.page.getByRole("tab", { name: "요약" }).click();
		await flow.page.getByRole("tab", { name: "설정" }).click();
		await expectVisible(flow.page.getByRole("button", { name: "조정 추가" }));
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
		/** 팝오버를 처음에는 숨긴 실제 Electron 앱. */
		app = await electron.launch({
			executablePath: ELECTRON_EXECUTABLE,
			args: [MAIN_ENTRY, `--user-data-dir=${userDataDirectory}`],
			env: TEST_ENV,
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
		const secondary = spawn(
			ELECTRON_EXECUTABLE,
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

/** 승인된 컴프와 비교할 정상 요약 첫 화면을 임시 산출물로 남긴다. */
async function captureSummaryScreenshot(page: Page): Promise<void> {
	/** 기본은 임시 증거이고, 지정하면 리뷰에 남길 저장소 경로를 쓴다. */
	const outputDirectory =
		process.env.YEONCHA_E2E_ARTIFACT_DIR ?? SCREENSHOT_DIRECTORY;
	await mkdir(outputDirectory, { recursive: true });
	/** Playwright가 캡처한 화면 데이터. */
	const screenshot = await page.screenshot();
	/** 승인된 컴프 대조에 사용할 고정된 산출물 위치. */
	const screenshotPath = path.join(outputDirectory, "summary-first-view.png");
	await writeFile(screenshotPath, screenshot);
}

/** 승인된 컴프와 비교할 빠른 등록면을 임시 또는 지정된 증거 폴더에 남긴다. */
async function captureEntryScreenshot(page: Page): Promise<void> {
	/** 기본은 임시 산출물이고, 지정하면 리뷰에 남길 저장소 경로를 쓴다. */
	const outputDirectory =
		process.env.YEONCHA_E2E_ARTIFACT_DIR ?? SCREENSHOT_DIRECTORY;
	await mkdir(outputDirectory, { recursive: true });
	/** Playwright가 캡처한 등록면 데이터. */
	const screenshot = await page.screenshot();
	/** 기본값 검토에 사용할 고정된 산출물 위치. */
	const screenshotPath = path.join(outputDirectory, "quick-entry.png");
	await writeFile(screenshotPath, screenshot);
}

/** 사용자에게 보이는 요소가 나타날 때까지 기다린 뒤 가시성을 확인한다. */
async function expectVisible(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	await locator.waitFor({ state: "visible", timeout: 1_000 });
	expect(await locator.isVisible()).toBe(true);
}
