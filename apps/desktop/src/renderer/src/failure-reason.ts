/**
 * 셸이 거부한 이유에서 화면에 옮길 한 줄을 뽑는다.
 *
 * `invoke`의 reject는 메인의 오류 문구를 그대로 실어 오지만 Electron이 채널 안내를
 * 앞에 붙인다. 사용자에게 뜻이 없는 그 접두만 걷어낸다.
 */
export function failureReason(cause: unknown): string {
	/** 원본 오류 문구. */
	const message = cause instanceof Error ? cause.message : String(cause);
	return (
		message
			.replace(/^Error invoking remote method '[^']*':\s*/, "")
			.replace(/^Error:\s*/, "")
			.trim() || "알 수 없는 오류"
	);
}
