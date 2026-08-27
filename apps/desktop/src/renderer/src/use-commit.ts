import { useState } from "react";
import type { AppState, HireDateDrop, LeaveDataChange } from "../../shared/ipc";
import { failureReason } from "./failure-reason";

/** 커밋 한 번을 감싼 결과. */
type Commit = {
	/** 변경을 커밋한다. 성공 여부를 돌려준다. */
	commit: (change: LeaveDataChange) => Promise<boolean>;
	/**
	 * 입사일 변경에 따른 기록 삭제를 커밋한다. 성공 여부를 돌려준다.
	 * 백업이 남는 조작이라 통로가 따로 있다(23번).
	 */
	dropBeforeHireDate: (change: HireDateDrop) => Promise<boolean>;
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

	/** 셸 호출 한 번. 잠금과 실패 문구가 통로마다 갈라지지 않게 여기 하나로 모은다. */
	const send = async (call: () => Promise<AppState>): Promise<boolean> => {
		setSaving(true);
		try {
			await call();
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

	return {
		commit: (change) => send(() => window.yeoncha.commit(change)),
		dropBeforeHireDate: (change) =>
			send(() => window.yeoncha.dropRecordsBeforeHireDate(change)),
		saving,
		error,
		clearError: () => setError(null),
	};
}
