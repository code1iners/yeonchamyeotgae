import type { Adjustment, Balance, LivingGrant } from "@yeoncha/core";
import { livingGrants } from "@yeoncha/core";

/** 요약 발생분에만 붙이는 조정 원본 정보. 저장 형식과 코어 계산 결과는 바꾸지 않는다. */
export type SummaryGrant = LivingGrant & {
	/** 원본 조정 레코드의 안정적인 식별자. */
	adjustmentId?: string;
	/** 원본 조정 레코드의 메모. */
	adjustmentNote?: string;
};

/**
 * 요약에 표시할 살아 있는 발생분을 원본 조정과 연결한다.
 *
 * 조정은 코어의 계산 결과에서 저장 ID를 의도적으로 제외하지만, 같은 발생일·소멸일·
 * 일수의 조정도 입력 순서가 배정 정렬의 마지막 키로 보존된다. 그래서 화면 모델에서
 * 같은 값의 조정을 큐로 소비하면 계산·저장 계약을 건드리지 않고 원본 ID와 메모리를
 * 안정적으로 다시 연결할 수 있다.
 */
export function summaryGrants({
	balance,
	adjustments,
	today,
}: {
	/** 코어가 계산한 잔여와 발생 내역. */
	balance: Balance;
	/** 저장된 조정 원본. */
	adjustments: Adjustment[];
	/** 조회일. */
	today: string;
}): SummaryGrant[] {
	/** 같은 발생 값의 원본 조정들을 입력 순서대로 보관하는 큐. */
	const adjustmentsByGrant = new Map<string, Adjustment[]>();
	for (const adjustment of adjustments) {
		const key = grantMatchKey(adjustment);
		const queue = adjustmentsByGrant.get(key) ?? [];
		queue.push(adjustment);
		adjustmentsByGrant.set(key, queue);
	}

	/** 모든 발생분을 먼저 연결해, 소멸된 같은 값의 조정도 큐에서 정확히 소비한다. */
	const linkedDetails = balance.grants.map((grant) => {
		if (grant.source !== "adjustment") {
			return grant;
		}

		/** 이 계산 결과와 같은 값의 아직 연결하지 않은 원본 조정. */
		const queue = adjustmentsByGrant.get(grantMatchKey(grant));
		const adjustment = queue?.shift();
		if (!adjustment) {
			return grant;
		}

		return {
			...grant,
			adjustmentId: adjustment.id,
			adjustmentNote: adjustment.note,
		};
	});

	return livingGrants({ grants: linkedDetails, today });
}

/** 요약 발생분 한 줄의 사람이 읽을 이름을 만든다. */
export function summaryGrantLabel(
	grant: SummaryGrant,
	options: {
		/** 같은 날의 빈 메모 조정을 짧은 ID로도 구분할 것인가. */
		duplicateBlankDate?: boolean;
	} = {},
): string {
	if (grant.source !== "adjustment") {
		return grant.source === "monthly" ? "월차" : "연차";
	}

	/** 메모가 있으면 사용자가 입력한 조정 이름을 우선한다. */
	const note = grant.adjustmentNote?.trim();
	if (note) {
		return `조정 · ${note}`;
	}

	/** 메모가 없으면 발생일을 기본 이름으로 삼고, 같은 날이면 ID 일부를 덧붙인다. */
	const suffix =
		options.duplicateBlankDate && grant.adjustmentId
			? ` · #${grant.adjustmentId.slice(0, 8)}`
			: "";
	return `조정 · 발생일 ${grant.grantDate}${suffix}`;
}

/** 조정과 계산 결과를 같은 발생 값으로 비교할 키. */
function grantMatchKey(value: {
	/** 발생일. */
	grantDate: string;
	/** 소멸일. */
	expiryDate: string;
	/** 발생 일수. */
	days: number;
}): string {
	return `${value.grantDate}|${value.expiryDate}|${value.days}`;
}
