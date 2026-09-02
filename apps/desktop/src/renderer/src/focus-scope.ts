import type { KeyboardEvent } from "react";

/** 팝오버 안에서 키보드로 순환시킬 수 있는 조작 요소 선택자. */
const FOCUSABLE_SELECTOR = [
	"button:not(:disabled)",
	"input:not(:disabled)",
	"select:not(:disabled)",
	"textarea:not(:disabled)",
	"a[href]",
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

/** 대화상자 안의 Tab 포커스를 첫 요소와 마지막 요소 사이에서 순환시킨다. */
export function trapFocus(event: KeyboardEvent<HTMLElement>): void {
	if (event.key !== "Tab") {
		return;
	}

	/** 현재 대화상자에서 실제로 포커스할 수 있는 요소. */
	const focusable = Array.from(
		event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter((element) => !element.hidden && element.getClientRects().length > 0);
	if (focusable.length === 0) {
		event.preventDefault();
		return;
	}

	/** 순환의 양 끝 요소. */
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (!first || !last) {
		return;
	}

	/** 현재 포커스가 순환의 경계에 있는가. */
	const activeElement = document.activeElement;
	if (event.shiftKey && activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}
