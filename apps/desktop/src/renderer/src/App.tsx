import { useEffect, useRef } from "react";

/**
 * 팝오버 루트. 탭 셸과 온보딩은 20번 티켓에서 채우고,
 * 이 티켓에서는 내용 높이 보고(5.6절)만 한다.
 */
export function App() {
	/** 높이 측정 대상인 팝오버 본문 요소. */
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(function reportContentHeightEffect() {
		const root = rootRef.current;
		if (!root) {
			return;
		}
		// 내용 높이가 바뀔 때마다 셸에 보고해 창 높이를 맞춘다.
		const observer = new ResizeObserver(() => {
			window.yeoncha.reportContentHeight(
				Math.ceil(root.getBoundingClientRect().height),
			);
		});
		observer.observe(root);
		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<div ref={rootRef} style={{ padding: 16 }}>
			<p style={{ margin: 0 }}>연차몇개</p>
		</div>
	);
}
