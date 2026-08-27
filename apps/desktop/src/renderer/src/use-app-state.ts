import { useEffect, useState } from "react";
import type { AppState } from "../../shared/ipc";

/**
 * 셸 상태를 구독한다. 렌더러가 아는 값은 전부 여기서 온다.
 *
 * 처음 한 번 가져오고, 그 뒤에는 셸이 밀어주는 것만 받는다 — 값이 바뀌는 계기가
 * 렌더러 밖에 있기 때문이다(커밋 · 자정 · 절전 복귀). 아직 못 받았으면 `null`이다.
 */
export function useAppState(): AppState | null {
	/** 마지막으로 받은 셸 상태. */
	const [state, setState] = useState<AppState | null>(null);

	useEffect(function subscribeStateEffect() {
		/** 셸이 민 상태를 이미 받았는가. 늦게 돌아온 첫 조회가 그것을 덮지 않게 한다. */
		let pushed = false;

		// 구독을 먼저 걸어야 첫 조회를 기다리는 동안의 변경을 놓치지 않는다.
		const unsubscribe = window.yeoncha.onStateChanged((next) => {
			pushed = true;
			setState(next);
		});

		// 셸이 다시 낼 때까지 기다리지 않게 현재 상태를 한 번 가져온다.
		window.yeoncha
			.getState()
			.then((initial) => {
				if (!pushed) {
					setState(initial);
				}
			})
			.catch((cause: unknown) => {
				// 조회가 실패하면 화면은 빈 채로 남는다. 다음 푸시가 오면 그때 그려진다.
				console.error("셸 상태를 가져오지 못했다", cause);
			});

		return unsubscribe;
	}, []);

	return state;
}
