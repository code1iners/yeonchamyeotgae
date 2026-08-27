import { describe, expect, test } from "vitest";
import {
	type AdjustmentDraft,
	validateAdjustmentDraft,
} from "./adjustment-input.ts";

/** 검증을 통과하는 초안. 각 테스트가 볼 필드 하나만 바꿔 쓴다. */
const VALID: AdjustmentDraft = {
	days: "5",
	grantDate: "2025-01-01",
	expiryDate: "2025-12-31",
	note: "이월",
};

/** 검증에 걸린 필드 목록. 어느 필드가 막혔는지만 본다. */
function issueFields(draft: AdjustmentDraft): string[] {
	/** 판정 결과. */
	const result = validateAdjustmentDraft(draft);
	return result.ok ? [] : result.issues.map((issue) => issue.field);
}

describe("validateAdjustmentDraft — 도메인 이상치는 입력이 막는다 (스펙 2절)", () => {
	test("네 필드가 갖춰지면 조정 레코드의 몸통이 나온다", () => {
		/** 판정 결과. */
		const result = validateAdjustmentDraft(VALID);

		expect(result).toEqual({
			ok: true,
			value: {
				grantDate: "2025-01-01",
				expiryDate: "2025-12-31",
				days: 5,
				note: "이월",
			},
		});
	});

	test("음수 일수는 통과한다 — 법정보다 덜 주는 해를 표현한다(3.7절)", () => {
		/** 판정 결과. */
		const result = validateAdjustmentDraft({ ...VALID, days: "-2.5" });

		expect(result.ok && result.value.days).toBe(-2.5);
	});

	test("0.25 배수가 아닌 일수를 막는다 — 파서가 아니라 여기서 막는다", () => {
		expect(issueFields({ ...VALID, days: "0.3" })).toEqual(["days"]);
		expect(issueFields({ ...VALID, days: "1.25" })).toEqual([]);
	});

	test("빈 일수와 숫자가 아닌 일수를 막는다", () => {
		expect(issueFields({ ...VALID, days: "" })).toEqual(["days"]);
		expect(issueFields({ ...VALID, days: "다섯" })).toEqual(["days"]);
	});

	test("빈 날짜와 실재하지 않는 날짜를 막는다", () => {
		expect(issueFields({ ...VALID, grantDate: "" })).toEqual(["grantDate"]);
		expect(issueFields({ ...VALID, expiryDate: "" })).toEqual(["expiryDate"]);
		expect(issueFields({ ...VALID, grantDate: "2025-02-30" })).toEqual([
			"grantDate",
		]);
	});

	test("소멸일이 발생일보다 이르면 막는다 — 파서는 이것을 통과시킨다(2절)", () => {
		expect(
			issueFields({
				...VALID,
				grantDate: "2025-12-31",
				expiryDate: "2025-01-01",
			}),
		).toEqual(["expiryDate"]);
	});

	test("발생일과 소멸일이 같은 날이면 통과한다 — 소멸일 당일도 유효하다(3.3절)", () => {
		expect(
			issueFields({
				...VALID,
				grantDate: "2025-06-01",
				expiryDate: "2025-06-01",
			}),
		).toEqual([]);
	});

	test("걸린 필드를 한 번에 전부 돌려준다", () => {
		expect(
			issueFields({ days: "0.3", grantDate: "", expiryDate: "", note: "" }),
		).toEqual(["days", "grantDate", "expiryDate"]);
	});

	test("메모는 비어 있어도 되고 앞뒤 공백은 걷어낸다", () => {
		/** 판정 결과. */
		const result = validateAdjustmentDraft({ ...VALID, note: "  이월  " });

		expect(result.ok && result.value.note).toBe("이월");
	});
});
