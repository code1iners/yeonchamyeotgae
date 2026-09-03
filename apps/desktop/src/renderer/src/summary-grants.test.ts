import { computeBalance, computeGrants } from "@yeoncha/core";
import { describe, expect, test } from "vitest";
import { summaryGrantLabel, summaryGrants } from "./summary-grants";

/** 여러 조정의 정체성을 한 화면 모델에서 확인하는 고정 조회일. */
const TODAY = "2025-12-01";

describe("summaryGrants", () => {
	test("서로 다른 조정 메모와 ID를 살아 있는 발생분에 연결한다", () => {
		/** 요약에 함께 보여줄 조정 원본. */
		const adjustments = [
			{
				id: "adjustment-carry",
				grantDate: "2025-11-01",
				expiryDate: "2026-01-31",
				days: 2,
				note: "이월",
			},
			{
				id: "adjustment-policy",
				grantDate: "2025-11-02",
				expiryDate: "2026-02-28",
				days: 1,
				note: "사규 추가분",
			},
		];
		/** 코어가 만든 계산 결과. */
		const balance = computeBalance({
			grants: computeGrants({
				settings: { hireDate: TODAY, grantBasis: "hireDate" },
				entries: [],
				adjustments,
				today: TODAY,
			}),
			entries: [],
			today: TODAY,
		});

		const grants = summaryGrants({ balance, adjustments, today: TODAY });

		expect(grants.map((grant) => grant.adjustmentId)).toEqual([
			"adjustment-carry",
			"adjustment-policy",
		]);
		expect(grants.map((grant) => summaryGrantLabel(grant))).toEqual([
			"조정 · 이월",
			"조정 · 사규 추가분",
		]);
	});

	test("빈 메모는 발생일로 표시하고 같은 날짜면 안정적인 ID 일부로 구분한다", () => {
		/** 같은 값의 빈 메모 조정 두 건. 입력 순서도 ID 연결의 뒷키다. */
		const adjustments = [
			{
				id: "a0000001-adjustment",
				grantDate: "2025-11-01",
				expiryDate: "2026-01-31",
				days: 1,
				note: "",
			},
			{
				id: "b0000002-adjustment",
				grantDate: "2025-11-01",
				expiryDate: "2026-01-31",
				days: 1,
				note: "",
			},
		];
		/** 같은 값의 조정 두 건이 살아 있는 계산 결과. */
		const balance = computeBalance({
			grants: computeGrants({
				settings: { hireDate: TODAY, grantBasis: "hireDate" },
				entries: [],
				adjustments,
				today: TODAY,
			}),
			entries: [],
			today: TODAY,
		});
		const grants = summaryGrants({ balance, adjustments, today: TODAY });

		expect(grants.map((grant) => grant.adjustmentId)).toEqual([
			"a0000001-adjustment",
			"b0000002-adjustment",
		]);
		expect(
			grants.map((grant) =>
				summaryGrantLabel(grant, { duplicateBlankDate: true }),
			),
		).toEqual([
			"조정 · 발생일 2025-11-01 · #a0000001",
			"조정 · 발생일 2025-11-01 · #b0000002",
		]);
	});
});
