import { describe, expect, test } from "vitest";
import { expiryLosses, groupHistory } from "./history.ts";
import type { Adjustment } from "./storage.ts";
import { balanceOf, entriesFrom } from "./test-scenarios.ts";

describe("groupHistory — 예정과 사용의 분리 (스펙 5.3절)", () => {
	test("조회일 이후는 예정, 조회일 당일까지는 사용이다", () => {
		/** 어제·오늘·내일 하루씩 쓴 상태. */
		const entries = entriesFrom("2025-05-09", 3);
		/** 조회일 기준 잔여 — 발생 레코드가 여기서 나온다. */
		const balance = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries,
			today: "2025-05-10",
		});

		/** 그룹핑 결과. */
		const groups = groupHistory({
			grants: balance.grants,
			entries,
			today: "2025-05-10",
		});

		// 내일 것만 예정이다 — 오늘 기록은 잔여 계산(3.9절)과 같이 사용으로 센다.
		expect(groups.planned.map((entry) => entry.date)).toEqual(["2025-05-11"]);
		expect(
			groups.years.flatMap((section) => section.entries.map((e) => e.date)),
		).toEqual(["2025-05-10", "2025-05-09"]);
	});
});

describe("groupHistory — 연차 연도는 소멸일에서 파생된다 (스펙 3.10절)", () => {
	test("회계연도 기준 — 월차 기록은 입사한 해, 비례분 구간은 다음 해로 묶인다", () => {
		/** 2024-07-01 입사, 회계연도 기준. 입사 해와 이듬해에 하루씩 썼다. */
		const entries = [
			...entriesFrom("2024-09-10", 1),
			...entriesFrom("2025-02-10", 1),
		];
		const balance = balanceOf({
			hireDate: "2024-07-01",
			grantBasis: "fiscalYear",
			entries,
			today: "2025-03-01",
		});

		/** 그룹핑 결과. */
		const groups = groupHistory({
			grants: balance.grants,
			entries,
			today: "2025-03-01",
		});

		// 2024-09-10에는 월차(소멸 2025-06-30)만 유효하다 — 가장 이른 월차 발생일(2024-08-01)의
		// 해가 이름이 된다. 2025-02-10에는 비례분(소멸 2025-12-31)이 경계가 되어 2025로 간다.
		expect(
			groups.years.map((section) => ({
				year: section.year,
				dates: section.entries.map((entry) => entry.date),
			})),
		).toEqual([
			{ year: 2025, dates: ["2025-02-10"] },
			{ year: 2024, dates: ["2024-09-10"] },
		]);
		expect(groups.currentYear).toBe(2025);
	});

	test("입사일 기준 — 해를 걸치는 연차 연도는 시작한 해의 이름을 쓴다", () => {
		/** 2023-03-15 입사, 입사일 기준. 2025-03-15~2026-03-14 연도의 양끝에 썼다. */
		const entries = [
			...entriesFrom("2025-06-10", 1),
			...entriesFrom("2026-02-10", 1),
		];
		const balance = balanceOf({
			hireDate: "2023-03-15",
			grantBasis: "hireDate",
			entries,
			today: "2026-02-20",
		});

		/** 그룹핑 결과. */
		const groups = groupHistory({
			grants: balance.grants,
			entries,
			today: "2026-02-20",
		});

		// 두 기록 모두 2025-03-15 발생분(소멸 2026-03-14)에 속한다 — 달력 해가 갈라도 한 섹션이다.
		expect(
			groups.years.map((section) => ({
				year: section.year,
				dates: section.entries.map((entry) => entry.date),
			})),
		).toEqual([{ year: 2025, dates: ["2026-02-10", "2025-06-10"] }]);
		expect(groups.currentYear).toBe(2025);
	});

	test("첫 발생 전의 기록은 날짜 자신의 연도로 둔다", () => {
		/** 입사 직후 첫 월차가 생기기 전에 쓴 기록 — 유효한 발생분이 없다. */
		const entries = entriesFrom("2025-01-20", 1);
		const balance = balanceOf({
			hireDate: "2025-01-10",
			grantBasis: "hireDate",
			entries,
			today: "2025-01-25",
		});

		expect(
			groupHistory({ grants: balance.grants, entries, today: "2025-01-25" })
				.years,
		).toEqual([{ year: 2025, entries }]);
	});
});

describe("expiryLosses — 소멸일별 사라진 미사용분 (스펙 5.7절)", () => {
	test("같은 소멸일의 월차는 한 줄로 합쳐지고, 살아 있는 발생분은 오르지 않는다", () => {
		/** 2024-07-01 입사, 회계연도 기준. 월차 11건이 다 모인 뒤 3일만 쓰고 일괄 소멸일을 넘겼다. */
		const entries = entriesFrom("2025-06-02", 3);
		const balance = balanceOf({
			hireDate: "2024-07-01",
			grantBasis: "fiscalYear",
			entries,
			today: "2025-07-01",
		});

		// 월차 8일이 2025-06-30에 사라졌다 — 비례분(소멸 2025-12-31)은 아직 살아 있어 없다.
		expect(expiryLosses({ grants: balance.grants, adjustments: [] })).toEqual([
			{
				expiryDate: "2025-06-30",
				year: 2024,
				source: "monthly",
				note: "",
				days: 8,
			},
		]);
	});

	test("조정의 메모가 붙고, 최근 소멸일이 먼저 온다", () => {
		/** 사용기한이 짧은 이월 조정 — 소멸일까지 한 번도 쓰지 않았다. */
		const carryover: Adjustment = {
			id: "adjustment-carryover",
			grantDate: "2025-01-01",
			expiryDate: "2025-03-31",
			days: 3,
			note: "이월",
		};
		const balance = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			adjustments: [carryover],
			today: "2025-04-01",
		});

		// 이월 3일(2025-03-31)과 월차 11일(2024-12-31)이 최근 소멸일부터 선다.
		expect(
			expiryLosses({ grants: balance.grants, adjustments: [carryover] }),
		).toEqual([
			{
				expiryDate: "2025-03-31",
				year: 2025,
				source: "adjustment",
				note: "이월",
				days: 3,
			},
			{
				expiryDate: "2024-12-31",
				year: 2024,
				source: "monthly",
				note: "",
				days: 11,
			},
		]);
	});

	test("다 쓴 발생분은 소멸해도 오르지 않는다", () => {
		/** 월차 11건이 다 모인 뒤 전부 쓰고 소멸일을 넘긴 상태. */
		const entries = entriesFrom("2024-12-02", 11);
		const balance = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries,
			today: "2025-01-10",
		});

		expect(expiryLosses({ grants: balance.grants, adjustments: [] })).toEqual(
			[],
		);
	});
});
