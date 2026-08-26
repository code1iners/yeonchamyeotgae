import { app } from "electron";
import { createPopover, showPopover, togglePopover } from "./popover";
import { createTray } from "./tray";

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
		createPopover();
		createTray((trayBounds) => {
			togglePopover(trayBounds);
		});
	});

	app.on("window-all-closed", () => {
		// 트레이 상주 앱이므로 창이 다 닫혀도 종료하지 않는다.
	});
}
