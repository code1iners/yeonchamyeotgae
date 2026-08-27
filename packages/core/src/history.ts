import { type GrantDetail, isValidOn } from "./balance.ts";
import type { Grant, GrantSource } from "./grants.ts";
import { compareDate } from "./iso-date.ts";
import type { Adjustment, LeaveEntry } from "./storage.ts";

/** 이력 리스트의 연차 연도 섹션 하나(스펙 5.3절). */
export type LeaveYearSection = {
	/** 연차 연도 이름 — 그 연도가 시작한 해. */
	year: number;
	/** 이 연도에 속한 사용 기록. 최근 것부터. */
	entries: LeaveEntry[];
};

/** 이력 탭 리스트 뷰의 세 덩어리(스펙 5.3절). */
export type HistorySections = {
	/** 조회일 이후의 기록 — 맨 위 예정 섹션. 가까운 날짜부터. */
	planned: LeaveEntry[];
	/** 조회일까지의 기록을 연차 연도별로 묶은 섹션들. 최근 연도부터. */
	years: LeaveYearSection[];
	/** 조회일이 속한 연차 연도 — 이 섹션만 펼친 채로 연다. */
	currentYear: number;
};

/**
 * 휴가 이력을 예정 / 연차 연도별 사용으로 묶는다(스펙 5.3절).
 *
 * 연차 연도는 저장되지 않는 파생값이다(3.10절) — 진실은 발생 레코드의 소멸일이고,
 * 여기서는 각 기록 날짜에 유효한 발생분의 소멸일에서 연도 이름을 끌어낸다. 사용·예정의
 * 경계는 잔여 계산(3.9절)과 같아야 하므로 조회일 당일까지가 사용이다.
 */
export function groupHistory({
	grants,
	entries,
	today,
}: {
	grants: Grant[];
	entries: LeaveEntry[];
	today: string;
}): HistorySections {
	/** 조회일 이후의 기록 — 가까운 예정이 먼저 보이게 오름차순. */
	const planned = entries
		.filter((entry) => compareDate(entry.date, today) > 0)
		.sort((a, b) => compareDate(a.date, b.date));

	/** 연차 연도 이름 → 그 연도의 사용 기록. */
	const byYear = new Map<number, LeaveEntry[]>();
	for (const entry of entries) {
		// 예정인가요? 사용 섹션이 아니다.
		if (compareDate(entry.date, today) > 0) {
			continue;
		}
		/** 이 기록이 속한 연차 연도. */
		const year = leaveYearOf(grants, entry.date);
		byYear.set(year, [...(byYear.get(year) ?? []), entry]);
	}

	/** 연차 연도 섹션들 — 최근 연도부터, 섹션 안도 최근 기록부터. */
	const years = [...byYear.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([year, grouped]) => ({
			year,
			entries: grouped.sort((a, b) => compareDate(b.date, a.date)),
		}));

	return { planned, years, currentYear: leaveYearOf(grants, today) };
}

/**
 * 그 날짜가 속한 연차 연도의 이름(스펙 3.10절).
 *
 * 그날 유효한 발생분의 소멸일 중 가장 늦은 것이 연도의 경계이고, 그 소멸일을 공유하는
 * 발생분의 가장 이른 발생일의 연도가 이름이 된다 — 입사일 기준(발생일의 해)과 회계연도
 * 기준(그 해 1/1) 모두에서 사람이 부르는 연도와 맞는다. 유효한 발생분이 하나도 없으면
 * (첫 발생 전의 기록) 날짜 자신의 연도로 둔다 — 이름일 뿐 계산에 쓰이지 않는다.
 *
 * **배정된 발생분이 아니라 그날의 경계로 정한다.** 배정 기반이면 기록을 하나 더할 때마다
 * 배정이 밀리며 과거 기록의 소속 연도까지 움직인다 — "언제 썼는지 훑는" 리스트의 묶음은
 * 안정적이어야 한다.
 */
function leaveYearOf(grants: Grant[], date: string): number {
	/** 그날 유효한 발생분의 소멸일 중 가장 늦은 것. */
	let boundary: string | null = null;
	for (const grant of grants) {
		if (
			isValidOn(grant, date) &&
			(boundary === null || compareDate(grant.expiryDate, boundary) > 0)
		) {
			boundary = grant.expiryDate;
		}
	}

	// 유효한 발생분이 없나요? 날짜 자신의 연도가 마지막 대비책이다.
	if (boundary === null) {
		return yearOf(date);
	}
	return leaveYearNameOf(grants, boundary);
}

/** 소멸일 하나에서 사라진 미사용분 한 줄(스펙 5.7절). */
export type ExpiryLoss = {
	/** 소멸일 — 달력의 빨간 밑줄이 이 날짜에 붙는다. */
	expiryDate: string;
	/** 그 소멸일이 속한 연차 연도의 이름. */
	year: number;
	/** 사라진 발생분의 출처. */
	source: GrantSource;
	/** 조정이면 그 메모. 없으면 빈 문자열. */
	note: string;
	/** 사라진 미사용 일수 합. */
	days: number;
};

/**
 * 소멸일이 지나 사라진 미사용분을 소멸일·출처별로 합친다(스펙 5.7절).
 *
 * 리스트 뷰 맨 아래의 소멸 섹션과 달력의 빨간 밑줄이 같은 목록을 쓴다. 이미 소멸한
 * 것만 본다 — 아직 살아 있는 발생분의 남은 양은 손실이 아니라 잔여이고, 임박 경고는
 * 요약 탭의 D-day 배지가 맡는다(경로 1). 최근 소멸일이 먼저 온다.
 */
export function expiryLosses({
	grants,
	adjustments,
}: {
	grants: GrantDetail[];
	adjustments: Adjustment[];
}): ExpiryLoss[] {
	/** 아직 어느 줄에도 짝지어지지 않은 조정 — 메모를 찾을 때 하나씩 소비한다. */
	const unmatched = [...adjustments];
	/** 소멸일·출처·메모가 같은 손실을 합치는 통. */
	const merged = new Map<string, ExpiryLoss>();

	for (const grant of grants) {
		// 소멸일을 지나고도 남은 양이 있나요? 그것만 손실이다.
		if (!grant.expired || grant.remaining <= 0) {
			continue;
		}

		/** 이 발생분의 메모 — 같은 값의 조정 레코드에서 가져온다. */
		const note =
			grant.source === "adjustment" ? takeNote(unmatched, grant) : "";
		/** 합치는 키. */
		const key = `${grant.expiryDate}|${grant.source}|${note}`;
		/** 이미 있는 줄. */
		const line = merged.get(key);

		if (line) {
			line.days += grant.remaining;
		} else {
			merged.set(key, {
				expiryDate: grant.expiryDate,
				year: leaveYearNameOf(grants, grant.expiryDate),
				source: grant.source,
				note,
				days: grant.remaining,
			});
		}
	}

	return [...merged.values()].sort((a, b) =>
		compareDate(b.expiryDate, a.expiryDate),
	);
}

/**
 * 발생분과 같은 값(발생일·소멸일·일수)의 조정을 찾아 메모를 꺼내고 목록에서 지운다.
 *
 * 발생 레코드에는 조정의 `id`가 남지 않아 값으로 짝짓는다. 같은 값의 조정이 여럿이면
 * 하나씩 소비해 메모가 두 줄에 겹으로 붙지 않게 한다. 못 찾으면 빈 문자열이다.
 */
function takeNote(unmatched: Adjustment[], grant: GrantDetail): string {
	/** 같은 값을 가진 조정의 위치. */
	const index = unmatched.findIndex(
		(adjustment) =>
			adjustment.grantDate === grant.grantDate &&
			adjustment.expiryDate === grant.expiryDate &&
			adjustment.days === grant.days,
	);
	// 짝이 없나요? 값이 어긋난 것이므로 메모 없이 둔다.
	if (index < 0) {
		return "";
	}
	return unmatched.splice(index, 1)[0]?.note ?? "";
}

/**
 * 소멸일 하나의 연차 연도 이름 — 그 소멸일을 공유하는 발생분의 가장 이른 발생일의 연도.
 * 공유하는 발생분이 자기 자신뿐이어도 성립한다(조정의 발생일 연도가 이름이 된다).
 */
function leaveYearNameOf(
	grants: { grantDate: string; expiryDate: string }[],
	expiryDate: string,
): number {
	/** 그 소멸일을 공유하는 발생분의 가장 이른 발생일. */
	let earliest: string | null = null;
	for (const grant of grants) {
		if (
			grant.expiryDate === expiryDate &&
			(earliest === null || compareDate(grant.grantDate, earliest) < 0)
		) {
			earliest = grant.grantDate;
		}
	}
	return yearOf(earliest ?? expiryDate);
}

/** YYYY-MM-DD의 연도. */
function yearOf(date: string): number {
	return Number(date.slice(0, 4));
}
