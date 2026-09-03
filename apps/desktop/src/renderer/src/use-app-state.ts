import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../../shared/ipc";

/** 초기 셸 상태 요청의 화면 상태. */
export type AppStateLoad =
	| { status: "loading"; state: null; error: null }
	| { status: "ready"; state: AppState; error: null }
	| { status: "error"; state: null; error: unknown };

/** 화면이 상태 요청 결과를 현재 화면에 반영해도 되는지 확인한다. */
export function shouldAcceptInitialState({
	requestId,
	currentRequestId,
	pushVersionAtStart,
	currentPushVersion,
}: {
	/** 결과를 만든 요청의 식별자. */
	requestId: number;
	/** 현재 유효한 요청의 식별자. */
	currentRequestId: number;
	/** 요청을 시작할 때의 push 버전. */
	pushVersionAtStart: number;
	/** 현재까지 셸 push가 발생한 횟수. */
	currentPushVersion: number;
}): boolean {
	return (
		requestId === currentRequestId && pushVersionAtStart === currentPushVersion
	);
}

/**
 * 셸 상태를 구독한다. 렌더러가 아는 값은 전부 여기서 온다.
 *
 * 처음 한 번 가져오는 동안에는 loading을 보여주고, 조회가 거부되면 retry 가능한
 * 오류 화면을 보여준다. 구독을 먼저 걸어 첫 조회보다 앞선 상태 push를 늦은 응답이
 * 덮어쓰지 못하게 한다.
 */
export function useAppState(): AppStateLoad & { retry: () => void } {
	/** 마지막 상태 요청의 결과. */
	const [load, setLoad] = useState<AppStateLoad>({
		status: "loading",
		state: null,
		error: null,
	});
	/** 현재 컴포넌트가 살아 있는지. 늦은 IPC 결과의 setState를 막는다. */
	const mountedRef = useRef(false);
	/** 마지막으로 유효한 getState 요청. 재시도와 push가 이전 응답을 무효화한다. */
	const requestIdRef = useRef(0);
	/** 구독으로 받은 최신 상태의 세대. */
	const pushVersionRef = useRef(0);

	/** 셸 상태를 한 번 요청하고, 현재 요청이면 결과를 화면에 반영한다. */
	const requestState = useCallback(() => {
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		const pushVersionAtStart = pushVersionRef.current;
		setLoad({ status: "loading", state: null, error: null });

		void Promise.resolve()
			.then(() => window.yeoncha.getState())
			.then((next) => {
				if (
					!mountedRef.current ||
					!shouldAcceptInitialState({
						requestId,
						currentRequestId: requestIdRef.current,
						pushVersionAtStart,
						currentPushVersion: pushVersionRef.current,
					})
				) {
					return;
				}
				setLoad({ status: "ready", state: next, error: null });
			})
			.catch((cause: unknown) => {
				if (
					!mountedRef.current ||
					!shouldAcceptInitialState({
						requestId,
						currentRequestId: requestIdRef.current,
						pushVersionAtStart,
						currentPushVersion: pushVersionRef.current,
					})
				) {
					return;
				}
				console.error("셸 상태를 가져오지 못했다", cause);
				setLoad({ status: "error", state: null, error: cause });
			});
	}, []);

	useEffect(
		function subscribeStateEffect() {
			mountedRef.current = true;

			// 구독을 먼저 걸어야 첫 조회를 기다리는 동안의 변경을 놓치지 않는다.
			const unsubscribe = window.yeoncha.onStateChanged((next) => {
				pushVersionRef.current += 1;
				requestIdRef.current += 1;
				setLoad({ status: "ready", state: next, error: null });
			});

			// 셸이 다시 낼 때까지 기다리지 않게 현재 상태를 한 번 가져온다.
			requestState();

			return () => {
				mountedRef.current = false;
				requestIdRef.current += 1;
				unsubscribe();
			};
		},
		[requestState],
	);

	return { ...load, retry: requestState };
}
