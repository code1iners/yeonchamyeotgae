import { describe, expect, test } from "vitest";
import { isValidHireDate } from "./settings-validation";

describe("isValidHireDate", () => {
	test("실재하는 YYYY-MM-DD 날짜를 통과시킨다", () => {
		expect(isValidHireDate("2024-02-29")).toBe(true);
	});

	test("빈 값과 다른 날짜 표기를 막는다", () => {
		expect(isValidHireDate("")).toBe(false);
		expect(isValidHireDate("20240229")).toBe(false);
	});

	test("달력에 없는 날짜를 막는다", () => {
		expect(isValidHireDate("2023-02-29")).toBe(false);
		expect(isValidHireDate("2024-04-31")).toBe(false);
	});
});
