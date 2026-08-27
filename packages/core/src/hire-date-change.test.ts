import { describe, expect, test } from "vitest";
import { splitRecordsByHireDate } from "./hire-date-change.ts";
import type { Adjustment, LeaveEntry } from "./storage.ts";

/** 휴가 기록 1건을 만든다. 가르는 축이 날짜뿐이라 나머지는 고정값이면 된다. */
function entry(date: string): LeaveEntry {
	return { id: `entry-${date}`, date, days: 1, note: "" };
}

/** 조정 레코드 1건을 만든다. */
function adjustment(grantDate: string, expiryDate: string): Adjustment {
	return {
		id: `adj-${grantDate}`,
		grantDate,
		expiryDate,
		days: 5,
		note: "이월",
	};
}

// 스펙 5.4절: 입사일을 바꿀 때 "새 입사일 이전의 기록을 지울까요?"를 묻는다.
// 묻는 화면은 지울 것의 수를 보여줘야 하고 거절하면 원본이 그대로 남아야 하므로,
// 이 함수는 지우지 않고 가르기만 한다.
describe("splitRecordsByHireDate", () => {
	test("새 입사일 이전의 휴가 기록만 지울 후보가 된다", () => {
		/** 가른 결과. */
		const split = splitRecordsByHireDate({
			hireDate: "2025-01-01",
			entries: [entry("2024-12-31"), entry("2025-01-02")],
			adjustments: [],
		});

		expect(split.dropped.entries.map((it) => it.date)).toEqual(["2024-12-31"]);
		expect(split.kept.entries.map((it) => it.date)).toEqual(["2025-01-02"]);
	});

	test("입사일 당일 기록은 남는다", () => {
		/** 가른 결과. */
		const split = splitRecordsByHireDate({
			hireDate: "2025-01-01",
			entries: [entry("2025-01-01")],
			adjustments: [adjustment("2025-01-01", "2025-12-31")],
		});

		expect(split.dropped.entries).toEqual([]);
		expect(split.dropped.adjustments).toEqual([]);
		expect(split.kept.entries).toHaveLength(1);
		expect(split.kept.adjustments).toHaveLength(1);
	});

	test("조정은 소멸일이 아니라 발생일로 가른다", () => {
		// 소멸일로 가르면 입사 전에 생긴 이월분이 새 발생분 옆에 살아남는다.
		/** 가른 결과. */
		const split = splitRecordsByHireDate({
			hireDate: "2025-01-01",
			entries: [],
			adjustments: [adjustment("2024-06-01", "2025-06-30")],
		});

		expect(split.dropped.adjustments.map((it) => it.grantDate)).toEqual([
			"2024-06-01",
		]);
		expect(split.kept.adjustments).toEqual([]);
	});

	test("지울 것이 없으면 원본이 순서 그대로 남는다", () => {
		/** 넣은 순서. 배정 순서(3.4절)와 달리 저장 순서는 입력 순서다. */
		const entries = [entry("2025-03-10"), entry("2025-02-10")];
		/** 가른 결과. */
		const split = splitRecordsByHireDate({
			hireDate: "2025-01-01",
			entries,
			adjustments: [],
		});

		expect(split.kept.entries).toEqual(entries);
		expect(split.dropped.entries).toEqual([]);
	});
});
