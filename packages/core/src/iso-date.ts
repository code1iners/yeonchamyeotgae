import { Temporal } from "temporal-polyfill";

/** YYYY-MM-DD 두 개의 시간순 비교. 길이가 같은 ISO 날짜라 사전순이 곧 시간순이다. */
export function compareDate(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	return a > b ? 1 : 0;
}

/**
 * `YYYY-MM-DD` 형식이면서 실재하는 날짜인가. `Temporal.PlainDate`와 1:1인 것만 통과한다.
 *
 * 형식을 따로 보는 이유는 `Temporal.PlainDate.from`이 `"20240101"` 같은 다른 ISO 변형도
 * 받기 때문이고, `overflow: "reject"`를 쓰는 이유는 기본값(constrain)이 2024-02-30을
 * 2024-02-29로 조용히 고쳐 통과시키기 때문이다.
 */
export function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	try {
		Temporal.PlainDate.from(value, { overflow: "reject" });
		return true;
	} catch {
		return false;
	}
}
