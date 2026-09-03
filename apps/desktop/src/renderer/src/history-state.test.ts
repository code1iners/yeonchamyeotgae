import { describe, expect, test } from "vitest";
import { syncOpenYears } from "./history-state";

describe("syncOpenYears", () => {
	test("수동 선택이 없으면 현재 연도만 기본 펼침으로 이동한다", () => {
		expect([
			...syncOpenYears({
				openYears: new Set([2025]),
				previousCurrentYear: 2025,
				currentYear: 2026,
				touchedYears: new Set(),
			}),
		]).toEqual([2026]);
	});

	test("사용자가 예전 연도를 만졌으면 그 선택과 다른 열린 연도를 보존한다", () => {
		expect([
			...syncOpenYears({
				openYears: new Set([2024, 2025]),
				previousCurrentYear: 2025,
				currentYear: 2026,
				touchedYears: new Set([2025, 2024]),
			}),
		]).toEqual([2024, 2025, 2026]);
	});

	test("새 현재 연도를 사용자가 미리 접어 둔 선택은 다시 열지 않는다", () => {
		expect([
			...syncOpenYears({
				openYears: new Set([2025]),
				previousCurrentYear: 2025,
				currentYear: 2026,
				touchedYears: new Set([2026]),
			}),
		]).toEqual([]);
	});
});
