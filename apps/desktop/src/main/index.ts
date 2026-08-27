import { app } from "electron";
import type { AppState } from "../shared/ipc";
import { registerDataIpc } from "./data-ipc";
import {
	createPopover,
	sendStateToPopover,
	showPopover,
	togglePopover,
} from "./popover";
import { startRecalcTriggers } from "./recalc";
import { getState, loadStore, setStateListener } from "./store";
import {
	createTray,
	startThemeRedraw,
	type TrayView,
	updateTray,
} from "./tray";

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
		/** 트레이. 첫 실행에서 팝오버를 붙일 기준점을 여기서 얻는다. */
		const tray = createTray((trayBounds) => {
			togglePopover(trayBounds);
		});

		// 데이터가 바뀌면 트레이와 팝오버가 같은 값을 본다 — 4.5절 재계산 트리거의 1번이다.
		setStateListener(publishState);

		/** 부팅 시점의 상태. */
		const initialState = getState();
		publishState(initialState);

		// 남은 재계산 트리거(자정·절전 복귀·시각 변경)를 건다. **값이 바뀌는 축이다.**
		startRecalcTriggers(() => publishState(getState()));
		// 같은 값을 다시 그리는 축(6.2절). 위와 다른 축이며 섞지 않는다.
		startThemeRedraw();

		// 입사일이 없나요? 첫 실행에서 팝오버가 스스로 열린다 — 사용자가 무엇부터
		// 해야 하는지 찾지 않게 하는 것이 온보딩의 요구다. 대시를 눌러 들어온 것과
		// 같은 상태이므로 열리는 것은 설정 탭이다(4.4절).
		if (trayView(initialState).kind === "unset") {
			showPopover(tray.getBounds());
		}
	});

	app.on("window-all-closed", () => {
		// 트레이 상주 앱이므로 창이 다 닫혀도 종료하지 않는다.
	});
}

/** 트레이와 팝오버에 같은 상태를 반영한다. 상태가 화면에 닿는 통로는 이 하나다. */
function publishState(state: AppState): void {
	updateTray(trayView(state));
	sendStateToPopover(state);
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
