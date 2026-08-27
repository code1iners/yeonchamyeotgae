import { contextBridge, ipcRenderer } from "electron";
import type {
	AppState,
	HireDateDrop,
	LeaveDataChange,
	TransferResult,
} from "../shared/ipc";
import { IPC } from "../shared/ipc";

/** 렌더러에 노출하는 셸 API. 렌더러가 셸에 닿는 통로는 이것뿐이다. */
const yeonchaApi = {
	/** 팝오버 본문 높이를 셸에 보고해 창 높이를 내용에 맞춘다(5.6절). */
	reportContentHeight(height: number): void {
		ipcRenderer.send(IPC.CONTENT_HEIGHT, height);
	},

	/**
	 * 셸 상태 전부를 가져온다 — 읽기 상태 · 설정 · 휴가 기록 · 조정 · 잔여와 내역.
	 * 잔여는 셸이 만든 `Asia/Seoul` 오늘 기준이며 렌더러는 날짜를 만들지 않는다.
	 */
	getState(): Promise<AppState> {
		return ipcRenderer.invoke(IPC.GET_STATE);
	},

	/**
	 * 변경을 커밋한다 — 준 필드만 덮어쓰고 즉시 원자적으로 저장된다.
	 * 읽지 못한 파일에는 쓰지 않으므로 오류 상태에서는 거부된다(2절).
	 */
	commit(change: LeaveDataChange): Promise<AppState> {
		return ipcRenderer.invoke(IPC.COMMIT, change);
	},

	/**
	 * 입사일 변경에 따른 기록 삭제를 커밋한다. **지우기 직전에 백업이 남는다**(2절).
	 * 커밋과 통로가 다른 이유는 백업을 남기는 자리가 둘뿐이기 때문이다(23번).
	 */
	dropRecordsBeforeHireDate(change: HireDateDrop): Promise<AppState> {
		return ipcRenderer.invoke(IPC.DROP_BEFORE_HIRE_DATE, change);
	},

	/**
	 * 저장 파일이 있는 폴더를 OS 파일 관리자에서 연다(23번).
	 * 저장 경로를 설정값으로 열지 않는 대신 두는 통로이므로 인자가 없다(2절).
	 */
	revealDataFile(): Promise<void> {
		return ipcRenderer.invoke(IPC.REVEAL_FILE);
	},

	/** 저장 파일을 그대로 복사해 내보낸다. 파일 고르기는 셸의 대화상자가 한다. */
	exportData(): Promise<TransferResult> {
		return ipcRenderer.invoke(IPC.EXPORT);
	},

	/**
	 * 고른 파일로 전체를 교체한다. 교체 직전에 백업이 남는다.
	 * "지금 데이터가 대체됩니다"를 먼저 말하는 것은 부르는 화면의 몫이다(23번).
	 */
	importData(): Promise<TransferResult> {
		return ipcRenderer.invoke(IPC.IMPORT);
	},

	/**
	 * `data.json.bak`을 되돌린다. 읽기 실패 화면의 `[백업에서 복구]`가 부른다.
	 * 성공하면 갱신된 상태가 오고, 백업이 없거나 그것마저 깨졌으면 거부된다.
	 */
	restoreBackup(): Promise<AppState> {
		return ipcRenderer.invoke(IPC.RESTORE_BACKUP);
	},

	/**
	 * 셸이 상태를 다시 냈을 때 받는다(커밋 · 자정 · 절전 복귀).
	 * 돌려주는 함수를 부르면 구독이 끊긴다.
	 */
	onStateChanged(listener: (state: AppState) => void): () => void {
		/** ipcRenderer가 부르는 핸들러. 이벤트 객체는 렌더러에 넘기지 않는다. */
		const handler = (_event: unknown, state: AppState) => {
			listener(state);
		};
		ipcRenderer.on(IPC.STATE_CHANGED, handler);
		return () => {
			ipcRenderer.off(IPC.STATE_CHANGED, handler);
		};
	},
};

contextBridge.exposeInMainWorld("yeoncha", yeonchaApi);

/** 렌더러 쪽 타입 선언(`window.yeoncha`)이 참조하는 API 모양. */
export type YeonchaApi = typeof yeonchaApi;
