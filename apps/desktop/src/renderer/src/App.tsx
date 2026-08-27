import type { Balance } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";
import { SettingsTab } from "./SettingsTab";
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
	/** 사용자가 고른 탭. 입사일이 없는 동안에는 설정으로 고정된다. */
	const [selectedTab, setSelectedTab] = useState<TabKey>("summary");

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
	/**
	 * 저장 파일을 읽지 못했는가. 온보딩과 뭉뚱그리면 화면이 거짓말을 한다 — 입사일은
	 * 있는데 파일이 깨진 것이므로 `입사일을 넣으면…`이 사실이 아니다. 팝오버 전체를
	 * 차지하는 오류 화면과 복구 버튼 둘은 5.5절대로 23번이 만든다.
	 */
	const unreadable = state?.read.status === "error";
	/** 실제로 그릴 탭. */
	const tab: TabKey = onboarding ? "settings" : selectedTab;

	useEffect(
		function followOnboardingTabEffect() {
			// 온보딩 동안에는 고른 탭도 설정으로 맞춰둔다 — 그러지 않으면 입사일을 저장해
			// 탭이 열리는 순간 화면이 요약으로 튄다. 온보딩을 끝낸 사람은 아직 설정에 있다.
			if (onboarding) {
				setSelectedTab("settings");
			}
		},
		[onboarding],
	);

	return (
		<div ref={rootRef}>
			{state && (
				<>
					{/* 온보딩에는 헤더를 두지 않는다 — 잔여 자리에 들어갈 대시는 방금 눌러
					    들어온 트레이 글리프와 같은 것이고(6절), 이 화면이 말할 것은 한 줄뿐이다. */}
					{!onboarding && (
						<div className="head">
							<span>잔여</span>
							<b className="num">{formatBalance(state.balance)}</b>
						</div>
					)}
					<div className="tabs" role="tablist">
						{TABS.map(({ key, label }) => (
							<button
								key={key}
								type="button"
								role="tab"
								aria-selected={tab === key}
								disabled={onboarding && key !== "settings"}
								onClick={() => setSelectedTab(key)}
							>
								{label}
							</button>
						))}
					</div>
					{onboarding &&
						(unreadable ? (
							<p className="error">저장 파일을 읽지 못했습니다.</p>
						) : (
							<p className="onboarding">입사일을 넣으면 연차를 계산합니다.</p>
						))}
					{/* 요약(24번)과 이력(26번)의 내용은 뒤 티켓이다 — 여기는 탭 전환까지다. */}
					<div role="tabpanel">
						{tab === "summary" && <PendingPane />}
						{tab === "history" && <PendingPane />}
						{tab === "settings" && (
							<SettingsTab
								settings={state.settings}
								adjustments={state.adjustments}
								grants={state.balance?.grants ?? []}
								today={state.today}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}

/**
 * 헤더의 잔여 문구. 계산할 수 없는 상태는 대시로 둔다 — 온보딩에서는 헤더 자체가
 * 없으므로 이 자리에 오는 것은 파일을 읽지 못한 경우뿐이다.
 *
 * **반올림도 절사도 하지 않는다**(5.1절). Windows에서는 이 화면이 정확한 잔여를
 * 볼 수 있는 유일한 곳이다. 경고색과 초과 표시는 24번이 붙인다.
 */
function formatBalance(balance: Balance | null): string {
	return balance ? `${balance.balance}일` : "—";
}

/** 아직 내용이 없는 탭. 탭 전환과 높이 변화를 확인할 수 있을 만큼만 그린다. */
function PendingPane() {
	return (
		<div className="pane">
			<div className="row dim">이 탭은 아직 비어 있습니다.</div>
		</div>
	);
}
