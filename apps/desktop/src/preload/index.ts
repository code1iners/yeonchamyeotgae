import { contextBridge, ipcRenderer } from "electron";
import type { AppState, LeaveDataChange } from "../shared/ipc";
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
