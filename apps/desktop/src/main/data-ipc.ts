import { ipcMain } from "electron";
import { IPC, type LeaveDataChange } from "../shared/ipc";
import { commit, getState } from "./store";

/**
 * 데이터 IPC를 등록한다. 렌더러가 저장 파일에 닿는 통로는 이 둘뿐이다 —
 * 경로도, 파일 시스템도, 도메인 규칙도 렌더러로 넘어가지 않는다.
 *
 * 커밋은 쓰기가 막힌 상태에서 거부되며(읽지 못한 파일에는 쓰지 않는다),
 * 거부는 `invoke`의 reject로 렌더러에 그대로 전달된다.
 */
export function registerDataIpc(): void {
	ipcMain.handle(IPC.GET_STATE, () => getState());
	ipcMain.handle(IPC.COMMIT, (_event, change: LeaveDataChange) =>
		commit(change),
	);
}
