import { describe, expect, test } from "vitest";
import { formatTrayLabel } from "./tray-label.ts";

// 스펙 "표시 seam이 고정할 것" 표 그대로다. macOS는 예산 Infinity, Windows는 3.
// -0.25 → -1이 핵심 행이다 — Math.trunc면 0이 나와 초과 노출(4.2절)이 조용히 무효화된다.
describe("formatTrayLabel", () => {
	test.each([
		[12.75, "12.75", "12"],
		[-24.75, "-24.75", "-25"],
		[-0.25, "-0.25", "-1"],
		[0, "0", "0"],
	])(
		"잔여 %f → Infinity 예산 %s / 3글자 예산 %s",
		(balance, exact, floored) => {
			expect(
				formatTrayLabel(balance, { maxGlyphs: Number.POSITIVE_INFINITY }),
			).toBe(exact);
			expect(formatTrayLabel(balance, { maxGlyphs: 3 })).toBe(floored);
		},
	);
});
