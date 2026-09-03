import { useEffect, useRef } from "react";
import { failureReason } from "./failure-reason";

/** 처음 셸 상태를 기다리는 화면. 빈 팝오버와 달리 현재 작업을 명시한다. */
export function AppLoadingScreen() {
	return (
		<main
			className="app-state-screen"
			role="status"
			aria-live="polite"
			aria-busy="true"
		>
			<h1 className="app-state-title">앱 상태를 불러오는 중입니다…</h1>
			<p className="app-state-body">
				저장 파일과 최신 잔여를 확인하고 있습니다.
			</p>
		</main>
	);
}

type ErrorProps = {
	/** 초기 getState 호출이 거부된 원인. 읽기 파일 오류와는 다른 상태다. */
	cause: unknown;
	/** 셸 상태를 다시 요청한다. */
	onRetry: () => void;
};

/** 초기 셸 통신 실패 화면. 저장 파일을 읽지 못한 화면과 문구·행동을 분리한다. */
export function AppStateErrorScreen({ cause, onRetry }: ErrorProps) {
	/** 화면이 나타나면 제목에서 오류 맥락을 읽게 하는 focus 대상. */
	const screenRef = useRef<HTMLElement>(null);

	useEffect(function focusAppStateErrorScreenEffect() {
		screenRef.current?.focus();
	}, []);

	return (
		<main
			ref={screenRef}
			className="app-state-screen app-state-error"
			tabIndex={-1}
			role="alert"
			aria-labelledby="app-state-error-title"
			aria-describedby="app-state-error-description"
		>
			<h1 id="app-state-error-title" className="app-state-title">
				앱 상태를 불러오지 못했습니다
			</h1>
			<p id="app-state-error-description" className="app-state-body">
				셸과 통신하지 못했습니다. 저장 파일 자체의 읽기 오류와는 다른
				문제입니다.
			</p>
			<p className="app-state-error-detail">{failureReason(cause)}</p>
			<div className="cta">
				<button type="button" className="primary" onClick={onRetry}>
					다시 시도
				</button>
			</div>
		</main>
	);
}
