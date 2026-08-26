import { Temporal } from "temporal-polyfill";
import { describe, expect, test } from "vitest";

// 스펙 3.2절: 발생일·소멸일 계산은 Temporal.PlainDate.add()의 기본 동작(constrain,
// 월말 클램프)에 그대로 기댄다. 이 표가 그 전제를 고정한다 — 폴리필을 갈아탈 때
// 이 표가 깨지면 발생일 계산 전체가 어긋난다는 뜻이다.
describe("Temporal.PlainDate 날짜 산술", () => {
	test.each([
		["2024-01-31", 1, "2024-02-29"],
		["2023-01-31", 1, "2023-02-28"],
		["2024-01-31", 3, "2024-04-30"],
		["2024-08-31", 1, "2024-09-30"],
		["2024-01-15", 1, "2024-02-15"],
	])("%s + %i개월 = %s (월말 클램프)", (start, months, expected) => {
		const result = Temporal.PlainDate.from(start).add({ months });
		expect(result.toString()).toBe(expected);
	});

	test.each([
		["2024-01-01", "2024-12-31"],
		["2024-02-29", "2025-02-27"],
		["2024-03-01", "2025-02-28"],
	])("%s + 1년 − 1일 = %s (윤년 경계)", (start, expected) => {
		const result = Temporal.PlainDate.from(start)
			.add({ years: 1 })
			.subtract({ days: 1 });
		expect(result.toString()).toBe(expected);
	});
});
