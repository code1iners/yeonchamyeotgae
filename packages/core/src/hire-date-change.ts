import type { Adjustment, LeaveEntry } from "./storage.ts";

/** 새 입사일로 기록을 가를 때 넘기는 것. */
export type HireDateSplitInput = {
	/** 새 입사일. YYYY-MM-DD. */
	hireDate: string;
	/** 저장된 휴가 기록 전부. */
	entries: LeaveEntry[];
	/** 저장된 조정 레코드 전부. */
	adjustments: Adjustment[];
};

/** 새 입사일을 기준으로 갈라둔 기록. */
export type HireDateSplit = {
	/** 새 입사일 이후(당일 포함)라 어느 쪽을 골라도 남는 것. */
	kept: { entries: LeaveEntry[]; adjustments: Adjustment[] };
	/** 새 입사일 이전이라 지울지 묻게 되는 것. */
	dropped: { entries: LeaveEntry[]; adjustments: Adjustment[] };
};

/**
 * 새 입사일을 기준으로 기록을 가른다 — 지우지 않고 가르기만 한다(스펙 5.4절).
 *
 * **지우는 것이 아니라 가르는 것이 이 함수의 일이다.** 입사일을 바꿀 때 앱은
 * "새 입사일 이전의 휴가 기록과 조정 레코드를 지울까요?"를 묻고 사용자가 고르며,
 * 묻는 화면에는 지울 것의 수가 필요하고 거절하면 원본이 그대로 남아야 한다.
 * 양쪽을 한 번에 내면 화면이 셀 것과 커밋할 것을 따로 구하지 않는다.
 *
 * 조정은 **발생일**로 가른다. 소멸일로 가르면 입사 전에 생긴 이월분이 새 발생분
 * 옆에 살아남아 잔여를 부풀린다.
 *
 * 입사일 당일은 남긴다 — 소멸일 경계와 같은 셈법이며(3.3절), 첫날 휴가가 조용히
 * 사라지지 않는다.
 */
export function splitRecordsByHireDate({
	hireDate,
	entries,
	adjustments,
}: HireDateSplitInput): HireDateSplit {
	return {
		kept: {
			entries: entries.filter((entry) => entry.date >= hireDate),
			adjustments: adjustments.filter(
				(adjustment) => adjustment.grantDate >= hireDate,
			),
		},
		dropped: {
			entries: entries.filter((entry) => entry.date < hireDate),
			adjustments: adjustments.filter(
				(adjustment) => adjustment.grantDate < hireDate,
			),
		},
	};
}
