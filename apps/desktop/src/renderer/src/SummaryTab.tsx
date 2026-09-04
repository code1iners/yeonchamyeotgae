import type { Adjustment, Balance } from "@yeoncha/core";
import { Fragment } from "react";
import { HelpTooltip } from "./HelpTooltip";
import { type LedgerHelpTerm, TERM_HELP } from "./help-content";
import {
	type SummaryGrant,
	summaryGrantLabel,
	summaryGrants,
} from "./summary-grants";

type Props = {
	/** 조회일 기준 잔여와 발생분별 내역. 이 화면의 모든 숫자가 여기서 나온다. */
	balance: Balance;
	/** 조회일. 소멸까지 남은 날을 세는 기준이다. */
	today: string;
	/** 조정 원본. 발생분 행의 이름을 계산 결과와 연결한다. */
	adjustments: Adjustment[];
	/** `조정을 추가` 링크 — 설정 탭으로 넘어가며 조정 폼이 열린 채로 도착한다(5.1절). */
	onAddAdjustment: () => void;
};

/**
 * 4줄 표의 행(스펙 5.1절). **설명이 숫자와 한 몸이다** — 이 표의 목적이 회사 시스템
 * 숫자와의 대조이므로 숫자만 있으면 무엇과 대조하는지 알 수 없다.
 *
 * `초과`는 잔여 바로 위에 선다. 스펙이 말하는 검산(`발생 − 사용 − 예정 − 초과 = 잔여`)이
 * 위에서 아래로 읽히려면 빼는 항이 전부 잔여보다 앞에 있어야 한다.
 */
const LINES = [
	/** 조회일에 살아 있는 레코드의 일수 합. 음수 조정도 합산 항으로 들어간다(3.5절). */
	{ key: "granted", label: "발생", note: "지금 살아 있는 발생분" },
	/** 살아 있는 발생분에 배정된 몫 중 오늘까지의 휴가 기록. */
	{ key: "used", label: "사용", note: "오늘까지 쓴 휴가" },
	/** 살아 있는 발생분에 배정된 몫 중 오늘 이후의 휴가 기록. 각주가 나머지를 말한다. */
	{ key: "planned", label: "예정", note: "현재 발생분에 배정된 예정" },
	/** 어느 발생분에도 배정되지 못한 일수(3.6절). 0보다 클 때만 행이 붙는다. */
	{ key: "excess", label: "초과", note: "배정되지 못해 잔여를 깎는 몫" },
	/** 위의 항들을 더하고 뺀 결과. 트레이에 뜨는 숫자와 같은 값이다(4절). */
	{ key: "balance", label: "잔여", note: "트레이에 뜨는 숫자" },
] as const satisfies readonly {
	key: "granted" | "used" | "planned" | "excess" | "balance";
	label: string;
	note: string;
}[];

/**
 * 요약 탭 — **"지금 몇 개인지"의 근거**다(스펙 5.1절). 트레이 숫자가 왜 그 값인지가
 * 전부 여기에 있다.
 *
 * 잔여를 큰 숫자로 다시 띄우지 않는다 — 트레이에 이미 있다. 이 화면이 트레이보다
 * 더 갖는 것은 **근거**뿐이고, 그래서 4줄 표와 발생분 리스트가 본문이다.
 *
 * 이 탭이 **소멸을 알아채는 두 경로 중 하나**를 갖는다(5.7절). 트레이는 소멸에 아무
 * 표시도 하지 않고 OS 알림도 없으므로, 발생분 행의 D-day 배지가 사라질 연차를 말하는
 * 두 자리 중 하나다.
 */
export function SummaryTab({
	balance,
	today,
	adjustments,
	onAddAdjustment,
}: Props) {
	/** 조회일에 살아 있는 발생분. 소멸 임박 순으로 정렬되어 온다(3.4절). */
	const grants = summaryGrants({ balance, adjustments, today });
	/** 초과가 있는가 — 초과 행과 상단의 원인 한 줄이 이 값에 달려 있다. */
	const hasExcess = balance.excess > 0;
	/** 표 아래에서 등록 총량과 아직 잔여에 반영되지 않은 양을 항상 보여준다. */
	/** 같은 발생일의 빈 메모 조정 수를 세어 반복된 화면 이름을 구분한다. */
	const blankAdjustmentDateCounts = grants.reduce((counts, grant) => {
		if (grant.source === "adjustment" && !grant.adjustmentNote?.trim()) {
			counts.set(grant.grantDate, (counts.get(grant.grantDate) ?? 0) + 1);
		}
		return counts;
	}, new Map<string, number>());
	/** 같은 발생일의 빈 메모 조정이 둘 이상인 날짜. */
	const duplicateBlankAdjustmentDates = new Set(
		[...blankAdjustmentDateCounts]
			.filter(([, count]) => count > 1)
			.map(([date]) => date),
	);

	return (
		<div className="pane">
			{/* 원인 표시와 조치가 한 동선이어야 한다(5.1절) — 그래서 링크가 원인 옆에 있다. */}
			{hasExcess && (
				<div className="alert">
					<p>
						초과 {balance.excess}일 — 어느 발생분에도 배정되지 못한 휴가입니다
					</p>
					<button type="button" className="link" onClick={onAddAdjustment}>
						조정을 추가
					</button>
				</div>
			)}
			<table className="summary-table" aria-label="잔여 계산">
				<tbody>
					{LINES.filter((line) => line.key !== "excess" || hasExcess).map(
						({ key, label, note }) => (
							<Fragment key={key}>
								{key === "balance" && (
									<tr className="summary-equation-row">
										<td colSpan={3}>
											<span className="summary-equation">
												{summaryEquation(hasExcess)}
											</span>
										</td>
									</tr>
								)}
								<tr
									className={`summary-row ${key === "balance" ? "summary-row-total" : ""}`}
								>
									<th className="sum-label" scope="row">
										{label}
									</th>
									<td className="sum-number num selectable">
										<b>{balance[key]}</b>
									</td>
									<td className="sum-note dim">
										<span className="sum-note-content">{note}</span>
										{lineHelpTerms(key).map((term) => (
											<HelpTooltip
												key={term}
												label={`${term} 도움말`}
												context={term}
											>
												{TERM_HELP[term]}
											</HelpTooltip>
										))}
									</td>
								</tr>
							</Fragment>
						),
					)}
				</tbody>
			</table>
			{/*
			 * 각주가 유일한 해답이다(5.1절). 4줄의 `예정`에 등록 총량을 쓰면 검산이 깨지고,
			 * 배정분만 쓰고 각주가 없으면 사용자가 등록한 나머지가 요약에서 사라진다.
			 */}
			<p className="footnote planned-summary dim">
				{plannedSummaryOf(balance)}
			</p>
			{/* 발생분이 많아져도 목록만 줄이고, 기록 시작 행동은 최초 뷰포트에 남긴다. */}
			<section className="summary-grants" aria-label="살아 있는 발생분">
				<div className="sec-title">살아 있는 발생분</div>
				<div className="grant-header">
					<span>출처</span>
					<span>남은 양/총량</span>
					<span>소멸일 또는 소멸까지</span>
				</div>
				<section className="summary-grants-scroll" aria-label="발생분 목록">
					{grants.length === 0 ? (
						<div className="row dim">지금 살아 있는 발생분이 없습니다.</div>
					) : (
						grants.map((grant, index) => {
							/** 행에서 읽을 출처 이름. 긴 메모는 CSS로 줄이고 전체는 title에 남긴다. */
							const sourceLabel = summaryGrantLabel(grant, {
								duplicateBlankDate: duplicateBlankAdjustmentDates.has(
									grant.grantDate,
								),
							});
							return (
								<div className="grant" key={keyOf(grant, index)}>
									<span className="grant-source selectable" title={sourceLabel}>
										{sourceLabel}
									</span>
									<b className="num grant-amount selectable">
										<span aria-hidden="true">
											{grant.remaining}/{grant.days}
										</span>
										<span className="sr-only">
											남은 양 {grant.remaining}일 / 총량 {grant.days}일
										</span>
									</b>
									{/* D-day와 정확한 소멸일을 함께 보여줘 계산 기준을 추측하지 않게 한다. */}
									<span
										className="grant-expiry dim num selectable"
										title={
											grant.expiringSoon
												? `소멸 임박, D-${grant.daysUntilExpiry}`
												: `소멸일 ${grant.expiryDate}`
										}
									>
										<span aria-hidden="true">
											{grant.expiringSoon && (
												<span className="badge num warn">
													D-{grant.daysUntilExpiry}
												</span>
											)}
											<span className="grant-expiry-date">
												{grant.expiryDate}
											</span>
										</span>
										<span className="sr-only">
											{grant.expiringSoon
												? `소멸까지 ${grant.daysUntilExpiry}일, 소멸일 ${grant.expiryDate}`
												: `소멸일 ${grant.expiryDate}`}
										</span>
									</span>
								</div>
							);
						})
					)}
				</section>
			</section>
		</div>
	);
}

/** 등록 예정 총량과 아직 현재 잔여에 반영되지 않은 양을 말하는 각주(스펙 5.1절). */
function plannedSummaryOf(balance: Balance): string {
	return (
		"등록 예정 총 " +
		balance.plannedTotal +
		"일 · 잔여 미반영 " +
		balance.plannedOnFutureGrants +
		"일"
	);
}

/** 잔여 계산의 모든 항을 사용자가 바로 검산할 수 있는 한 줄로 만든다. */
function summaryEquation(hasExcess: boolean): string {
	return hasExcess
		? "발생 − 사용 − 예정 − 초과 = 잔여"
		: "발생 − 사용 − 예정 = 잔여";
}

/** 요약 행에서 용어 설명을 열 물음표의 순서. */
function lineHelpTerms(key: (typeof LINES)[number]["key"]): LedgerHelpTerm[] {
	if (key === "granted") {
		return ["발생"];
	}
	if (key === "planned") {
		return ["예정", "배정"];
	}
	if (key === "excess") {
		return ["초과"];
	}
	return [];
}

/** 발생분 행의 key. 화면 모델의 조정 ID와 index로 같은 값을 안전하게 구분한다. */
function keyOf(grant: SummaryGrant, index: number): string {
	return [
		grant.source,
		grant.grantDate,
		grant.expiryDate,
		grant.days,
		grant.adjustmentId ?? index,
	].join("-");
}
