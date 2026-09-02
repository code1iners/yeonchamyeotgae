import path from "node:path";
import type { Display, Rectangle } from "electron";
import { BrowserWindow, ipcMain, screen } from "electron";
import { type AppState, IPC } from "../shared/ipc";

/** 팝오버 고정 폭(5.6절) — 달력 한 주가 7칸 × 48px로 들어가는 최소 폭. */
const POPOVER_WIDTH = 380;
/** 렌더러가 높이를 보고하기 전에 쓰는 초기 높이. */
const INITIAL_HEIGHT = 240;
/** 렌더러가 보고한 높이의 하한. 0이나 음수가 와도 창이 사라지지 않게 한다. */
const MIN_HEIGHT = 80;
/** 트레이와 팝오버 사이 간격(px). */
const TRAY_GAP = 4;
/**
 * 트레이 클릭으로 팝오버가 blur → 숨김 처리된 직후, 같은 클릭의 click 이벤트가
 * 팝오버를 곧바로 다시 열지 않게 하는 유예 시간(ms).
 */
const REOPEN_SUPPRESS_MS = 250;
/** 파일 관리자가 호출 완료 뒤 포커스를 가져가기까지 기다릴 최대 시간(ms). */
const EXTERNAL_APP_BLUR_GRACE_MS = 250;

/** 단 하나뿐인 팝오버 창. 닫힘은 숨김이며 파괴하지 않는다. */
let popover: BrowserWindow | null = null;
/** 마지막으로 blur로 숨긴 시각(epoch ms). 토글 클릭의 재열림 억제에 쓴다. */
let hiddenAt = 0;
/** 마지막 클릭의 트레이 아이콘 영역. 위치 계산의 기준점이다. */
let anchorBounds: Rectangle | null = null;
/**
 * 열려 있는 네이티브 대화상자의 수. 하나라도 있으면 blur 숨김을 미룬다.
 * 불리언이면 중첩된 안쪽이 끝날 때 바깥의 붙잡음까지 풀어버린다.
 */
let openDialogs = 0;

/** 네이티브 파일 관리자 호출 뒤의 비동기 blur까지 붙잡을지 정하는 옵션. */
type PopoverHoldOptions = {
	/** `shell.showItemInFolder`처럼 반환 뒤 blur가 올 수 있는 호출인가. */
	waitForExternalBlur?: boolean;
};

/** 팝오버 창을 만든다. 숨긴 채로 만들고 트레이 클릭이 열어준다. */
export function createPopover(): BrowserWindow {
	popover = new BrowserWindow({
		width: POPOVER_WIDTH,
		height: INITIAL_HEIGHT,
		show: false,
		frame: false,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		webPreferences: {
			preload: path.join(import.meta.dirname, "../preload/index.mjs"),
			// ESM preload는 sandbox와 병존하지 않는다. contextIsolation은 기본값(true)이다.
			sandbox: false,
		},
	});

	// 포커스를 잃으면 닫힌다 — 팝오버의 정의다. 단 하나의 예외가 대화상자다.
	popover.on("blur", () => {
		if (openDialogs > 0) {
			return;
		}
		hidePopover();
	});

	// 렌더러가 내용 높이를 보고하면 창 높이를 맞춘다(5.6절 — 높이는 내용에 맞춘다).
	ipcMain.on(IPC.CONTENT_HEIGHT, (_event, height: number) => {
		resizeToContent(height);
	});

	/** electron-vite dev 서버가 있으면 그쪽을, 없으면(프로덕션 빌드) 번들된 파일을 연다. */
	const rendererUrl = process.env.ELECTRON_RENDERER_URL;
	if (rendererUrl) {
		popover.loadURL(rendererUrl);
	} else {
		popover.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
	}
	return popover;
}

/** 트레이 클릭용 토글. 열려 있으면 닫고, 닫혀 있으면 트레이 위치에 연다. */
export function togglePopover(trayBounds: Rectangle): void {
	if (!popover) {
		return;
	}
	anchorBounds = trayBounds;
	if (popover.isVisible()) {
		hidePopover();
		return;
	}
	// 트레이 클릭이 blur를 먼저 일으켜 이미 닫혔다면, 같은 클릭으로 다시 열지 않는다(토글 유지).
	if (Date.now() - hiddenAt < REOPEN_SUPPRESS_MS) {
		return;
	}
	showPopover();
}

/**
 * 셸이 다시 낸 상태를 팝오버 렌더러에 밀어준다.
 *
 * 렌더러가 스스로 다시 묻지 않는 이유는 값이 바뀌는 계기가 렌더러 밖에 있기
 * 때문이다 — 자정과 절전 복귀(21번), 그리고 다른 경로의 커밋이다.
 */
export function sendStateToPopover(state: AppState): void {
	popover?.webContents.send(IPC.STATE_CHANGED, state);
}

/**
 * 팝오버를 무조건 연다. 두 번째 인스턴스 실행과 첫 실행 온보딩이 이 경로를 탄다.
 *
 * `anchor`를 주면 그 자리에 붙여 연다 — 클릭 전이라 기준점이 없는 경로에서
 * 트레이 위치를 넘겨줄 수 있다.
 */
export function showPopover(anchor?: Rectangle): void {
	if (!popover) {
		return;
	}
	if (anchor) {
		anchorBounds = anchor;
	}
	positionPopover(popover);
	popover.show();
}

/**
 * 네이티브 파일 대화상자나 파일 관리자 호출 동안 팝오버를 붙잡아 둔다(23번).
 *
 * 대화상자가 뜨면 팝오버가 blur로 닫히고, 그러면 파일을 고른 뒤 결과를 보여줄
 * 화면이 사라진다. 대화상자가 닫힌 뒤 포커스를 되돌려 놓는 것까지가 한 벌이다 —
 * 그러지 않으면 다음 바깥 클릭에 blur가 오지 않아 팝오버가 계속 떠 있는다.
 */
export async function withPopoverHeld<T>(
	run: () => Promise<T>,
	options: PopoverHoldOptions = {},
): Promise<T> {
	openDialogs += 1;
	/** 외부 파일 관리자의 늦은 blur를 처리하고 나서 잠금을 풀기 위한 대기. */
	const externalBlur = options.waitForExternalBlur
		? waitForExternalBlur()
		: null;
	try {
		return await run();
	} finally {
		await externalBlur;
		openDialogs -= 1;
		if (openDialogs === 0 && popover?.isVisible()) {
			popover.focus();
		}
	}
}

/** 파일 관리자 호출 직후 또는 짧은 유예 시간 뒤에 팝오버 잠금을 해제한다. */
function waitForExternalBlur(): Promise<void> {
	/** 현재 잠금을 기다리는 팝오버 창. */
	const currentPopover = popover;
	if (!currentPopover) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		/** blur나 유예 시간이 먼저 끝났는지 나타내는 상태. */
		let settled = false;
		/** 비동기 외부 앱 호출이 영원히 잠금을 잡지 않게 하는 타이머. */
		let timeout: ReturnType<typeof setTimeout>;
		/** 잠금 대기를 끝내고 등록한 blur 리스너와 타이머를 치운다. */
		const finish = () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			currentPopover.removeListener("blur", handleBlur);
			resolve();
		};
		/** 외부 파일 관리자가 포커스를 가져간 순간. */
		const handleBlur = () => finish();

		currentPopover.on("blur", handleBlur);
		timeout = setTimeout(finish, EXTERNAL_APP_BLUR_GRACE_MS);
	});
}

/**
 * 팝오버를 숨기고 숨긴 시각을 기록한다.
 *
 * 트레이 우클릭 메뉴가 뜨기 직전에도 이 함수가 불린다(4.6절) — `blur`가 먼저 돌
 * 것이라는 가정이 실물 검증에서 뒤집혀, 명시적으로 닫는 쪽으로 바꿨다.
 */
export function hidePopover(): void {
	if (!popover?.isVisible()) {
		return;
	}
	popover.hide();
	hiddenAt = Date.now();
}

/** 렌더러가 보고한 내용 높이로 창 크기를 맞추고, 열려 있으면 위치도 다시 잡는다. */
function resizeToContent(height: number): void {
	if (!popover) {
		return;
	}
	/** 화면 작업 영역을 넘지 않게 자른 목표 높이. */
	const maxHeight = displayFor(anchorBounds).workArea.height;
	const next = Math.min(Math.max(Math.round(height), MIN_HEIGHT), maxHeight);
	popover.setContentSize(POPOVER_WIDTH, next);
	if (popover.isVisible()) {
		positionPopover(popover);
	}
}

/** 트레이 아이콘에 붙여 팝오버 위치를 잡는다. 메뉴 막대(상단)면 아래로, 작업 표시줄(하단)이면 위로 연다. */
function positionPopover(window: BrowserWindow): void {
	const { width, height } = window.getBounds();
	const display = displayFor(anchorBounds);
	const area = display.workArea;

	let x: number;
	let y: number;
	if (hasAnchor(anchorBounds)) {
		x = Math.round(anchorBounds.x + anchorBounds.width / 2 - width / 2);
		/** 트레이가 화면 위쪽 절반에 있는가(macOS 메뉴 막대 = 위, Windows 작업 표시줄 = 대개 아래). */
		const trayOnTop =
			anchorBounds.y + anchorBounds.height / 2 <
			display.bounds.y + display.bounds.height / 2;
		y = trayOnTop
			? anchorBounds.y + anchorBounds.height + TRAY_GAP
			: anchorBounds.y - height - TRAY_GAP;
	} else {
		// 트레이 위치를 모르면(두 번째 인스턴스가 클릭 전에 열 때) 작업 영역 우상단에 둔다.
		x = area.x + area.width - width - TRAY_GAP;
		y = area.y + TRAY_GAP;
	}

	// 작업 영역 밖으로 나가지 않게 자른다.
	x = Math.min(Math.max(x, area.x), area.x + area.width - width);
	y = Math.min(Math.max(y, area.y), area.y + area.height - height);
	window.setPosition(x, y);
}

/** 기준점이 속한 디스플레이. 기준점이 없으면 주 디스플레이. */
function displayFor(bounds: Rectangle | null): Display {
	if (hasAnchor(bounds)) {
		return screen.getDisplayMatching(bounds);
	}
	return screen.getPrimaryDisplay();
}

/** 위치 계산에 쓸 수 있는 기준점인가 — 트레이 클릭 전이거나 빈 bounds면 아니다. */
function hasAnchor(bounds: Rectangle | null): bounds is Rectangle {
	return bounds !== null && bounds.width > 0;
}
