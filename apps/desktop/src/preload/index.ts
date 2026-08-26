import { contextBridge, ipcRenderer } from "electron";

/** 렌더러에 노출하는 셸 API. 데이터 IPC는 19번 티켓에서 여기로 들어온다. */
const yeonchaApi = {
	/** 팝오버 본문 높이를 셸에 보고해 창 높이를 내용에 맞춘다(5.6절). */
	reportContentHeight(height: number): void {
		ipcRenderer.send("popover:content-height", height);
	},
};

contextBridge.exposeInMainWorld("yeoncha", yeonchaApi);

/** 렌더러 쪽 타입 선언(`window.yeoncha`)이 참조하는 API 모양. */
export type YeonchaApi = typeof yeonchaApi;
