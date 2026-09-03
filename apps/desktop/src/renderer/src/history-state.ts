/** 연도 경계에서 기본 펼침 상태를 갱신한다. */
export function syncOpenYears({
	openYears,
	previousCurrentYear,
	currentYear,
	touchedYears,
}: {
	/** 지금 펼쳐진 연도들. */
	openYears: ReadonlySet<number>;
	/** 상태 push 전의 기본 현재 연도. */
	previousCurrentYear: number;
	/** 상태 push 후의 기본 현재 연도. */
	currentYear: number;
	/** 사용자가 직접 펼치거나 접은 연도들. */
	touchedYears: ReadonlySet<number>;
}): Set<number> {
	/** 사용자의 명시적 선택을 보존하면서 기본 연도만 교체할 다음 상태. */
	const next = new Set(openYears);

	// 사용자가 예전 기본 연도를 만지지 않았다면 새 기본 연도로 따라간다.
	if (!touchedYears.has(previousCurrentYear)) {
		next.delete(previousCurrentYear);
	}
	// 새 기본 연도를 사용자가 직접 닫아 둔 경우에만 자동으로 다시 열지 않는다.
	if (!touchedYears.has(currentYear)) {
		next.add(currentYear);
	}

	return next;
}
