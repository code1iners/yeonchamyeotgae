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
		expect(
			await flow.page
				.getByText("변경한 값이 없습니다.", { exact: true })
				.isVisible(),
		).toBe(true);
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
			flow.page.getByText(
				"지우면 삭제 직전 상태가 data.json.bak에 백업됩니다. 남겨두면 이 기록은 그대로 두고 계산에만 새 입사일을 적용합니다.",
				{ exact: true },
			),
		);

		// 보존을 고르면 파일의 기존 기록은 남고 백업은 만들지 않는다.
		await flow.page.getByRole("button", { name: "남기고 저장" }).click();
		await confirmTitle.waitFor({ state: "detached" });
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
		await plannedRow.hover();
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
		await currentRow.hover();
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
		/** 키보드 포커스로도 행 행동을 발견할 수 있는 수정 버튼. */
		const editButton = plannedRow.getByRole("button", { name: "수정" });
		await editButton.focus();
		await expectVisible(plannedRow.getByRole("button", { name: "삭제" }));
		await editButton.press("Enter");
		await expectVisible(plannedRow.getByLabel("날짜"));
		await flow.page.getByLabel("날짜").fill("2025-12-16");
		await plannedRow.getByRole("button", { name: "반차", exact: true }).click();
		await plannedRow.getByRole("button", { name: "저장" }).click();

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
		await updatedPlannedRow.hover();
		await updatedPlannedRow.getByRole("button", { name: "삭제" }).click();
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
		await expectVisible(flow.page.getByText("15일", { exact: true }));
		expect(
			await flow.page.getByText("2025-11-27", { exact: true }).count(),
		).toBe(0);
	});

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
		expect(scrollState).toEqual({
			regionScrollable: true,
			pageScrollable: false,
		});
		await expectVisible(flow.page.getByRole("heading", { name: "연차몇개" }));
		await expectVisible(flow.page.getByRole("tab", { name: "이력" }));
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

		/** 사용 기록을 키보드로 선택한다. */
		await usedDay.focus();
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
			selectedDetails.getByText("이 날에는 기록이 없습니다.", { exact: true }),
		);
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

		// 시작일과 종료일을 역순으로 넣어도 주말과 기존 기록을 뺀 2건을 미리 보여준다.
		await flow.page.getByRole("button", { name: "휴가 등록" }).click();
		sheet = flow.page.getByRole("dialog", { name: "휴가 등록" });
		await flow.page
			.getByRole("button", { name: "기간으로", exact: true })
			.click();
		await flow.page.getByLabel("날짜").fill("2025-12-09");
		await flow.page.getByLabel("종료일").fill("2025-12-05");
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

/** 저장 커밋이 임시 파일에 반영되고 난 뒤 조건을 만족하는 데이터를 읽는다. */
async function waitForStoredData(
	userDataDirectory: string,
	predicate: (data: LeaveData) => boolean,
): Promise<LeaveData> {
	/** 격리 저장 파일 경로. */
	const filePath = path.join(userDataDirectory, "data.json");
	/** 원자적 저장 교체가 끝날 때까지 확인할 최대 횟수. */
	const maxAttempts = 20;
	// 저장 교체 순간의 읽기 실패나 이전 내용은 짧은 간격으로 다시 확인한다.
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

/** 탭 키로 도달한 조작의 포커스와 실제 포커스 테두리를 함께 확인한다. */
async function expectKeyboardFocus(
	locator: ReturnType<Page["locator"]>,
): Promise<void> {
	expect(
		await locator.evaluate((element) => element === document.activeElement),
	).toBe(true);
	expect(
		await locator.evaluate((element) => {
			const style = getComputedStyle(element);
			return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
		}),
	).toBe(true);
}
