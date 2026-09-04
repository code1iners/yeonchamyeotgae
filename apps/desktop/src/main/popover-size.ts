/** 팝오버가 들어갈 운영체제 작업 영역 크기. */
export type WorkAreaSize = {
	/** 작업 영역 폭(DIP). */
	width: number;
	/** 작업 영역 높이(DIP). */
	height: number;
};

/** 팝오버 내용 크기 계산 입력. */
type PopoverContentSizeInput = {
	/** 렌더러가 보고한 CSS 높이. */
	contentHeight: number;
	/** 렌더러 페이지 확대 배율. */
	zoomFactor: number;
	/** 기본 CSS 폭. */
	baseWidth: number;
	/** 창이 사라지지 않게 하는 기본 CSS 최소 높이. */
	minHeight: number;
	/** 창이 벗어나면 안 되는 운영체제 작업 영역. */
	workArea: WorkAreaSize;
};

/** 확대 배율을 적용하되 운영체제 작업 영역 안에 남는 네이티브 팝오버 크기를 계산한다. */
export function fitPopoverContent({
	contentHeight,
	zoomFactor,
	baseWidth,
	minHeight,
	workArea,
}: PopoverContentSizeInput): WorkAreaSize {
	/** 확대된 고정 폭을 작업 영역 폭으로 제한한 결과. */
	const width = Math.min(Math.round(baseWidth * zoomFactor), workArea.width);
	/** 확대된 내용 높이를 최소 높이와 작업 영역 높이 사이로 제한한 결과. */
	const height = Math.min(
		Math.max(
			Math.round(contentHeight * zoomFactor),
			Math.round(minHeight * zoomFactor),
		),
		workArea.height,
	);
	return { width, height };
}
