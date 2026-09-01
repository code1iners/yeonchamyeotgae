import { Temporal } from "temporal-polyfill";

/** 입사일 입력이 저장 형식과 같은 실재하는 날짜인지 확인한다. */
export function isValidHireDate(value: string): boolean {
	// 브라우저의 date 입력도 이 형식을 내지만, 프로그램으로 들어온 값까지 같은 경계에서 막는다.
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
