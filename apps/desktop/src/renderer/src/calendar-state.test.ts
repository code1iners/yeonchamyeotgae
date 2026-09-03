import { describe, expect, test } from "vitest";
import { syncCalendarMonth } from "./calendar-state";

describe("syncCalendarMonth", () => {
	test("사용자가 움직이지 않았으면 같은 달의 새 오늘도 기준으로 삼는다", () => {
		expect(
			syncCalendarMonth({
				currentMonth: "2025-12",
				today: "2025-12-31",
				userNavigated: false,
			}),
		).toBe("2025-12");
	});

	test("월·연도 경계에서 기본 달력을 새 오늘 월로 옮긴다", () => {
		expect(
			syncCalendarMonth({
				currentMonth: "2025-12",
				today: "2026-01-01",
				userNavigated: false,
			}),
		).toBe("2026-01");
	});

	test("사용자가 탐색 중이면 상태 push가 달력을 되돌리지 않는다", () => {
		expect(
			syncCalendarMonth({
				currentMonth: "2024-11",
				today: "2026-01-01",
				userNavigated: true,
			}),
		).toBe("2024-11");
	});
});
