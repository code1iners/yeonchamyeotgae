import { formatTrayLabel } from "@yeoncha/core";
import type { NativeImage, Rectangle } from "electron";
import { Menu, nativeImage, nativeTheme, screen, Tray } from "electron";
import { drawGlyph, type GlyphTone } from "./glyph";
import { drawNumber } from "./tray-number";

/**
 * 트레이가 그리는 상태 셋. 잔여를 띄우지 못하는 이유가 둘이라 `null` 하나로
 * 뭉치지 않는다 — 대시는 양쪽 다 맞지만(숫자가 들어갈 자리인데 아직 계산할 수
 * 없다) 툴팁은 갈린다.
 */
export type TrayView =
	/** 잔여를 띄운다. */
	| { kind: "balance"; balance: number }
	/** 입사일 미설정 — 파일이 없다. */
	| { kind: "unset" }
	/** 저장 파일을 읽지 못했다. */
	| { kind: "unreadable" };

/** 입사일 미설정 상태의 툴팁(4절). */
const TOOLTIP_UNSET = "연차몇개 — 입사일을 입력하세요";
/**
 * 저장 파일을 읽지 못한 상태의 툴팁. 4절이 정의한 두 문구 중 어느 쪽도 사실이
 * 아니라서 셋째가 필요하다 — 입사일은 있는데 파일을 못 읽는 것이고, 그 자리에
 * "입사일을 입력하세요"를 띄우면 툴팁이 거짓말을 한다. 무엇이 잘못됐고 무엇을
 * 고를 수 있는지는 눌러서 열리는 오류 화면이 말한다(23번).
 */
const TOOLTIP_UNREADABLE = "연차몇개 — 저장 파일을 읽지 못했습니다";

/**
 * macOS 트레이의 글리프 예산 — 네이티브 텍스트라 제한이 없다(4.3절).
 * 잔여가 `12.75`면 트레이에 `12.75`가 그대로 뜬다.
 */
const MAC_MAX_GLYPHS = Number.POSITIVE_INFINITY;
/**
 * Windows 트레이의 글리프 예산 — 부호 한 글자 + 숫자 두 글자(4.3절).
 * 16px 정사각에서 편하게 읽히는 것이 두 글자이고, 최악인 `-25`가 세 글자다.
 */
const WINDOWS_MAX_GLYPHS = 3;

/**
 * 이 셸의 글리프 예산. **플랫폼 지식이 위 상수 둘로 끝난다** — 표기 규칙 자체는
 * 코어의 `formatTrayLabel` 한 곳에만 있고 셸에 포매팅 분기가 없다(4.3절).
 */
const MAX_GLYPHS =
	process.platform === "darwin" ? MAC_MAX_GLYPHS : WINDOWS_MAX_GLYPHS;

/**
 * 앱 수명 동안 유지되는 트레이 인스턴스. 갱신에도 쓰지만, 그것과 별개로 참조를
 * 잡아두지 않으면 GC가 트레이를 거둬 아이콘이 사라진다 — 삭제하면 안 된다.
 */
let _tray: Tray | null = null;
/**
 * 마지막으로 요청한 그리기의 순번. Windows 숫자 이미지는 숨은 렌더러를 거쳐
 * 비동기로 오므로, 늦게 끝난 옛 그리기가 새 값을 덮지 않게 막는다.
 */
let renderSeq = 0;
/**
 * 마지막으로 그린 트레이 상태. 테마가 바뀌면 **이 값을 그대로** 다시 그린다 —
 * 재계산이 아니라 재그리기다(6.2절). 초깃값은 `createTray`가 처음 그리는 대시다.
 */
let lastView: TrayView = { kind: "unset" };

/** {@link createTray}가 받는 옵션. 항목이 늘면 콜백이 늘 뿐, 위치 인자로 두지 않는다(4.6절). */
export interface CreateTrayOptions {
	/** 좌클릭 — 팝오버를 토글한다. */
	onClick: (trayBounds: Rectangle) => void;
	/**
	 * 우클릭 메뉴를 띄우기 직전에 부른다. `popUpContextMenu`는 동기 호출이라 메뉴가
	 * 떠 있는 동안 JS 이벤트 루프가 막혀 `blur`가 돌 기회가 없다 — 팝오버가 열려
	 * 있으면 그 blur에 기대지 않고 이 콜백에서 먼저 닫아야 한다(4.6절, 실물 검증이
	 * 뒤집은 가정).
	 */
	onWillShowMenu: () => void;
	/** 우클릭 메뉴의 `[종료]` — 앱을 끈다. 실제로 부르는 것은 `index.ts`다. */
	onQuit: () => void;
}

/** 트레이를 만들고 좌클릭·우클릭 핸들러를 건다. 초기 표시는 입사일 미설정 대시다. */
export function createTray({
	onClick,
	onWillShowMenu,
	onQuit,
}: CreateTrayOptions): Tray {
	const created = new Tray(createGlyphImage());
	created.setToolTip(TOOLTIP_UNSET);
	created.on("click", (_event, bounds) => {
		// 합성 클릭(접근성 등)은 bounds가 비어 올 수 있어 트레이에서 직접 읽어 보완한다.
		onClick(bounds.width > 0 ? bounds : created.getBounds());
	});

	// setContextMenu가 아니라 right-click + popUpContextMenu다(4.6절) — setContextMenu는
	// Windows에서 좌클릭도 가로채 팝오버 토글을 죽인다. macOS에서는 발현하지 않는다.
	/** 우클릭 메뉴(항목 하나, `[종료]`). */
	const menu = buildContextMenu(onQuit);
	created.on("right-click", () => {
		onWillShowMenu();
		created.popUpContextMenu(menu);
	});

	_tray = created;
	return created;
}

/**
 * 트레이 우클릭 메뉴(4.6절). 항목은 `[종료]` 하나이고 문구는 양 OS 모두 같다 —
 * 트레이에서 연 메뉴는 무엇을 종료하는지 모호할 자리가 없어 macOS의 `Quit AppName`
 * 관례(애플리케이션 메뉴의 관례)를 따를 이유가 없다. 확인 대화상자는 없다 — 저장이
 * 전부 동기라 종료가 쓰기를 끊지 않고, 종료로 잃을 것이 없다.
 */
function buildContextMenu(onQuit: () => void): Menu {
	return Menu.buildFromTemplate([{ label: "종료", click: onQuit }]);
}

/**
 * 트레이에 잔여를 띄운다. `null`은 입사일 미설정이며 대시가 그 자리를 지킨다(4.4절).
 *
 * **툴팁은 양쪽 다 정확한 값을 갖는다**(4절). Windows에서 트레이 숫자와 팝오버
 * 숫자가 갈리는 유일한 경우이고, 그 간극을 메우는 것이 툴팁의 존재 이유다.
 */
export function updateTray(view: TrayView): void {
	/** 갱신 대상 트레이. */
	const tray = _tray;
	if (!tray) {
		return;
	}
	renderSeq += 1;
	lastView = view;

	// 잔여를 띄울 수 없나요? 숫자가 들어갈 자리를 대시가 지킨다(4.4절).
	if (view.kind !== "balance") {
		tray.setToolTip(view.kind === "unset" ? TOOLTIP_UNSET : TOOLTIP_UNREADABLE);
		renderTray(tray, createGlyphImage(), "");
		return;
	}

	/** 잔여. */
	const { balance } = view;
	tray.setToolTip(`연차몇개 — 잔여 ${balance}일`);
	/** 트레이 문자열. 예산에 담기면 정확한 표기, 담기지 않으면 내림 정수다. */
	const label = formatTrayLabel(balance, { maxGlyphs: MAX_GLYPHS });

	// macOS는 네이티브 텍스트라 여기서 끝난다.
	if (process.platform === "darwin") {
		renderTray(tray, nativeImage.createEmpty(), label);
		return;
	}

	// Windows는 문자열을 정사각 이미지로 그려야 한다 — 숨은 렌더러를 거쳐 온다.
	/** 이 그리기의 순번. 돌아왔을 때 아직 최신인지 확인한다. */
	const seq = renderSeq;
	drawNumber(label, windowsIconSize(), windowsTone())
		.then((image) => {
			// 그 사이 더 새로운 값이 들어왔나요?
			if (seq === renderSeq) {
				renderTray(tray, image, label);
			}
		})
		.catch((error: unknown) => {
			// 그리기가 실패하면 직전 이미지가 남는다 — 툴팁은 이미 정확한 값을 갖고 있다.
			console.error("트레이 숫자를 그리지 못했다", error);
		});
}

/**
 * Windows에서 테마가 바뀌면 트레이를 **다시 그린다**(6.2절).
 *
 * 4.5절의 재계산 트리거와 **다른 축이다** — 저쪽은 값이 바뀌는 것이고 이쪽은 같은
 * 값을 다시 그리는 것이다. **섞지 않는다.** macOS는 템플릿 이미지 한 장을 OS가
 * 반전해 주므로 이 리스너 자체가 필요 없다.
 *
 * 이 이벤트는 값이 실제로 바뀔 때만 오므로 무조건 다시 그려도 낭비가 없다.
 */
export function startThemeRedraw(): void {
	if (process.platform === "darwin") {
		return;
	}
	nativeTheme.on("updated", () => {
		updateTray(lastView);
	});
}

/** 트레이 이미지와 제목을 한 번에 반영한다. 렌더링만이고 표기 규칙은 없다. */
function renderTray(tray: Tray, image: NativeImage, title: string): void {
	tray.setImage(image);
	// setTitle은 macOS 전용이다. 다른 플랫폼에서는 no-op이라 분기가 필요 없다.
	tray.setTitle(title);
}

/** 플랫폼별 트레이 글리프 이미지를 만든다(6.2절). */
function createGlyphImage(): NativeImage {
	if (process.platform === "darwin") {
		return createMacTemplateImage();
	}
	return drawGlyph(windowsIconSize(), windowsTone());
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
 * Windows 알림 영역 아이콘의 크기(device px).
 *
 * `SM_CXSMICON`과 정확히 맞춰야 한다 — 어긋나면 OS 리샘플링이 전 픽셀에
 * 안티에일리어싱을 만든다. 홀수 크기(비표준 배율)의 반 픽셀 중심 이탈은
 * 글리프 쪽이 내림으로 흡수한다.
 */
function windowsIconSize(): number {
	return Math.round(16 * screen.getPrimaryDisplay().scaleFactor);
}

/**
 * Windows 잉크 톤 — 다크 테마 배경에는 흰 잉크, 라이트 테마에는 검정 잉크.
 * 이 값이 바뀐 것을 트레이에 반영하는 것은 `startThemeRedraw`다.
 */
function windowsTone(): GlyphTone {
	return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}
