import { describe, expect, test } from "vitest";
import type { GrantDetail } from "./balance.ts";
import { livingGrants } from "./summary.ts";
import { balanceOf, entriesFrom } from "./test-scenarios.ts";

/** 발생 레코드 1건의 내역 — 소멸 임박 판정만 볼 때 쓴다. */
function detailOf(
	grantDate: string,
	expiryDate: string,
	days = 15,
): GrantDetail {
	return {
		grantDate,
		source: "annual",
		days,
		allocated: 0,
		remaining: days,
		expiryDate,
		expired: false,
		living: true,
	};
}

describe("livingGrants — 소멸 임박 배지 (스펙 5.1절·5.7절)", () => {
	test("소멸일 당일은 D-0이고 아직 살아 있다", () => {
		expect(
			livingGrants({
				grants: [detailOf("2025-01-01", "2025-12-31")],
				today: "2025-12-31",
			}),
		).toMatchObject([{ daysUntilExpiry: 0, expiringSoon: true }]);
	});

	test("60일 이내면 임박이고 61일이면 아니다", () => {
		/** 2025-11-01 → 12-31이 60일, 하루 앞선 10-31이 61일이다. */
		const grants = [detailOf("2025-01-01", "2025-12-31")];

		expect(livingGrants({ grants, today: "2025-11-01" })).toMatchObject([
			{ daysUntilExpiry: 60, expiringSoon: true },
		]);
		expect(livingGrants({ grants, today: "2025-10-31" })).toMatchObject([
			{ daysUntilExpiry: 61, expiringSoon: false },
		]);
	});
});

describe("livingGrants — 무엇이 리스트에 오르는가 (스펙 5.1절)", () => {
	test("케이스 J — 내년 발생분은 살아 있지 않다", () => {
		/** 2025년분 15일 중 10일을 쓰고 내년 2월에 3일을 예정해둔 상태(케이스 J). */
		const balance = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: [
				...entriesFrom("2025-05-01", 10),
				...entriesFrom("2026-02-10", 3),
			],
			today: "2025-12-01",
		});
		/** 살아 있는 발생분. */
		const rows = livingGrants({ grants: balance.grants, today: "2025-12-01" });

		// 2026-01-01 발생분은 예정 3일을 이미 물고 있지만 아직 살아 있지 않다.
		expect(balance.grants).toHaveLength(13);
		expect(rows).toMatchObject([
			{ grantDate: "2025-01-01", days: 15, remaining: 5, daysUntilExpiry: 30 },
		]);
	});

	test("케이스 G — 소멸 임박 순으로 서고 그날 소멸하는 발생분도 아직 남는다", () => {
		/** 월차 11건(소멸 2025-06-30)과 비례분 7.5(소멸 2025-12-31)가 겹치는 날. */
		const balance = balanceOf({
			hireDate: "2024-07-01",
			grantBasis: "fiscalYear",
			today: "2025-06-30",
		});
		/** 살아 있는 발생분. */
		const rows = livingGrants({ grants: balance.grants, today: "2025-06-30" });

		expect(rows).toHaveLength(12);
		// 월차 11건이 앞에 서고 전부 그날 소멸한다.
		expect(
			rows.slice(0, 11).map((row) => `${row.source} D-${row.daysUntilExpiry}`),
		).toEqual(Array(11).fill("monthly D-0"));
		expect(rows[11]).toMatchObject({
			days: 7.5,
			expiryDate: "2025-12-31",
			daysUntilExpiry: 184,
			expiringSoon: false,
		});
	});

	test("소멸한 발생분은 리스트에 없다", () => {
		/** 월차가 일괄 소멸한 다음 날 — 남는 것은 비례분뿐이다. */
		const balance = balanceOf({
			hireDate: "2024-07-01",
			grantBasis: "fiscalYear",
			today: "2025-07-01",
		});

		expect(
			livingGrants({ grants: balance.grants, today: "2025-07-01" }),
		).toMatchObject([{ days: 7.5, expiryDate: "2025-12-31" }]);
	});
});
