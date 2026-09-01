import type { Balance } from "@yeoncha/core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { HistoryTab } from "./HistoryTab";
import { LeaveEntrySheet } from "./LeaveEntrySheet";
import { SettingsTab } from "./SettingsTab";
import { SummaryTab } from "./SummaryTab";
import { UnreadableScreen } from "./UnreadableScreen";
import { useAppState } from "./use-app-state";

/** 팝오버의 탭 셋(5절). 배열 순서가 곧 탭 막대의 순서다. */
const TABS = [
	/** 잔여가 왜 그 값인지 — 4줄 표와 살아 있는 발생분(24번). */
	{ key: "summary", label: "요약" },
	/** 휴가 이력을 리스트 또는 달력으로(26번). */
	{ key: "history", label: "이력" },
	/** 입사일 · 기준방식 · 조정. 입사일이 없으면 이 탭만 활성이다. */
	{ key: "settings", label: "설정" },
] as const;

/** 탭 식별자. */
type TabKey = (typeof TABS)[number]["key"];

/** 탭과 연결된 버튼의 고유 식별자. */
function tabId(key: TabKey): string {
	return `tab-${key}`;
}

/** 탭과 연결된 패널의 고유 식별자. */
function panelId(key: TabKey): string {
	return `panel-${key}`;
}

/**
 * 고른 탭과, 그 탭으로 간 이유.
 *
 * 이유를 탭과 한 값으로 묶는다 — 따로 두면 탭을 바꿔도 이유가 남아, 나중에 그냥
 * 설정 탭을 눌러 들어온 사람에게 조정 폼이 저절로 열린다.
 */
type Selection = {
	/** 고른 탭. */
	tab: TabKey;
	/** 설정 탭에 도착하면서 조정 폼을 열어둘 것인가(5.1절). */
	openAdjustment: boolean;
};

/**
 * 팝오버 루트 — 헤더 · 탭 막대 · 탭 내용, 그리고 내용 높이 보고(5.6절).
 *
 * 폭은 셸이 380px로 고정하고 높이만 여기서 정해진다. 별도 창은 없다 — 화면은 전부
 * 이 안에 있다.
 */
export function App() {
	/** 높이 측정 대상인 팝오버 본문 요소. */
	const rootRef = useRef<HTMLDivElement>(null);
	/** 셸이 준 상태. 아직 못 받았으면 `null`이다. */
	const state = useAppState();
	/** 사용자가 고른 탭과 그 이유. 입사일이 없는 동안에는 설정으로 고정된다. */
	const [selected, setSelected] = useState<Selection>({
		tab: "summary",
		openAdjustment: false,
	});
	/** 휴가 등록 시트가 열려 있는가. 열리면 팝오버 전체를 덮는다 — 모드 전환이다(5.2절). */
	const [entryOpen, setEntryOpen] = useState(false);

	useEffect(function reportContentHeightEffect() {
		const root = rootRef.current;
		if (!root) {
			return;
		}
		// 내용 높이가 바뀔 때마다 셸에 보고해 창 높이를 맞춘다.
		const observer = new ResizeObserver(() => {
			window.yeoncha.reportContentHeight(
				Math.ceil(root.getBoundingClientRect().height),
			);
		});
		observer.observe(root);
		return () => {
			observer.disconnect();
		};
	}, []);

	/**
	 * 입사일이 없나요? 계산할 것이 없으므로 설정 탭만 활성이다(5.4절).
	 *
	 * 트레이의 대시를 눌러 들어온 경로가 이것이고, 그래서 대시 클릭이 설정 탭을
	 * 연다(4.4절) — 셸이 탭을 지정해 보내지 않아도 상태 하나로 정해진다.
	 */
	const onboarding = state !== null && state.settings === null;
	/** 실제로 그릴 탭. */
	const tab: TabKey = onboarding ? "settings" : selected.tab;
	/** 탭을 선택하고 조정 추가 같은 이전 진입 맥락은 닫는다. */
	const selectTab = (nextTab: TabKey) => {
		setSelected({ tab: nextTab, openAdjustment: false });
	};
	/** 탭 목록에서 키보드로 다음 화면을 고르는 핸들러. */
	const handleTabKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		currentTab: TabKey,
	) => {
		/** 지금 상태에서 키보드로 갈 수 있는 탭. */
		const enabledTabs = onboarding
			? TABS.filter(({ key }) => key === "settings")
			: TABS;
		/** 현재 선택된 탭의 목록 위치. */
		const currentIndex = enabledTabs.findIndex(({ key }) => key === currentTab);
		if (currentIndex < 0) {
			return;
		}

		/** 키 입력으로 이동할 목록 위치. */
		let nextIndex = currentIndex;
		switch (event.key) {
			case "ArrowLeft":
				nextIndex =
					(currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
				break;
			case "ArrowRight":
				nextIndex = (currentIndex + 1) % enabledTabs.length;
				break;
			case "Home":
				nextIndex = 0;
				break;
			case "End":
				nextIndex = enabledTabs.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		/** 키보드로 이동할 탭. */
		const nextTab = enabledTabs[nextIndex];
		if (!nextTab) {
			return;
		}
		selectTab(nextTab.key);
		document.getElementById(tabId(nextTab.key))?.focus();
	};

	useEffect(
		function followOnboardingTabEffect() {
			// 온보딩 동안에는 고른 탭도 설정으로 맞춰둔다 — 그러지 않으면 입사일을 저장해
			// 탭이 열리는 순간 화면이 요약으로 튄다. 온보딩을 끝낸 사람은 아직 설정에 있다.
			if (onboarding) {
				setSelected({ tab: "settings", openAdjustment: false });
			}
		},
		[onboarding],
	);

	// 높이를 재는 뿌리 요소는 하나로 둔다 — 화면을 갈아끼울 때 이 요소까지 바뀌면
	// 마운트 때 건 ResizeObserver가 떨어져 나간 노드를 계속 보게 된다.
	return (
		<div className="popover-shell" ref={rootRef}>
			{/*
			 * 저장 파일을 읽지 못했나요? **탭 구조 자체를 그리지 않는다**(5.5절).
			 * 온보딩과 뭉뚱그리면 화면이 거짓말을 한다 — 입사일은 있는데 파일이 깨진
			 * 것이라 `입사일을 넣으면…`이 사실이 아니고, 탭을 띄우면 쓸 수 없는 입력이
			 * 열린다.
			 */}
			{state?.read.status === "error" ? (
				<UnreadableScreen kind={state.read.kind} />
			) : entryOpen && state?.balance ? (
				/* 등록 시트는 탭 위에 겹치는 레이어가 아니라 팝오버 전체를 대신한다(5.2절).
				   잔여가 계산되는 상태에서만이다 — 온보딩·읽기 실패로 떨어지면 시트도 접힌다. */
				<LeaveEntrySheet
					entries={state.entries}
					today={state.today}
					onClose={() => setEntryOpen(false)}
				/>
			) : (
				state && (
					<>
						<header className="head">
							<h1 className="product-name">연차몇개</h1>
							{!onboarding && (
								<div className="head-balance">
									<span className="head-balance-label">잔여</span>
									{/* 초과가 있으면 경고색이다(5.1절). 요약 탭의 초과 행·원인 한 줄과
									    같은 조건이어야 한다 — 갈리면 헤더와 본문이 다른 말을 한다. */}
									<strong
										className={`num ${state.balance && state.balance.excess > 0 ? "warn" : ""}`}
									>
										{formatBalance(state.balance)}
									</strong>
								</div>
							)}
						</header>
						<div className="tabs" role="tablist" aria-label="연차 화면">
							{TABS.map(({ key, label }) => (
								<button
									key={key}
									type="button"
									role="tab"
									id={tabId(key)}
									aria-controls={panelId(key)}
									aria-selected={tab === key}
									tabIndex={tab === key ? 0 : -1}
									disabled={onboarding && key !== "settings"}
									onClick={() => selectTab(key)}
									onKeyDown={(event) => handleTabKeyDown(event, key)}
								>
									{label}
								</button>
							))}
						</div>
						{onboarding && (
							<p className="onboarding">입사일을 넣으면 연차를 계산합니다.</p>
						)}
						<div
							id={panelId("summary")}
							role="tabpanel"
							aria-labelledby={tabId("summary")}
							hidden={tab !== "summary"}
							tabIndex={-1}
						>
							{tab === "summary" && state.balance && (
								<SummaryTab
									balance={state.balance}
									today={state.today}
									onAddAdjustment={() =>
										setSelected({ tab: "settings", openAdjustment: true })
									}
									onAddEntry={() => setEntryOpen(true)}
								/>
							)}
						</div>
						<div
							id={panelId("history")}
							role="tabpanel"
							aria-labelledby={tabId("history")}
							hidden={tab !== "history"}
							tabIndex={-1}
						>
							{tab === "history" && state.balance && (
								<HistoryTab
									entries={state.entries}
									balance={state.balance}
									adjustments={state.adjustments}
									today={state.today}
								/>
							)}
						</div>
						<div
							id={panelId("settings")}
							role="tabpanel"
							aria-labelledby={tabId("settings")}
							hidden={tab !== "settings"}
							tabIndex={-1}
						>
							{tab === "settings" && (
								<SettingsTab
									settings={state.settings}
									entries={state.entries}
									adjustments={state.adjustments}
									grants={state.balance?.grants ?? []}
									today={state.today}
									openAdjustment={selected.openAdjustment}
								/>
							)}
						</div>
					</>
				)
			)}
		</div>
	);
}

/**
 * 헤더에 표시할 잔여 문구. 온보딩에서는 잔여 영역 자체를 렌더링하지 않으며,
 * 이 함수가 호출되는 계산 가능 상태에서는 정확한 소수 값을 그대로 보여준다.
 *
 * **반올림도 절사도 하지 않는다**(5.1절). Windows에서는 이 화면이 정확한 잔여를
 * 볼 수 있는 유일한 곳이다.
 */
function formatBalance(balance: Balance | null): string {
	return balance ? `${balance.balance}일` : "—";
}
