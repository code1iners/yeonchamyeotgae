import { useEffect, useRef, useState } from "react";
import type { TransferResult } from "../../shared/ipc";

type Props = {
	/** 저장 파일이 이미 있는가. 없으면 온보딩이며 내보낼 것도 열어볼 것도 없다. */
	hasSavedFile: boolean;
};

/** 데이터 영역 제목 식별자. 버튼과 상태를 하나의 설정 맥락으로 묶는다. */
const DATA_TITLE_ID = "settings-data-title";
/** 데이터 영역 설명 식별자. 세 가지 행동의 대상 파일을 알려준다. */
const DATA_DESCRIPTION_ID = "settings-data-description";
/** 가져오기 확인 제목 식별자. 확인 영역과 포커스 이름을 연결한다. */
const IMPORT_CONFIRM_TITLE_ID = "settings-import-confirm-title";
/** 가져오기 확인 설명 식별자. 바뀔 데이터와 백업 사실을 함께 읽힌다. */
const IMPORT_CONFIRM_DESCRIPTION_ID = "settings-import-confirm-description";

/** 진행 중인 데이터 조작. 한 번에 하나만 실행한다. */
type DataOperation = "reveal" | "export" | "import";

/** 데이터 조작이 끝난 뒤 보여줄 안내의 종류. */
type FeedbackTone = "success" | "neutral" | "error";

/** 데이터 조작 결과를 현재 화면에 남길 안내. */
type Feedback = {
	/** 안내의 의미. 오류만 색과 보조 기술의 역할이 다르다. */
	tone: FeedbackTone;
	/** 사용자가 다음 행동을 판단할 문장. */
	message: string;
	/** 성공한 내보내기·가져오기 파일의 경로. */
	path?: string;
};

/** 진행 중인 조작별 화면 문구. 색이 아니라 문장으로 상태를 전달한다. */
const OPERATION_MESSAGES: Record<DataOperation, string> = {
	reveal: "파일 위치를 여는 중입니다…",
	export: "내보내는 중입니다…",
	import: "가져오는 중입니다…",
};

/**
 * 설정 탭의 데이터 섹션 — 파일 위치 열기 · 내보내기 · 가져오기(스펙 5.4절).
 *
 * **내보내기 파일 = 저장 파일이다**(2절). 그래서 이 셋은 한 파일을 두고 하는 일이며,
 * 내보낸 것을 그대로 다시 가져올 수 있다.
 *
 * **온보딩에는 가져오기 하나만 남긴다.** 그 시점에는 저장 파일이 없으므로 나머지 둘은
 * 감추고, 가져오기는 새 기기에서 데이터를 넣는 유일한 경로다(사용자 스토리 45).
 */
export function DataSection({ hasSavedFile }: Props) {
	/** 가져오기 확인을 띄우고 있는가. 전체 교체이므로 한 단계를 더 둔다. */
	const [confirming, setConfirming] = useState(false);
	/** 현재 실행 중인 데이터 조작. 진행 문구와 모든 버튼 잠금에 함께 쓴다. */
	const [operation, setOperation] = useState<DataOperation | null>(null);
	/** 마지막 조작 결과 안내. 가져오기 취소 때는 기존 값을 보존한다. */
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	/** 네이티브 조작 또는 확인 취소 뒤 포커스를 돌려달라는 요청. */
	const [restoreFocus, setRestoreFocus] = useState(false);
	/** 렌더링보다 먼저 갱신되어 같은 이벤트 묶음의 중복 조작도 막는 잠금. */
	const operationRef = useRef<DataOperation | null>(null);
	/** 조작이 끝나거나 확인을 취소한 뒤 되돌릴 버튼 이름. */
	const focusTargetRef = useRef<DataOperation | null>(null);
	/** 가져오기 확인을 열었을 때 보조 기술의 읽기 시작점. */
	const confirmationRef = useRef<HTMLElement>(null);
	/** 저장 파일 위치를 여는 버튼. */
	const revealButtonRef = useRef<HTMLButtonElement>(null);
	/** 내보내기 버튼. */
	const exportButtonRef = useRef<HTMLButtonElement>(null);
	/** 가져오기 버튼. 확인을 닫은 뒤 이 자리로 돌아온다. */
	const importButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(
		function manageDataFocusEffect() {
			// 확인 영역이 열리면 키보드 사용자가 파괴적 설명을 먼저 읽게 한다.
			if (confirming) {
				confirmationRef.current?.focus();
				return;
			}

			// 네이티브 대화상자가 끝나기 전에는 팝오버 포커스를 다시 빼앗지 않는다.
			if (operation !== null) {
				return;
			}

			if (!restoreFocus) {
				return;
			}

			/** 조작이 끝난 뒤 포커스를 돌려줄 버튼 이름. */
			const target = focusTargetRef.current;
			setRestoreFocus(false);
			if (!target) {
				return;
			}
			focusTargetRef.current = null;
			/** 논리적 이름에 대응하는 현재 DOM 버튼. 확인 영역이 닫히면 새로 생길 수 있다. */
			const targetElement =
				target === "reveal"
					? revealButtonRef.current
					: target === "export"
						? exportButtonRef.current
						: importButtonRef.current;
			targetElement?.focus();
		},
		[confirming, operation, restoreFocus],
	);

	/** 조작이 끝나거나 확인을 취소한 뒤 포커스를 되돌릴 버튼 이름을 등록한다. */
	const requestFocus = (target: DataOperation) => {
		focusTargetRef.current = target;
		setRestoreFocus(true);
	};

	/** 데이터 조작을 시작하고, 이미 열린 대화상자와의 중복 호출을 차단한다. */
	const beginOperation = (next: DataOperation): boolean => {
		if (operationRef.current !== null) {
			return false;
		}
		operationRef.current = next;
		setOperation(next);
		return true;
	};

	/** 데이터 조작을 끝내고 다음 조작을 허용한다. */
	const finishOperation = () => {
		operationRef.current = null;
		setOperation(null);
	};

	/** 내보내기·가져오기 결과를 화면 문구로 옮긴다. 취소는 가져오기 화면을 보존한다. */
	const reportTransfer = (
		kind: "export" | "import",
		result: TransferResult,
	) => {
		if (result.status === "canceled") {
			if (kind === "export") {
				setFeedback({
					tone: "neutral",
					message: "내보내기를 취소했습니다.",
				});
			}
			return;
		}

		if (result.status === "done") {
			setFeedback({
				tone: "success",
				message:
					kind === "export"
						? "내보내기를 완료했습니다."
						: "가져오기를 완료했습니다.",
				path: result.path,
			});
			return;
		}

		setFeedback({ tone: "error", message: result.message });
	};

	/** 내보내기·가져오기 대화상자를 열고 결과를 같은 설정 화면에 남긴다. */
	const runTransfer = async (
		kind: "export" | "import",
		open: () => Promise<TransferResult>,
	) => {
		if (!beginOperation(kind)) {
			return;
		}
		try {
			reportTransfer(kind, await open());
		} catch (cause) {
			console.error("데이터 조작에 실패했다", cause);
			setFeedback({
				tone: "error",
				message:
					kind === "export"
						? "내보내지 못했습니다. 다른 위치를 선택해 다시 시도하세요."
						: "가져오지 못했습니다. 다른 저장 파일을 골라 다시 시도하세요.",
			});
		} finally {
			finishOperation();
		}
	};

	/** 저장 파일 위치를 열고 실패하면 다음 행동을 안내한다. */
	const runReveal = async () => {
		if (!beginOperation("reveal")) {
			return;
		}
		try {
			await window.yeoncha.revealDataFile();
			setFeedback({
				tone: "success",
				message: "파일 위치를 열었습니다.",
			});
		} catch (cause) {
			console.error("파일 위치를 열지 못했다", cause);
			setFeedback({
				tone: "error",
				message: "파일 위치를 열지 못했습니다. 다시 시도하세요.",
			});
		} finally {
			finishOperation();
		}
	};

	/** 파일 위치 열기 핸들러. OS 파일 관리자와 팝오버 조작의 포커스를 함께 관리한다. */
	const handleReveal = () => {
		requestFocus("reveal");
		void runReveal();
	};

	/** 내보내기 핸들러. 대화상자가 끝나면 내보내기 버튼으로 포커스를 돌린다. */
	const handleExport = () => {
		requestFocus("export");
		void runTransfer("export", () => window.yeoncha.exportData());
	};

	/** 가져오기 확인 핸들러. 여기서부터 지금 데이터가 대체된다. */
	const handleImport = () => {
		if (operationRef.current !== null) {
			return;
		}
		setConfirming(false);
		void runTransfer("import", () => window.yeoncha.importData());
	};

	/** 가져오기 확인을 여는 핸들러. 기존 결과 문구는 취소 시 복귀해야 하므로 보존한다. */
	const handleOpenConfirm = () => {
		if (operationRef.current !== null) {
			return;
		}
		requestFocus("import");
		setConfirming(true);
	};

	/** 가져오기 확인을 취소하고 현재 데이터·안내·포커스를 그대로 돌려놓는다. */
	const handleCancelConfirm = () => {
		if (operationRef.current !== null) {
			return;
		}
		setConfirming(false);
	};

	/** 현재 조작 또는 마지막 결과를 보조 기술에 전달할 문단. */
	const feedbackView = operation ? (
		<p
			className="data-feedback data-feedback-progress"
			role="status"
			aria-live="polite"
		>
			{OPERATION_MESSAGES[operation]}
		</p>
	) : feedback && !confirming ? (
		<p
			className={`data-feedback data-feedback-${feedback.tone}`}
			role={feedback.tone === "error" ? "alert" : "status"}
			aria-live={feedback.tone === "error" ? "assertive" : "polite"}
		>
			{feedback.message}
			{feedback.path && <code className="data-path">{feedback.path}</code>}
		</p>
	) : null;

	return (
		<section
			className="data-section"
			aria-labelledby={DATA_TITLE_ID}
			aria-busy={operation !== null}
		>
			<h2 id={DATA_TITLE_ID} className="sec-title">
				데이터
			</h2>
			<p id={DATA_DESCRIPTION_ID} className="data-description">
				{hasSavedFile
					? "저장 파일을 열어보거나 내보내고, 다른 저장 파일을 가져올 수 있습니다."
					: "다른 기기에서 내보낸 저장 파일을 가져올 수 있습니다."}
			</p>
			{feedbackView}
			{confirming ? (
				<section
					ref={confirmationRef}
					className="confirm data-confirm"
					tabIndex={-1}
					aria-live="polite"
					aria-atomic="true"
					aria-labelledby={IMPORT_CONFIRM_TITLE_ID}
					aria-describedby={IMPORT_CONFIRM_DESCRIPTION_ID}
				>
					<h3 id={IMPORT_CONFIRM_TITLE_ID} className="settings-confirm-title">
						가져오기 확인
					</h3>
					<p id={IMPORT_CONFIRM_DESCRIPTION_ID}>지금 데이터가 대체됩니다.</p>
					<p className="dim">
						가져오기는 전체 교체입니다. 지금 휴가 기록과 조정은 남지 않으며,
						교체 직전 상태는 <code>data.json.bak</code>에 백업됩니다.
					</p>
					<div className="cta">
						<button
							type="button"
							className="primary"
							disabled={operation !== null}
							aria-describedby={IMPORT_CONFIRM_DESCRIPTION_ID}
							onClick={handleImport}
						>
							파일 고르고 대체
						</button>
						<button
							type="button"
							disabled={operation !== null}
							aria-describedby={IMPORT_CONFIRM_DESCRIPTION_ID}
							onClick={handleCancelConfirm}
						>
							취소
						</button>
					</div>
				</section>
			) : (
				<div className="data-actions">
					{hasSavedFile && (
						<div className="data-action-group">
							<h3 className="data-action-title">저장 파일</h3>
							<div className="cta">
								<button
									ref={revealButtonRef}
									type="button"
									disabled={operation !== null}
									aria-describedby={DATA_DESCRIPTION_ID}
									onClick={handleReveal}
								>
									{operation === "reveal"
										? "파일 위치를 여는 중…"
										: "파일 위치 열기"}
								</button>
								<button
									ref={exportButtonRef}
									type="button"
									disabled={operation !== null}
									aria-describedby={DATA_DESCRIPTION_ID}
									onClick={handleExport}
								>
									{operation === "export" ? "내보내는 중…" : "내보내기"}
								</button>
							</div>
						</div>
					)}
					<div className="data-action-group">
						<h3 className="data-action-title">가져올 저장 파일</h3>
						<div className="cta">
							<button
								ref={importButtonRef}
								type="button"
								disabled={operation !== null}
								aria-describedby={DATA_DESCRIPTION_ID}
								onClick={handleOpenConfirm}
							>
								{operation === "import"
									? "가져오는 중…"
									: hasSavedFile
										? "가져오기"
										: "데이터 가져오기"}
							</button>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
