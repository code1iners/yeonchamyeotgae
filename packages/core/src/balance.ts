import type { Grant, GrantSource } from "./grants.ts";
import { compareDate } from "./iso-date.ts";
import type { LeaveEntry } from "./storage.ts";

/**
 * 발생 레코드 1건에서 나간 휴가 기록 한 건의 몫.
 *
 * 사용과 예정은 날짜에서 파생되므로(CONTEXT.md) 배정 자체는 둘을 구분하지 않는다.
 * 조회일을 아는 computeBalance가 이 날짜로 갈라 4줄 표의 사용·예정을 만든다.
 */
export type Draw = {
	/** 휴가 날짜. YYYY-MM-DD. */
	date: string;
	/** 이 레코드에서 나간 일수. */
	days: number;
};

/** 발생 레코드 1건의 배정 결과(스펙 3.4절). */
export type Allocation = {
	/** 배정 대상 발생 레코드. */
	grant: Grant;
	/** 배정된 사용량. 음수 조정은 배정 대상이 아니므로 0이다. */
	allocated: number;
	/** 남은 양 — 일수 − 배정량. */
	remaining: number;
	/** 이 레코드에서 나간 휴가 기록별 몫. 휴가 날짜 오름차순. */
	draws: Draw[];
};

/** 어느 발생분에도 배정되지 못한 일수 한 덩어리(스펙 3.6절). */
export type Excess = {
	/** 초과가 생긴 휴가 날짜. */
	date: string;
	/** 배정되지 못한 일수. */
	days: number;
	/**
	 * 이 초과가 사라지는 날. 그 날짜에 유효했던 발생 레코드들의 소멸일 중 가장 늦은
	 * 것이며, 유효한 레코드가 하나도 없었으면(발생 전 사용) 그 뒤 처음 생기는 발생분의
	 * 소멸일이다. 둘 다 없으면 `null`이고 아직 소멸하지 않은 것으로 다룬다.
	 */
	expiryDate: string | null;
};

/** 배정 결과 전체. */
export type AllocationResult = {
	/** 발생 레코드별 배정 결과. 입력 `grants`와 같은 순서·길이다. */
	allocations: Allocation[];
	/** 초과 덩어리. 휴가 날짜 오름차순. */
	excesses: Excess[];
};

/** 발생 레코드 1건의 조회 시점 내역(스펙 1절). */
export type GrantDetail = {
	/** 발생일. */
	grantDate: string;
	/** 출처. */
	source: GrantSource;
	/** 발생 일수. */
	days: number;
	/** 배정된 사용량. */
	allocated: number;
	/** 남은 양. */
	remaining: number;
	/** 소멸일. */
	expiryDate: string;
	/** 소멸 여부 — 조회일이 소멸일을 지났는가. */
	expired: boolean;
	/**
	 * 살아 있는가 — `발생일 <= 조회일 <= 소멸일`(3.3절).
	 *
	 * **소멸하지 않은 것과 다르다.** 아직 오지 않은 발생분도 `expired`는 거짓이므로,
	 * 소멸 여부만 보면 내년 발생분이 올해 리스트에 섞여 든다(케이스 J). 요약 탭의
	 * 발생분 리스트가 이 값으로 걸러진다(5.1절).
	 */
	living: boolean;
};

/** 조회일 기준 잔여와 내역(스펙 3.5절·5.1절). */
export type Balance = {
	/** 잔여. 트레이에 뜨는 숫자다. 초과가 있으면 음수가 된다. */
	balance: number;
	/** 발생 — 조회일에 유효한 발생 레코드의 일수 합. 음수 조정도 합산 항으로 들어간다. */
	granted: number;
	/** 사용 — 조회일에 유효한 발생분에 배정된 몫 중 조회일까지의 휴가 기록. */
	used: number;
	/** 예정 — 조회일에 유효한 발생분에 배정된 몫 중 조회일 이후의 휴가 기록. */
	planned: number;
	/**
	 * 아직 유효하지 않은 미래 발생분에 배정된 예정. 잔여에서 빠지지 않는다.
	 * 요약 탭의 예정 총량·잔여 미반영 각주가 이 값을 쓴다.
	 */
	plannedOnFutureGrants: number;
	/**
	 * 등록한 예정의 총량 — 조회일 이후 휴가 기록의 일수 합. 각주의 앞쪽 숫자다.
	 * `planned`와 `plannedOnFutureGrants`의 합이 아니다 — 배정되지 못해 초과로 간
	 * 예정이 있으면 어느 쪽에도 잡히지 않기 때문에 총량을 따로 센다.
	 */
	plannedTotal: number;
	/** 초과 — 조회일에 아직 살아 있는 배정 실패분. */
	excess: number;
	/** 발생 레코드별 내역. 배정 정렬 키(소멸 임박 순) 그대로 정렬되어 있다. */
	grants: GrantDetail[];
};

/** source 정렬 순위 — monthly → annual → adjustment(스펙 3.4절 정렬 키). */
const SOURCE_RANK: Record<GrantSource, number> = {
	monthly: 0,
	annual: 1,
	adjustment: 2,
};

/**
 * 휴가 기록을 발생 레코드에 배정하고 초과를 남긴다(스펙 3.4절·3.6절).
 *
 * 잔여를 합계끼리 빼지 않는 이유가 이 함수다(3.1절) — 소멸일이 다른 발생분이 겹칠 때
 * 어느 쪽에서 나갔는지가 정해져야 잔여가 하나로 결정된다. 결과는 저장하지 않고
 * 조회 시점에 매번 계산한다.
 *
 * 날짜 비교는 문자열 비교다. 양쪽 모두 길이가 같은 YYYY-MM-DD이므로 사전순이 곧
 * 시간순이고, 여기서는 날짜 산술이 필요 없다.
 */
export function allocate({
	grants,
	entries,
}: {
	grants: Grant[];
	entries: LeaveEntry[];
}): AllocationResult {
	/** 발생 레코드별 배정 결과. 입력 순서를 보존해 그대로 돌려준다. */
	const allocations: Allocation[] = grants.map((grant) => ({
		grant,
		allocated: 0,
		remaining: grant.days,
		draws: [],
	}));

	/**
	 * 배정 후보 — 양수 레코드만 소멸 임박 순으로 세운다. 음수 조정은 이미 마이너스라
	 * 사용을 배정할 수 없고 잔여 공식의 합산 항으로만 들어간다(3.7절).
	 */
	const candidates = sortByAllocationOrder(allocations).filter(
		(allocation) => allocation.grant.days > 0,
	);

	/** 초과 덩어리. */
	const excesses: Excess[] = [];

	/**
	 * 날짜 오름차순으로 세운 휴가 기록 — 먼저 쓴 휴가가 소멸 임박분을 먼저 가져간다.
	 * 입력 순서는 하루 1건 불변식이 깨진 파일에서도 결과를 결정론적으로 만드는 뒷키다.
	 */
	const sorted = entries
		.map((entry, index) => ({ entry, index }))
		.sort(
			(a, b) => compareDate(a.entry.date, b.entry.date) || a.index - b.index,
		);

	for (const { entry } of sorted) {
		/** 아직 배정하지 못한 일수. */
		let need = entry.days;

		// 배정할 것이 없나요? 0일과 음수 기록은 건너뛴다.
		if (need <= 0) {
			continue;
		}

		for (const candidate of candidates) {
			// 다 배정했나요?
			if (need <= 0) {
				break;
			}
			// 이 휴가 날짜에 유효하고 아직 남은 레코드인가요?
			if (candidate.remaining <= 0 || !isValidOn(candidate.grant, entry.date)) {
				continue;
			}

			/** 이번 레코드에서 가져갈 몫. min으로 잘라 남은 양이 음수로 새지 않게 한다. */
			const take = Math.min(candidate.remaining, need);
			candidate.allocated += take;
			candidate.remaining -= take;
			candidate.draws.push({ date: entry.date, days: take });
			need -= take;
		}

		// 배정할 잔량이 모자랐나요? 남은 일수는 수명을 달고 초과로 간다(3.6절).
		if (need > 0) {
			excesses.push({
				date: entry.date,
				days: need,
				expiryDate: excessExpiryOn(grants, entry.date),
			});
		}
	}

	return { allocations, excesses };
}

/**
 * 조회일 기준 잔여와 발생 레코드별 내역을 낸다(스펙 3.5절).
 *
 * ```
 * 잔여 = Σ(조회일에 유효한 레코드의 일수 − 배정량) − (조회일에 아직 살아 있는 초과분)
 * ```
 *
 * 소멸은 공식의 항이 아니다 — "발생"을 조회일에 유효한 레코드로 정의해 공식을 3항으로
 * 유지한다(3.3절). 트레이용·팝오버용을 나눠 부르면 같은 배정을 두 번 하므로 잔여와
 * 내역이 한 번에 나온다(1절).
 */
export function computeBalance({
	grants,
	entries,
	today,
}: {
	grants: Grant[];
	entries: LeaveEntry[];
	today: string;
}): Balance {
	/** 배정 결과. */
	const { allocations, excesses } = allocate({ grants, entries });

	/** 내역 순서 — 배정과 같은 정렬 키다. 요약 탭의 "소멸 임박 순" 리스트가 이 순서다. */
	const ordered = sortByAllocationOrder(allocations);

	/** 발생 — 조회일에 유효한 레코드의 일수 합. */
	let granted = 0;
	/** 사용 — 유효한 레코드에 배정된 조회일까지의 휴가 기록. */
	let used = 0;
	/** 예정 — 유효한 레코드에 배정된 조회일 이후의 휴가 기록. */
	let planned = 0;
	/** 미래 발생분에 배정된 예정. 잔여에서 빠지지 않고 각주에만 쓰인다(5.1절). */
	let plannedOnFutureGrants = 0;
	/** 배정되지 않고 남은 양의 합 — 유효한 레코드에 대해서만 센다. */
	let unallocated = 0;

	/** 발생 레코드별 내역. */
	const details: GrantDetail[] = ordered.map((allocation) => {
		/** 발생 레코드와 그 배정 결과. */
		const { grant, allocated, remaining, draws } = allocation;
		/** 조회일에 유효한가요? 소멸일 당일도 유효하다(3.3절). */
		const valid = isValidOn(grant, today);

		if (valid) {
			granted += grant.days;
			unallocated += remaining;
			for (const draw of draws) {
				// 오늘까지의 기록은 사용, 오늘 이후는 예정이다. 상태는 날짜에서만 나온다(3.9절).
				if (compareDate(draw.date, today) <= 0) {
					used += draw.days;
				} else {
					planned += draw.days;
				}
			}
		} else if (compareDate(grant.grantDate, today) > 0) {
			// 아직 발생하지 않은 레코드 — 여기 배정된 것은 전부 미래 예정이다.
			for (const draw of draws) {
				plannedOnFutureGrants += draw.days;
			}
		}

		return {
			grantDate: grant.grantDate,
			source: grant.source,
			days: grant.days,
			allocated,
			remaining,
			expiryDate: grant.expiryDate,
			expired: compareDate(today, grant.expiryDate) > 0,
			living: valid,
		};
	});

	/**
	 * 조회일에 아직 살아 있는 초과분. 소멸일이 지난 초과는 없던 일이 된다(3.6절).
	 *
	 * `expiryDate`가 `null`인 초과는 아직 어떤 발생 레코드도 없는 상태에서 쓴 휴가다.
	 * 3.1절의 누적 오차가 아니다 — 첫 발생분이 생기는 순간 그 소멸일을 물려받으므로
	 * 수명 없는 상태가 첫 발생일을 넘겨 이어지지 않는다.
	 */
	const excess = excesses
		.filter(
			(entry) =>
				entry.expiryDate === null || compareDate(today, entry.expiryDate) <= 0,
		)
		.reduce((sum, entry) => sum + entry.days, 0);

	/** 등록한 예정의 총량 — 배정 여부와 무관한 조회일 이후 기록의 합(5.1절 각주). */
	const plannedTotal = entries
		.filter((entry) => compareDate(entry.date, today) > 0)
		.reduce((sum, entry) => sum + entry.days, 0);

	return {
		balance: unallocated - excess,
		granted,
		used,
		planned,
		plannedOnFutureGrants,
		plannedTotal,
		excess,
		grants: details,
	};
}

/**
 * 조회일에 살아 있는 발생분 중 가장 늦은 소멸일 — 조정 소멸일의 기본값이다(스펙 3.7절).
 *
 * 살아 있는 것이 하나도 없으면 `null`이고 입력 폼은 그 자리를 비워둔다. **규칙이 날짜를
 * 지어내지 않는다** — 이월 사용기한은 회사마다 다르고(1년 더 / 6개월 / 무기한), 규칙이
 * 정하면 조용히 틀린다.
 */
export function latestLivingExpiry({
	grants,
	today,
}: {
	grants: Grant[];
	today: string;
}): string | null {
	/** 지금까지 찾은 가장 늦은 소멸일. */
	let latest: string | null = null;

	for (const grant of grants) {
		// 조회일에 유효한 레코드인가요? 아직 발생하지 않은 것은 살아 있는 것이 아니다.
		if (!isValidOn(grant, today)) {
			continue;
		}
		if (latest === null || compareDate(grant.expiryDate, latest) > 0) {
			latest = grant.expiryDate;
		}
	}

	return latest;
}

/**
 * 그 발생분이 대상일에 유효한가 — `발생일 <= 대상일 <= 소멸일`(스펙 3.3절).
 *
 * 3.3절 규칙의 유일한 구현이다. 이력의 연차 연도 파생(history.ts)도 이것을 쓴다 —
 * 같은 규칙을 두 모듈이 각자 들면 한쪽만 고쳐지는 날이 온다.
 */
export function isValidOn(
	grant: Pick<Grant, "grantDate" | "expiryDate">,
	date: string,
): boolean {
	return (
		compareDate(grant.grantDate, date) <= 0 &&
		compareDate(date, grant.expiryDate) <= 0
	);
}

/**
 * 배정·내역 정렬 키(스펙 3.4절): `소멸일 ↑ → 발생일 ↑ → source → 입력 순서`로 세운다.
 *
 * 앞의 두 키가 "소멸 임박 순"으로 사용자 손실을 최소화하고, 뒤의 두 키는 잔여 값을
 * 바꾸지 않고 내역 표시와 테스트를 결정론적으로 만든다. 입력 순서가 마지막 키이므로
 * 입력 배열의 위치를 뒷키로 들고 정렬한 뒤 다시 벗긴다.
 */
function sortByAllocationOrder(allocations: Allocation[]): Allocation[] {
	return allocations
		.map((allocation, index) => ({ allocation, index }))
		.sort(
			(a, b) =>
				compareDate(
					a.allocation.grant.expiryDate,
					b.allocation.grant.expiryDate,
				) ||
				compareDate(
					a.allocation.grant.grantDate,
					b.allocation.grant.grantDate,
				) ||
				SOURCE_RANK[a.allocation.grant.source] -
					SOURCE_RANK[b.allocation.grant.source] ||
				a.index - b.index,
		)
		.map(({ allocation }) => allocation);
}

/**
 * 초과 한 덩어리의 소멸일을 정한다(스펙 3.6절).
 *
 * 그 날짜에 유효했던 레코드들의 소멸일 중 가장 늦은 것 — 쉽게 말해 그 연차 연도가
 * 끝나면 초과도 없던 일이 된다. 유효한 레코드가 하나도 없는 발생 전 사용이면 그 뒤
 * 처음 생기는 발생분의 소멸일을 쓴다. 수명을 주지 않고 영구히 빼면 3.1절의 누적
 * 오차가 그대로 돌아온다.
 *
 * 배정 후보(양수)가 아니라 **발생 레코드 전부**를 본다. 음수 조정만 유효한 날에도
 * 수명이 나와야 한다 — 후보만 보면 그 초과가 `null`이 되어 영구히 잔여를 깎는다.
 */
function excessExpiryOn(grants: Grant[], date: string): string | null {
	/** 그 날짜에 유효했던 레코드들의 소멸일 중 가장 늦은 것. */
	let latest: string | null = null;
	/** 그 뒤 처음 생기는 발생분의 발생일. */
	let nextGrantDate: string | null = null;
	/** 그 발생일에 생기는 레코드들의 소멸일 중 가장 늦은 것. */
	let nextExpiry: string | null = null;

	for (const grant of grants) {
		// 그 날짜에 유효했나요?
		if (isValidOn(grant, date)) {
			if (latest === null || compareDate(grant.expiryDate, latest) > 0) {
				latest = grant.expiryDate;
			}
			continue;
		}

		// 그 날짜보다 늦게 생기는 레코드인가요? 발생 전 사용의 대비책으로 모아둔다.
		if (compareDate(grant.grantDate, date) > 0) {
			/** 지금까지 찾은 것보다 이른 발생일인가. */
			const earlier =
				nextGrantDate === null ||
				compareDate(grant.grantDate, nextGrantDate) < 0;

			if (earlier) {
				nextGrantDate = grant.grantDate;
				nextExpiry = grant.expiryDate;
			} else if (
				grant.grantDate === nextGrantDate &&
				nextExpiry !== null &&
				compareDate(grant.expiryDate, nextExpiry) > 0
			) {
				nextExpiry = grant.expiryDate;
			}
		}
	}

	return latest ?? nextExpiry;
}
