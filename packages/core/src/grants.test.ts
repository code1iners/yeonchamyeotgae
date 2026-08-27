import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";
import { computeGrants, type Grant } from "./grants.ts";
import type { Adjustment, LeaveEntry, Settings } from "./storage.ts";

/** 테스트용 computeGrants 호출 — 설정·오늘만 다르고 나머지는 빈 값이 기본이다. */
function grantsOf(
	settings: Settings,
	today: string,
	{
		entries = [],
		adjustments = [],
	}: { entries?: LeaveEntry[]; adjustments?: Adjustment[] } = {},
): Grant[] {
	return computeGrants({ settings, entries, adjustments, today });
}

/** 테스트용 휴가 기록 — 경계 산정에는 날짜만 쓰인다. */
function entryOn(date: string): LeaveEntry {
	return { id: `entry-${date}`, date, days: 1, note: "" };
}

describe("computeGrants — 입사일 기준", () => {
	test("발생분은 조회일까지만 생성한다", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "hireDate" },
			"2024-04-01",
		);

		expect(grants.map((grant) => grant.grantDate)).toEqual([
			"2024-02-01",
			"2024-03-01",
			"2024-04-01",
		]);
	});

	test("휴가 기록이 조회일보다 늦으면 그 날짜까지 발생분을 생성한다", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "hireDate" },
			"2024-04-01",
			{ entries: [entryOn("2024-06-15")] },
		);

		expect(grants.map((grant) => grant.grantDate)).toEqual([
			"2024-02-01",
			"2024-03-01",
			"2024-04-01",
			"2024-05-01",
			"2024-06-01",
		]);
	});

	test("월차 11건이 입사일 + n개월에 각 1일, 소멸일은 전부 입사일 + 1년 − 1일", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "hireDate" },
			"2024-12-31",
		);

		const monthly = grants.filter((grant) => grant.source === "monthly");
		expect(monthly).toHaveLength(11);
		expect(monthly.map((grant) => grant.grantDate)).toEqual([
			"2024-02-01",
			"2024-03-01",
			"2024-04-01",
			"2024-05-01",
			"2024-06-01",
			"2024-07-01",
			"2024-08-01",
			"2024-09-01",
			"2024-10-01",
			"2024-11-01",
			"2024-12-01",
		]);
		for (const grant of monthly) {
			expect(grant.days).toBe(1);
			expect(grant.expiryDate).toBe("2024-12-31");
		}
	});

	test("연차가 입사일 + k년에 min(25, 15 + floor((k−1)/2))일, 소멸일은 발생일 + 1년 − 1일 (케이스 C·D·E)", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "hireDate" },
			"2046-01-01",
		);

		const annual = grants.filter((grant) => grant.source === "annual");
		expect(annual).toHaveLength(22);

		/** 발생일 → 연차 레코드. */
		const byDate = new Map(annual.map((grant) => [grant.grantDate, grant]));
		expect(byDate.get("2025-01-01")?.days).toBe(15);
		expect(byDate.get("2025-01-01")?.expiryDate).toBe("2025-12-31");
		expect(byDate.get("2027-01-01")?.days).toBe(16);
		expect(byDate.get("2045-01-01")?.days).toBe(25);
		expect(byDate.get("2046-01-01")?.days).toBe(25);
	});

	test("월말 입사는 월말 클램프로 발생하고 경계가 하루도 벌어지지 않는다 (케이스 M)", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-31", grantBasis: "hireDate" },
			"2025-01-31",
		);

		const monthly = grants.filter((grant) => grant.source === "monthly");
		expect(monthly.slice(0, 4).map((grant) => grant.grantDate)).toEqual([
			"2024-02-29",
			"2024-03-31",
			"2024-04-30",
			"2024-05-31",
		]);
		for (const grant of monthly) {
			expect(grant.expiryDate).toBe("2025-01-30");
		}

		const annual = grants.filter((grant) => grant.source === "annual");
		expect(annual[0]?.grantDate).toBe("2025-01-31");
	});

	test("월차와 연차가 겹치는 구간이 없다 — 누적 26일이 유효한 순간이 존재하지 않는다", () => {
		// 평년·윤년 월말·연초를 섞은 입사일에서 첫 2년의 모든 날짜를 훑는다.
		for (const hireDate of ["2024-01-01", "2024-01-31", "2023-06-15"]) {
			const grants = grantsOf(
				{ hireDate, grantBasis: "hireDate" },
				Temporal.PlainDate.from(hireDate).add({ years: 2 }).toString(),
			);

			// 각 날짜에 유효한 발생 일수를 합산 — 26이 나오면 두 종류가 겹친 것이다.
			for (
				let date = Temporal.PlainDate.from(hireDate);
				Temporal.PlainDate.compare(
					date,
					Temporal.PlainDate.from(hireDate).add({ years: 2 }),
				) <= 0;
				date = date.add({ days: 1 })
			) {
				/** 그 날짜에 유효한 발생 일수 합. */
				const validDays = grants
					.filter(
						(grant) =>
							Temporal.PlainDate.compare(grant.grantDate, date) <= 0 &&
							Temporal.PlainDate.compare(date, grant.expiryDate) <= 0,
					)
					.reduce((sum, grant) => sum + grant.days, 0);
				expect(validDays).toBeLessThan(26);
			}
		}
	});
});

describe("computeGrants — 회계연도 기준", () => {
	test("7월 입사 — 월차 11건·비례분 7.5·연차 15 (케이스 G)", () => {
		const grants = grantsOf(
			{ hireDate: "2024-07-01", grantBasis: "fiscalYear" },
			"2026-01-01",
		);

		// 월차는 입사일 기준과 동일하다 — 법정이므로 회계연도와 무관하다.
		const monthly = grants.filter((grant) => grant.source === "monthly");
		expect(monthly).toHaveLength(11);
		expect(monthly[0]?.grantDate).toBe("2024-08-01");
		expect(monthly[10]?.grantDate).toBe("2025-06-01");
		for (const grant of monthly) {
			expect(grant.expiryDate).toBe("2025-06-30");
		}

		// 비례분과 연차는 매년 1/1에 발생하고 그 해 12/31에 소멸한다.
		const annual = grants.filter((grant) => grant.source === "annual");
		expect(annual).toEqual([
			{
				grantDate: "2025-01-01",
				source: "annual",
				days: 7.5,
				expiryDate: "2025-12-31",
			},
			{
				grantDate: "2026-01-01",
				source: "annual",
				days: 15,
				expiryDate: "2026-12-31",
			},
		]);
	});

	test("1월 중순 입사 — 비례분 13.75와 월차 소멸 2025-01-14가 2주간 겹친다 (케이스 N)", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-15", grantBasis: "fiscalYear" },
			"2025-01-01",
		);

		const monthly = grants.filter((grant) => grant.source === "monthly");
		expect(monthly).toHaveLength(11);
		for (const grant of monthly) {
			expect(grant.expiryDate).toBe("2025-01-14");
		}

		const annual = grants.filter((grant) => grant.source === "annual");
		expect(annual).toEqual([
			{
				grantDate: "2025-01-01",
				source: "annual",
				days: 13.75,
				expiryDate: "2025-12-31",
			},
		]);
	});

	test("완성 개월 수가 0이면 비례분 레코드를 만들지 않는다", () => {
		const grants = grantsOf(
			{ hireDate: "2024-12-15", grantBasis: "fiscalYear" },
			"2025-06-01",
		);

		expect(grants.filter((grant) => grant.source === "annual")).toEqual([]);
	});

	test("1/1 입사는 첫 1/1에 비례분 없이 연차 15일 하나만 발생한다", () => {
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "fiscalYear" },
			"2025-01-01",
		);

		const annual = grants.filter((grant) => grant.source === "annual");
		expect(annual).toEqual([
			{
				grantDate: "2025-01-01",
				source: "annual",
				days: 15,
				expiryDate: "2025-12-31",
			},
		]);
	});

	test("가산휴가의 k는 회계연도 순번이 아니라 입사일 기준 완성 근속연수다", () => {
		const grants = grantsOf(
			{ hireDate: "2024-07-01", grantBasis: "fiscalYear" },
			"2027-01-01",
		);

		/** 발생일 → 연차 레코드. */
		const byDate = new Map(
			grants
				.filter((grant) => grant.source === "annual")
				.map((grant) => [grant.grantDate, grant]),
		);
		// 2027-01-01은 3번째 회계연도지만 근속 2년 6개월 → 완성 2년 → 15일이다.
		expect(byDate.get("2027-01-01")?.days).toBe(15);
	});
});

describe("computeGrants — 조정", () => {
	test("조정이 계산 결과를 덮어쓰지 않고 목록 끝에 덧붙고, 음수 일수도 그대로 실린다", () => {
		/** 이월 +5일과 감액 −3일 조정. */
		const adjustments: Adjustment[] = [
			{
				id: "adj-1",
				grantDate: "2025-01-01",
				expiryDate: "2025-12-31",
				days: 5,
				note: "이월",
			},
			{
				id: "adj-2",
				grantDate: "2025-01-01",
				expiryDate: "2025-12-31",
				days: -3,
				note: "사규 감액",
			},
		];
		const grants = grantsOf(
			{ hireDate: "2024-01-01", grantBasis: "hireDate" },
			"2025-06-01",
			{ adjustments },
		);

		// 계산이 만든 발생분은 그대로다 — 월차 11건 + 연차 1건.
		expect(
			grants.filter((grant) => grant.source !== "adjustment"),
		).toHaveLength(12);

		// 조정은 입력 순서대로 끝에 덧붙는다.
		expect(grants.slice(-2)).toEqual([
			{
				grantDate: "2025-01-01",
				source: "adjustment",
				days: 5,
				expiryDate: "2025-12-31",
			},
			{
				grantDate: "2025-01-01",
				source: "adjustment",
				days: -3,
				expiryDate: "2025-12-31",
			},
		]);
	});
});
