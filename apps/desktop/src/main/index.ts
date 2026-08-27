import { app } from "electron";
import type { AppState } from "../shared/ipc";
import { registerDataIpc } from "./data-ipc";
import {
	createPopover,
	sendStateToPopover,
	showPopover,
	togglePopover,
} from "./popover";
import { getState, loadStore, setStateListener } from "./store";
import { createTray, type TrayView, updateTray } from "./tray";

/** 단일 인스턴스 락(2절) — 두 인스턴스가 같은 데이터 파일에 쓰는 것을 막는다. */
const isPrimaryInstance = app.requestSingleInstanceLock();

if (!isPrimaryInstance) {
	app.quit();
} else {
	// 두 번째 실행은 기존 인스턴스의 팝오버를 열고 종료한다(락에 막혀 위 분기로 빠진다).
	app.on("second-instance", () => {
		showPopover();
	});

	app.whenReady().then(() => {
		// macOS에서 Dock을 차지하지 않는다 — 트레이 상주 앱이다.
		if (process.platform === "darwin") {
			app.dock?.hide();
		}

		// 트레이보다 먼저 읽는다 — 첫 그림이 대시인지 숫자인지가 이 결과로 갈린다.
		loadStore();
		registerDataIpc();
		createPopover();
		createTray((trayBounds) => {
			togglePopover(trayBounds);
		});

		// 상태가 바뀌면 트레이와 팝오버가 같은 값을 본다.
		setStateListener((state) => {
			updateTray(trayView(state));
			sendStateToPopover(state);
		});
		updateTray(trayView(getState()));
	});

	app.on("window-all-closed", () => {
		// 트레이 상주 앱이므로 창이 다 닫혀도 종료하지 않는다.
	});
}

/** 트레이가 그릴 상태. 잔여가 없으면 **왜** 없는지가 툴팁을 가른다. */
function trayView(state: AppState): TrayView {
	if (state.balance) {
		return { kind: "balance", balance: state.balance.balance };
	}
	return state.read.status === "error"
		? { kind: "unreadable" }
		: { kind: "unset" };
}
