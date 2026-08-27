import { Temporal } from "temporal-polyfill";
import type { GrantDetail } from "./balance.ts";

/**
 * 소멸 임박 기준(스펙 5.1절) — 소멸까지 남은 날이 이 값 이하면 요약 탭이 소멸일 대신
 * `D-31` 배지를 경고색으로 띄운다.
 *
 * 트레이는 소멸에 아무 표시도 하지 않으므로(4.4절) 이 배지가 소멸을 알아채는 두 경로
 * 중 하나다(5.7절). 나머지 하나는 26번의 이력 달력이다.
 */
const EXPIRY_SOON_DAYS = 60;

/** 요약 탭의 살아 있는 발생분 한 줄(스펙 5.1절). */
export type LivingGrant = GrantDetail & {
	/** 소멸까지 남은 날. 소멸일 당일이 `0`이다 — 그 날에는 아직 쓸 수 있다(3.3절). */
	daysUntilExpiry: number;
	/** 소멸 임박인가. 참인 행만 소멸일 대신 배지를 단다. */
	expiringSoon: boolean;
};

/**
 * 조회일에 살아 있는 발생분만 골라 소멸까지 남은 날을 붙인다(스펙 5.1절).
 *
 * 살아 있다는 판정 자체는 하지 않는다 — `computeBalance`가 이미 낸 `living`을 쓴다.
 * 같은 규칙(3.3절)을 두 모듈이 각자 구현하면 한쪽만 고쳐지는 날이 온다.
 *
 * 입력 순서(배정 정렬 키 = 소멸 임박 순, 3.4절)를 그대로 보존한다. 리스트가 요구하는
 * 정렬이 배정 순서와 같은 것이라 여기서 다시 세우지 않는다.
 */
export function livingGrants({
	grants,
	today,
}: {
	grants: GrantDetail[];
	today: string;
}): LivingGrant[] {
	/** 조회일. 남은 날을 세는 기준이다. */
	const on = Temporal.PlainDate.from(today);

	// 살아 있는 것만 남긴다 — 소멸분과 아직 오지 않은 발생분이 여기서 빠진다.
	return grants
		.filter((grant) => grant.living)
		.map((grant) => {
			/** 소멸까지 남은 날. */
			const daysUntilExpiry = on.until(
				Temporal.PlainDate.from(grant.expiryDate),
			).days;

			// 남은 날을 붙여 돌려준다. 배지로 띄울지는 이 값 하나로 갈린다.
			return {
				...grant,
				daysUntilExpiry,
				expiringSoon: daysUntilExpiry <= EXPIRY_SOON_DAYS,
			};
		});
}
