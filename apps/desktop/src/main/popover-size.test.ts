import { describe, expect, test } from "vitest";
import { fitPopoverContent } from "./popover-size";

describe("팝오버 작업 영역 크기 제한", () => {
	test("400% 확대 폭과 긴 내용을 작업 영역 안에 제한한다", () => {
		expect(
			fitPopoverContent({
				contentHeight: 600,
				zoomFactor: 4,
				baseWidth: 380,
				minHeight: 80,
				workArea: { width: 1280, height: 900 },
			}),
		).toEqual({ width: 1280, height: 900 });
	});

	test("기본 배율에서는 기존 폭과 최소 높이를 유지한다", () => {
		expect(
			fitPopoverContent({
				contentHeight: 0,
				zoomFactor: 1,
				baseWidth: 380,
				minHeight: 80,
				workArea: { width: 1440, height: 900 },
			}),
		).toEqual({ width: 380, height: 80 });
	});
});
