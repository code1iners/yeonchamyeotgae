import { describe, expect, test } from "vitest";
import { matchesAppShortcut, shortcutLabel } from "./shortcuts";

/** 단축키 판정 테스트에서 재사용하는 정상 macOS 이벤트. */
const MAC_EVENT = {
	altKey: false,
	code: "KeyE",
	ctrlKey: false,
	metaKey: true,
	repeat: false,
	shiftKey: true,
};

describe("앱 단축키", () => {
	test("macOS 표기와 metaKey 이벤트가 같은 단축키를 가리킨다", () => {
		expect(shortcutLabel("open-entry", "MacIntel")).toBe("⌘⇧E");
		expect(matchesAppShortcut(MAC_EVENT, "open-entry", "MacIntel")).toBe(true);
	});

	test("다른 플랫폼은 Ctrl 표기와 ctrlKey 이벤트를 사용한다", () => {
		expect(shortcutLabel("history-tab", "Linux x86_64")).toBe("Ctrl⇧2");
		expect(
			matchesAppShortcut(
				{ ...MAC_EVENT, code: "Digit2", ctrlKey: true, metaKey: false },
				"history-tab",
				"Linux x86_64",
			),
		).toBe(true);
	});

	test("입력 중에 쓰는 조합과 반복 입력은 단축키가 아니다", () => {
		expect(
			matchesAppShortcut(
				{ ...MAC_EVENT, repeat: true },
				"open-entry",
				"MacIntel",
			),
		).toBe(false);
		expect(
			matchesAppShortcut(
				{ ...MAC_EVENT, altKey: true },
				"open-entry",
				"MacIntel",
			),
		).toBe(false);
	});
});
