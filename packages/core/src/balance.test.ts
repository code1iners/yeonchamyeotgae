import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";
import { allocate, computeBalance } from "./balance.ts";
import { computeGrants, type Grant } from "./grants.ts";
import type { Adjustment, LeaveEntry, Settings } from "./storage.ts";

/** 검증 케이스 한 건의 입력 — 스펙 Testing Decisions의 표 한 줄에 그대로 대응한다. */
type Scenario = {
	/** 입사일. */
	hireDate: string;
	/** 기준방식. */
	grantBasis: Settings["grantBasis"];
	/** 휴가 이력. */
	entries?: LeaveEntry[];
	/** 조정 레코드. */
	adjustments?: Adjustment[];
	/** 조회일. */
	today: string;
};

/** 조회일만 빼둔 시나리오 — 같은 데이터를 여러 조회일로 훑는 케이스가 이것을 편다. */
type Snapshot = Omit<Scenario, "today">;

/** 시나리오에서 발생 목록을 거쳐 잔여까지 한 번에 낸다(계산 seam 전체). */
function balanceOf({
	hireDate,
	grantBasis,
	entries = [],
	adjustments = [],
	today,
}: Scenario) {
	/** 설정. */
	const settings: Settings = { hireDate, grantBasis };
	/** 조회일 기준 발생 레코드. */
	const grants = computeGrants({ settings, entries, adjustments, today });
	return computeBalance({ grants, entries, today });
}

/** 연속한 날짜의 휴가 기록 — 하루 1건 불변식대로 하루씩 끊어 만든다. */
function entriesFrom(start: string, count: number, days = 1): LeaveEntry[] {
	/** 만들어진 기록. */
	const entries: LeaveEntry[] = [];
	/** 시작일을 하루씩 밀며 쓰는 커서. */
	let date = start;
	for (let n = 0; n < count; n += 1) {
		entries.push({ id: `entry-${date}`, date, days, note: "" });
		date = nextDate(date);
	}
	return entries;
}

/** YYYY-MM-DD의 다음 날. 테스트 데이터를 만드는 데만 쓴다. */
function nextDate(date: string): string {
	return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}

/** 조정 레코드 1건. */
function adjustmentOf(
	grantDate: string,
	expiryDate: string,
	days: number,
): Adjustment {
	return {
		id: `adjustment-${grantDate}-${days}`,
		grantDate,
		expiryDate,
		days,
		note: "",
	};
}

/** 발생 레코드 1건 — allocate만 단독으로 볼 때 쓴다. */
function grantOf(
	grantDate: string,
	expiryDate: string,
	days: number,
	source: Grant["source"] = "annual",
): Grant {
	return { grantDate, source, days, expiryDate };
}

describe("검증 케이스 1부 — 기본 (2024-01-01 입사, 입사일 기준, 휴가 기록 없음)", () => {
	/** 1부 공통 시나리오 — 조회일만 바뀐다. */
	const base: Snapshot = { hireDate: "2024-01-01", grantBasis: "hireDate" };

	test("A. 2024-04-01에 잔여 3 — 월차 3건", () => {
		expect(balanceOf({ ...base, today: "2024-04-01" }).balance).toBe(3);
	});

	test("B. 2024-12-31에 잔여 11 — 최초 1년의 마지막 날에도 아직 유효하다", () => {
		expect(balanceOf({ ...base, today: "2024-12-31" }).balance).toBe(11);
	});

	test("C. 2025-01-01에 잔여 15 — 26이 뜨는 순간은 없다", () => {
		expect(balanceOf({ ...base, today: "2025-01-01" }).balance).toBe(15);
	});

	test("D. 2027-01-01에 잔여 16 — 근속 3년 가산", () => {
		expect(balanceOf({ ...base, today: "2027-01-01" }).balance).toBe(16);
	});

	test("E. 2045-01-01과 2046-01-01 모두 잔여 25 — 상한", () => {
		expect(balanceOf({ ...base, today: "2045-01-01" }).balance).toBe(25);
		expect(balanceOf({ ...base, today: "2046-01-01" }).balance).toBe(25);
	});
});

describe("검증 케이스 G — 회계연도 기준 7월 입사자", () => {
	/** 2024-07-01 입사·회계연도. 월차 11건(2025-06-30 소멸)과 비례분 7.5가 겹친다. */
	const base: Snapshot = { hireDate: "2024-07-01", grantBasis: "fiscalYear" };

	test("2025-06-30에 잔여 18.5 — 월차 11 + 비례분 7.5 동시 보유", () => {
		expect(balanceOf({ ...base, today: "2025-06-30" }).balance).toBe(18.5);
	});

	test("2025-07-01에 잔여 7.5 — 월차 일괄 소멸", () => {
		expect(balanceOf({ ...base, today: "2025-07-01" }).balance).toBe(7.5);
	});
});

describe("검증 케이스 H — 차감 순서는 소멸 임박 순이다", () => {
	/** G에 2025-03-10 ~ 03-14 5건을 더한 시나리오. */
	const scenario: Snapshot = {
		hireDate: "2024-07-01",
		grantBasis: "fiscalYear",
		entries: entriesFrom("2025-03-10", 5),
	};

	test("2025-07-01에 잔여 7.5 — 5일이 월차에서 나가고 남은 6일이 6/30에 소멸한다", () => {
		expect(balanceOf({ ...scenario, today: "2025-07-01" }).balance).toBe(7.5);
	});

	test("5일이 전부 월차에 배정되고 비례분은 손대지 않는다 (소멸 늦은 순이면 2.5로 5일 손해다)", () => {
		const { grants } = balanceOf({ ...scenario, today: "2025-07-01" });

		/** 월차 배정 합. */
		const monthly = grants
			.filter((grant) => grant.source === "monthly")
			.reduce((sum, grant) => sum + grant.allocated, 0);
		/** 비례분(회계연도 첫해 연차) 배정 합. */
		const annual = grants
			.filter((grant) => grant.source === "annual")
			.reduce((sum, grant) => sum + grant.allocated, 0);

		expect(monthly).toBe(5);
		expect(annual).toBe(0);
	});
});

describe("검증 케이스 I — 연초 이중 차감이 없다", () => {
	/** 2025년 사용 10일. */
	const used2025 = entriesFrom("2025-05-01", 10);
	/** 2026년 사용 12일. */
	const used2026 = entriesFrom("2026-03-02", 12);

	test("2026-01-05에 잔여 15 — 2025년분에 배정된 10일이 함께 소멸한다 (단순 뺄셈이면 5)", () => {
		expect(
			balanceOf({
				hireDate: "2024-01-01",
				grantBasis: "hireDate",
				entries: used2025,
				today: "2026-01-05",
			}).balance,
		).toBe(15);
	});

	// 스펙 표는 이 줄의 잔여를 15로 적었지만, 같은 입사일의 케이스 D가 2027-01-01 발생분을
	// 16일로 고정한다(근속 3년 가산). 케이스가 고정하려는 것은 "그 해 발생분 전액이 그대로
	// 남는다"이므로 발생 일수를 따라 16으로 둔다.
	test("2027-01-05에 잔여 16 — 그 해 발생분 전액이 남는다 (단순 뺄셈이면 −6)", () => {
		const { balance, granted, used } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: [...used2025, ...used2026],
			today: "2027-01-05",
		});

		expect(granted).toBe(16);
		expect(balance).toBe(16);
		// 단순 뺄셈이면 살아 있는 발생분에서 지난 기록 22일을 통째로 빼 −6이 된다.
		expect(granted - (used2025.length + used2026.length)).toBe(-6);
		expect(used).toBe(0);
	});
});

describe("검증 케이스 J — 미래 예정은 미래 발생분에서 나간다", () => {
	test("2025-12-01에 잔여 5이고 예정 3일은 2026-01-01 발생분에 실려 나온다", () => {
		const { balance, planned, plannedOnFutureGrants } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: [
				...entriesFrom("2025-05-01", 10),
				...entriesFrom("2026-02-10", 3),
			],
			today: "2025-12-01",
		});

		expect(balance).toBe(5);
		// 오늘 살아 있는 발생분을 쓰는 예정은 없다 — 3일 전부가 내년 발생분에서 나간다.
		expect(planned).toBe(0);
		expect(plannedOnFutureGrants).toBe(3);
	});

	test("초과로 떨어진 예정이 있어도 등록한 예정 총량이 따로 나온다 (5.1절 각주)", () => {
		const { planned, plannedOnFutureGrants, plannedTotal } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: [
				// 2025년분 15일을 전부 쓰고, 2026년에는 발생분 15일을 넘겨 16일을 예정한다.
				...entriesFrom("2025-03-03", 15),
				...entriesFrom("2026-02-01", 16),
			],
			today: "2025-12-01",
		});

		expect(planned).toBe(0);
		expect(plannedOnFutureGrants).toBe(15);
		// 배정분 둘의 합(15)으로는 등록한 16일을 복원할 수 없다 — 1일이 초과로 떨어졌다.
		expect(plannedTotal).toBe(16);
	});
});

describe("검증 케이스 K — 초과는 그 연차 연도가 끝나면 사라진다", () => {
	/** 2025-03월에 18일 사용 — 연차 15일을 넘겨 3일이 초과로 간다. */
	const scenario: Snapshot = {
		hireDate: "2024-01-01",
		grantBasis: "hireDate",
		entries: entriesFrom("2025-03-03", 18),
	};

	test("2025-06-01에 잔여 −3 — 초과가 트레이에 그대로 뜬다", () => {
		const { balance, excess } = balanceOf({ ...scenario, today: "2025-06-01" });

		expect(balance).toBe(-3);
		expect(excess).toBe(3);
	});

	test("2026-01-05에 잔여 15 — 2025년분이 소멸하며 초과 3일도 함께 사라진다", () => {
		const { balance, excess } = balanceOf({ ...scenario, today: "2026-01-05" });

		expect(balance).toBe(15);
		expect(excess).toBe(0);
	});
});

describe("검증 케이스 L — 조정으로 과거의 초과를 푼다", () => {
	/** K와 같은 초과 시나리오. */
	const scenario: Snapshot = {
		hireDate: "2024-01-01",
		grantBasis: "hireDate",
		entries: entriesFrom("2025-03-03", 18),
	};

	test("소멸일 동률에서 annual이 adjustment보다 먼저 채워진다", () => {
		const { grants } = balanceOf({
			...scenario,
			adjustments: [adjustmentOf("2025-01-01", "2025-12-31", 5)],
			today: "2025-11-05",
		});

		/** 2025년 연차 레코드. */
		const annual = grants.find((grant) => grant.source === "annual");
		/** 조정 레코드. */
		const adjustment = grants.find((grant) => grant.source === "adjustment");

		expect(annual?.allocated).toBe(15);
		expect(adjustment?.allocated).toBe(3);
	});

	test("발생일 2025-01-01 / 소멸일 2025-12-31 / +5 조정이면 2025-11-05 잔여가 2다", () => {
		expect(
			balanceOf({
				...scenario,
				adjustments: [adjustmentOf("2025-01-01", "2025-12-31", 5)],
				today: "2025-11-05",
			}).balance,
		).toBe(2);
	});

	test("소멸일만 2026-12-31로 늘리면 2026-01-05 잔여가 17이다 — 조정 잔량 2 + 2026년분 15", () => {
		expect(
			balanceOf({
				...scenario,
				adjustments: [adjustmentOf("2025-01-01", "2026-12-31", 5)],
				today: "2026-01-05",
			}).balance,
		).toBe(17);
	});

	test("발생일이 입력일이면 초과에 배정되지 못해 2026-01-05 잔여가 20이 된다 — 발생일이 입력인 이유다", () => {
		expect(
			balanceOf({
				...scenario,
				adjustments: [adjustmentOf("2025-11-05", "2026-12-31", 5)],
				today: "2026-01-05",
			}).balance,
		).toBe(20);
	});
});

describe("검증 케이스 M — 월말 클램프 (2024-01-31 입사)", () => {
	/** 첫 월차 발생일이 2024-02-29다. */
	const base: Snapshot = { hireDate: "2024-01-31", grantBasis: "hireDate" };

	test("2024-02-28에 잔여 0", () => {
		expect(balanceOf({ ...base, today: "2024-02-28" }).balance).toBe(0);
	});

	test("2024-02-29에 잔여 1", () => {
		expect(balanceOf({ ...base, today: "2024-02-29" }).balance).toBe(1);
	});
});

describe("검증 케이스 N — 회계연도 겹침의 최댓값 (2024-01-15 입사)", () => {
	/** 월차 11건(2025-01-14 소멸)과 비례분 13.75가 2주간 겹친다. */
	const base: Snapshot = { hireDate: "2024-01-15", grantBasis: "fiscalYear" };

	test("2025-01-10에 잔여 24.75", () => {
		expect(balanceOf({ ...base, today: "2025-01-10" }).balance).toBe(24.75);
	});

	test("2025-01-15에 잔여 13.75 — 월차 일괄 소멸", () => {
		expect(balanceOf({ ...base, today: "2025-01-15" }).balance).toBe(13.75);
	});
});

describe("allocate — 배정 규칙 (스펙 3.4절)", () => {
	test("소멸일에도 아직 배정된다 — 유효 조건이 발생일 <= 대상일 <= 소멸일이다", () => {
		const { allocations, excesses } = allocate({
			grants: [grantOf("2025-01-01", "2025-12-31", 3)],
			entries: entriesFrom("2025-12-31", 1),
		});

		expect(allocations[0]?.allocated).toBe(1);
		expect(excesses).toHaveLength(0);
	});

	test("소멸일 다음 날은 배정되지 않고 초과로 간다", () => {
		const { allocations, excesses } = allocate({
			grants: [grantOf("2025-01-01", "2025-12-31", 3)],
			entries: entriesFrom("2026-01-01", 1),
		});

		expect(allocations[0]?.allocated).toBe(0);
		expect(excesses).toHaveLength(1);
	});

	test("발생일 전날은 배정되지 않는다", () => {
		const { allocations } = allocate({
			grants: [grantOf("2025-01-01", "2025-12-31", 3)],
			entries: entriesFrom("2024-12-31", 1),
		});

		expect(allocations[0]?.allocated).toBe(0);
	});

	test("한 기록이 여러 레코드에 0.25 단위로 쪼개져 배정된다", () => {
		const { allocations, excesses } = allocate({
			grants: [
				grantOf("2025-01-01", "2025-06-30", 0.25),
				grantOf("2025-01-01", "2025-12-31", 0.5),
			],
			entries: [{ id: "e", date: "2025-03-01", days: 1, note: "" }],
		});

		expect(allocations[0]?.allocated).toBe(0.25);
		expect(allocations[1]?.allocated).toBe(0.5);
		expect(excesses).toEqual([
			{ date: "2025-03-01", days: 0.25, expiryDate: "2025-12-31" },
		]);
	});

	test("휴가 기록은 입력 순서와 무관하게 날짜 오름차순으로 처리된다", () => {
		/** 소멸 임박한 1일짜리 레코드 하나와 넉넉한 레코드 하나. */
		const grants = [
			grantOf("2025-01-01", "2025-06-30", 1),
			grantOf("2025-01-01", "2025-12-31", 5),
		];
		/** 2월과 8월 기록. 8월에는 소멸 임박분이 이미 유효하지 않다. */
		const entries: LeaveEntry[] = [
			{ id: "b", date: "2025-08-01", days: 1, note: "" },
			{ id: "a", date: "2025-02-01", days: 1, note: "" },
		];

		const { allocations } = allocate({ grants, entries });

		// 날짜 순으로 처리해야 2월분이 소멸 임박분을 먼저 쓴다.
		expect(allocations[0]?.allocated).toBe(1);
		expect(allocations[1]?.allocated).toBe(1);
	});

	test("음수 조정은 배정 대상이 아니지만 초과의 수명은 준다", () => {
		const { allocations, excesses } = allocate({
			grants: [grantOf("2025-01-01", "2025-12-31", -3, "adjustment")],
			entries: entriesFrom("2025-03-01", 1),
		});

		expect(allocations[0]?.allocated).toBe(0);
		// 배정 후보(양수)만 봤다면 expiryDate가 null이 되어 초과가 영구히 잔여를 깎는다.
		expect(excesses).toEqual([
			{ date: "2025-03-01", days: 1, expiryDate: "2025-12-31" },
		]);
	});

	test("발생 레코드가 하나도 없으면 초과에 소멸일이 없다", () => {
		const { excesses } = allocate({
			grants: [],
			entries: entriesFrom("2025-03-01", 1),
		});

		expect(excesses).toEqual([
			{ date: "2025-03-01", days: 1, expiryDate: null },
		]);
	});

	test("초과는 그 날짜에 유효했던 레코드들의 소멸일 중 가장 늦은 것까지 산다", () => {
		const { excesses } = allocate({
			grants: [
				grantOf("2025-01-01", "2025-06-30", 1),
				grantOf("2025-01-01", "2025-12-31", 1),
			],
			entries: [{ id: "e", date: "2025-03-01", days: 5, note: "" }],
		});

		expect(excesses).toEqual([
			{ date: "2025-03-01", days: 3, expiryDate: "2025-12-31" },
		]);
	});

	test("발생 전 사용이면 그 뒤 처음 생기는 발생분의 소멸일을 쓴다", () => {
		const { excesses } = allocate({
			grants: [
				grantOf("2025-02-01", "2025-12-31", 1),
				grantOf("2026-01-01", "2026-12-31", 15),
			],
			entries: entriesFrom("2025-01-15", 1),
		});

		expect(excesses).toEqual([
			{ date: "2025-01-15", days: 1, expiryDate: "2025-12-31" },
		]);
	});

	test("배정 결과는 입력 grants와 같은 순서·길이다", () => {
		/** 소멸 임박 순과 입력 순서가 어긋나게 둔 목록. */
		const grants = [
			grantOf("2025-01-01", "2025-12-31", 1),
			grantOf("2025-01-01", "2025-06-30", 1),
		];

		const { allocations } = allocate({ grants, entries: [] });

		expect(allocations.map((allocation) => allocation.grant)).toEqual(grants);
	});
});

describe("computeBalance — 내역과 4줄 표 (스펙 1절·5.1절)", () => {
	/** 케이스 K에 예정 1건을 더해 사용·예정·초과가 한 화면에 다 뜨는 시나리오. */
	const scenario: Scenario = {
		hireDate: "2024-01-01",
		grantBasis: "hireDate",
		entries: [
			...entriesFrom("2025-03-03", 18),
			{ id: "planned", date: "2025-06-10", days: 1, note: "" },
		],
		today: "2025-06-01",
	};

	test("발생 − 사용 − 예정 − 초과 = 잔여로 검산된다", () => {
		const { granted, used, planned, excess, balance } = balanceOf(scenario);

		expect(granted).toBe(15);
		expect(used).toBe(15);
		expect(planned).toBe(0);
		// 예정 1일도 배정할 잔량이 없어 초과로 간다.
		expect(excess).toBe(4);
		expect(balance).toBe(granted - used - planned - excess);
	});

	test("내역에 발생일 / source / 일수 / 배정된 사용량 / 남은 양 / 소멸일 / 소멸 여부가 실린다", () => {
		const { grants } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: entriesFrom("2025-03-03", 2),
			today: "2025-06-01",
		});

		expect(grants).toContainEqual({
			grantDate: "2025-01-01",
			source: "annual",
			days: 15,
			allocated: 2,
			remaining: 13,
			expiryDate: "2025-12-31",
			expired: false,
		});
	});

	test("소멸분도 내역에 남고 소멸 여부로 갈린다", () => {
		const { grants } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			today: "2025-06-01",
		});

		/** 소멸한 월차. */
		const monthly = grants.filter((grant) => grant.source === "monthly");
		expect(monthly).toHaveLength(11);
		for (const grant of monthly) {
			expect(grant.expired).toBe(true);
		}
	});

	test("내역이 소멸일 ↑ → 발생일 ↑ → source → 입력 순서로 결정론적으로 정렬된다", () => {
		const { grants } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			adjustments: [
				adjustmentOf("2025-01-01", "2025-12-31", 5),
				adjustmentOf("2025-01-01", "2025-12-31", 2),
				adjustmentOf("2024-06-01", "2024-12-31", 1),
			],
			today: "2025-06-01",
		});

		expect(
			grants.map((grant) => [
				grant.expiryDate,
				grant.grantDate,
				grant.source,
				grant.days,
			]),
		).toEqual([
			["2024-12-31", "2024-02-01", "monthly", 1],
			["2024-12-31", "2024-03-01", "monthly", 1],
			["2024-12-31", "2024-04-01", "monthly", 1],
			["2024-12-31", "2024-05-01", "monthly", 1],
			["2024-12-31", "2024-06-01", "monthly", 1],
			// 같은 소멸일·발생일이면 monthly가 adjustment보다 앞이다.
			["2024-12-31", "2024-06-01", "adjustment", 1],
			["2024-12-31", "2024-07-01", "monthly", 1],
			["2024-12-31", "2024-08-01", "monthly", 1],
			["2024-12-31", "2024-09-01", "monthly", 1],
			["2024-12-31", "2024-10-01", "monthly", 1],
			["2024-12-31", "2024-11-01", "monthly", 1],
			["2024-12-31", "2024-12-01", "monthly", 1],
			["2025-12-31", "2025-01-01", "annual", 15],
			// 정렬 키가 전부 같으면 입력 순서가 갈라준다.
			["2025-12-31", "2025-01-01", "adjustment", 5],
			["2025-12-31", "2025-01-01", "adjustment", 2],
		]);
	});

	test("음수 조정은 합산 항이고 소멸일이 지나면 함께 사라진다", () => {
		/** 2025년분 15일에서 3일을 깎는 음수 조정. */
		const adjustments = [adjustmentOf("2025-01-01", "2025-12-31", -3)];

		expect(
			balanceOf({
				hireDate: "2024-01-01",
				grantBasis: "hireDate",
				adjustments,
				today: "2025-06-01",
			}).balance,
		).toBe(12);
		expect(
			balanceOf({
				hireDate: "2024-01-01",
				grantBasis: "hireDate",
				adjustments,
				today: "2026-01-05",
			}).balance,
		).toBe(15);
	});

	test("수명 없는 초과는 첫 발생분이 생기는 순간 그 소멸일을 물려받는다", () => {
		/** 첫 월차(2024-02-01)보다 이른 휴가 1건. 그 시점에는 발생 레코드가 없다. */
		const scenario: Snapshot = {
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: entriesFrom("2024-01-15", 1),
		};

		// 아직 아무 발생분도 없다 — 초과가 그대로 뜬다.
		expect(balanceOf({ ...scenario, today: "2024-01-20" }).balance).toBe(-1);
		// 첫 월차가 생기며 초과가 그 소멸일(2024-12-31)을 받는다.
		expect(balanceOf({ ...scenario, today: "2024-02-01" }).balance).toBe(0);
		// 월차가 소멸하며 초과도 함께 사라진다 — 수명 없는 상태가 이어지지 않는다.
		expect(balanceOf({ ...scenario, today: "2025-01-01" }).balance).toBe(15);
	});

	test("음수 조정만 유효했던 날의 초과도 그 소멸일에 함께 사라진다", () => {
		/** 첫 월차(2024-02-01)보다 이른 휴가 1건과, 그 날짜에 유효한 음수 조정. */
		const scenario: Snapshot = {
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: entriesFrom("2024-01-15", 1),
			adjustments: [adjustmentOf("2024-01-01", "2024-06-30", -1)],
		};

		// 발생 4(월차) − 1(음수 조정) − 1(초과) = 2.
		expect(balanceOf({ ...scenario, today: "2024-05-01" }).balance).toBe(2);
		// 음수 조정이 소멸하면 그 수명을 물려받은 초과도 함께 사라진다.
		expect(balanceOf({ ...scenario, today: "2024-07-01" }).balance).toBe(6);
	});

	test("조회일 당일의 휴가 기록은 사용으로 센다", () => {
		const { used, planned } = balanceOf({
			hireDate: "2024-01-01",
			grantBasis: "hireDate",
			entries: entriesFrom("2025-06-01", 1),
			today: "2025-06-01",
		});

		expect(used).toBe(1);
		expect(planned).toBe(0);
	});
});
