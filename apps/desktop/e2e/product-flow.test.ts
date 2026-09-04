import { chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LeaveData } from "@yeoncha/core";
import type { ElectronApplication, Page } from "playwright";
import { Temporal } from "temporal-polyfill";
import { afterEach, describe, expect, test } from "vitest";
import {
	closeProductFlow,
	expectInactivePopoverUnfocused,
	expectKeyboardFocus,
	expectVisible,
	isPopoverContentCapped,
	isPopoverVisible,
	launchProductFlow,
	type ProductFlow,
	readPopoverLayout,
	triggerPopoverBlur,
	waitForPopoverHidden,
	waitForStoredData,
} from "./product-flow-harness";

/** 실제 Electron 제품 흐름에서 셸과 시드를 함께 고정할 조회일. */
const TEST_TODAY = "2025-12-01";
/** 테스트 시드와 같은 조회일의 불변 날짜 객체. */
const TEST_TODAY_DATE = Temporal.PlainDate.from(TEST_TODAY);
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

/** 가져오기 성공 뒤 설정·휴가 기록·조정이 통째로 바뀌는지 확인할 저장 데이터. */
const IMPORTED_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: "2022-05-05", grantBasis: "fiscalYear" },
	entries: [
		{
			id: "imported-entry",
			date: "2025-12-02",
			days: 0.5,
			note: "가져온 기록",
		},
	],
	adjustments: [
		{
			id: "imported-adjustment",
			grantDate: "2025-01-01",
			expiryDate: "2026-12-31",
			days: 7,
			note: "가져온 조정",
		},
	],
};

/** 기준방식 전환에 따른 잔여 재계산을 확인할 설정 데이터. */
const BASIS_CHANGE_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: "2024-07-01", grantBasis: "hireDate" },
	entries: [],
	adjustments: [],
};

/** 새 입사일 이전 휴가 기록·조정을 보존하거나 삭제하는 흐름의 설정 데이터. */
const SETTINGS_IMPACT_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: "2024-01-01", grantBasis: "hireDate" },
	entries: [
		{
			id: "settings-old-entry",
			date: "2024-12-20",
			days: 1,
			note: "이전 입사일의 휴가",
		},
	],
	adjustments: [
		{
			id: "settings-old-adjustment",
			grantDate: "2024-06-01",
			expiryDate: "2025-12-31",
			days: 2,
			note: "이전 입사일의 조정",
		},
	],
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

/** 계산으로 만든 연차와 손으로 넣은 양수 조정을 함께 관리하는 저장 데이터. */
const ADJUSTMENTS_DATA: LeaveData = {
	schemaVersion: 1,
	settings: { hireDate: "2024-01-01", grantBasis: "hireDate" },
	entries: [],
	adjustments: [
		{
			id: "adjustments-existing-positive",
			grantDate: "2025-01-01",
			expiryDate: "2026-12-31",
			days: 4,
			note: "기존 이월",
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

/** 다른 날짜·단위·기간의 저장과 기존 날짜 건너뛰기를 확인할 데이터. */
const EXPANDED_ENTRY_DATA: LeaveData = {
	...QUICK_ENTRY_DATA,
	entries: [
		{
			id: "already-taken-in-range",
			date: "2025-12-05",
			days: 1,
			note: "기존 기록",
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

/** 예정·사용·연차 연도 접기와 인라인 변경을 한 흐름에서 검증할 저장 데이터. */
const HISTORY_DATA = historyData();

/** 달력의 월 이동·상태 문구·소멸 설명·선택 기록 변경을 한 흐름에서 검증할 저장 데이터. */
const CALENDAR_DATA = calendarData();

/** 기록이 길어져도 목록만 스크롤되는지 검증할 저장 데이터. */
const LONG_HISTORY_DATA = longHistoryData();

/** 제품 흐름이 남길 시각 수용 캡처의 기본 임시 경로. */
const SCREENSHOT_DIRECTORY = path.join(os.tmpdir(), "yeonchamyeotgae-e2e");
/** 컴프 대조에 허용하는 결정론적 시각 상태 캡처 이름. */
type VisualScreenshotName =
	| "summary-first-view.png"
	| "summary-first-view-dark.png"
	| "quick-entry.png"
	| "quick-entry-dark.png"
	| "history-edit.png"
	| "history-edit-dark.png";

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

/** 예정·사용·소멸 하단 배치를 한 화면에서 재현하는 이력 시드. */
function historyData(): LeaveData {
	/** 앱과 같은 시간대의 조회일. */
	const today = TEST_TODAY_DATE;
	/** 현재 연차 연도에 속한 사용 기록. */
	const usedDate = today.subtract({ days: 3 });
	/** 이전 연차 연도에 속한 사용 기록. 월차 잔량을 소멸시킨다. */
	const previousYearDate = Temporal.PlainDate.from("2024-12-20");
	/** 예정 기록을 처음 수정할 날짜. */
	const plannedDate = today.add({ days: 14 });

	return {
		schemaVersion: 1,
		settings: { hireDate: "2024-01-01", grantBasis: "hireDate" },
		entries: [
			{
				id: "history-used-current",
				date: usedDate.toString(),
				days: 1,
				note: "현재 연차 사용",
			},
			{
				id: "history-used-previous",
				date: previousYearDate.toString(),
				days: 0.5,
				note: "지난 연차 사용",
			},
			{
				id: "history-planned",
				date: plannedDate.toString(),
				days: 0.25,
				note: "예정 기록",
			},
		],
		adjustments: [],
	};
}

/** 예정·사용·소멸일이 서로 다른 달에 걸리는 달력 검증용 저장 데이터. */
function calendarData(): LeaveData {
	return {
		schemaVersion: 1,
		settings: { hireDate: TEST_TODAY, grantBasis: "hireDate" },
		entries: [
			{
				id: "calendar-used-entry",
				date: "2025-11-28",
				days: 1,
				note: "지난 기록 메모",
			},
			{
				id: "calendar-planned-entry",
				date: "2025-12-15",
				days: 0.5,
				note: "예정 기록 메모",
			},
		],
		adjustments: [
			{
				id: "calendar-living-adjustment",
				grantDate: TEST_TODAY,
				expiryDate: "2026-12-31",
				days: 10,
				note: "달력 현재 발생",
			},
			{
				id: "calendar-expired-adjustment",
				grantDate: "2025-01-01",
				expiryDate: "2025-11-30",
				days: 5,
				note: "이월",
			},
		],
	};
}

/** 예정 기록 여러 건으로 이력 목록의 내부 스크롤을 만드는 시드. */
function longHistoryData(): LeaveData {
	/** 앱과 같은 시간대의 조회일. */
	const today = TEST_TODAY_DATE;
	/** 스크롤 경계를 넘길 예정 기록. */
	const entries = Array.from({ length: 36 }, (_, index) => {
		/** 각 기록의 날짜. */
		const date = today.add({ days: index + 1 });
		return {
			id: `long-history-${index}`,
			date: date.toString(),
			days: 0.25,
			note: "",
		};
	});

	return {
		schemaVersion: 1,
		settings: { hireDate: "2024-01-01", grantBasis: "hireDate" },
		entries,
		adjustments: [],
	};
}

/** 현재 테스트가 열어 둔 제품 흐름. 실패해도 afterEach가 반드시 정리한다. */
let flow: ProductFlow | null = null;

afterEach(async () => {
	if (flow) {
		await closeProductFlow(flow);
		flow = null;
	}
});

describe.sequential("Electron 제품 흐름", () => {
	test("공통 팝오버 셸이 제품명과 연결된 탭·패널 및 키보드 이동을 제공한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);

		await expectVisible(flow.page.getByRole("heading", { name: "연차몇개" }));
		await expectVisible(flow.page.getByRole("tablist", { name: "연차 화면" }));
		await flow.page.waitForFunction(
			() => document.documentElement.scrollHeight === window.innerHeight,
		);
		/** 실제 팝오버 콘텐츠의 외부 치수. */
		const layout = await flow.page.evaluate(() => ({
			width: window.innerWidth,
			height: window.innerHeight,
			contentHeight: document.documentElement.scrollHeight,
		}));
		expect(layout.width).toBe(380);
		expect(layout.contentHeight).toBe(layout.height);

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
		await expectVisible(
			flow.page.getByRole("rowheader", { name: "발생", exact: true }),
		);
		/** 모든 정상 탭에서 같은 위치에 남는 전역 등록 행동과 단축키 안내. */
		const entryTrigger = flow.page.getByRole("button", { name: "휴가 등록" });
		await expectVisible(entryTrigger);
		await expectVisible(flow.page.getByText("단축키 ⌘⇧N", { exact: true }));

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await expectVisible(flow.page.getByRole("button", { name: "리스트" }));
		await expectVisible(entryTrigger);

		await flow.page.getByRole("tab", { name: "설정" }).click();
		await expectVisible(flow.page.getByText("입사일", { exact: true }));
		await expectVisible(flow.page.getByText("기준방식", { exact: true }));
		await expectVisible(entryTrigger);

		expect(await isPopoverVisible(flow.app)).toBe(true);
		await triggerPopoverBlur(flow.app);
		await waitForPopoverHidden(flow.app);
	});

	test("용어 도움말과 앱 단축키가 맥락·입력 포커스를 보존한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);

		/** 헤더의 공통 단축키 도움말 버튼. */
		const shortcutHelp = flow.page.getByRole("button", {
			name: "단축키 도움말",
		});
		await shortcutHelp.click();
		/** 헤더 도움말에서 실제로 읽을 수 있는 설명. */
		const shortcutTooltip = flow.page
			.getByRole("tooltip")
			.filter({ hasText: "휴가 등록" });
		await expectVisible(shortcutTooltip);
		expect(await shortcutHelp.getAttribute("aria-expanded")).toBe("true");
		const tooltipId = await shortcutTooltip.getAttribute("id");
		expect(await shortcutHelp.getAttribute("aria-describedby")).toBe(tooltipId);
		await flow.page.keyboard.press("Escape");
		expect(await shortcutHelp.getAttribute("aria-expanded")).toBe("false");
		expect(
			await shortcutHelp.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);

		/** 전역 등록 단축키는 등록면을 열고, Escape 뒤 헤더 트리거로 돌아온다. */
		const entryTrigger = flow.page.getByRole("button", { name: "휴가 등록" });
		const entryShortcutResult = await flow.page.evaluate(() => {
			const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
			const event = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "KeyN",
				ctrlKey: !mac,
				metaKey: mac,
				shiftKey: true,
			});
			window.dispatchEvent(event);
			return event.defaultPrevented;
		});
		expect(entryShortcutResult).toBe(true);
		const shortcutEntrySheet = flow.page.getByRole("dialog", {
			name: "휴가 등록",
		});
		await expectVisible(shortcutEntrySheet);
		await flow.page.keyboard.press("Escape");
		await shortcutEntrySheet.waitFor({ state: "detached" });
		await expectKeyboardFocus(entryTrigger);

		/** 요약 행의 발생 설명 버튼. focus만으로도 같은 용어의 도움말이 열린다. */
		const grantedHelp = flow.page.getByRole("button", { name: "발생 도움말" });
		await grantedHelp.focus();
		await expectVisible(
			flow.page.getByRole("tooltip").filter({ hasText: "근속에 따라" }),
		);
		/** focus 이동으로 설명을 먼저 닫고 포커스된 탭을 키보드로 활성화한다. */
		const historyTab = flow.page.getByRole("tab", { name: "이력" });
		await historyTab.focus();
		await flow.page
			.getByRole("tooltip")
			.filter({ hasText: "근속에 따라" })
			.waitFor({ state: "hidden" });
		await historyTab.press("Enter");
		expect(await grantedHelp.count()).toBe(0);
		expect(
			await flow.page
				.getByRole("tooltip")
				.filter({ hasText: "근속에 따라" })
				.count(),
		).toBe(0);

		/** 비편집 영역에서 물리 코드 단축키를 보내면 해당 탭으로 이동한다. */
		const shortcutResult = await flow.page.evaluate(() => {
			const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
			const event = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "Digit1",
				ctrlKey: !mac,
				metaKey: mac,
				shiftKey: true,
			});
			window.dispatchEvent(event);
			return event.defaultPrevented;
		});
		expect(shortcutResult).toBe(true);
		expect(
			await flow.page
				.getByRole("tab", { name: "요약" })
				.getAttribute("aria-selected"),
		).toBe("true");

		/** 입력 포커스 중 같은 조합은 앱 단축키가 가로채지 않는다. */
		await flow.page.getByRole("tab", { name: "설정" }).click();
		const hireDate = flow.page.getByLabel("입사일");
		await hireDate.focus();
		const editableShortcutResult = await hireDate.evaluate((input) => {
			const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
			const event = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				code: "Digit1",
				ctrlKey: !mac,
				metaKey: mac,
				shiftKey: true,
			});
			input.dispatchEvent(event);
			return event.defaultPrevented;
		});
		expect(editableShortcutResult).toBe(false);
		expect(
			await flow.page
				.getByRole("tab", { name: "설정" })
				.getAttribute("aria-selected"),
		).toBe("true");
	}, 60_000);

	test("설정에서 기준방식 설명·유효성·저장 후 잔여 재계산을 확인한다", async () => {
		flow = await launchProductFlow(BASIS_CHANGE_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 원장형 설정의 입사일 입력. */
		const hireDate = flow.page.getByLabel("입사일");
		/** 원장형 설정의 기준방식 선택. */
		const grantBasis = flow.page.getByLabel("기준방식");
		/** 저장 전후 상태를 말하는 버튼. */
		const save = flow.page.getByRole("button", { name: "저장", exact: true });

		await expectVisible(flow.page.getByRole("heading", { name: "기본 설정" }));
		expect(await hireDate.inputValue()).toBe("2024-07-01");
		expect(await grantBasis.inputValue()).toBe("hireDate");
		expect(await save.isDisabled()).toBe(true);
		expect(await hireDate.getAttribute("aria-invalid")).toBe("false");
		await expectVisible(
			flow.page.getByText("변경한 값이 없습니다.", { exact: true }),
		);
		await expectVisible(
			flow.page.getByText(/첫 연차는 입사 1년 뒤에 생깁니다\./),
		);

		// 빈 입사일은 저장을 막고 입력과 안내를 보조 기술에 연결한다.
		await hireDate.fill("");
		expect(await save.isDisabled()).toBe(true);
		expect(await hireDate.getAttribute("aria-invalid")).toBe("true");
		await expectVisible(
			flow.page.getByText("입사일을 입력하면 저장할 수 있습니다.", {
				exact: true,
			}),
		);
		expect(await hireDate.getAttribute("aria-describedby")).toContain(
			"settings-save-status",
		);

		await hireDate.fill("2024-07-01");
		await grantBasis.selectOption("fiscalYear");
		await expectVisible(
			flow.page.getByText(
				"회사에서 연차 발생을 1월 1일에 한꺼번에 계산한다면 이 방식을 고르세요.",
				{ exact: false },
			),
		);
		expect(await save.isEnabled()).toBe(true);
		expect(await grantBasis.getAttribute("aria-describedby")).toContain(
			"settings-grant-basis-help",
		);

		await save.click();
		await expectVisible(flow.page.getByText("7.5일", { exact: true }));
		expect(await grantBasis.inputValue()).toBe("fiscalYear");
		await expectVisible(
			flow.page.getByText("설정을 저장했습니다.", { exact: true }),
		);
	}, 60_000);

	test("입사일 변경에서 기록 보존과 삭제를 고르고 삭제 전 백업을 확인한다", async () => {
		flow = await launchProductFlow(SETTINGS_IMPACT_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 변경할 입사일 입력. */
		const hireDate = flow.page.getByLabel("입사일");
		/** 변경 전에는 비활성이고, 날짜가 달라지면 활성화되는 저장 버튼. */
		const save = flow.page.getByRole("button", { name: "저장", exact: true });
		await hireDate.fill("2025-01-01");
		await save.click();

		/** 영향을 받는 기록을 보여 주는 확인 제목. */
		const confirmTitle = flow.page.getByRole("heading", {
			name: "입사일 변경 확인",
		});
		/** 키보드와 보조 기술이 읽기 시작할 확인 영역. */
		const confirmRegion = flow.page.getByRole("region", {
			name: "입사일 변경 확인",
		});
		await expectVisible(confirmTitle);
		expect(
			await confirmRegion.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);
		await expectVisible(
			flow.page.getByText(
				"새 입사일 이전의 휴가 기록 1건과 조정 1건이 있습니다.",
				{ exact: true },
			),
		);
		await expectVisible(
			confirmRegion.getByText(
				/지우고 저장을 선택하면 교체 직전 상태를 자동 백업 파일에.*data\.json\.bak.*남겨두면/,
			),
		);

		// 취소하면 다음 키 입력이 입사일 입력으로 이어진다.
		await flow.page.getByRole("button", { name: "취소", exact: true }).click();
		await confirmTitle.waitFor({ state: "detached" });
		expect(
			await hireDate.evaluate((element) => element === document.activeElement),
		).toBe(true);
		await save.click();
		await expectVisible(confirmTitle);
		expect(
			await confirmRegion.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);

		// 보존을 고르면 파일의 기존 기록은 남고 백업은 만들지 않는다.
		await flow.page.getByRole("button", { name: "남기고 저장" }).click();
		await confirmTitle.waitFor({ state: "detached" });
		expect(
			await hireDate.evaluate((element) => element === document.activeElement),
		).toBe(true);
		/** 보존 선택 후 저장된 데이터. */
		const kept = await waitForStoredData(
			flow.userDataDirectory,
			(data) => data.settings.hireDate === "2025-01-01",
		);
		expect(kept.entries).toHaveLength(1);
		expect(kept.adjustments).toHaveLength(1);

		// 다시 입사일을 옮긴 뒤 삭제를 고르면 새 설정과 남길 기록만 저장된다.
		await hireDate.fill("2025-06-01");
		await save.click();
		await expectVisible(confirmTitle);
		await flow.page.getByRole("button", { name: "지우고 저장" }).click();
		await confirmTitle.waitFor({ state: "detached" });
		expect(
			await hireDate.evaluate((element) => element === document.activeElement),
		).toBe(true);

		/** 삭제 선택 후 저장된 데이터. */
		const deleted = await waitForStoredData(
			flow.userDataDirectory,
			(data) => data.settings.hireDate === "2025-06-01",
		);
		expect(deleted.entries).toHaveLength(0);
		expect(deleted.adjustments).toHaveLength(0);
		/** 삭제 직전에 남은 백업 원본. */
		const backup = JSON.parse(
			await readFile(
				path.join(flow.userDataDirectory, "data.json.bak"),
				"utf8",
			),
		) as LeaveData;
		expect(backup.settings.hireDate).toBe("2025-01-01");
		expect(backup.entries).toHaveLength(1);
		expect(backup.adjustments).toHaveLength(1);

		// 삭제 후 상태 푸시로 이력도 즉시 다시 계산된다.
		await flow.page.getByRole("tab", { name: "이력" }).click();
		expect(
			await flow.page.getByText("2024-12-20", { exact: true }).count(),
		).toBe(0);
	}, 60_000);

	test("설정 저장 실패 시 입력값·설명·재시도 경로를 유지한다", async () => {
		flow = await launchProductFlow(BASIS_CHANGE_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 저장에 실패할 기준방식 초안. */
		const grantBasis = flow.page.getByLabel("기준방식");
		await grantBasis.selectOption("fiscalYear");

		// 저장 파일 디렉터리를 잠가 원자적 쓰기 실패를 실제 Electron 경로에서 만든다.
		await chmod(flow.userDataDirectory, 0o500);
		try {
			await flow.page
				.getByRole("button", { name: "저장", exact: true })
				.click();
			await expectVisible(
				flow.page.getByRole("alert").filter({ hasText: "저장하지 못했습니다" }),
			);
			expect(await grantBasis.inputValue()).toBe("fiscalYear");
			expect(
				await flow.page
					.getByRole("button", { name: "저장", exact: true })
					.isEnabled(),
			).toBe(true);
			expect(
				await flow.page
					.getByRole("form", { name: "설정 저장" })
					.getAttribute("aria-busy"),
			).toBe("false");
		} finally {
			await chmod(flow.userDataDirectory, 0o700);
		}
	}, 60_000);

	test("설정의 데이터 관리가 저장 파일과 가져올 파일 행동을 구분한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안에서 데이터 조작만 묶은 접근 가능한 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		await expectVisible(dataSection);
		await expectVisible(dataSection.getByRole("heading", { name: "데이터" }));
		await expectVisible(dataSection.getByText("저장 파일", { exact: true }));
		await expectVisible(
			dataSection.getByText("가져올 저장 파일", { exact: true }),
		);
		await expectVisible(
			dataSection.getByRole("button", { name: "파일 위치 열기" }),
		);
		await expectVisible(dataSection.getByRole("button", { name: "내보내기" }));
		await expectVisible(dataSection.getByRole("button", { name: "가져오기" }));
	});

	test("데이터 내보내기의 완료·취소·실패를 같은 화면에 설명하고 설정을 보존한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안의 데이터 조작 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		/** 내보내기 전 저장 파일 원문. 내보내기는 이 바이트를 그대로 복사해야 한다. */
		const originalRaw = await readFile(
			path.join(flow.userDataDirectory, "data.json"),
			"utf8",
		);
		/** 사용자가 고른 정상적인 내보내기 경로. */
		const exportPath = path.join(flow.userDataDirectory, "exported.json");
		/** 내보내기 뒤에도 유지되어야 하는 설정 입력. */
		const hireDate = flow.page.getByLabel("입사일");
		const grantBasis = flow.page.getByLabel("기준방식");

		await mockSaveDialog(flow.app, { canceled: false, filePath: exportPath });
		await dataSection.getByRole("button", { name: "내보내기" }).click();
		await expectVisible(
			dataSection
				.getByRole("status")
				.filter({ hasText: "내보내기를 완료했습니다" }),
		);
		await expectVisible(dataSection.getByText(exportPath, { exact: true }));
		await expectInactivePopoverUnfocused(flow.app);
		expect(await readFile(exportPath, "utf8")).toBe(originalRaw);
		expect(await hireDate.inputValue()).toBe("2020-01-01");
		expect(await grantBasis.inputValue()).toBe("hireDate");
		expect(
			await dataSection
				.getByRole("button", { name: "내보내기" })
				.evaluate((element) => element === document.activeElement),
		).toBe(true);

		await mockSaveDialog(flow.app, { canceled: true, filePath: "" });
		await dataSection.getByRole("button", { name: "내보내기" }).click();
		await expectVisible(
			dataSection
				.getByRole("status")
				.filter({ hasText: "내보내기를 취소했습니다" }),
		);
		await expectInactivePopoverUnfocused(flow.app);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);
		expect(
			await dataSection
				.getByRole("button", { name: "내보내기" })
				.evaluate((element) => element === document.activeElement),
		).toBe(true);

		/** 파일 대신 디렉터리를 골라 쓰기 실패를 만든 경로. */
		const failedExportPath = path.join(
			flow.userDataDirectory,
			"export-directory",
		);
		await mkdir(failedExportPath);
		await mockSaveDialog(flow.app, {
			canceled: false,
			filePath: failedExportPath,
		});
		await dataSection.getByRole("button", { name: "내보내기" }).click();
		await expectVisible(
			dataSection.getByRole("alert").filter({ hasText: "내보내지 못했습니다" }),
		);
		await expectVisible(
			dataSection
				.getByRole("alert")
				.filter({ hasText: "다른 위치를 선택해 다시 시도하세요." }),
		);
		await expectInactivePopoverUnfocused(flow.app);
		expect(await hireDate.inputValue()).toBe("2020-01-01");
		expect(await grantBasis.inputValue()).toBe("hireDate");
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);
	}, 60_000);

	test("저장 파일 위치 열기는 파일 관리자 호출을 마치고 같은 화면에 결과를 남긴다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안에서 파일 위치를 여는 데이터 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		/** OS 파일 관리자에 넘겨야 하는 저장 파일 경로. */
		const dataPath = await realpath(
			path.join(flow.userDataDirectory, "data.json"),
		);
		await mockRevealDataFile(flow.app);

		await dataSection.getByRole("button", { name: "파일 위치 열기" }).click();
		await expectVisible(
			dataSection
				.getByRole("status")
				.filter({ hasText: "파일 위치를 열었습니다" }),
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(await isPopoverVisible(flow.app)).toBe(true);
		await expectInactivePopoverUnfocused(flow.app);
		expect(await readRevealedPath(flow.app)).toBe(dataPath);
		expect(
			await dataSection
				.getByRole("button", { name: "파일 위치 열기" })
				.evaluate((element) => element === document.activeElement),
		).toBe(true);
	}, 60_000);

	test("데이터 가져오기 확인과 취소는 원본·화면을 보존하고 성공 뒤 전체 상태를 갱신한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안의 데이터 조작 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		/** 가져오기 전 저장 파일 원문. 백업으로도 같은 원문을 보존해야 한다. */
		const originalRaw = await readFile(
			path.join(flow.userDataDirectory, "data.json"),
			"utf8",
		);
		/** 가져오기 대화상자가 반환할 정상 파일. */
		const importPath = path.join(flow.userDataDirectory, "import.json");
		await writeFile(importPath, JSON.stringify(IMPORTED_DATA), "utf8");
		/** 성공 뒤 셸 상태 푸시로 바뀌어야 하는 설정 필드. */
		const hireDate = flow.page.getByLabel("입사일");
		const grantBasis = flow.page.getByLabel("기준방식");
		/** 가져오기 버튼. 확인을 취소하거나 대화상자가 끝난 뒤 같은 자리에 돌아온다. */
		const importButton = dataSection.getByRole("button", { name: "가져오기" });

		await importButton.click();
		/** 파일을 고르기 전에 전체 교체와 백업을 설명하는 확인 영역. */
		const confirmation = dataSection.getByRole("region", {
			name: "가져오기 확인",
		});
		await expectVisible(confirmation);
		await expectVisible(
			confirmation.getByText("지금 데이터가 대체됩니다.", { exact: true }),
		);
		await expectVisible(
			confirmation.getByText(
				/교체 직전 상태를 자동 백업 파일에.*data\.json\.bak/,
			),
		);
		expect(
			await confirmation.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);

		await confirmation
			.getByRole("button", { name: "취소", exact: true })
			.click();
		await confirmation.waitFor({ state: "detached" });
		expect(
			await importButton.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);

		// 확인을 통과한 뒤 네이티브 파일 선택을 취소해도 현재 화면과 원본은 그대로다.
		await importButton.click();
		await mockOpenDialog(flow.app, { canceled: true, filePaths: [] });
		await dataSection
			.getByRole("region", { name: "가져오기 확인" })
			.getByRole("button", { name: "파일 고르고 대체" })
			.click();
		await expectVisible(importButton);
		await expectInactivePopoverUnfocused(flow.app);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);
		expect(
			await importButton.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);

		await importButton.click();
		await mockOpenDialog(flow.app, {
			canceled: false,
			filePaths: [importPath],
		});
		await dataSection
			.getByRole("region", { name: "가져오기 확인" })
			.getByRole("button", { name: "파일 고르고 대체" })
			.click();
		await expectVisible(
			dataSection
				.getByRole("status")
				.filter({ hasText: "가져오기를 완료했습니다" }),
		);
		await expectVisible(
			dataSection.getByRole("status").filter({ hasText: importPath }),
		);
		await expectVisible(importButton);
		await expectInactivePopoverUnfocused(flow.app);
		expect(await hireDate.inputValue()).toBe("2022-05-05");
		expect(await grantBasis.inputValue()).toBe("fiscalYear");
		expect(JSON.parse(await readFile(importPath, "utf8"))).toEqual(
			IMPORTED_DATA,
		);
		expect(
			JSON.parse(
				await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
			),
		).toEqual(IMPORTED_DATA);
		expect(
			await readFile(
				path.join(flow.userDataDirectory, "data.json.bak"),
				"utf8",
			),
		).toBe(originalRaw);
		expect(
			await importButton.evaluate(
				(element) => element === document.activeElement,
			),
		).toBe(true);
	}, 60_000);

	test("가져오기 실패는 원본을 덮지 않고 파일 종류별 다음 행동을 설명한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안의 데이터 조작 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		/** 실패 전 원본 저장 파일. 세 종류의 실패 뒤에도 같아야 한다. */
		const originalRaw = await readFile(
			path.join(flow.userDataDirectory, "data.json"),
			"utf8",
		);
		/** JSON 파싱 자체가 실패하는 파일. */
		const invalidPath = path.join(flow.userDataDirectory, "invalid.json");
		/** 저장 형식 필드가 빠진 파일. */
		const mismatchPath = path.join(flow.userDataDirectory, "mismatch.json");
		/** 현재 앱보다 높은 저장 형식 버전의 파일. */
		const futurePath = path.join(flow.userDataDirectory, "future.json");
		await writeFile(invalidPath, "{ not valid JSON", "utf8");
		await writeFile(
			mismatchPath,
			JSON.stringify({ schemaVersion: 1, entries: [], adjustments: [] }),
			"utf8",
		);
		await writeFile(futurePath, JSON.stringify({ schemaVersion: 2 }), "utf8");
		/** 파일을 고르고 확인하는 제품 경계를 반복하는 작은 흐름. */
		const chooseImportFile = async (sourcePath: string) => {
			await dataSection.getByRole("button", { name: "가져오기" }).click();
			await mockOpenDialog(flow.app, {
				canceled: false,
				filePaths: [sourcePath],
			});
			await dataSection
				.getByRole("region", { name: "가져오기 확인" })
				.getByRole("button", { name: "파일 고르고 대체" })
				.click();
		};

		await chooseImportFile(invalidPath);
		await expectVisible(
			dataSection
				.getByRole("alert")
				.filter({ hasText: "고른 파일이 JSON이 아닙니다" }),
		);
		await expectVisible(
			dataSection
				.getByRole("alert")
				.filter({ hasText: "다른 저장 파일을 골라 다시 시도하세요" }),
		);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);
		await expect(
			readFile(path.join(flow.userDataDirectory, "data.json.bak"), "utf8"),
		).rejects.toThrow();

		await chooseImportFile(mismatchPath);
		await expectVisible(
			dataSection
				.getByRole("alert")
				.filter({ hasText: "고른 파일의 구조가 저장 형식과 다릅니다" }),
		);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);

		await chooseImportFile(futurePath);
		await expectVisible(
			dataSection
				.getByRole("alert")
				.filter({ hasText: "고른 파일이 더 새 버전입니다" }),
		);
		await expectVisible(
			dataSection.getByRole("alert").filter({ hasText: "앱을 업데이트하세요" }),
		);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe(originalRaw);
	}, 60_000);

	test("데이터 대화상자 진행 중에는 모든 조작을 잠그고 팝오버를 유지한다", async () => {
		flow = await launchProductFlow(NORMAL_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 안의 데이터 조작 영역. */
		const dataSection = flow.page.getByRole("region", { name: "데이터" });
		/** 진행 중인 내보내기를 시작할 버튼. */
		const exportButton = dataSection.getByRole("button", { name: "내보내기" });
		await holdSaveDialog(flow.app);
		await exportButton.click();

		await expectVisible(
			dataSection.getByRole("status").filter({ hasText: "내보내는 중입니다" }),
		);
		expect(await dataSection.getAttribute("aria-busy")).toBe("true");
		/** 데이터 조작 버튼 수. 저장 파일 두 개와 가져오기 하나다. */
		const dataButtons = dataSection.getByRole("button");
		expect(await dataButtons.count()).toBe(3);
		// 하나의 네이티브 대화상자에 머무는 동안 충돌하는 세 조작을 모두 막는다.
		expect(
			await dataButtons.evaluateAll((buttons) =>
				buttons.every((button) => button.matches(":disabled")),
			),
		).toBe(true);

		await triggerPopoverBlur(flow.app);
		expect(await isPopoverVisible(flow.app)).toBe(true);
	}, 60_000);

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
		await flow.page.waitForFunction(
			() => document.body.scrollHeight === window.innerHeight,
		);
		/** 긴 요약이 맞춘 팝오버의 외부 높이와 문서 높이. */
		const longSummaryLayout = await flow.page.evaluate(() => ({
			height: window.innerHeight,
			contentHeight: document.body.scrollHeight,
		}));
		expect(longSummaryLayout.contentHeight).toBe(longSummaryLayout.height);
		/** 긴 요약에서 핵심 행동의 실제 뷰포트 높이. */
		const viewportHeight = longSummaryLayout.height;
		/** 요약 목록과 팝오버 외부의 스크롤 경계. */
		const grantRegion = flow.page.getByRole("region", {
			name: "발생분 목록",
			exact: true,
		});
		const scrollState = await grantRegion.evaluate((element) => ({
			regionScrollable: element.scrollHeight > element.clientHeight,
			pageScrollable: document.body.scrollHeight > window.innerHeight,
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
		await expectVisible(flow.page.getByText("출처", { exact: true }));
		await expectVisible(flow.page.getByText("남은 양/총량", { exact: true }));
		await expectVisible(
			flow.page.getByText("소멸일 또는 소멸까지", { exact: true }),
		);

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await flow.page.waitForFunction(
			(previousHeight) =>
				document.body.scrollHeight === window.innerHeight &&
				window.innerHeight !== previousHeight,
			longSummaryLayout.height,
		);
		/** 이력 탭으로 내용이 바뀐 뒤의 팝오버 외부 높이. */
		const historyHeight = await flow.page.evaluate(() => window.innerHeight);
		expect(historyHeight).not.toBe(longSummaryLayout.height);
	});

	test("200% 확대에서도 요약의 핵심 행동과 발생분 머리를 유지한다", async () => {
		flow = await launchProductFlow(SUMMARY_DATA);
		await flow.app.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
		});

		/** 확대 후에도 사용자가 먼저 만나는 핵심 행동과 계산 근거. */
		const balanceBox = await flow.page
			.getByText("잔여", { exact: true })
			.first()
			.boundingBox();
		const entryBox = await flow.page
			.getByRole("button", { name: "휴가 등록" })
			.boundingBox();
		await expectVisible(
			flow.page.getByText("발생 − 사용 − 예정 = 잔여", { exact: true }),
		);
		await expectVisible(
			flow.page.getByText("소멸일 또는 소멸까지", { exact: true }),
		);
		const equationBox = await flow.page
			.getByText("발생 − 사용 − 예정 = 잔여", { exact: true })
			.boundingBox();
		const grantHeaderBox = await flow.page
			.getByText("소멸일 또는 소멸까지", { exact: true })
			.boundingBox();
		if (!balanceBox || !entryBox || !equationBox || !grantHeaderBox) {
			throw new Error("200% 확대 뒤 요약의 핵심 요소 위치를 읽지 못했습니다");
		}
		const layout = await flow.page.evaluate(() => ({
			width: window.innerWidth,
			height: window.innerHeight,
			bodyWidth: document.body.scrollWidth,
			bodyHeight: document.body.scrollHeight,
			bodyOverflowX: getComputedStyle(document.body).overflowX,
			bodyOverflowY: getComputedStyle(document.body).overflowY,
		}));
		/** 작업 영역이 부족할 때 전체 팝오버 스크롤이 허용되는지 확인할 측정값. */
		const popoverLayout = await readPopoverLayout(flow);
		expect(layout.bodyWidth).toBeLessThanOrEqual(layout.width);
		expect(layout.bodyHeight > layout.height).toBe(
			isPopoverContentCapped(popoverLayout),
		);
		expect(layout.bodyOverflowX).toBe("hidden");
		expect(layout.bodyOverflowY).toBe("auto");
		for (const box of [balanceBox, entryBox, equationBox, grantHeaderBox]) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
		}
	}, 60_000);

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
			const row = ledger
				.getByRole("rowheader", { name: label, exact: true })
				.locator("xpath=..");
			await expectVisible(row);
			expect(await row.getByRole("cell").first().textContent()).toBe(value);
		}

		await expectVisible(
			flow.page.getByText("등록 예정 총 1.25일 · 잔여 미반영 1.25일"),
		);
		await expectVisible(
			flow.page.getByText("발생 − 사용 − 예정 = 잔여", { exact: true }),
		);
		await expectVisible(
			flow.page.getByText(TEST_TODAY_DATE.add({ days: 30 }).toString(), {
				exact: true,
			}),
		);
		await expectVisible(
			flow.page.getByText(TEST_TODAY_DATE.add({ days: 45 }).toString(), {
				exact: true,
			}),
		);
		await expectVisible(flow.page.getByTitle("소멸 임박, D-30"));
		await expectVisible(flow.page.getByTitle("소멸 임박, D-45"));
		await flow.page.emulateMedia({ colorScheme: "light" });
		await captureSummaryScreenshot(flow.page);
		await flow.page.emulateMedia({ colorScheme: "dark" });
		await captureDarkSummaryScreenshot(flow.page);

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
					(
						await flow.page
							.getByText(label, { exact: true })
							.locator("xpath=..")
							.boundingBox()
					)?.x,
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

	test("이력 리스트가 예정·연차 연도·소멸을 나누고 인라인 변경 후 잔여를 갱신한다", async () => {
		flow = await launchProductFlow(HISTORY_DATA);
		await flow.page.getByRole("tab", { name: "이력" }).click();

		/** 예정 기록 행. 예정 섹션과 행 태그가 같은 기록을 가리킨다. */
		const plannedRow = flow.page.getByRole("article", {
			name: /2025-12-15 예정 휴가 기록/,
		});
		/** 현재 연차 연도 접기 버튼. */
		const currentYear = flow.page.getByRole("button", { name: /2025년/ });
		/** 이전 연차 연도 접기 버튼. */
		const previousYear = flow.page.getByRole("button", { name: /2024년/ });
		/** 소멸된 월차의 하단 기록. */
		const expiredLine = flow.page.getByText("2024년 월차 10.5일 소멸", {
			exact: true,
		});

		await expectVisible(flow.page.getByText("예정", { exact: true }).first());
		await expectVisible(plannedRow);
		await expectVisible(flow.page.getByText("사용", { exact: true }).first());
		expect(await currentYear.getAttribute("aria-expanded")).toBe("true");
		expect(await previousYear.getAttribute("aria-expanded")).toBe("false");
		expect(
			await flow.page.getByText("2024-12-20", { exact: true }).count(),
		).toBe(0);
		await expectVisible(expiredLine);

		/** 수정 전 예정 날짜 열의 위치. */
		const dateBefore = await plannedRow
			.getByText("2025-12-15", { exact: true })
			.boundingBox();
		await expectVisible(plannedRow.getByRole("button", { name: "수정" }));
		/** 값의 길이와 행동 노출이 달라도 다섯 고정 열의 시작 위치가 같다. */
		const plannedColumnBoxes = await Promise.all([
			plannedRow.getByText("2025-12-15", { exact: true }).boundingBox(),
			plannedRow.getByText("반반차", { exact: true }).boundingBox(),
			plannedRow.getByText("예정", { exact: true }).boundingBox(),
			plannedRow.getByText("예정 기록", { exact: true }).boundingBox(),
			plannedRow.getByRole("button", { name: "수정" }).boundingBox(),
		]);
		/** 현재 사용 행은 날짜·단위·상태·메모가 예정 행과 서로 다르다. */
		const currentRow = flow.page.getByRole("article", {
			name: /2025-11-28 사용 휴가 기록/,
		});
		await expectVisible(currentRow.getByRole("button", { name: "수정" }));
		const currentColumnBoxes = await Promise.all([
			currentRow.getByText("2025-11-28", { exact: true }).boundingBox(),
			currentRow.getByText("종일", { exact: true }).boundingBox(),
			currentRow.getByText("사용", { exact: true }).boundingBox(),
			currentRow.getByText("현재 연차 사용", { exact: true }).boundingBox(),
			currentRow.getByRole("button", { name: "수정" }).boundingBox(),
		]);
		if (
			!plannedColumnBoxes.every(Boolean) ||
			!currentColumnBoxes.every(Boolean)
		) {
			throw new Error("이력 고정 열의 위치를 읽지 못했습니다");
		}
		expect(currentColumnBoxes.map((box) => box?.x)).toEqual(
			plannedColumnBoxes.map((box) => box?.x),
		);
		await flow.page.emulateMedia({ colorScheme: "light" });
		/** 날짜 열이 한 줄로 읽히는지 확인할 실제 텍스트 줄 수. */
		const dateLineCounts = await Promise.all(
			[
				plannedRow.getByText("2025-12-15", { exact: true }),
				currentRow.getByText("2025-11-28", { exact: true }),
			].map((date) =>
				date.evaluate((element) => {
					/** 날짜 텍스트가 차지하는 시각적 줄 범위. */
					const range = document.createRange();
					range.selectNodeContents(element);
					return range.getClientRects().length;
				}),
			),
		);
		expect(dateLineCounts).toEqual([1, 1]);
		await flow.page.emulateMedia({ colorScheme: "dark" });
		/** 다크 테마에서도 날짜 열이 유지하는 실제 텍스트 줄 수. */
		const darkDateLineCounts = await Promise.all(
			[
				plannedRow.getByText("2025-12-15", { exact: true }),
				currentRow.getByText("2025-11-28", { exact: true }),
			].map((date) =>
				date.evaluate((element) => {
					/** 다크 테마 날짜 텍스트가 차지하는 시각적 줄 범위. */
					const range = document.createRange();
					range.selectNodeContents(element);
					return range.getClientRects().length;
				}),
			),
		);
		expect(darkDateLineCounts).toEqual([1, 1]);
		await flow.page.emulateMedia({ colorScheme: "light" });
		/** 키보드 포커스로도 행 행동을 발견할 수 있는 수정 버튼. */
		const editButton = plannedRow.getByRole("button", { name: "수정" });
		await editButton.focus();
		await expectVisible(plannedRow.getByRole("button", { name: "삭제" }));
		await editButton.press("Enter");
		/** 인라인 수정이 열리면 날짜 입력부터 이어서 조작한다. */
		const plannedDateInput = flow.page.getByLabel("날짜");
		await expectVisible(plannedDateInput);
		await expectKeyboardFocus(plannedDateInput);
		await captureHistoryEditScreenshot(flow.page);
		await flow.page.emulateMedia({ colorScheme: "dark" });
		await expectKeyboardFocus(plannedDateInput);
		await captureDarkHistoryEditScreenshot(flow.page);
		await flow.page.getByLabel("날짜").fill("2025-12-16");
		await plannedRow.getByRole("button", { name: "반차", exact: true }).click();
		/** 키보드로 인라인 수정을 저장해 닫힌 뒤 포커스 표시까지 확인한다. */
		const plannedSaveButton = plannedRow.getByRole("button", { name: "저장" });
		await plannedSaveButton.focus();
		await plannedSaveButton.press("Enter");

		await expectVisible(flow.page.getByText("13.5일", { exact: true }));
		await expectVisible(
			flow.page.getByRole("article", {
				name: /2025-12-16 예정 휴가 기록/,
			}),
		);
		expect(
			await flow.page.getByText("2025-12-15", { exact: true }).count(),
		).toBe(0);
		/** 수정 후에도 날짜 열은 같은 고정 열에 선다. */
		const dateAfter = await flow.page
			.getByRole("article", { name: /2025-12-16 예정 휴가 기록/ })
			.getByText("2025-12-16", { exact: true })
			.boundingBox();
		if (!dateBefore || !dateAfter) {
			throw new Error("인라인 수정 전후 날짜 위치를 읽지 못했습니다");
		}
		expect(dateAfter.x).toBe(dateBefore.x);

		/** 수정한 예정 기록을 삭제할 행. */
		const updatedPlannedRow = flow.page.getByRole("article", {
			name: /2025-12-16 예정 휴가 기록/,
		});
		await expectKeyboardFocus(
			updatedPlannedRow.getByRole("button", { name: "수정" }),
		);
		await updatedPlannedRow.hover();
		await updatedPlannedRow.getByRole("button", { name: "삭제" }).click();
		await expectVisible(
			updatedPlannedRow.getByText("삭제할까요?", { exact: true }),
		);
		const cancelDelete = updatedPlannedRow.getByRole("button", {
			name: "취소",
		});
		await cancelDelete.focus();
		await cancelDelete.press("Enter");
		await expectKeyboardFocus(
			updatedPlannedRow.getByRole("button", { name: "삭제" }),
		);
		await updatedPlannedRow.getByRole("button", { name: "삭제" }).click();
		await updatedPlannedRow
			.getByRole("button", { name: "삭제", exact: true })
			.last()
			.click();
		await expectVisible(flow.page.getByText("14일", { exact: true }));
		expect(
			await flow.page.getByText("2025-12-16", { exact: true }).count(),
		).toBe(0);

		// 이전 연차 연도를 펼쳐도 소멸 기록은 그 아래에 남는다.
		await previousYear.click();
		await expectVisible(flow.page.getByText("2024-12-20", { exact: true }));
		/** 펼친 이전 연차 연도의 사용 행 위치. */
		const usedBox = await flow.page
			.getByText("2024-12-20", { exact: true })
			.boundingBox();
		/** 사용 행 아래에 놓여야 하는 소멸 행 위치. */
		const expiredBox = await expiredLine.boundingBox();
		if (!usedBox || !expiredBox) {
			throw new Error("사용·소멸 행 위치를 읽지 못했습니다");
		}
		expect(expiredBox.y).toBeGreaterThan(usedBox.y);

		/** 현재 연차 연도 사용 기록을 인라인 수정할 행. */
		const usedRow = flow.page.getByRole("article", {
			name: /2025-11-28 사용 휴가 기록/,
		});
		await usedRow.hover();
		await usedRow.getByRole("button", { name: "수정" }).click();
		await expectKeyboardFocus(usedRow.getByLabel("날짜"));
		/** 키보드로 수정 취소를 실행해 같은 행의 수정 버튼으로 돌아간다. */
		const usedCancelButton = usedRow.getByRole("button", { name: "취소" });
		await usedCancelButton.focus();
		await usedCancelButton.press("Enter");
		await expectKeyboardFocus(usedRow.getByRole("button", { name: "수정" }));
		await usedRow.getByRole("button", { name: "수정" }).click();
		await usedRow.getByLabel("날짜").fill("2024-12-20");
		await usedRow.getByRole("button", { name: "저장" }).click();
		await expectVisible(
			usedRow.getByText("그날에는 이미 휴가 기록이 있습니다", { exact: true }),
		);
		expect(await usedRow.getByLabel("날짜").inputValue()).toBe("2024-12-20");
		await usedRow.getByLabel("날짜").fill("2025-11-27");
		await usedRow.getByRole("button", { name: "저장" }).click();
		await expectVisible(
			flow.page.getByRole("article", { name: /2025-11-27 사용 휴가 기록/ }),
		);

		/** 날짜를 고친 사용 기록을 삭제할 행. */
		const updatedUsedRow = flow.page.getByRole("article", {
			name: /2025-11-27 사용 휴가 기록/,
		});
		await updatedUsedRow.hover();
		await updatedUsedRow.getByRole("button", { name: "삭제" }).click();
		await expectVisible(
			updatedUsedRow.getByText("삭제할까요?", { exact: true }),
		);
		await updatedUsedRow
			.getByRole("button", { name: "삭제", exact: true })
			.last()
			.click();
		await expectVisible(flow.page.getByText("15일", { exact: true }));
		expect(
			await flow.page.getByText("2025-11-27", { exact: true }).count(),
		).toBe(0);
	}, 60_000);

	test("빈 이력의 다음 행동으로 휴가 등록을 시작하고 닫힌 뒤 헤더로 포커스를 돌린다", async () => {
		flow = await launchProductFlow(QUICK_ENTRY_DATA);
		await flow.page.getByRole("tab", { name: "이력" }).click();

		/** 기록이 없을 때 같은 맥락에서 다음 단계를 시작하는 CTA. */
		const emptyEntryButton = flow.page
			.locator(".history-empty")
			.getByRole("button", { name: "휴가 등록" });
		/** 등록면을 닫은 뒤 돌아갈 전역 헤더 CTA. */
		const headerEntryButton = flow.page
			.locator(".head-entry")
			.getByRole("button", { name: "휴가 등록" });
		await expectVisible(
			flow.page.getByText("휴가 기록이 없습니다.", { exact: true }),
		);
		await emptyEntryButton.click();
		const sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await expectVisible(sheet);
		await flow.page.keyboard.press("Escape");
		await sheet.waitFor({ state: "detached" });
		await expectKeyboardFocus(headerEntryButton);
	}, 60_000);

	test("이력 변경 실패가 해당 행에 남고 입력 맥락을 보존한다", async () => {
		flow = await launchProductFlow(HISTORY_DATA);
		await flow.page.getByRole("tab", { name: "이력" }).click();

		/** 수정 실패를 만들 예정 기록 행. */
		const plannedRow = flow.page.getByRole("article", {
			name: /2025-12-15 예정 휴가 기록/,
		});
		await plannedRow.hover();
		await plannedRow.getByRole("button", { name: "수정" }).click();
		await flow.page.getByLabel("날짜").fill("2025-12-16");

		// 저장 파일 디렉터리를 잠가 수정 실패를 실제 Electron 경로에서 만든다.
		await chmod(flow.userDataDirectory, 0o500);
		try {
			await plannedRow.getByRole("button", { name: "저장" }).click();
			await expectVisible(
				plannedRow.getByText(/저장하지 못했습니다/, { exact: false }),
			);
			expect(await flow.page.getByLabel("날짜").inputValue()).toBe(
				"2025-12-16",
			);
		} finally {
			await chmod(flow.userDataDirectory, 0o700);
		}

		await plannedRow.getByRole("button", { name: "취소" }).click();

		/** 삭제 실패를 만들 현재 연차 사용 기록 행. */
		const usedRow = flow.page.getByRole("article", {
			name: /2025-11-28 사용 휴가 기록/,
		});
		await usedRow.hover();
		await chmod(flow.userDataDirectory, 0o500);
		try {
			await usedRow.getByRole("button", { name: "삭제" }).click();
			await expectVisible(usedRow.getByText("삭제할까요?", { exact: true }));
			await usedRow
				.getByRole("button", { name: "삭제", exact: true })
				.last()
				.click();
			await expectVisible(
				usedRow.getByText(/저장하지 못했습니다/, { exact: false }),
			);
			await expectVisible(usedRow.getByText("2025-11-28", { exact: true }));
		} finally {
			await chmod(flow.userDataDirectory, 0o700);
		}
	});

	test("긴 이력에서는 팝오버 머리와 탭을 고정하고 목록만 스크롤한다", async () => {
		flow = await launchProductFlow(LONG_HISTORY_DATA);
		await flow.page.getByRole("tab", { name: "이력" }).click();

		/** 이력만 스크롤 가능한 접근성 영역. */
		const historyList = flow.page.getByRole("region", {
			name: "휴가 이력 목록",
		});
		await expectVisible(historyList);
		/** 목록과 팝오버 바깥의 스크롤 여부. */
		const scrollState = await historyList.evaluate((element) => ({
			regionScrollable: element.scrollHeight > element.clientHeight,
			pageScrollable:
				document.documentElement.scrollHeight > window.innerHeight,
		}));
		/** 작은 작업 영역에서만 전체 팝오버 스크롤 폴백을 허용한다. */
		const popoverLayout = await readPopoverLayout(flow);
		expect(scrollState).toEqual({
			regionScrollable: true,
			pageScrollable: isPopoverContentCapped(popoverLayout),
		});
		await expectVisible(flow.page.getByRole("heading", { name: "연차몇개" }));
		await expectVisible(flow.page.getByRole("tab", { name: "이력" }));
	});

	test("긴 조정 원장에서도 설정 머리와 데이터 행동을 유지하고 목록만 스크롤한다", async () => {
		flow = await launchProductFlow(LONG_SUMMARY_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 긴 조정 행만 스크롤할 접근성 영역. */
		const adjustmentList = flow.page.getByRole("region", {
			name: "조정 목록",
		});
		await expectVisible(adjustmentList);
		/** 조정 목록과 팝오버 바깥의 스크롤 여부. */
		const scrollState = await adjustmentList.evaluate((element) => ({
			regionScrollable: element.scrollHeight > element.clientHeight,
			pageScrollable:
				document.documentElement.scrollHeight > window.innerHeight,
		}));
		/** 작은 작업 영역에서만 전체 팝오버 스크롤 폴백을 허용한다. */
		const popoverLayout = await readPopoverLayout(flow);
		expect(scrollState).toEqual({
			regionScrollable: true,
			pageScrollable: isPopoverContentCapped(popoverLayout),
		});
		await expectVisible(flow.page.getByRole("heading", { name: "기본 설정" }));
		await expectVisible(flow.page.getByRole("region", { name: "데이터" }));
	});

	test("이력 달력에서 상태·소멸·선택 기록을 확인하고 키보드로 변경·삭제한다", async () => {
		flow = await launchProductFlow(CALENDAR_DATA);
		await flow.page.getByRole("tab", { name: "이력" }).click();

		/** 리스트와 달력 사이를 바꾸는 같은 화면의 보기 조작. */
		const listView = flow.page.getByRole("button", { name: "리스트" });
		const calendarView = flow.page.getByRole("button", { name: "달력" });
		expect(await listView.getAttribute("aria-pressed")).toBe("true");
		await flow.page.keyboard.press("Tab");
		await expectKeyboardFocus(listView);
		await flow.page.keyboard.press("Tab");
		await expectKeyboardFocus(calendarView);
		await flow.page.keyboard.press("Enter");
		expect(await calendarView.getAttribute("aria-pressed")).toBe("true");
		expect(await listView.getAttribute("aria-pressed")).toBe("false");

		/** 현재 달을 감싸는 접근 가능한 달력. */
		const calendar = flow.page.getByRole("group", {
			name: "달력",
			exact: true,
		});
		await expectVisible(calendar);
		await expectVisible(calendar.getByText("2025년 12월", { exact: true }));
		await expectVisible(
			calendar.getByRole("table", { name: "2025년 12월 달력" }),
		);

		/** 이전 달로 이동하는 키보드 조작. */
		const previousMonth = calendar.getByRole("button", { name: "이전 달" });
		await previousMonth.focus();
		await previousMonth.press("Enter");
		/** 사용 상태를 문구로 포함하는 날짜 셀. */
		const usedDay = calendar.getByRole("button", {
			name: /2025-11-28.*사용/,
		});
		/** 소멸일 상태를 문구로 포함하는 날짜 셀. */
		const expiryDay = calendar.getByRole("button", {
			name: /2025-11-30.*소멸일/,
		});
		await expectVisible(usedDay);
		await expectVisible(expiryDay);
		/** 날짜 격자는 Tab 정지점을 하나만 두고 방향키로 인접 날짜를 이동한다. */
		expect(
			await calendar
				.locator(".cal-day")
				.evaluateAll(
					(days) =>
						days.filter((day) => day.getAttribute("tabindex") === "0").length,
				),
		).toBe(1);
		await usedDay.focus();
		await usedDay.press("ArrowLeft");
		await expectKeyboardFocus(
			calendar.getByRole("button", { name: "2025-11-27", exact: true }),
		);
		await flow.page.keyboard.press("ArrowRight");
		await expectKeyboardFocus(usedDay);

		/** 사용 기록을 키보드로 선택한다. */
		await usedDay.press("Enter");
		/** 선택 날짜의 기록·소멸 상세 영역. */
		const selectedDetails = flow.page.getByRole("region", {
			name: "선택한 날짜 상세",
		});
		await expectVisible(selectedDetails);
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "2025-11-28" }),
		);
		await expectVisible(selectedDetails.getByText("사용", { exact: true }));
		await expectVisible(selectedDetails.getByText("메모", { exact: true }));
		await expectVisible(
			selectedDetails.getByText("지난 기록 메모", { exact: true }),
		);

		/** 다음 달로 돌아가는 키보드 조작. */
		const nextMonth = calendar.getByRole("button", { name: "다음 달" });
		await nextMonth.focus();
		await nextMonth.press("Enter");
		/** 예정 상태를 문구로 포함하는 날짜 셀. */
		const plannedDay = calendar.getByRole("button", {
			name: /2025-12-15.*예정/,
		});
		await plannedDay.focus();
		await plannedDay.press("Enter");
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "2025-12-15" }),
		);
		await expectVisible(selectedDetails.getByText("예정", { exact: true }));
		await expectVisible(
			selectedDetails.getByText("예정 기록 메모", { exact: true }),
		);
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "반차" }),
		);

		/** 단위 변경을 키보드로 실행하고 상태 푸시로 잔여가 바뀌는지 확인한다. */
		const fullDay = selectedDetails.getByRole("button", { name: "종일" });
		await fullDay.focus();
		await fullDay.press("Enter");
		/** 단위 변경은 저장 전 초안으로 남고, 원래 데이터와 잔여는 그대로다. */
		await expectVisible(
			selectedDetails.getByText("저장 전 초안: 종일", { exact: true }),
		);
		await expectVisible(selectedDetails.getByRole("button", { name: "저장" }));
		await expectVisible(selectedDetails.getByRole("button", { name: "취소" }));
		await expectVisible(flow.page.getByText("9.5일", { exact: true }));
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "반차" }),
		);
		await selectedDetails.getByRole("button", { name: "취소" }).press("Enter");
		await expectKeyboardFocus(
			selectedDetails.getByRole("button", { name: "반차", exact: true }),
		);
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "반차" }),
		);

		/** 다시 고른 단위를 명시적으로 저장하고 그때만 잔여를 갱신한다. */
		await fullDay.focus();
		await fullDay.press("Enter");
		const saveCalendarDraft = selectedDetails.getByRole("button", {
			name: "저장",
			exact: true,
		});
		await saveCalendarDraft.focus();
		await saveCalendarDraft.press("Enter");
		await expectVisible(flow.page.getByText("9일", { exact: true }));
		await expectVisible(
			selectedDetails.getByRole("definition").filter({ hasText: "종일" }),
		);
		await expectVisible(
			calendar.getByRole("button", {
				name: /2025-12-15.*예정.*선택됨/,
			}),
		);

		/** 선택 기록 삭제를 키보드로 실행한다. */
		const deleteEntry = selectedDetails.getByRole("button", { name: "삭제" });
		await deleteEntry.focus();
		await deleteEntry.press("Enter");
		await expectVisible(
			selectedDetails.getByText("삭제할까요?", { exact: true }),
		);
		const confirmDeleteEntry = selectedDetails
			.getByRole("button", { name: "삭제", exact: true })
			.last();
		await confirmDeleteEntry.focus();
		await confirmDeleteEntry.press("Enter");
		await expectVisible(
			selectedDetails.getByText("이 날에는 기록이 없습니다.", { exact: true }),
		);
		await expectKeyboardFocus(selectedDetails);
		await expectVisible(flow.page.getByText("10일", { exact: true }));
		expect(
			await calendar.getByRole("button", { name: /2025-12-15.*예정/ }).count(),
		).toBe(0);

		/** 소멸일을 선택해 무엇이 얼마나 사라졌는지 확인한다. */
		await previousMonth.focus();
		await previousMonth.press("Enter");
		await expiryDay.focus();
		await expiryDay.press("Enter");
		await expectVisible(
			selectedDetails.getByText("2025년 이월 4일 소멸", { exact: true }),
		);

		/** 같은 이력 화면에서 리스트 보기로 되돌아가는 키보드 조작. */
		await listView.focus();
		await listView.press("Enter");
		expect(await listView.getAttribute("aria-pressed")).toBe("true");
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
		await flow.page.emulateMedia({ colorScheme: "light" });
		await captureEntryScreenshot(flow.page);
		await flow.page.emulateMedia({ colorScheme: "dark" });
		/** 다크 등록면에서 포커스 표시를 확인할 날짜 입력. */
		const darkEntryDate = flow.page.getByLabel("날짜");
		await darkEntryDate.focus();
		await expectKeyboardFocus(darkEntryDate);
		await captureDarkEntryScreenshot(flow.page);

		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		/** 커밋·상태 갱신 직후 닫히고 부모 화면에 완료 상태가 남는다. */
		await sheet.waitFor({ state: "detached" });
		await expectVisible(
			flow.page
				.getByRole("status")
				.filter({ hasText: "휴가 기록을 등록했습니다." }),
		);
		await expectDocumentFocus(
			flow.page.getByRole("button", { name: "휴가 등록" }),
		);
		await expectVisible(flow.page.getByText("9일", { exact: true }));

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await expectVisible(
			flow.page
				.getByRole("status")
				.filter({ hasText: "휴가 기록을 등록했습니다." }),
		);
		await expectVisible(flow.page.getByText(TEST_TODAY, { exact: true }));
		await expectVisible(flow.page.getByText("종일", { exact: true }));
	}, 60_000);

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

	test("확장 등록은 다른 날짜·단위·메모와 역순 기간의 중복 제외를 저장한다", async () => {
		flow = await launchProductFlow(EXPANDED_ENTRY_DATA);

		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		/** 확장 입력을 확인할 첫 등록면. */
		let sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		/** 다른 날짜를 선택할 입력. */
		const dateInput = flow.page.getByLabel("날짜");
		/** 선택 사항인 메모 입력. */
		const noteInput = flow.page.getByLabel("메모");

		// 다른 날짜와 반차를 고른 뒤 기간으로 갔다가 돌아와도 입력 맥락을 유지한다.
		await dateInput.fill("2025-12-03");
		await noteInput.fill("  반차 메모  ");
		await flow.page.getByRole("button", { name: "반차", exact: true }).click();
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		/** 기간의 종료일을 선택할 입력. */
		const endDateInput = flow.page.getByLabel("종료일");
		await endDateInput.fill("2025-12-04");
		expect(await dateInput.inputValue()).toBe("2025-12-03");
		expect(await endDateInput.inputValue()).toBe("2025-12-04");
		expect(await noteInput.inputValue()).toBe("  반차 메모  ");
		await flow.page.getByRole("button", { name: "하루", exact: true }).click();
		expect(await dateInput.inputValue()).toBe("2025-12-03");
		expect(await noteInput.inputValue()).toBe("  반차 메모  ");
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		expect(await endDateInput.inputValue()).toBe("2025-12-04");
		await flow.page.getByRole("button", { name: "하루", exact: true }).click();

		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("8.5일", { exact: true }));

		// 같은 등록면에서 다른 단위와 메모를 저장한다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page.getByLabel("날짜").fill("2025-12-04");
		await flow.page
			.getByRole("button", { name: "반반차", exact: true })
			.click();
		await flow.page.getByLabel("메모").fill("  반반차 메모  ");
		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("8.25일", { exact: true }));

		// 정상적인 기간은 시작일이 먼저 오고, 기존 기록이 없는 두 날을 펼친다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-08");
		await flow.page.getByLabel("종료일").fill("2025-12-09");
		await flow.page.getByLabel("메모").fill("  기간 메모  ");
		expect(await flow.page.getByLabel("주말 제외").isChecked()).toBe(true);
		await expectVisible(
			flow.page.getByText("휴가 기록 2건을 종일로 등록합니다.", {
				exact: true,
			}),
		);
		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("6.25일", { exact: true }));

		// 시작일과 종료일이 역순이면 자동으로 뒤집지 않고 등록을 막는다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-09");
		await flow.page.getByLabel("종료일").fill("2025-12-05");
		await expectVisible(
			flow.page.getByText(
				"종료일은 시작일 이후여야 합니다. 시작일과 종료일을 다시 선택하세요.",
				{ exact: true },
			),
		);
		expect(
			await flow.page
				.getByRole("button", { name: "등록", exact: true })
				.isDisabled(),
		).toBe(true);
		await flow.page.getByRole("button", { name: "취소", exact: true }).click();
		await expectVisible(flow.page.getByText("6.25일", { exact: true }));

		// 주말 제외를 끄면 주말도 실제 휴가 기록으로 펼쳐진다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-13");
		await flow.page.getByLabel("종료일").fill("2025-12-14");
		expect(await flow.page.getByLabel("주말 제외").isChecked()).toBe(true);
		await expectVisible(
			flow.page.getByText("선택한 기간에는 등록할 수 있는 날이 없습니다.", {
				exact: true,
			}),
		);
		expect(
			await flow.page
				.getByRole("button", { name: "등록", exact: true })
				.isDisabled(),
		).toBe(true);
		await flow.page.getByLabel("주말 제외").uncheck();
		await expectVisible(
			flow.page.getByText("휴가 기록 2건을 종일로 등록합니다.", {
				exact: true,
			}),
		);
		await flow.page.getByLabel("메모").fill("  주말 메모  ");
		await flow.page.getByRole("button", { name: "등록", exact: true }).click();
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("4.25일", { exact: true }));

		await flow.page.getByRole("tab", { name: "이력" }).click();
		await expectVisible(flow.page.getByText("2025-12-03", { exact: true }));
		await expectVisible(flow.page.getByText("반차", { exact: true }));
		/** 앞뒤 공백이 제거된 첫 번째 메모. */
		const halfNote = flow.page.getByText("반차 메모", { exact: true });
		await expectVisible(halfNote);
		expect(await halfNote.textContent()).toBe("반차 메모");
		await expectVisible(flow.page.getByText("2025-12-04", { exact: true }));
		await expectVisible(flow.page.getByText("반반차", { exact: true }));
		/** 앞뒤 공백이 제거된 두 번째 메모. */
		const quarterNote = flow.page.getByText("반반차 메모", { exact: true });
		await expectVisible(quarterNote);
		expect(await quarterNote.textContent()).toBe("반반차 메모");
		/** 펼쳐진 각 기간 기록에 전달된 앞뒤 공백 제거 메모. */
		const periodNotes = flow.page.getByText("기간 메모", { exact: true });
		expect(await periodNotes.allTextContents()).toEqual([
			"기간 메모",
			"기간 메모",
		]);
		/** 주말 기록 두 건에 전달된 앞뒤 공백 제거 메모. */
		const weekendNotes = flow.page.getByText("주말 메모", { exact: true });
		expect(await weekendNotes.allTextContents()).toEqual([
			"주말 메모",
			"주말 메모",
		]);
		await expectVisible(flow.page.getByText("2025-12-08", { exact: true }));
		await expectVisible(flow.page.getByText("2025-12-09", { exact: true }));
		await expectVisible(flow.page.getByText("2025-12-13", { exact: true }));
		await expectVisible(flow.page.getByText("2025-12-14", { exact: true }));
		expect(
			await flow.page.getByText("2025-12-05", { exact: true }).count(),
		).toBe(1);

		// 이미 기록된 날짜만 남긴 기간은 등록할 수 없고, 취소도 같은 등록면에서 끝낸다.
		await flow.page.getByRole("tab", { name: "요약" }).click();
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-08");
		await flow.page.getByLabel("종료일").fill("2025-12-09");
		await expectVisible(
			flow.page.getByText("선택한 기간에는 등록할 수 있는 날이 없습니다.", {
				exact: true,
			}),
		);
		expect(
			await flow.page
				.getByRole("button", { name: "등록", exact: true })
				.isDisabled(),
		).toBe(true);
		await flow.page.getByRole("button", { name: "취소", exact: true }).click();
		await sheet.waitFor({ state: "detached" });

		// 유효한 입력을 취소해도 저장되지 않고 잔여가 그대로다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page.getByLabel("날짜").fill("2025-12-15");
		await flow.page.getByLabel("메모").fill("취소할 기록");
		await flow.page.getByRole("button", { name: "취소", exact: true }).click();
		await sheet.waitFor({ state: "detached" });
		await expectVisible(flow.page.getByText("4.25일", { exact: true }));
		await flow.page.getByRole("tab", { name: "이력" }).click();
		expect(
			await flow.page.getByText("2025-12-15", { exact: true }).count(),
		).toBe(0);
	}, 60_000);

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
		/** 마지막 조작에서 첫 조작으로 순환해야 하는 등록면의 닫기 버튼. */
		const closeButton = sheet.getByRole("button", { name: "닫기" });
		/** 등록면 마지막에 놓인 취소 버튼. */
		const cancelButton = sheet.getByRole("button", {
			name: "취소",
			exact: true,
		});
		await cancelButton.focus();
		await cancelButton.press("Tab");
		await expectKeyboardFocus(closeButton);

		await flow.page.keyboard.press("Escape");
		await sheet.waitFor({ state: "detached" });
		await expectKeyboardFocus(trigger);

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
		await expectKeyboardFocus(trigger);
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

	test("조정 원장에서 양수·음수 추가·수정·삭제 후 잔여와 근거를 갱신한다", async () => {
		flow = await launchProductFlow(ADJUSTMENTS_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 설정 탭에서 조정을 나열하는 원장. */
		const adjustmentTable = flow.page.getByRole("table", { name: "조정 목록" });
		await expectVisible(adjustmentTable);
		expect(
			await adjustmentTable.getByRole("columnheader").allTextContents(),
		).toEqual(["일수", "발생일", "소멸일", "메모", "행동"]);
		await expectVisible(
			flow.page.getByText(
				"이월·사규 추가분·포상 휴가를 여기에 넣습니다. 월차와 연차는 계산이 만들며 고칠 수 없습니다.",
				{ exact: true },
			),
		);
		await expectVisible(flow.page.getByText("19일", { exact: true }));

		/** 닫힌 조정 폼으로 들어가는 트리거. */
		const addAdjustmentButton = flow.page.getByRole("button", {
			name: "조정 추가",
		});
		await addAdjustmentButton.click();
		/** 양수·음수 조정을 입력하는 추가 폼. */
		const addForm = flow.page.getByRole("form", { name: "조정 추가" });
		/** 추가할 일수 입력. */
		const days = addForm.getByLabel("일수");
		/** 추가 조정의 발생일 입력. */
		const grantDate = addForm.getByLabel("발생일");
		/** 추가 조정의 소멸일 입력. */
		const expiryDate = addForm.getByLabel("소멸일");
		/** 추가 조정의 메모 입력. */
		const note = addForm.getByLabel("메모");
		await expectKeyboardFocus(days);
		expect(await grantDate.inputValue()).toBe(TEST_TODAY);
		expect(await expiryDate.inputValue()).toBe("2026-12-31");

		// 잘못된 일수는 저장 전에 설명하고 입력면을 닫지 않는다.
		await days.fill("0.3");
		await addForm.getByRole("button", { name: "추가", exact: true }).click();
		await expectVisible(
			flow.page.getByText("일수는 0.25 단위로 넣어주세요", { exact: true }),
		);
		expect(await days.getAttribute("aria-invalid")).toBe("true");
		expect(await flow.page.getByText("19일", { exact: true }).count()).toBe(1);

		await days.fill("2.5");
		await note.fill("  화면에서 추가한 양수  ");
		/** 키보드로 추가를 완료해 원래 조정 추가 버튼으로 포커스를 돌린다. */
		const addSubmitButton = addForm.getByRole("button", {
			name: "추가",
			exact: true,
		});
		await addSubmitButton.focus();
		await addSubmitButton.press("Enter");
		await addForm.waitFor({ state: "detached" });
		await expectKeyboardFocus(addAdjustmentButton);
		await expectVisible(flow.page.getByText("21.5일", { exact: true }));

		/** 화면에서 새로 추가한 양수 조정 행. */
		const positiveRow = adjustmentTable
			.getByRole("row")
			.filter({ hasText: "+2.5일" });
		await expectVisible(positiveRow);
		await expectVisible(positiveRow.getByText("2025-12-01", { exact: true }));
		await expectVisible(positiveRow.getByText("2026-12-31", { exact: true }));
		await expectVisible(
			positiveRow.getByText("화면에서 추가한 양수", { exact: true }),
		);
		/** 기존 행과 새 행에서 비교할 네 개의 고정 원장 열. */
		const existingRow = adjustmentTable
			.getByRole("row")
			.filter({ hasText: "+4일" });
		/** 새 행의 일수·날짜·메모·행동 열 위치. */
		const positiveColumns = await Promise.all([
			positiveRow.getByRole("cell").nth(0).boundingBox(),
			positiveRow.getByRole("cell").nth(1).boundingBox(),
			positiveRow.getByRole("cell").nth(2).boundingBox(),
			positiveRow.getByRole("cell").nth(4).boundingBox(),
		]);
		/** 기존 행의 같은 열 위치. 값의 자릿수가 달라도 열은 움직이지 않는다. */
		const existingColumns = await Promise.all([
			existingRow.getByRole("cell").nth(0).boundingBox(),
			existingRow.getByRole("cell").nth(1).boundingBox(),
			existingRow.getByRole("cell").nth(2).boundingBox(),
			existingRow.getByRole("cell").nth(4).boundingBox(),
		]);
		if (!positiveColumns.every(Boolean) || !existingColumns.every(Boolean)) {
			throw new Error("조정 원장 열의 위치를 읽지 못했습니다");
		}
		expect(positiveColumns.map((box) => box?.x)).toEqual(
			existingColumns.map((box) => box?.x),
		);

		// 계산이 만든 연차는 조정 원장과 별도 근거로 계속 남는다.
		await flow.page.getByRole("tab", { name: "요약" }).click();
		/** 조정 후에도 계산된 발생분과 조정 발생분을 함께 보여주는 영역. */
		const grants = flow.page.getByRole("region", { name: "살아 있는 발생분" });
		await expectVisible(grants.getByText("연차", { exact: true }));
		await expectVisible(grants.getByText("조정 · 기존 이월", { exact: true }));
		await expectVisible(
			grants.getByText("조정 · 화면에서 추가한 양수", { exact: true }),
		);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		await positiveRow.getByRole("button", { name: "수정" }).click();
		/** 같은 원장 맥락에서 양수를 음수로 바꾸는 수정 폼. */
		const editForm = flow.page.getByRole("form", { name: "조정 수정" });
		await expectKeyboardFocus(editForm.getByLabel("일수"));
		await editForm.getByLabel("일수").fill("-1.25");
		await editForm.getByLabel("메모").fill("  화면에서 수정한 음수  ");
		/** 키보드로 수정 저장을 완료해 같은 행의 수정 버튼으로 돌아간다. */
		const adjustmentSaveButton = editForm.getByRole("button", {
			name: "저장",
			exact: true,
		});
		await adjustmentSaveButton.focus();
		await adjustmentSaveButton.press("Enter");
		await editForm.waitFor({ state: "detached" });
		/** 수정 후에도 같은 조정 레코드의 수정 버튼으로 돌아오는지 확인할 행. */
		const updatedAdjustmentRow = adjustmentTable
			.getByRole("row")
			.filter({ hasText: "화면에서 수정한 음수" });
		await expectKeyboardFocus(
			updatedAdjustmentRow.getByRole("button", { name: "수정" }),
		);
		await expectVisible(flow.page.getByText("17.75일", { exact: true }));
		await flow.page.getByRole("tab", { name: "요약" }).click();
		/** 수정 후에도 계산된 연차와 두 조정 발생분이 함께 남는 근거. */
		const updatedGrants = flow.page.getByRole("region", {
			name: "살아 있는 발생분",
		});
		await expectVisible(updatedGrants.getByText("연차", { exact: true }));
		await expectVisible(
			updatedGrants.getByText("조정 · 기존 이월", { exact: true }),
		);
		await expectVisible(
			updatedGrants.getByText("조정 · 화면에서 수정한 음수", { exact: true }),
		);
		await flow.page.getByRole("tab", { name: "설정" }).click();

		/** 수정 후 음수로 바뀐 조정 행. */
		const negativeRow = adjustmentTable
			.getByRole("row")
			.filter({ hasText: "-1.25일" });
		await expectVisible(negativeRow);
		await expectVisible(
			negativeRow.getByText("화면에서 수정한 음수", { exact: true }),
		);

		await negativeRow.getByRole("button", { name: "삭제" }).click();
		const adjustmentDeleteConfirmation = adjustmentTable
			.getByRole("row")
			.filter({ hasText: "삭제할까요?" });
		await expectVisible(
			adjustmentDeleteConfirmation.getByText("삭제할까요?", { exact: true }),
		);
		await adjustmentDeleteConfirmation
			.getByRole("button", { name: "삭제", exact: true })
			.click();
		await expectVisible(flow.page.getByText("19일", { exact: true }));
		expect(
			await adjustmentTable
				.getByRole("row")
				.filter({ hasText: "-1.25일" })
				.count(),
		).toBe(0);
		await flow.page.getByRole("tab", { name: "요약" }).click();
		/** 삭제 후 기존 조정 하나만 남은 발생분 근거. */
		const remainingGrants = flow.page.getByRole("region", {
			name: "살아 있는 발생분",
		});
		await expectVisible(remainingGrants.getByText("연차", { exact: true }));
		await expectVisible(
			remainingGrants.getByText("조정 · 기존 이월", { exact: true }),
		);
	}, 60_000);

	test("조정 저장 실패 시 입력값과 열린 맥락을 유지하고 다시 시도할 수 있다", async () => {
		flow = await launchProductFlow(ADJUSTMENTS_DATA);
		await flow.page.getByRole("tab", { name: "설정" }).click();
		await flow.page.getByRole("button", { name: "조정 추가" }).click();

		/** 저장 실패 뒤에도 같은 폼에 남아야 하는 값. */
		const addForm = flow.page.getByRole("form", { name: "조정 추가" });
		/** 저장 실패 뒤에도 보존되어야 하는 일수 입력. */
		const days = addForm.getByLabel("일수");
		/** 저장 실패 뒤에도 보존되어야 하는 메모 입력. */
		const note = addForm.getByLabel("메모");
		await days.fill("2.5");
		await note.fill("저장 실패 뒤에도 남는 조정");

		// 원자적 저장을 실패시켜 제품 경계의 실패 상태를 확인한다.
		await chmod(flow.userDataDirectory, 0o500);
		try {
			await addForm.getByRole("button", { name: "추가", exact: true }).click();
			await expectVisible(
				flow.page.getByRole("alert").filter({ hasText: "저장하지 못했습니다" }),
			);
			expect(await addForm.isVisible()).toBe(true);
			expect(await days.inputValue()).toBe("2.5");
			expect(await note.inputValue()).toBe("저장 실패 뒤에도 남는 조정");
			expect(
				await addForm
					.getByRole("button", { name: "추가", exact: true })
					.isEnabled(),
			).toBe(true);
		} finally {
			await chmod(flow.userDataDirectory, 0o700);
		}
	}, 60_000);

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
			.filter({
				has: flow.page.getByRole("rowheader", { name: "초과", exact: true }),
			});
		await expectVisible(excessRow);
		expect(await excessRow.getByRole("cell").first().textContent()).toBe("3");
		await expectVisible(
			flow.page.getByText("발생 − 사용 − 예정 − 초과 = 잔여", { exact: true }),
		);

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

	test("읽을 수 없는 JSON은 정상 셸과 분리하고 파일 위치 열기를 제공한다", async () => {
		flow = await launchProductFlow("{ not valid JSON");

		/** 정상 탭을 대신하는 읽기 실패 화면. */
		const recoveryScreen = flow.page.getByRole("main");
		await expectVisible(recoveryScreen);
		await expectVisible(
			flow.page.getByRole("heading", { name: "저장 파일을 읽지 못했습니다" }),
		);
		await expectKeyboardFocus(recoveryScreen);
		await expectVisible(
			flow.page.getByText("파일이 JSON 형식이 아니거나 열 수 없습니다."),
		);
		expect(await flow.page.getByRole("tab").count()).toBe(0);
		await expectVisible(
			flow.page.getByRole("button", { name: "백업에서 복구" }),
		);
		/** 읽기 실패 화면의 키보드 순서에서 두 번째인 파일 위치 열기 버튼. */
		const revealButton = flow.page.getByRole("button", {
			name: "파일 위치 열기",
		});
		expect(await revealButton.count()).toBe(1);

		await mockRevealDataFile(flow.app);
		await recoveryScreen.press("Tab");
		await flow.page.keyboard.press("Tab");
		await expectKeyboardFocus(revealButton);
		await revealButton.press("Enter");
		await expectVisible(
			flow.page
				.getByRole("status")
				.filter({ hasText: "파일 위치를 열었습니다" }),
		);
		expect(await readRevealedPath(flow.app)).toBe(
			await realpath(path.join(flow.userDataDirectory, "data.json")),
		);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe("{ not valid JSON");
	});

	test("저장 파일 구조가 다르면 구조 오류를 설명하고 탭을 숨긴다", async () => {
		flow = await launchProductFlow(
			JSON.stringify({ schemaVersion: 1, entries: [], adjustments: [] }),
		);

		await expectVisible(
			flow.page.getByText("파일의 구조가 저장 형식과 다릅니다."),
		);
		expect(await flow.page.getByRole("tab").count()).toBe(0);
		await expectVisible(
			flow.page.getByRole("button", { name: "백업에서 복구" }),
		);
	});

	test("더 새 저장 형식은 업데이트 안내만 표시하고 복구를 제안하지 않는다", async () => {
		flow = await launchProductFlow(JSON.stringify({ schemaVersion: 2 }));

		await expectVisible(
			flow.page.getByText(
				"더 새 버전의 앱이 쓴 파일입니다. 앱을 업데이트하세요.",
			),
		);
		expect(await flow.page.getByRole("tab").count()).toBe(0);
		expect(await flow.page.getByRole("button").count()).toBe(0);
	});

	test("유효한 백업을 복구하면 정상 탭과 계산 결과로 돌아온다", async () => {
		flow = await launchProductFlow("{ not valid JSON");

		/** 복구에 사용할 정상 저장 데이터. */
		const backupData: LeaveData = {
			schemaVersion: 1,
			settings: { hireDate: "2020-01-01", grantBasis: "hireDate" },
			entries: [],
			adjustments: [],
		};
		await writeFile(
			path.join(flow.userDataDirectory, "data.json.bak"),
			JSON.stringify(backupData),
			"utf8",
		);

		/** 읽기 실패 화면의 첫 키보드 행동인 백업 복구 버튼. */
		const restoreButton = flow.page.getByRole("button", {
			name: "백업에서 복구",
		});
		/** 복구 전후 정상 셸과 분리되는 읽기 실패 화면. */
		const recoveryScreen = flow.page.getByRole("main");
		await expectKeyboardFocus(recoveryScreen);
		await recoveryScreen.press("Tab");
		await expectKeyboardFocus(restoreButton);
		await restoreButton.press("Enter");
		await expectVisible(flow.page.getByRole("tab", { name: "요약" }));
		await expectVisible(flow.page.getByText("잔여", { exact: true }).first());
		expect(await flow.page.getByRole("tab").count()).toBe(3);
		expect(await flow.page.getByRole("main").count()).toBe(0);
		/** 복구 성공 뒤 파일에 저장된 정상 상태. */
		const restored = await waitForStoredData(
			flow.userDataDirectory,
			(data) => data.settings.hireDate === backupData.settings.hireDate,
		);
		expect(restored).toEqual(backupData);
	});

	test("백업 복구에 실패하면 복구 화면과 원본을 유지한다", async () => {
		flow = await launchProductFlow("{ not valid JSON");

		/** 파싱할 수 없는 백업. 복구 전후 원본 보존을 확인한다. */
		await writeFile(
			path.join(flow.userDataDirectory, "data.json.bak"),
			"{ not valid backup",
			"utf8",
		);
		/** 실패 뒤 다시 시도할 수 있고 포커스를 돌려받아야 하는 복구 버튼. */
		const restoreButton = flow.page.getByRole("button", {
			name: "백업에서 복구",
		});
		/** 읽기 실패 화면에서 Tab으로 복구 행동에 도달해 Enter로 실행한다. */
		const recoveryScreen = flow.page.getByRole("main");
		await expectKeyboardFocus(recoveryScreen);
		await recoveryScreen.press("Tab");
		await expectKeyboardFocus(restoreButton);
		await restoreButton.press("Enter");

		await expectVisible(
			flow.page.getByRole("alert").filter({ hasText: "복구하지 못했습니다" }),
		);
		await expectKeyboardFocus(restoreButton);
		expect(await flow.page.getByRole("main").count()).toBe(1);
		expect(await flow.page.getByRole("tab").count()).toBe(0);
		expect(
			await flow.page
				.getByRole("button", { name: "백업에서 복구" })
				.isEnabled(),
		).toBe(true);
		expect(
			await readFile(path.join(flow.userDataDirectory, "data.json"), "utf8"),
		).toBe("{ not valid JSON");
	});
});

/** 제품 흐름에서 네이티브 저장 대화상자의 사용자가 고른 결과를 고정한다. */
async function mockSaveDialog(
	app: ElectronApplication,
	result: { canceled: boolean; filePath: string },
): Promise<void> {
	await app.evaluate(({ dialog }, nextResult) => {
		dialog.showSaveDialog = async () => nextResult;
	}, result);
}

/** 제품 흐름에서 네이티브 열기 대화상자의 사용자가 고른 결과를 고정한다. */
async function mockOpenDialog(
	app: ElectronApplication,
	result: { canceled: boolean; filePaths: string[] },
): Promise<void> {
	await app.evaluate(({ dialog }, nextResult) => {
		dialog.showOpenDialog = async () => nextResult;
	}, result);
}

/** 진행 중 상태와 팝오버 수명 주기를 검증할 수 있도록 저장 대화상자를 끝내지 않는다. */
async function holdSaveDialog(app: ElectronApplication): Promise<void> {
	await app.evaluate(({ dialog }) => {
		dialog.showSaveDialog = () => new Promise(() => {});
	});
}

/** 파일 관리자 호출을 실제 창 대신 메인 프로세스의 제품 흐름 표식으로 받는다. */
async function mockRevealDataFile(app: ElectronApplication): Promise<void> {
	await app.evaluate(({ BrowserWindow, shell }) => {
		/** 파일 관리자 호출을 제품 흐름에서 읽을 표식. */
		const state = globalThis as typeof globalThis & {
			__yeonchaRevealedPath?: string | null;
		};
		state.__yeonchaRevealedPath = null;
		shell.showItemInFolder = (filePath) => {
			state.__yeonchaRevealedPath = filePath;
			// 파일 관리자가 비동기로 포커스를 가져가는 순간에도 팝오버를 붙잡는지 확인한다.
			setTimeout(() => BrowserWindow.getAllWindows()[0]?.emit("blur"), 25);
		};
	});
}

/** 메인 프로세스가 파일 관리자에 넘긴 저장 파일 경로를 읽는다. */
async function readRevealedPath(
	app: ElectronApplication,
): Promise<string | null> {
	return app.evaluate(() => {
		/** 파일 관리자 호출 표식의 타입. */
		const state = globalThis as typeof globalThis & {
			__yeonchaRevealedPath?: string | null;
		};
		return state.__yeonchaRevealedPath ?? null;
	});
}

/** 승인된 컴프와 비교할 정상 요약 첫 화면을 임시 산출물로 남긴다. */
async function captureSummaryScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "summary-first-view.png");
}

/** 승인된 컴프와 비교할 빠른 등록면을 임시 또는 지정된 증거 폴더에 남긴다. */
async function captureEntryScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "quick-entry.png");
}

/** 다크 테마의 빠른 등록면을 비교용 캡처로 남긴다. */
async function captureDarkEntryScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "quick-entry-dark.png");
}

/** 승인된 컴프와 비교할 다크 테마 요약 첫 화면을 남긴다. */
async function captureDarkSummaryScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "summary-first-view-dark.png");
}

/** 승인된 컴프와 비교할 이력 인라인 수정 상태를 남긴다. */
async function captureHistoryEditScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "history-edit.png");
}

/** 다크 테마의 이력 인라인 수정 상태를 비교용 캡처로 남긴다. */
async function captureDarkHistoryEditScreenshot(page: Page): Promise<void> {
	await captureVisualScreenshot(page, "history-edit-dark.png");
}

/** 같은 제품 흐름에서 비교할 시각 상태를 지정된 증거 폴더에 저장한다. */
async function captureVisualScreenshot(
	page: Page,
	fileName: VisualScreenshotName,
): Promise<void> {
	/** 기본은 임시 산출물이고, 지정하면 리뷰에 남길 저장소 경로를 쓴다. */
	const outputDirectory =
		process.env.YEONCHA_E2E_ARTIFACT_DIR ?? SCREENSHOT_DIRECTORY;
	await mkdir(outputDirectory, { recursive: true });
	/** Playwright가 캡처한 사용자-visible 화면 데이터. */
	const screenshot = await page.screenshot();
	/** 컴프 대조에 사용할 고정된 산출물 위치. */
	const screenshotPath = path.join(outputDirectory, fileName);
	await writeFile(screenshotPath, screenshot);
}

/** 상태 전환 뒤 지정한 요소가 실제 문서 포커스를 갖는지 확인한다. */
async function expectDocumentFocus(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	/** 렌더러 효과와 상태 전환이 정착할 때까지 확인할 횟수. */
	const maxAttempts = 20;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		if (
			await locator.evaluate((element) => element === document.activeElement)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("문서 포커스를 확인하지 못했습니다");
}
