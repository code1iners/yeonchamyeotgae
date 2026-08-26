import type { NativeImage } from "electron";
import { nativeImage } from "electron";

/**
 * 트레이 글리프의 톤(6.2절).
 * - `mono`: macOS 템플릿 이미지용. 알파만 의미가 있다(잉크 색은 OS가 정한다).
 * - `light`: 라이트 테마 배경용 — 검정 잉크.
 * - `dark`: 다크 테마 배경용 — 흰 잉크.
 */
export type GlyphTone = "mono" | "light" | "dark";

/** 톤별 잉크 색(RGB). mono는 알파만 쓰이므로 값 자체는 무의미하다. */
const INK: Record<GlyphTone, [number, number, number]> = {
	mono: [0, 0, 0],
	light: [0, 0, 0],
	dark: [255, 255, 255],
};

/**
 * "입사일 미설정" 상태의 가로 대시 글리프를 런타임에 그린다(6절).
 * 파일 자산이 아니라 함수다 — 16px 아이콘 파일을 만들지 않는다(6.3절).
 */
export function drawGlyph(size: number, tone: GlyphTone): NativeImage {
	return nativeImage.createFromBitmap(renderGlyphBitmap(size, tone), {
		width: size,
		height: size,
	});
}

/**
 * 대시 글리프의 원시 비트맵(32bit/px)을 만든다.
 *
 * 6.1절 확정 기하. 폭과 두께를 짝수로 강제해야 대시가 픽셀 격자에 정확히
 * 정렬되어 안티에일리어싱이 0이 된다. `round(size * 0.125)`로 단순화하면
 * 20px에서 두께 3px이 나와 반 픽셀이 남는다 — 단순화 금지(9절 15번).
 */
function renderGlyphBitmap(size: number, tone: GlyphTone): Buffer {
	/** 대시 폭(짝수 강제). */
	const w = Math.max(2, Math.round((size * 0.56) / 2) * 2);
	/** 대시 두께(짝수 강제). */
	const h = Math.max(2, Math.round((size * 0.125) / 2) * 2);
	// 좌표는 내림으로 정수화한다. 6.1절 표의 짝수 size에서는 나눗셈이 이미
	// 정수라 동작이 같고, 홀수 size(Windows 비표준 배율)에서는 반 픽셀
	// 중심 이탈을 감수하는 대신 안티에일리어싱 0을 지킨다.
	/** 대시 좌상단 좌표. */
	const x = Math.floor((size - w) / 2);
	const y = Math.floor((size - h) / 2);

	const [r, g, b] = INK[tone];
	const bitmap = Buffer.alloc(size * size * 4);
	for (let row = y; row < y + h; row++) {
		for (let col = x; col < x + w; col++) {
			const offset = (row * size + col) * 4;
			// createFromBitmap의 채널 순서는 플랫폼 의존(BGRA/RGBA)이지만
			// 잉크가 무채색(R=G=B)이라 어느 쪽이든 결과가 같다.
			bitmap[offset] = b;
			bitmap[offset + 1] = g;
			bitmap[offset + 2] = r;
			bitmap[offset + 3] = 255;
		}
	}
	return bitmap;
}
