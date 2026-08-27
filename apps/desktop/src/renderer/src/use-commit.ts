import { useState } from "react";
import type { LeaveDataChange } from "../../shared/ipc";

/** 커밋 한 번을 감싼 결과. */
type Commit = {
	/** 변경을 커밋한다. 성공 여부를 돌려준다. */
	commit: (change: LeaveDataChange) => Promise<boolean>;
	/** 커밋이 오가는 중인가. 같은 저장을 두 번 보내지 않게 막는다. */
	saving: boolean;
	/** 마지막 실패 문구. 성공하면 비워진다. */
	error: string | null;
	/** 실패 문구를 지운다 — 폼을 닫을 때 남은 오류가 다음 화면에 붙지 않게 한다. */
	clearError: () => void;
};

/**
 * 셸에 변경을 커밋하는 화면 쪽 공통 껍데기 — 진행 중 잠금과 실패 문구가 여기 하나에 있다.
 *
 * 설정 저장과 조정 저장이 같은 모양을 두 번 쓰던 자리다. 거부 사유는 하나가 아니므로
 * (쓰기 차단(2절)일 수도, 쓰기 자체의 실패일 수도 있다) 원인을 단정하지 않고 셸이 준
 * 사유를 그대로 옮긴다.
 */
export function useCommit(): Commit {
	/** 커밋이 오가는 중인가. */
	const [saving, setSaving] = useState(false);
	/** 저장 실패 문구. */
	const [error, setError] = useState<string | null>(null);

	/** 커밋 실행. */
	const commit = async (change: LeaveDataChange): Promise<boolean> => {
		setSaving(true);
		try {
			await window.yeoncha.commit(change);
			setError(null);
			return true;
		} catch (cause) {
			console.error("변경을 저장하지 못했다", cause);
			setError(`저장하지 못했습니다 — ${failureReason(cause)}`);
			return false;
		} finally {
			setSaving(false);
		}
	};

	return { commit, saving, error, clearError: () => setError(null) };
}

/**
 * 커밋 거부 사유에서 화면에 옮길 한 줄을 뽑는다.
 *
 * `invoke`의 reject는 메인의 오류 문구를 그대로 실어 오지만 Electron이 채널 안내를
 * 앞에 붙인다. 사용자에게 뜻이 없는 그 접두만 걷어낸다.
 */
function failureReason(cause: unknown): string {
	/** 원본 오류 문구. */
	const message = cause instanceof Error ? cause.message : String(cause);
	return (
		message
			.replace(/^Error invoking remote method '[^']*':\s*/, "")
			.replace(/^Error:\s*/, "")
			.trim() || "알 수 없는 오류"
	);
}
