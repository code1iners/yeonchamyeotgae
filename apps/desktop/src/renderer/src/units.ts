/** 단위 선택지 한 칸. */
export type UnitOption = {
	/** 화면에 뜨는 이름. */
	label: string;
	/** 저장되는 소수 일수(스펙 3.9절). */
	days: number;
};

/**
 * 단위 선택지(스펙 3.9절) — 등록 시트(25번)와 이력 수정(26번)이 같이 쓴다.
 * 열거형이 아니라 소수 일수로 저장하므로 여기가 이름과 값의 유일한 대응표다.
 */
export const UNITS: readonly UnitOption[] = [
	{ label: "종일", days: 1 },
	{ label: "반차", days: 0.5 },
	{ label: "반반차", days: 0.25 },
];

/** 기록 한 건의 단위 문구. 표준 셋 밖의 값(가져온 파일 등)은 일수 그대로 보여준다. */
export function unitLabel(days: number): string {
	return UNITS.find((unit) => unit.days === days)?.label ?? `${days}일`;
}
