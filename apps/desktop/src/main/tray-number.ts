import type { NativeImage, WebContents } from "electron";
import { BrowserWindow, nativeImage } from "electron";
import type { GlyphTone } from "./glyph";
import { inkColor } from "./glyph";

/**
 * 트레이 숫자를 그리는 숨은 렌더러(스펙 4.1절의 canvas 경로).
 *
 * 메인 프로세스에는 canvas가 없고 글자 래스터화는 canvas가 하는 일이므로 창을
 * 하나 빌린다. 보이지 않고, 작업 표시줄에 뜨지 않으며, 처음 숫자를 그릴 때 한 번
 * 만들어 앱 수명 동안 재사용한다. macOS는 `setTitle()`이라 이 창을 만들지 않는다.
 */
let canvasWindow: BrowserWindow | null = null;

/**
 * **정사각** 숫자 이미지를 만든다 — Windows 알림 영역 경로다(스펙 4.1절).
 *
 * `Tray.setImage`는 파일 경로가 없으면 크기를 맞춰주지 않으므로 호출자가 준
 * `size`가 그대로 device px다.
 */
export async function drawNumber(
	text: string,
	size: number,
	tone: GlyphTone,
): Promise<NativeImage> {
	/** 숨은 렌더러의 실행 대상. */
	const contents = await canvasContents();
	/** 페이지에서 돌 canvas 코드. 함수 원문을 문자열로 넘겨 그 자리에서 부른다. */
	const code = `(${renderInPage.toString()})(${JSON.stringify(text)}, ${size}, ${JSON.stringify(inkColor(tone))})`;
	return nativeImage.createFromDataURL(await contents.executeJavaScript(code));
}

/** 숨은 렌더러의 `webContents`. 없으면 만들고 로드가 끝날 때까지 기다린다. */
async function canvasContents(): Promise<WebContents> {
	if (canvasWindow && !canvasWindow.isDestroyed()) {
		return canvasWindow.webContents;
	}
	/** 그리기 전용 창. 크기는 쓰이지 않는다 — canvas 비트맵 크기가 결과를 정한다. */
	const created = new BrowserWindow({
		show: false,
		width: 64,
		height: 64,
		skipTaskbar: true,
		webPreferences: {
			// 숨은 창은 기본적으로 스로틀링 대상이다. 트레이 갱신이 지연되면 안 된다.
			backgroundThrottling: false,
		},
	});
	await created.loadURL("about:blank");
	canvasWindow = created;
	return created.webContents;
}

/**
 * 숨은 렌더러에서 도는 canvas 코드. **모듈 스코프의 어떤 것도 참조하면 안 된다** —
 * 원문을 문자열로 직렬화해 보내므로 인자와 전역만 살아남는다.
 *
 * 한 줄일 때 병목은 높이가 아니라 폭이므로(4.1절) 폭과 잉크 높이 둘 다에 맞춰
 * 글자 크기를 정한다. 기준 크기에서 한 번 재고 비례로 환산한다 — 글자 크기와
 * 텍스트 지표가 선형이라 반복 탐색이 필요 없다.
 */
function renderInPage(text: string, size: number, ink: string): string {
	/** 정사각 캔버스. 알림 영역 아이콘은 정의상 정사각이다(4.1절). */
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	/** 2D 그리기 맥락. */
	const context = canvas.getContext("2d");
	if (!context) {
		return canvas.toDataURL();
	}

	/** 글자 크기를 환산할 기준 크기. 크게 잡을수록 지표의 반올림 오차가 작다. */
	const probeSize = 100;
	/** 글꼴 — Windows는 Segoe UI다. 16px에서 획이 살도록 굵게 쓴다. */
	const fontOf = (px: number) =>
		`600 ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`;

	context.font = fontOf(probeSize);
	/** 기준 크기에서 잰 지표. */
	const probe = context.measureText(text);
	/** 기준 크기에서의 잉크 높이 — 숫자만 그리므로 사실상 cap height다. */
	const probeInkHeight =
		probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent;

	/** 최종 글자 크기 — 폭과 높이 중 먼저 막히는 쪽에 맞춘다. */
	const fontSize = Math.max(
		1,
		Math.floor(
			probeSize * Math.min(size / probe.width, (size * 0.72) / probeInkHeight),
		),
	);

	context.font = fontOf(fontSize);
	context.fillStyle = ink;
	context.textAlign = "center";
	context.textBaseline = "alphabetic";

	/** 최종 크기의 지표 — 잉크 상자를 정사각 중앙에 놓는 데 쓴다. */
	const metrics = context.measureText(text);
	context.fillText(
		text,
		size / 2,
		size / 2 +
			(metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2,
	);
	return canvas.toDataURL();
}
