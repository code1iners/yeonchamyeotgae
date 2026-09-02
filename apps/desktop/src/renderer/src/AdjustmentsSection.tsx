import type {
	Adjustment,
	AdjustmentDraft,
	AdjustmentIssue,
	GrantDetail,
} from "@yeoncha/core";
import { latestLivingExpiry, validateAdjustmentDraft } from "@yeoncha/core";
import { type FormEvent, useState } from "react";
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
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, saving, error, clearError } = useCommit();
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
			handleClose();
		}
	};

	/** 삭제 핸들러. */
	const handleDelete = async (id: string) => {
		if (saving) {
			return;
		}
		/** 삭제할 레코드를 뺀 다음 상태. 성공할 때만 화면에도 반영된다. */
		const didCommit = await commit({
			adjustments: adjustments.filter((adjustment) => adjustment.id !== id),
		});
		// 지우는 레코드를 고치고 있었나요? 성공한 뒤에만 폼을 닫아 실패 시 맥락을 지킨다.
		if (didCommit && editingId === id) {
			handleClose();
		}
	};

	return (
		<section
			className="adjustments-section"
			aria-labelledby={ADJUSTMENTS_TITLE_ID}
			aria-busy={saving}
		>
			<h2 id={ADJUSTMENTS_TITLE_ID} className="sec-title">
				조정
			</h2>
			<p className="row dim">
				이월·사규 추가분·포상 휴가를 여기에 넣습니다. 월차와 연차는 계산이
				만들며 고칠 수 없습니다.
			</p>
			{savingStatus}
			{/* 넣은 순서 그대로 보여준다. 배정 순서(소멸일 ↑ → 발생일 ↑ → source → 입력
			    순서, 3.4절)와는 다르다 — 그쪽은 요약 탭의 발생분 리스트가 보여준다. */}
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
					{adjustments.map((adjustment) => (
						<tr className="adj-row" key={adjustment.id}>
							<td className="adj-days num">{formatDays(adjustment.days)}</td>
							<td className="adj-grant num">
								<time dateTime={adjustment.grantDate}>
									{adjustment.grantDate}
								</time>
							</td>
							<td className="adj-expiry num">
								<time dateTime={adjustment.expiryDate}>
									{adjustment.expiryDate}
								</time>
							</td>
							<td className="adj-note">
								{adjustment.note || <span className="dim">메모 없음</span>}
							</td>
							<td className="adj-action-cell">
								<div className="adj-actions">
									<button
										type="button"
										className="mini"
										disabled={saving}
										onClick={() => handleOpenEdit(adjustment)}
									>
										수정
									</button>
									<button
										type="button"
										className="mini"
										disabled={saving}
										onClick={() => handleDelete(adjustment.id)}
									>
										삭제
									</button>
								</div>
							</td>
						</tr>
					))}
					{adjustments.length === 0 && (
						<tr>
							<td className="adjustments-empty dim" colSpan={5}>
								넣은 조정이 없습니다.
							</td>
						</tr>
					)}
				</tbody>
			</table>
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
					{saveError}
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
					{saveError}
					<div className="cta">
						<button type="button" disabled={saving} onClick={handleOpenAdd}>
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
