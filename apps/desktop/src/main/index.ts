import path from "node:path";
import { app, BrowserWindow } from "electron";

function createWindow(): void {
	const window = new BrowserWindow({
		width: 380,
		height: 400,
	});

	// electron-vite dev 서버가 있으면 그쪽을, 없으면(프로덕션 빌드) 번들된 파일을 연다.
	const rendererUrl = process.env.ELECTRON_RENDERER_URL;
	if (rendererUrl) {
		window.loadURL(rendererUrl);
	} else {
		window.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
	}
}

app.whenReady().then(() => {
	createWindow();
});

app.on("window-all-closed", () => {
	app.quit();
});
