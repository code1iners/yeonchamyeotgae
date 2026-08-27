import { isIsoDate } from "./iso-date.ts";
import type { Adjustment } from "./storage.ts";

/**
 * 조정 입력 폼이 들고 있는 네 필드(스펙 5.4절). 전부 문자열이다 — 화면의 입력 요소가
 * 내는 것이 문자열이고, 숫자·날짜로 바꾸는 판정 자체가 이 모듈이 하는 일이다.
 */
export type AdjustmentDraft = {
	/** 일수. 음수와 소수를 허용한다. */
	days: string;
	/** 발생일. */
	grantDate: string;
	/** 소멸일. */
	expiryDate: string;
	/** 메모. */
	note: string;
};

/** 조정 레코드에서 `id`를 뺀 몸통. `id`는 레코드를 만드는 쪽이 붙인다. */
export type AdjustmentValue = Omit<Adjustment, "id">;

/** 검증에 걸린 필드와 사유. 폼이 그대로 옮겨 적는다. */
export type AdjustmentIssue = {
	/** 걸린 필드. */
	field: "days" | "grantDate" | "expiryDate";
	/** 사용자에게 보일 사유. */
	message: string;
};

/** 조정 입력 판정 결과 — 통과하면 저장할 몸통이 나온다. */
export type AdjustmentDraftResult =
	| { ok: true; value: AdjustmentValue }
	| { ok: false; issues: AdjustmentIssue[] };

/** 사용 단위 — 종일 1 / 반차 0.5 / 반반차 0.25(스펙 3.9절). */
const DAY_UNIT = 0.25;

/**
 * 조정 입력 네 필드를 판정해 저장할 몸통을 낸다(스펙 2절·5.4절).
 *
 * **도메인 이상치를 막는 자리가 여기다.** 파서는 0.25 배수도, 소멸일이 발생일보다 이른
 * 조정도 통과시킨다 — 거부하면 앱이 자기가 쓴 파일을 못 읽기 때문이다(2절). 그래서
 * 그 판정이 입력 쪽에 있어야 하고, 셸이 아니라 코어에 있는 이유는 "무엇이 올바른
 * 데이터인가"가 코어의 몫이기 때문이다(1절).
 *
 * 걸린 필드를 전부 모아 돌려준다 — 한 번에 하나씩 알려주면 네 필드짜리 폼에서
 * 저장을 네 번 눌러야 한다.
 */
export function validateAdjustmentDraft(
	draft: AdjustmentDraft,
): AdjustmentDraftResult {
	/** 걸린 것들. */
	const issues: AdjustmentIssue[] = [];
	/** 숫자로 읽어낸 일수. 읽지 못했으면 `null`이다. */
	const days = parseDays(draft.days);

	/** 발생일이 실재하는 날짜인가. 소멸일과의 선후 비교도 이것이 참일 때만 뜻이 있다. */
	const grantDateOk = isIsoDate(draft.grantDate);

	// 일수가 숫자인가요?
	if (days === null) {
		issues.push({ field: "days", message: "일수를 숫자로 넣어주세요" });
	} else if (!Number.isInteger(days / DAY_UNIT)) {
		issues.push({ field: "days", message: "일수는 0.25 단위로 넣어주세요" });
	}

	if (!grantDateOk) {
		issues.push({ field: "grantDate", message: "발생일을 넣어주세요" });
	}

	// 소멸일이 실재하는 날짜인가요?
	if (!isIsoDate(draft.expiryDate)) {
		issues.push({ field: "expiryDate", message: "소멸일을 넣어주세요" });
	} else if (grantDateOk && draft.expiryDate < draft.grantDate) {
		// 소멸일 당일도 유효하므로(3.3절) 같은 날은 통과시키고 이른 날만 막는다.
		issues.push({
			field: "expiryDate",
			message: "소멸일이 발생일보다 이릅니다",
		});
	}

	// 걸린 것이 있나요? `days === null`은 이미 issue를 남겼지만 타입을 좁히려면 다시 본다.
	if (issues.length > 0 || days === null) {
		return { ok: false, issues };
	}

	return {
		ok: true,
		value: {
			grantDate: draft.grantDate,
			expiryDate: draft.expiryDate,
			days,
			note: draft.note.trim(),
		},
	};
}

/** 입력 문자열에서 일수를 읽는다. 빈 값과 숫자가 아닌 값은 `null`이다. */
function parseDays(text: string): number | null {
	/** 앞뒤 공백을 걷어낸 입력. */
	const trimmed = text.trim();
	// 빈 값인가요? Number("")는 0이므로 따로 걸러야 한다.
	if (trimmed === "") {
		return null;
	}
	/** 숫자 변환 결과. */
	const days = Number(trimmed);
	return Number.isFinite(days) ? days : null;
}
