import { describe, expect, it } from "vitest";
import { expandEntryDates } from "./entry-dates";

/** 빈 기존 기록. 대부분의 케이스는 겹치는 날이 없다. */
const NONE: ReadonlySet<string> = new Set();

describe("expandEntryDates", () => {
	// 스펙 5.2절의 예시 그대로 — 2026-03-20(금)~03-24(화)를 주말 제외로 넣으면 3건이다.
	it("주말 제외가 켜지면 토·일을 건너뛴다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-20",
				end: "2026-03-24",
				excludeWeekends: true,
				taken: NONE,
			}),
		).toEqual(["2026-03-20", "2026-03-23", "2026-03-24"]);
	});

	it("주말 제외가 꺼지면 기간의 모든 날이 들어간다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-20",
				end: "2026-03-24",
				excludeWeekends: false,
				taken: NONE,
			}),
		).toEqual([
			"2026-03-20",
			"2026-03-21",
			"2026-03-22",
			"2026-03-23",
			"2026-03-24",
		]);
	});

	// 하루 1건 불변식(스펙 3.9절) — 이미 기록이 있는 날짜는 기간에서 빠진다.
	it("이미 기록이 있는 날짜를 건너뛴다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-23",
				end: "2026-03-25",
				excludeWeekends: true,
				taken: new Set(["2026-03-24"]),
			}),
		).toEqual(["2026-03-23", "2026-03-25"]);
	});

	// 종료일을 시작일보다 앞으로 고를 수 있다 — 순서를 뒤집어 같은 기간으로 다룬다.
	it("역순 입력을 정규화한다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-24",
				end: "2026-03-23",
				excludeWeekends: true,
				taken: NONE,
			}),
		).toEqual(["2026-03-23", "2026-03-24"]);
	});

	it("시작일과 종료일이 같으면 그 하루다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-23",
				end: "2026-03-23",
				excludeWeekends: true,
				taken: NONE,
			}),
		).toEqual(["2026-03-23"]);
	});

	// 전부 걸러지면 빈 배열이다 — 시트가 [등록]을 비활성화하는 근거다.
	it("기간 전체가 주말이면 빈 배열을 돌려준다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-21",
				end: "2026-03-22",
				excludeWeekends: true,
				taken: NONE,
			}),
		).toEqual([]);
	});

	// 월 경계를 넘는 기간 — 달력 계산이 Temporal에 있는지 확인하는 케이스이기도 하다.
	it("월 경계를 넘어 이어진다", () => {
		expect(
			expandEntryDates({
				start: "2026-03-30",
				end: "2026-04-01",
				excludeWeekends: true,
				taken: NONE,
			}),
		).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
	});
});
