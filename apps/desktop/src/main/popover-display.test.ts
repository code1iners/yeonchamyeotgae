import { describe, expect, test, vi } from "vitest";
import { focusPopoverIfAllowed, showPopoverWindow } from "./popover-display";

/** 표시 정책 테스트에서 사용하는 가짜 BrowserWindow 선택지. */
type FakePopoverWindowOptions = {
	/** 가짜 창이 처음부터 네이티브 포커스를 가졌는지. */
	focused?: boolean;
	/** 비활성 표시 API를 대체할 함수. 없으면 지원하지 않는 환경이다. */
	showInactive?: () => void;
};

/** 표시 정책이 네이티브 API를 어떤 순서로 호출했는지 관찰할 가짜 창을 만든다. */

function createFakePopoverWindow(options: FakePopoverWindowOptions = {}) {
	/** 가짜 창이 처음부터 가졌는지 확인할 네이티브 포커스 상태. */
	const focused = options.focused ?? false;
	/** 비활성 표시 API. 명시적 `undefined`는 지원 불가 상태를 유지한다. */
	const showInactive =
		"showInactive" in options ? options.showInactive : vi.fn();
	/** 표시 정책에 전달할 가짜 BrowserWindow. */
	return {
		show: vi.fn(),
		showInactive,
		isFocused: vi.fn(() => focused),
		focus: vi.fn(),
	};
}

describe("팝오버 네이티브 표시 정책", () => {
	test("전면 모드는 기존 show 경로를 사용한다", () => {
		/** 전면 표시를 관찰할 가짜 창. */
		const popover = createFakePopoverWindow();

		showPopoverWindow(popover, "foreground", "darwin");

		expect(popover.show).toHaveBeenCalledOnce();
		expect(popover.showInactive).not.toHaveBeenCalled();
	});

	test("비활성 모드는 showInactive만 사용하고 포커스를 갖지 않으면 성공한다", () => {
		/** 비활성 표시를 관찰할 가짜 창. */
		const popover = createFakePopoverWindow();

		showPopoverWindow(popover, "inactive", "darwin");

		expect(popover.showInactive).toHaveBeenCalledOnce();
		expect(popover.show).not.toHaveBeenCalled();
	});

	test("지원하지 않는 플랫폼에서는 표시 없이 명확히 실패한다", () => {
		/** Linux에서 전면 폴백 여부를 관찰할 가짜 창. */
		const popover = createFakePopoverWindow();

		expect(() => showPopoverWindow(popover, "inactive", "linux")).toThrow(
			"macOS와 Windows에서만 지원됩니다",
		);
		expect(popover.showInactive).not.toHaveBeenCalled();
		expect(popover.show).not.toHaveBeenCalled();
	});

	test("showInactive 계약이 없으면 전면 폴백 없이 실패한다", () => {
		/** 비활성 표시 API가 없는 가짜 창. */
		const popover = createFakePopoverWindow({ showInactive: undefined });

		expect(() => showPopoverWindow(popover, "inactive", "win32")).toThrow(
			"BrowserWindow.showInactive()를 사용할 수 없습니다",
		);
		expect(popover.show).not.toHaveBeenCalled();
	});

	test("showInactive 예외도 전면 폴백 없이 문맥을 붙여 실패한다", () => {
		/** 비활성 표시 중 예외를 발생시키는 가짜 창. */
		const popover = createFakePopoverWindow({
			showInactive: () => {
				throw new Error("forced contract failure");
			},
		});

		expect(() => showPopoverWindow(popover, "inactive", "darwin")).toThrow(
			"비활성 Electron 제품 흐름을 표시하지 못했습니다",
		);
		expect(popover.show).not.toHaveBeenCalled();
	});

	test("showInactive 뒤 포커스를 얻으면 전면 폴백 없이 실패한다", () => {
		/** 비활성 표시 뒤 포커스를 얻은 가짜 창. */
		const popover = createFakePopoverWindow({ focused: true });

		expect(() => showPopoverWindow(popover, "inactive", "darwin")).toThrow(
			"팝오버 포커스를 막지 못했습니다",
		);
		expect(popover.show).not.toHaveBeenCalled();
	});

	test("비활성 모드에서는 대화상자 종료 뒤 focus를 호출하지 않는다", () => {
		/** 비활성 모드의 포커스 복귀를 관찰할 가짜 창. */
		const popover = createFakePopoverWindow();

		focusPopoverIfAllowed(popover, "inactive");

		expect(popover.focus).not.toHaveBeenCalled();
	});

	test("전면 모드에서는 대화상자 종료 뒤 기존 focus를 호출한다", () => {
		/** 전면 모드의 기존 포커스 복귀를 관찰할 가짜 창. */
		const popover = createFakePopoverWindow();

		focusPopoverIfAllowed(popover, "foreground");

		expect(popover.focus).toHaveBeenCalledOnce();
	});
});
