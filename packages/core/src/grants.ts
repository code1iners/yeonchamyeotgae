import { Temporal } from "temporal-polyfill";
import type { Adjustment, LeaveEntry, Settings } from "./storage.ts";

/** 발생분의 출처 — 월차 / 연차(비례분 포함) / 조정. */
export type GrantSource = "monthly" | "annual" | "adjustment";

/** 발생 레코드 1건(스펙 3.2절). 배정·잔여는 다음 티켓의 몫이다. */
export type Grant = {
	/** 발생일. YYYY-MM-DD. 이 날부터 쓸 수 있다. */
	grantDate: string;
	/** 출처. */
	source: GrantSource;
	/** 발생 일수. 조정은 음수일 수 있다. */
	days: number;
	/** 소멸일. YYYY-MM-DD. 이 날에는 아직 쓸 수 있다. */
	expiryDate: string;
};

/**
 * 입사일·기준방식·조정·휴가 기록에서 발생 레코드 목록을 만든다(스펙 3.2절).
 *
 * "오늘"은 인자다 — 코어가 현재 날짜를 읽으면 재계산 트리거가 무효가 된다(1절).
 * 미래 발생분은 max(조회일, 가장 늦은 휴가 기록 날짜)까지 생성한다 — 미래 예정이
 * 미래 발생분에 배정되어야 하기 때문이다.
 */
export function computeGrants({
	settings,
	entries,
	adjustments,
	today,
}: {
	settings: Settings;
	entries: LeaveEntry[];
	adjustments: Adjustment[];
	today: string;
}): Grant[] {
	/** 입사일. */
	const hireDate = Temporal.PlainDate.from(settings.hireDate);
	/** 발생 생성 경계 — 조회일과 가장 늦은 휴가 기록 날짜 중 늦은 쪽. */
	const horizon = entries.reduce((latest, entry) => {
		const date = Temporal.PlainDate.from(entry.date);
		return Temporal.PlainDate.compare(date, latest) > 0 ? date : latest;
	}, Temporal.PlainDate.from(today));

	/** 생성된 발생 레코드. */
	const grants: Grant[] = [];

	// 월차 11건 — 입사일 + n개월(n=1..11)에 각 1일.
	/** 월차 공통 소멸일 — 11건 전부 입사일 + 1년 − 1일. */
	const monthlyExpiry = hireDate.add({ years: 1 }).subtract({ days: 1 });
	for (let n = 1; n <= 11; n += 1) {
		const grantDate = hireDate.add({ months: n });
		// 경계를 넘는 발생분인가요?
		if (Temporal.PlainDate.compare(grantDate, horizon) > 0) {
			break;
		}
		grants.push({
			grantDate: grantDate.toString(),
			source: "monthly",
			days: 1,
			expiryDate: monthlyExpiry.toString(),
		});
	}

	// 연차 — 기준방식에 따라 발생일이 갈리고 일수 공식은 하나를 공유한다(스펙 3.2절).
	if (settings.grantBasis === "hireDate") {
		// 입사일 + k년(k=1,2,…)에 발생, 소멸일은 발생일 + 1년 − 1일.
		for (let k = 1; ; k += 1) {
			const grantDate = hireDate.add({ years: k });
			// 경계를 넘는 발생분인가요?
			if (Temporal.PlainDate.compare(grantDate, horizon) > 0) {
				break;
			}
			grants.push({
				grantDate: grantDate.toString(),
				source: "annual",
				days: annualDays(k),
				expiryDate: grantDate
					.add({ years: 1 })
					.subtract({ days: 1 })
					.toString(),
			});
		}
	} else {
		// 회계연도(1/1 고정) — 입사 후 첫 1/1부터 매년 1/1에 발생, 그 해 12/31에 소멸.
		for (
			let jan1 = Temporal.PlainDate.from({
				year: hireDate.year + 1,
				month: 1,
				day: 1,
			});
			Temporal.PlainDate.compare(jan1, horizon) <= 0;
			jan1 = jan1.add({ years: 1 })
		) {
			/** 그 1/1 시점의 입사일 기준 완성 근속연수. */
			const k = completedYearsAt(hireDate, jan1);
			/** 그 해 12/31. */
			const expiryDate = jan1.with({ month: 12, day: 31 }).toString();

			// 근속 1년 미만인가요? — 첫 1/1에는 완성 개월 수 비례분을 준다.
			if (k < 1) {
				/**
				 * 입사일부터 그 전해 12/31까지의 완성 개월 수. 12/31에 끝나는 달은
				 * 입사일 + m개월이 1/1에 떨어지므로 경계에 1/1을 포함해 센다.
				 */
				const m = completedMonthsAt(hireDate, jan1);
				// 완성된 달이 없으면 레코드를 만들지 않는다.
				if (m >= 1) {
					grants.push({
						grantDate: jan1.toString(),
						source: "annual",
						days: (15 * m) / 12,
						expiryDate,
					});
				}
				continue;
			}

			grants.push({
				grantDate: jan1.toString(),
				source: "annual",
				days: annualDays(k),
				expiryDate,
			});
		}
	}

	// 조정 — 계산 결과를 덮어쓰지 않고 입력 순서대로 덧붙는다(스펙 3.7절). 음수도 그대로 싣는다.
	for (const adjustment of adjustments) {
		grants.push({
			grantDate: adjustment.grantDate,
			source: "adjustment",
			days: adjustment.days,
			expiryDate: adjustment.expiryDate,
		});
	}

	return grants;
}

/** 입사일부터 대상일까지의 완성 근속연수 — 입사일 + k년 <= 대상일인 가장 큰 k. */
function completedYearsAt(
	hireDate: Temporal.PlainDate,
	date: Temporal.PlainDate,
): number {
	let k = 0;
	while (
		Temporal.PlainDate.compare(hireDate.add({ years: k + 1 }), date) <= 0
	) {
		k += 1;
	}
	return k;
}

/** 입사일부터 대상일까지의 완성 개월 수 — 월차의 "1개월 개근"과 같은 셈법이다. */
function completedMonthsAt(
	hireDate: Temporal.PlainDate,
	date: Temporal.PlainDate,
): number {
	let m = 0;
	while (
		Temporal.PlainDate.compare(hireDate.add({ months: m + 1 }), date) <= 0
	) {
		m += 1;
	}
	return m;
}

/** 완성 근속연수 k년의 연차 일수 — 15일에서 2년마다 1일 가산, 상한 25일. */
function annualDays(k: number): number {
	return Math.min(25, 15 + Math.floor((k - 1) / 2));
}
