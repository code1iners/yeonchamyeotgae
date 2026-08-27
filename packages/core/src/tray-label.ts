/**
 * 트레이에 띄울 잔여 문자열을 만든다(스펙 4.3절).
 *
 * 플랫폼 분기 대신 글리프 예산을 받는다 — macOS는 Infinity, Windows는 3.
 * 정확한 표기가 예산에 담기면 그대로, 담기지 않으면 내림 정수를 돌려준다.
 * Math.floor인 이유(4.2절): "표시값 ≤ 실제 잔여" 불변식을 부호와 무관하게
 * 지키는 유일한 선택이다. trunc는 -0.25를 0으로 보여 초과 노출을 숨긴다.
 */
export function formatTrayLabel(
	balance: number,
	{ maxGlyphs }: { maxGlyphs: number },
): string {
	/** 잔여의 정확한 표기. */
	const exact = String(balance);

	// 정확한 표기가 예산에 담기나요?
	if (exact.length <= maxGlyphs) {
		return exact;
	}

	return String(Math.floor(balance));
}
