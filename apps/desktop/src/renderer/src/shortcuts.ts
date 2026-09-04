/** 앱이 제공하는 반복 작업 단축키. 일괄 데이터 조작은 포함하지 않는다. */
export type AppShortcut =
	| "open-entry"
	| "summary-tab"
	| "history-tab"
	| "settings-tab";

/** 단축키별 실제 물리 키 코드. Shift 조합에서도 숫자 키를 안정적으로 읽는다. */
const SHORTCUT_CODES: Record<AppShortcut, string> = {
	"open-entry": "KeyN",
	"summary-tab": "Digit1",
	"history-tab": "Digit2",
	"settings-tab": "Digit3",
};

/** macOS 계열 플랫폼인지 판정한다. */
export function isMacPlatform(platform: string): boolean {
	return /Mac|iPhone|iPad|iPod/i.test(platform);
}

/** 앱 단축키가 사용할 주 수정키를 화면에 표시할 문자열로 돌려준다. */
export function shortcutModifierLabel(platform: string): string {
	return isMacPlatform(platform) ? "⌘" : "Ctrl";
}

/** 도움말에 표시할 단축키 문자열. 실제 이벤트 판정과 같은 플랫폼 분기를 쓴다. */
export function shortcutLabel(shortcut: AppShortcut, platform: string): string {
	const suffix: Record<AppShortcut, string> = {
		"open-entry": "N",
		"summary-tab": "1",
		"history-tab": "2",
		"settings-tab": "3",
	};
	return `${shortcutModifierLabel(platform)}⇧${suffix[shortcut]}`;
}

/** 현재 키 이벤트가 해당 앱 단축키인지 판정한다. 예약된 조합을 가로채지 않도록 조건을 고정한다. */
export function matchesAppShortcut(
	event: Pick<
		KeyboardEvent,
		"altKey" | "code" | "ctrlKey" | "metaKey" | "repeat" | "shiftKey"
	>,
	shortcut: AppShortcut,
	platform: string,
): boolean {
	/** 현재 플랫폼에서 앱이 사용할 주 수정키가 눌렸는가. */
	const mac = isMacPlatform(platform);
	const primaryPressed = mac ? event.metaKey : event.ctrlKey;
	const otherPrimaryPressed = mac ? event.ctrlKey : event.metaKey;
	return (
		primaryPressed &&
		!otherPrimaryPressed &&
		event.shiftKey &&
		!event.altKey &&
		!event.repeat &&
		event.code === SHORTCUT_CODES[shortcut]
	);
}

/** 입력값을 편집 중인 이벤트는 전역 단축키에 전달하지 않는다. */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (typeof Element === "undefined" || !(target instanceof Element)) {
		return false;
	}
	return (
		target.matches("input, textarea, select, [contenteditable='true']") ||
		(target instanceof HTMLElement && target.isContentEditable) ||
		target.getAttribute("role") === "textbox"
	);
}
