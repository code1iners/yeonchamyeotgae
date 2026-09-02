import type { Balance, GrantSource, LivingGrant } from "@yeoncha/core";
import { livingGrants } from "@yeoncha/core";
import type { RefObject } from "react";

type Props = {
	/** 조회일 기준 잔여와 발생분별 내역. 이 화면의 모든 숫자가 여기서 나온다. */
	balance: Balance;
	/** 조회일. 소멸까지 남은 날을 세는 기준이다. */
	today: string;
	/** 등록면이 닫힌 뒤 포커스를 돌려줄 휴가 등록 버튼. */
	entryTriggerRef: RefObject<HTMLButtonElement | null>;
	/** `조정을 추가` 링크 — 설정 탭으로 넘어가며 조정 폼이 열린 채로 도착한다(5.1절). */
	onAddAdjustment: () => void;
	/** `[휴가 등록]` — 팝오버를 덮는 등록 시트가 열린다(5.2절). */
	onAddEntry: () => void;
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
	{ key: "planned", label: "예정", note: "앞으로 쓸 휴가 중 배정된 몫" },
	/** 어느 발생분에도 배정되지 못한 일수(3.6절). 0보다 클 때만 행이 붙는다. */
	{ key: "excess", label: "초과", note: "배정되지 못해 잔여를 깎는 몫" },
	/** 위의 항들을 더하고 뺀 결과. 트레이에 뜨는 숫자와 같은 값이다(4절). */
	{ key: "balance", label: "잔여", note: "트레이에 뜨는 숫자" },
] as const satisfies readonly {
	key: "granted" | "used" | "planned" | "excess" | "balance";
	label: string;
	note: string;
}[];

/** 발생분 리스트의 출처 문구(CONTEXT.md). */
const SOURCE_LABEL: Record<GrantSource, string> = {
	monthly: "월차",
	annual: "연차",
	adjustment: "조정",
};

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
	entryTriggerRef,
	onAddAdjustment,
	onAddEntry,
}: Props) {
	/** 조회일에 살아 있는 발생분. 소멸 임박 순으로 정렬되어 온다(3.4절). */
	const grants = livingGrants({ grants: balance.grants, today });
	/** 초과가 있는가 — 초과 행과 상단의 원인 한 줄이 이 값에 달려 있다. */
	const hasExcess = balance.excess > 0;
	/** 표 아래 각주. 미래 발생분에서 나가는 예정이 없으면 `null`이다. */
	const footnote = footnoteOf(balance);

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
							<tr
								className={`summary-row ${key === "balance" ? "summary-row-total" : ""}`}
								key={key}
							>
								<th className="sum-label" scope="row">
									{label}
								</th>
								<td className="sum-number num">
									<b>{balance[key]}</b>
								</td>
								<td className="sum-note dim">{note}</td>
							</tr>
						),
					)}
				</tbody>
			</table>
			{/*
			 * 각주가 유일한 해답이다(5.1절). 4줄의 `예정`에 등록 총량을 쓰면 검산이 깨지고,
			 * 배정분만 쓰고 각주가 없으면 사용자가 등록한 나머지가 요약에서 사라진다.
			 */}
			{footnote && <p className="footnote dim">{footnote}</p>}
			{/* 발생분이 많아져도 목록만 줄이고, 기록 시작 행동은 최초 뷰포트에 남긴다. */}
			<section className="summary-grants" aria-label="살아 있는 발생분">
				<div className="sec-title">살아 있는 발생분</div>
				{grants.length === 0 ? (
					<div className="row dim">지금 살아 있는 발생분이 없습니다.</div>
				) : (
					grants.map((grant) => (
						<div className="grant" key={keyOf(grant)}>
							<span>{SOURCE_LABEL[grant.source]}</span>
							<b className="num grant-amount">
								{grant.remaining}/{grant.days}
							</b>
							{/* 60일 이내면 날짜 대신 D-day다 — 날짜는 남은 시간을 계산하게 시킨다. */}
							{grant.expiringSoon ? (
								<span
									className="badge num warn"
									title={`소멸 임박, D-${grant.daysUntilExpiry}`}
								>
									D-{grant.daysUntilExpiry}
								</span>
							) : (
								<span className="grant-expiry dim num">{grant.expiryDate}</span>
							)}
						</div>
					))
				)}
			</section>
			<div className="cta">
				<button
					ref={entryTriggerRef}
					type="button"
					className="primary"
					onClick={onAddEntry}
				>
					휴가 등록
				</button>
			</div>
		</div>
	);
}

/**
 * 미래 발생분에서 나가는 예정을 말하는 각주(스펙 5.1절). 없으면 `null`이다.
 *
 * 스펙의 예시는 `내년 발생분`이지만 실제로 그 발생분이 내년 것이라는 보장이 없어
 * (회계연도 기준의 월차·비례분도 미래 발생분이 된다) 시점을 단정하지 않는다.
 */
function footnoteOf(balance: Balance): string | null {
	/** 미래 발생분에서 나가는 예정. */
	const onFuture = balance.plannedOnFutureGrants;

	// 미래 발생분에서 나가는 예정이 있나요? 없으면 4줄이 그대로 전부다.
	if (onFuture <= 0) {
		return null;
	}
	// 등록한 예정이 전부 미래 발생분에서 나가나요? 같은 숫자를 두 번 적으면
	// (`3일이지만 3일은`) 두 값이 다른 것을 말하는 문장이 스스로를 배반한다.
	if (onFuture === balance.plannedTotal) {
		return `등록한 예정 ${onFuture}일은 전부 아직 생기지 않은 발생분에서 나갑니다 — 지금 잔여에 없습니다`;
	}
	return `등록한 예정은 ${balance.plannedTotal}일이지만 ${onFuture}일은 아직 생기지 않은 발생분에서 나갑니다 — 지금 잔여에 없습니다`;
}

/** 발생분 행의 key. 발생 레코드에는 `id`가 없으므로 레코드를 이루는 값으로 만든다. */
function keyOf(grant: LivingGrant): string {
	return `${grant.source}-${grant.grantDate}-${grant.expiryDate}-${grant.days}`;
}
