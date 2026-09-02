/** 팝오버가 사용할 네이티브 창 표시 모드. */
export type PopoverDisplayMode = "inactive" | "foreground";

/** 표시 정책이 관찰하는 BrowserWindow의 최소 계약. */
export type PopoverWindow = {
	/** 전면으로 창을 표시한다. */
	show(): void;
	/** 포커스 없이 창을 표시한다. 지원하지 않는 환경에는 없을 수 있다. */
	showInactive?: () => void;
	/** 창이 현재 네이티브 포커스를 가졌는지 확인한다. */
	isFocused(): boolean;
	/** 대화상자 종료 뒤 창에 네이티브 포커스를 돌려준다. */
	focus(): void;
};

/** 지정한 모드로 팝오버를 표시하고 비활성 계약을 검증한다. */
export function showPopoverWindow(
	window: PopoverWindow,
	mode: PopoverDisplayMode,
	platform: NodeJS.Platform,
): void {
	if (mode === "foreground") {
		window.show();
		return;
	}

	if (platform !== "darwin" && platform !== "win32") {
		throw new Error(
			"비활성 Electron 제품 흐름은 macOS와 Windows에서만 지원됩니다.",
		);
	}
	if (!window.showInactive) {
		throw new Error(
			"비활성 Electron 제품 흐름에 필요한 BrowserWindow.showInactive()를 사용할 수 없습니다.",
		);
	}

	// 지원 계약이 없으면 전면 표시나 화면 밖 이동으로 우회하지 않는다.
	try {
		window.showInactive();
	} catch (cause) {
		throw new Error("비활성 Electron 제품 흐름을 표시하지 못했습니다.", {
			cause,
		});
	}
	if (window.isFocused()) {
		throw new Error(
			"비활성 Electron 제품 흐름이 팝오버 포커스를 막지 못했습니다.",
		);
	}
}

/** 표시 모드에 따라 대화상자 종료 뒤 네이티브 포커스를 복귀시킨다. */
export function focusPopoverIfAllowed(
	window: PopoverWindow,
	mode: PopoverDisplayMode,
): void {
	if (mode === "inactive") {
		return;
	}
	window.focus();
}
