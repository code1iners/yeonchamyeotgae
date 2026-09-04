import type { LeaveEntry } from "@yeoncha/core";
import { useState } from "react";
import { useCommit } from "./use-commit";

type Options = {
	/** 현재 저장할 휴가 기록 전체. */
	entries: LeaveEntry[];
	/** 수정 초안처럼 삭제와 동시에 진행할 수 없는 상태. */
	disabled?: boolean;
	/** 삭제 성공 뒤 보기별 포커스와 완료 문구를 처리한다. */
	onSuccess: (id: string) => void;
};

/** 리스트와 달력에서 공유하는 휴가 기록 삭제 확인·저장 상태. */
export function useEntryRemoval({
	entries,
	disabled = false,
	onSuccess,
}: Options) {
	/** 삭제 확인을 열어 둔 기록의 식별자. */
	const [targetId, setTargetId] = useState<string | null>(null);
	/** 삭제 전용 커밋 통로. 수정 실패와 오류 위치를 섞지 않는다. */
	const removal = useCommit();

	/** 대상의 인라인 삭제 확인을 연다. */
	const open = (id: string) => {
		if (disabled || removal.saving) {
			return;
		}
		removal.clearError();
		setTargetId(id);
	};

	/** 확인한 대상만 제거하고 성공한 경우 보기별 후속 처리를 실행한다. */
	const confirm = async (id: string): Promise<boolean> => {
		if (disabled || removal.saving || targetId !== id) {
			return false;
		}
		/** 삭제 대상을 제외한 다음 기록 배열. */
		const nextEntries = entries.filter((entry) => entry.id !== id);
		if (await removal.commit({ entries: nextEntries })) {
			setTargetId(null);
			onSuccess(id);
			return true;
		}
		return false;
	};

	/** 확인을 취소하고 삭제 오류를 지운다. */
	const cancel = () => {
		if (removal.saving) {
			return;
		}
		setTargetId(null);
		removal.clearError();
	};

	/** 다른 날짜나 편집 맥락으로 이동할 때 오래된 삭제 확인을 버린다. */
	const dismiss = () => {
		setTargetId(null);
		removal.clearError();
	};

	return {
		targetId,
		saving: removal.saving,
		error: removal.error,
		open,
		confirm,
		cancel,
		dismiss,
	};
}
