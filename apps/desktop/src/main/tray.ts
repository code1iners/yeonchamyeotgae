import type { NativeImage, Rectangle } from "electron";
import { nativeImage, nativeTheme, screen, Tray } from "electron";
import { drawGlyph } from "./glyph";

/** 입사일 미설정 상태의 툴팁(4절). 잔여 표시는 19번 티켓에서 들어온다. */
const TOOLTIP_UNSET = "연차몇개 — 입사일을 입력하세요";

/**
 * 앱 수명 동안 유지되는 트레이 인스턴스. 읽는 곳은 없지만 참조를 잡아두지
 * 않으면 GC가 트레이를 거둬 아이콘이 사라진다 — 삭제하면 안 된다.
 */
let _tray: Tray | null = null;

/** 트레이를 만들고 클릭 핸들러를 건다. 초기 표시는 입사일 미설정 대시다. */
export function createTray(onClick: (trayBounds: Rectangle) => void): Tray {
	const created = new Tray(createGlyphImage());
	created.setToolTip(TOOLTIP_UNSET);
	created.on("click", (_event, bounds) => {
		// 합성 클릭(접근성 등)은 bounds가 비어 올 수 있어 트레이에서 직접 읽어 보완한다.
		onClick(bounds.width > 0 ? bounds : created.getBounds());
	});
	_tray = created;
	return created;
}

/** 플랫폼별 트레이 글리프 이미지를 만든다(6.2절). */
function createGlyphImage(): NativeImage {
	if (process.platform === "darwin") {
		return createMacTemplateImage();
	}
	return createWindowsSquareImage();
}

/**
 * macOS: 알파만 그린 템플릿 이미지 한 장으로 라이트/다크가 끝난다(6.2절).
 * 메뉴 막대는 16pt이므로 1x(16px)·2x(32px) 두 표현을 담는다.
 */
function createMacTemplateImage(): NativeImage {
	const image = nativeImage.createEmpty();
	for (const [size, scaleFactor] of [
		[16, 1],
		[32, 2],
	] as const) {
		// PNG로 인코딩해 넘긴다 — addRepresentation의 raw 비트맵 해석은 채널 순서가
		// 플랫폼 의존이지만 PNG 경로는 명확하고, 하드 엣지 사각형이라 무손실이다.
		image.addRepresentation({
			width: size,
			height: size,
			scaleFactor,
			buffer: drawGlyph(size, "mono").toPNG(),
		});
	}
	image.setTemplateImage(true);
	return image;
}

/**
 * Windows: 정사각 비트맵을 표시 배율에 맞는 크기로 직접 그려 넘긴다.
 * `Tray.setImage`는 파일 경로가 없으면 크기를 맞춰주지 않는다(4.1절).
 * 테마 변경 시 다시 그리기는 21번 티켓의 `nativeTheme.on('updated')`가 맡는다.
 */
function createWindowsSquareImage(): NativeImage {
	// 크기는 SM_CXSMICON과 정확히 맞춰야 한다 — 어긋나면 OS 리샘플링이
	// 전 픽셀에 안티에일리어싱을 만든다. 홀수 크기(비표준 배율)의 반 픽셀
	// 중심 이탈은 glyph 쪽이 내림으로 흡수한다.
	/** 알림 영역 아이콘의 기준 크기 16px × 표시 배율. */
	const size = Math.round(16 * screen.getPrimaryDisplay().scaleFactor);
	/** 다크 테마 배경에는 흰 잉크, 라이트 테마에는 검정 잉크. */
	const tone = nativeTheme.shouldUseDarkColors ? "dark" : "light";
	return drawGlyph(size, tone);
}
