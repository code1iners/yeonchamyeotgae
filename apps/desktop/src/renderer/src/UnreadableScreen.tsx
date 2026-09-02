import type { ParseErrorKind } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";
import { failureReason } from "./failure-reason";

type Props = {
	/** 읽기가 실패한 갈래. 무엇을 안내하고 버튼을 띄울지가 이것으로 갈린다(2절 표). */
	kind: ParseErrorKind;
};

/** 갈래별 안내 문구. 사용자가 할 일이 서로 달라 한 문구로 묶지 않는다. */
const MESSAGES: Record<ParseErrorKind, string> = {
	/** JSON 파싱 실패. 파일 권한 등으로 읽지 못한 경우도 여기로 온다. */
	"invalid-json": "파일이 JSON 형식이 아니거나 열 수 없습니다.",
	/** 구조 검증 실패. */
	"schema-mismatch": "파일의 구조가 저장 형식과 다릅니다.",
	/** 앱보다 새 버전이 쓴 파일. */
	"future-version": "더 새 버전의 앱이 쓴 파일입니다. 앱을 업데이트하세요.",
};

/** 읽기 실패 화면에서 실행 중인 사용자 행동. */
type RecoveryAction = "restore" | "reveal";
/** 읽기 실패 화면 제목 식별자. 화면의 접근 가능한 이름을 만든다. */
const FAILURE_TITLE_ID = "unreadable-title";
/** 읽기 실패 종류 설명 식별자. 제목과 원인 문장을 연결한다. */
const FAILURE_DESCRIPTION_ID = "unreadable-description";

/**
 * 읽기 실패 화면 — **탭이 아니라 팝오버 전체를 차지한다**(스펙 5.5절).
 *
 * 탭 3개 구조와 층위가 다르다. 헤더도 탭 막대도 없다 — 잔여를 낼 수 없는 상태이고,
 * 여기서 할 수 있는 일은 고르는 것 하나뿐이다. **고를 때까지 파일에 쓰지 않는다**(2절).
 *
 * **미래 버전에는 버튼을 띄우지 않고 안내만 남긴다**(5.5절). `[백업에서 복구]`가
 * 뜨지 않는 이유는 그 백업도 신버전이 남긴 것이라 되돌려도 같은 화면으로 돌아오기
 * 때문이고, 여기서 사용자가 할 일은 앱을 업데이트하는 것 하나다.
 */
export function UnreadableScreen({ kind }: Props) {
	/** 실행 중인 복구 행동. 한 번에 하나만 실행한다. */
	const [action, setAction] = useState<RecoveryAction | null>(null);
	/** 파일 위치 열기 성공 문구. 외부 파일 관리자 호출 결과를 같은 화면에 남긴다. */
	const [status, setStatus] = useState<string | null>(null);
	/** 복구 또는 파일 위치 열기 실패 문구. */
	const [error, setError] = useState<string | null>(null);
	/** 렌더링보다 먼저 갱신되어 빠른 중복 조작을 막는 잠금. */
	const actionRef = useRef<RecoveryAction | null>(null);
	/** 외부 행동 뒤 포커스를 돌려줄 논리적 행동. */
	const focusActionRef = useRef<RecoveryAction | null>(null);
	/** 읽기 실패 맥락을 처음 보조 기술에 읽힐 화면 요소. */
	const screenRef = useRef<HTMLElement>(null);
	/** 백업 복구 버튼. 복구가 끝난 뒤 포커스를 돌려준다. */
	const restoreButtonRef = useRef<HTMLButtonElement>(null);
	/** 파일 위치 열기 버튼. 외부 파일 관리자에서 돌아온 뒤 포커스를 돌려준다. */
	const revealButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(function focusUnreadableScreenEffect() {
		// 정상 탭이 사라진 이유를 먼저 읽게 한 뒤 Tab으로 주요 행동에 진입한다.
		screenRef.current?.focus();
	}, []);

	useEffect(
		function restoreRecoveryActionFocusEffect() {
			if (action !== null) {
				return;
			}

			/** 행동이 끝난 뒤 포커스를 돌려줄 대상. */
			const target = focusActionRef.current;
			if (!target) {
				return;
			}
			focusActionRef.current = null;
			/** 행동 종류에 맞는 실제 버튼 요소. */
			const targetElement =
				target === "restore"
					? restoreButtonRef.current
					: revealButtonRef.current;
			targetElement?.focus();
		},
		[action],
	);

	/** 복구 화면의 행동을 시작하고 중복 호출을 막는다. */
	const beginAction = (nextAction: RecoveryAction): boolean => {
		if (actionRef.current !== null) {
			return false;
		}
		actionRef.current = nextAction;
		focusActionRef.current = nextAction;
		setAction(nextAction);
		setStatus(null);
		setError(null);
		return true;
	};

	/** 복구 화면의 행동 잠금을 풀고 다음 키보드 조작을 허용한다. */
	const finishAction = () => {
		actionRef.current = null;
		setAction(null);
	};

	/** 백업에서 복구 핸들러. 성공하면 셸이 상태를 밀어주고 이 화면이 사라진다. */
	const handleRestore = async () => {
		if (!beginAction("restore")) {
			return;
		}
		try {
			await window.yeoncha.restoreBackup();
		} catch (cause) {
			console.error("백업에서 복구하지 못했다", cause);
			setError(`복구하지 못했습니다 — ${failureReason(cause)}`);
		} finally {
			finishAction();
		}
	};

	/** 파일 위치 열기 핸들러. 결과를 화면에 남기고 원본은 건드리지 않는다. */
	const handleReveal = async () => {
		if (!beginAction("reveal")) {
			return;
		}
		try {
			await window.yeoncha.revealDataFile();
			setStatus("파일 위치를 열었습니다.");
		} catch (cause) {
			console.error("파일 위치를 열지 못했다", cause);
			setError("파일 위치를 열지 못했습니다. 다시 시도하세요.");
		} finally {
			finishAction();
		}
	};

	return (
		<main
			ref={screenRef}
			className="failure"
			tabIndex={-1}
			aria-labelledby={FAILURE_TITLE_ID}
			aria-describedby={FAILURE_DESCRIPTION_ID}
			aria-busy={action !== null}
		>
			<h1 id={FAILURE_TITLE_ID} className="failure-title">
				저장 파일을 읽지 못했습니다
			</h1>
			<p id={FAILURE_DESCRIPTION_ID} className="failure-body">
				{MESSAGES[kind]}
			</p>
			<p className="failure-body">
				고를 때까지 앱은 이 파일에 쓰지 않습니다. 원본은 그대로 있습니다.
			</p>
			{action && (
				<p className="failure-status" role="status" aria-live="polite">
					{action === "restore"
						? "복구 중입니다…"
						: "파일 위치를 여는 중입니다…"}
				</p>
			)}
			{status && action === null && (
				<p className="failure-status" role="status" aria-live="polite">
					{status}
				</p>
			)}
			{error && (
				<p className="error" role="alert" aria-live="assertive">
					{error}
				</p>
			)}
			{kind !== "future-version" && (
				<div className="cta">
					<button
						ref={restoreButtonRef}
						type="button"
						className="primary"
						disabled={action !== null}
						onClick={handleRestore}
					>
						{action === "restore" ? "복구 중…" : "백업에서 복구"}
					</button>
					<button
						ref={revealButtonRef}
						type="button"
						disabled={action !== null}
						onClick={handleReveal}
					>
						{action === "reveal" ? "파일 위치를 여는 중…" : "파일 위치 열기"}
					</button>
				</div>
			)}
		</main>
	);
}
