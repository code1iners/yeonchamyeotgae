import type {
	Adjustment,
	AdjustmentDraft,
	AdjustmentIssue,
	GrantDetail,
} from "@yeoncha/core";
import { latestLivingExpiry, validateAdjustmentDraft } from "@yeoncha/core";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { HelpTooltip } from "./HelpTooltip";
import { TERM_HELP } from "./help-content";
import { useCommit } from "./use-commit";

type Props = {
	/** 저장된 조정 레코드. 목록도 커밋할 배열도 이것에서 나온다. */
	adjustments: Adjustment[];
	/** 조회일 기준 발생 레코드별 내역. 소멸일 기본값이 여기서 나온다. */
	grants: GrantDetail[];
	/** 조회일. 발생일 기본값이자 소멸 여부를 가르는 날이다. */
	today: string;
	/** 추가 폼을 연 채로 시작하는가. 요약 탭의 `조정을 추가`로 들어온 경로다(5.1절). */
	openOnMount: boolean;
};

/** 빈 초안 — 폼을 닫아둔 동안의 값이다. */
const EMPTY_DRAFT: AdjustmentDraft = {
	days: "",
	grantDate: "",
	expiryDate: "",
	note: "",
};

/** 조정 영역 제목 식별자. 표와 폼의 접근 가능한 이름에 함께 쓴다. */
const ADJUSTMENTS_TITLE_ID = "adjustments-title";
/** 입력 폼 제목 식별자. 추가·수정 상태를 보조 기술에 알린다. */
const ADJUSTMENT_FORM_TITLE_ID = "adjustment-form-title";
/** 저장 실패 문구 식별자. 폼의 재시도 맥락과 연결한다. */
const ADJUSTMENT_SAVE_ERROR_ID = "adjustment-save-error";

/** 조정 폼을 닫은 뒤 포커스를 돌려줄 논리적 대상. */
type AdjustmentFocusTarget =
	| {
			/** 새 조정 폼을 연 추가 버튼을 가리킨다. */
			kind: "add";
	  }
	| {
			/** 수정 폼을 연 조정 레코드 식별자. */
			kind: "edit";
			/** 다시 포커스할 조정 레코드 식별자. */
			id: string;
	  }
	| {
			/** 삭제 확인을 연 조정 레코드 식별자. */
			kind: "delete";
			/** 취소 뒤 다시 포커스할 조정 레코드 식별자. */
			id: string;
	  };

/**
 * 설정 탭의 조정 섹션 — 이월·사규 추가분·포상 휴가가 전부 여기로 들어온다(스펙 5.4절).
 *
 * 법정 계산과 회사 규정의 차이를 메우는 유일한 통로이고, 초과가 났을 때의 조치 경로다.
 * **계산이 만든 발생 레코드(월차·연차)는 이 화면에 나오지 않는다** — 조정은 덮어쓰기가
 * 아니라 덧붙이기이므로 고칠 대상 자체가 없다(3.7절).
 */
export function AdjustmentsSection({
	adjustments,
	grants,
	today,
	openOnMount,
}: Props) {
	/** 폼에 들어 있는 값. 폼이 닫혀 있으면 빈 초안이다. */
	const [draft, setDraft] = useState<AdjustmentDraft>(() =>
		openOnMount ? addDraft({ grants, today }) : EMPTY_DRAFT,
	);
	/** 폼이 열려 있는가. */
	const [open, setOpen] = useState(openOnMount);
	/** 수정 중인 레코드의 `id`. `null`이면 추가다. */
	const [editingId, setEditingId] = useState<string | null>(null);
	/** 마지막 검증에서 걸린 것들. */
	const [issues, setIssues] = useState<AdjustmentIssue[]>([]);
	/** 삭제 확인을 열어 둔 조정의 식별자. */
	const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
	/** 마지막 성공 행동을 보조 기술에 알리는 문구. */
	const [successStatus, setSuccessStatus] = useState<string | null>(null);
	/** 폼이 열릴 때 가장 먼저 포커스할 일수 입력. */
	const firstInputRef = useRef<HTMLInputElement>(null);
	/** 닫힌 폼으로 돌아올 추가 버튼. */
	const addButtonRef = useRef<HTMLButtonElement>(null);
	/** 수정 폼이 닫힌 뒤 돌아갈 행별 수정 버튼. */
	const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	/** 삭제 확인을 닫은 뒤 돌아갈 행별 삭제 버튼. */
	const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	/** 삭제 확인 영역에 포커스를 둘 대상. */
	const deleteConfirmRefs = useRef(new Map<string, HTMLDivElement>());
	/** 폼을 닫은 뒤 복귀할 논리적 대상. */
	const focusReturnRef = useRef<AdjustmentFocusTarget | null>(null);
	/** 삭제처럼 폼 열림 상태가 바뀌지 않는 조작 뒤에도 포커스를 복귀시킬 대상. */
	const [focusRestoreTarget, setFocusRestoreTarget] =
		useState<AdjustmentFocusTarget | null>(null);
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, saving, error, clearError } = useCommit();

	useEffect(
		function manageAdjustmentFocusEffect() {
			if (deleteTargetId) {
				deleteConfirmRefs.current.get(deleteTargetId)?.focus();
				return;
			}
			// 폼이 열리면 추가·수정 모두 일수 입력에서 키보드 흐름을 시작한다.
			if (open) {
				firstInputRef.current?.focus();
				return;
			}

			/** 폼이 닫힌 뒤 다시 포커스할 논리적 대상. */
			const target = focusReturnRef.current ?? focusRestoreTarget;
			if (!target) {
				return;
			}
			focusReturnRef.current = null;
			if (focusRestoreTarget) {
				setFocusRestoreTarget(null);
			}
			if (target.kind === "add") {
				addButtonRef.current?.focus();
				return;
			}
			if (target.kind === "delete") {
				deleteButtonRefs.current.get(target.id)?.focus();
				return;
			}
			// 수정한 행이 삭제되었으면 목록에 남은 추가 버튼으로 흐름을 잇는다.
			(editButtonRefs.current.get(target.id) ?? addButtonRef.current)?.focus();
		},
		[deleteTargetId, focusRestoreTarget, open],
	);

	/** 행의 수정 버튼을 현재 DOM과 함께 등록한다. */
	const registerEditButton = (
		id: string,
		element: HTMLButtonElement | null,
	) => {
		if (element) {
			editButtonRefs.current.set(id, element);
		} else {
			editButtonRefs.current.delete(id);
		}
	};

	/** 행의 삭제 버튼을 현재 DOM과 함께 등록한다. */
	const registerDeleteButton = (
		id: string,
		element: HTMLButtonElement | null,
	) => {
		if (element) {
			deleteButtonRefs.current.set(id, element);
		} else {
			deleteButtonRefs.current.delete(id);
		}
	};

	/** 행 안의 삭제 확인 영역을 현재 DOM과 함께 등록한다. */
	const registerDeleteConfirmation = (
		id: string,
		element: HTMLDivElement | null,
	) => {
		if (element) {
			deleteConfirmRefs.current.set(id, element);
		} else {
			deleteConfirmRefs.current.delete(id);
		}
	};

	/** 포커스 복귀 요청을 등록하고, 폼이 열려 있지 않아도 효과를 다시 실행한다. */
	const requestFocusRestore = (target: AdjustmentFocusTarget) => {
		focusReturnRef.current = target;
		setFocusRestoreTarget(target);
	};
	/** 저장 중 삭제·추가·수정의 공통 진행 상태. 폼이 닫혀 있어도 보인다. */
	const savingStatus = saving ? (
		<p className="adjustments-status" role="status" aria-live="polite">
			저장 중…
		</p>
	) : null;
	/** 커밋 실패 문구. 폼 안팎에서 같은 오류를 한 번만 만든다. */
	const saveError = error ? (
		<p
			id={ADJUSTMENT_SAVE_ERROR_ID}
			className="error"
			role="alert"
			aria-live="assertive"
		>
			{error}
		</p>
	) : null;

	/** 추가 폼 열기 핸들러. */
	const handleOpenAdd = () => {
		if (saving) {
			return;
		}
		clearError();
		setSuccessStatus(null);
		setDeleteTargetId(null);
		focusReturnRef.current = { kind: "add" };
		setDraft(addDraft({ grants, today }));
		setEditingId(null);
		setIssues([]);
		setOpen(true);
	};

	/** 수정 폼 열기 핸들러. */
	const handleOpenEdit = (adjustment: Adjustment) => {
		if (saving) {
			return;
		}
		clearError();
		setSuccessStatus(null);
		setDeleteTargetId(null);
		focusReturnRef.current = { kind: "edit", id: adjustment.id };
		setDraft({
			days: String(adjustment.days),
			grantDate: adjustment.grantDate,
			expiryDate: adjustment.expiryDate,
			note: adjustment.note,
		});
		setEditingId(adjustment.id);
		setIssues([]);
		setOpen(true);
	};

	/** 폼 닫기 핸들러. 남은 실패 문구까지 지운다 — 다음에 연 폼에 붙으면 거짓말이 된다. */
	const handleClose = () => {
		if (!focusReturnRef.current) {
			focusReturnRef.current = editingId
				? { kind: "edit", id: editingId }
				: { kind: "add" };
		}
		setOpen(false);
		setDraft(EMPTY_DRAFT);
		setEditingId(null);
		setIssues([]);
		clearError();
	};

	/** 폼 제출 핸들러 — 검증을 통과한 것만 커밋으로 넘어간다. */
	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		// 저장 중에는 Enter와 자동화된 재호출도 같은 변경을 다시 보내지 않는다.
		if (saving) {
			return;
		}
		/** 입력 판정 결과. 도메인 이상치는 파서가 아니라 여기서 막힌다(2절). */
		const result = validateAdjustmentDraft(draft);

		// 걸린 것이 있나요?
		if (!result.ok) {
			setIssues(result.issues);
			return;
		}
		setIssues([]);

		/** 커밋할 조정 배열 — 수정이면 자리에서 갈아끼우고 추가면 뒤에 덧붙인다. */
		const next = editingId
			? adjustments.map((adjustment) =>
					adjustment.id === editingId
						? { ...result.value, id: editingId }
						: adjustment,
				)
			: [...adjustments, { ...result.value, id: crypto.randomUUID() }];

		if (await commit({ adjustments: next })) {
			setSuccessStatus(
				editingId ? "조정을 수정했습니다." : "조정을 추가했습니다.",
			);
			handleClose();
		}
	};

	/** 삭제 버튼을 누르면 표 안에서 확인 단계를 연다. */
	const handleDelete = (id: string) => {
		if (saving) {
			return;
		}
		setSuccessStatus(null);
		clearError();
		setDeleteTargetId(id);
	};

	/** 확인한 조정만 삭제하고, 실패하면 확인 영역과 행을 그대로 남긴다. */
	const handleConfirmDelete = async (id: string) => {
		if (saving || deleteTargetId !== id) {
			return;
		}
		/** 삭제할 레코드를 뺀 다음 상태. 성공할 때만 화면에도 반영된다. */
		const didCommit = await commit({
			adjustments: adjustments.filter((adjustment) => adjustment.id !== id),
		});
		if (didCommit) {
			setDeleteTargetId(null);
			setSuccessStatus("조정을 삭제했습니다.");
			requestFocusRestore({ kind: "add" });
		}
	};

	/** 삭제를 취소하고 같은 행의 삭제 버튼으로 포커스를 되돌린다. */
	const handleCancelDelete = (id: string) => {
		if (saving) {
			return;
		}
		setDeleteTargetId(null);
		clearError();
		requestFocusRestore({ kind: "delete", id });
	};

	return (
		<section
			className="adjustments-section"
			aria-labelledby={ADJUSTMENTS_TITLE_ID}
			aria-busy={saving}
		>
			<h2 id={ADJUSTMENTS_TITLE_ID} className="sec-title">
				조정
				<HelpTooltip label="조정 도움말" context="조정">
					{TERM_HELP.조정}
				</HelpTooltip>
			</h2>
			<p className="row dim">
				이월·사규 추가분·포상 휴가를 여기에 넣습니다. 월차와 연차는 계산이
				만들며 고칠 수 없습니다.
			</p>
			{savingStatus}
			{successStatus && !saving && (
				<p className="adjustments-status" role="status" aria-live="polite">
					{successStatus}
				</p>
			)}
			{/* 넣은 순서 그대로 보여준다. 배정 순서(소멸일 ↑ → 발생일 ↑ → source → 입력
			    순서, 3.4절)와는 다르다 — 그쪽은 요약 탭의 발생분 리스트가 보여준다. */}
			<section className="adjustments-scroll" aria-label="조정 목록">
				<table className="adjustments-table" aria-label="조정 목록">
					<caption className="sr-only">조정 목록</caption>
					<thead>
						<tr>
							<th scope="col">일수</th>
							<th scope="col">발생일</th>
							<th scope="col">소멸일</th>
							<th scope="col">메모</th>
							<th scope="col">행동</th>
						</tr>
					</thead>
					<tbody>
						{adjustments.map((adjustment) => {
							/** 현재 행의 삭제 확인 여부와 접근성 식별자. */
							const isDeleting = deleteTargetId === adjustment.id;
							const deleteTitleId = `adjustment-delete-title-${adjustment.id}`;
							const deleteDescriptionId = `adjustment-delete-description-${adjustment.id}`;
							return (
								<Fragment key={adjustment.id}>
									<tr className="adj-row">
										<td className="adj-days num selectable">
											{formatDays(adjustment.days)}
										</td>
										<td className="adj-grant num selectable">
											<time dateTime={adjustment.grantDate}>
												{adjustment.grantDate}
											</time>
										</td>
										<td className="adj-expiry num selectable">
											<time dateTime={adjustment.expiryDate}>
												{adjustment.expiryDate}
											</time>
										</td>
										<td
											className="adj-note selectable"
											title={adjustment.note || undefined}
										>
											{adjustment.note || (
												<span className="dim">메모 없음</span>
											)}
										</td>
										<td className="adj-action-cell">
											<div className="adj-actions">
												<button
													type="button"
													className="mini"
													disabled={saving || deleteTargetId !== null}
													ref={(element) =>
														registerEditButton(adjustment.id, element)
													}
													onClick={() => handleOpenEdit(adjustment)}
												>
													수정
												</button>
												<button
													type="button"
													className="mini"
													disabled={saving || deleteTargetId !== null}
													ref={(element) =>
														registerDeleteButton(adjustment.id, element)
													}
													onClick={() => handleDelete(adjustment.id)}
												>
													삭제
												</button>
											</div>
										</td>
									</tr>
									{isDeleting && (
										<tr className="adj-delete-row">
											<td colSpan={5}>
												<div
													ref={(element) =>
														registerDeleteConfirmation(adjustment.id, element)
													}
													className="adj-delete-confirm"
													tabIndex={-1}
													role="alertdialog"
													aria-labelledby={deleteTitleId}
													aria-describedby={deleteDescriptionId}
													onKeyDown={(event) => {
														if (event.key === "Escape") {
															event.preventDefault();
															handleCancelDelete(adjustment.id);
														}
													}}
												>
													<strong id={deleteTitleId}>삭제할까요?</strong>
													<p id={deleteDescriptionId}>
														{adjustment.note || "이 조정을 삭제합니다."}
													</p>
													{error && (
														<p
															className="error"
															role="alert"
															aria-live="assertive"
														>
															{error}
														</p>
													)}
													<div className="hist-delete-actions">
														<button
															type="button"
															className="danger"
															disabled={saving}
															onClick={() => handleConfirmDelete(adjustment.id)}
														>
															삭제
														</button>
														<button
															type="button"
															disabled={saving}
															onClick={() => handleCancelDelete(adjustment.id)}
														>
															취소
														</button>
													</div>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
						{adjustments.length === 0 && (
							<tr>
								<td className="adjustments-empty dim" colSpan={5}>
									넣은 조정이 없습니다.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</section>
			{open ? (
				<form
					className="adj-form"
					aria-label={editingId ? "조정 수정" : "조정 추가"}
					aria-labelledby={ADJUSTMENT_FORM_TITLE_ID}
					aria-describedby={error ? ADJUSTMENT_SAVE_ERROR_ID : undefined}
					aria-busy={saving}
					onSubmit={handleSubmit}
					noValidate
				>
					<h3 id={ADJUSTMENT_FORM_TITLE_ID} className="adj-form-title">
						{editingId ? "조정 수정" : "조정 추가"}
					</h3>
					<label className="field">
						<span>일수</span>
						<input
							ref={firstInputRef}
							type="number"
							step="0.25"
							inputMode="decimal"
							value={draft.days}
							disabled={saving}
							aria-invalid={hasIssue(issues, "days")}
							aria-describedby={issueId(issues, "days")}
							onChange={(event) =>
								setDraft({ ...draft, days: event.target.value })
							}
						/>
					</label>
					<label className="field">
						<span>발생일</span>
						<input
							type="date"
							value={draft.grantDate}
							disabled={saving}
							aria-invalid={hasIssue(issues, "grantDate")}
							aria-describedby={issueId(issues, "grantDate")}
							onChange={(event) =>
								setDraft({ ...draft, grantDate: event.target.value })
							}
						/>
					</label>
					<label className="field">
						<span>소멸일</span>
						<input
							type="date"
							value={draft.expiryDate}
							disabled={saving}
							aria-invalid={hasIssue(issues, "expiryDate")}
							aria-describedby={issueId(issues, "expiryDate")}
							onChange={(event) =>
								setDraft({ ...draft, expiryDate: event.target.value })
							}
						/>
					</label>
					<label className="field">
						<span>메모</span>
						<input
							type="text"
							value={draft.note}
							disabled={saving}
							onChange={(event) =>
								setDraft({ ...draft, note: event.target.value })
							}
						/>
					</label>
					{issues.map((issue) => (
						<p
							className="error field-error"
							id={errorId(issue.field)}
							role="alert"
							key={issue.field}
						>
							{issue.message}
						</p>
					))}
					{!deleteTargetId && saveError}
					<div className="cta">
						<button type="submit" className="primary" disabled={saving}>
							{saving ? "저장 중…" : editingId ? "저장" : "추가"}
						</button>
						<button type="button" disabled={saving} onClick={handleClose}>
							취소
						</button>
					</div>
				</form>
			) : (
				<>
					{!deleteTargetId && saveError}
					<div className="cta">
						<button
							ref={addButtonRef}
							type="button"
							disabled={saving}
							onClick={handleOpenAdd}
						>
							조정 추가
						</button>
					</div>
				</>
			)}
		</section>
	);
}

/** 추가 폼의 초안 — 네 필드 중 발생일과 소멸일이 기본값으로 채워진다(스펙 3.7절). */
function addDraft({
	grants,
	today,
}: Pick<Props, "grants" | "today">): AdjustmentDraft {
	return {
		...EMPTY_DRAFT,
		grantDate: today,
		// 살아 있는 발생분이 없으면 비워둔다 — 규칙이 소멸일을 지어내면 조용히 틀린다.
		expiryDate: latestLivingExpiry({ grants, today }) ?? "",
	};
}

/** 그 필드가 이번 검증에 걸렸는가. */
function hasIssue(issues: AdjustmentIssue[], field: AdjustmentIssue["field"]) {
	return issues.some((issue) => issue.field === field);
}

/** 오류가 있는 입력에만 연결할 오류 문구 식별자. */
function issueId(
	issues: AdjustmentIssue[],
	field: AdjustmentIssue["field"],
): string | undefined {
	return hasIssue(issues, field) ? errorId(field) : undefined;
}

/** 조정 입력 오류의 DOM 식별자. 필드와 문구를 일대일로 연결한다. */
function errorId(field: AdjustmentIssue["field"]): string {
	return `adjustment-${field}-error`;
}

/** 목록에 뜨는 일수 — 더하는 것인지 깎는 것인지가 부호로 먼저 읽혀야 한다. */
function formatDays(days: number): string {
	return `${days > 0 ? "+" : ""}${days}일`;
}
