import type {
	Adjustment,
	AdjustmentDraft,
	AdjustmentIssue,
	GrantDetail,
} from "@yeoncha/core";
import { latestLivingExpiry, validateAdjustmentDraft } from "@yeoncha/core";
import { useState } from "react";
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

	/** 추가 폼 열기 핸들러. */
	const handleOpenAdd = () => {
		setDraft(addDraft({ grants, today }));
		setEditingId(null);
		setIssues([]);
		setOpen(true);
	};

	/** 수정 폼 열기 핸들러. */
	const handleOpenEdit = (adjustment: Adjustment) => {
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
	const handleSubmit = async () => {
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
		// 지우는 레코드를 고치고 있었나요? 폼에 남은 것이 유령이 되지 않게 닫는다.
		if (editingId === id) {
			handleClose();
		}
		await commit({
			adjustments: adjustments.filter((adjustment) => adjustment.id !== id),
		});
	};

	return (
		<>
			<div className="sec-title">조정</div>
			<div className="row dim">
				이월·사규 추가분·포상 휴가를 여기에 넣습니다. 월차와 연차는 계산이
				만들며 고칠 수 없습니다.
			</div>
			{/* 넣은 순서 그대로 보여준다. 배정 순서(소멸일 ↑ → 발생일 ↑ → source → 입력
			    순서, 3.4절)와는 다르다 — 그쪽은 요약 탭의 발생분 리스트가 보여준다. */}
			{adjustments.map((adjustment) => (
				<div className="adj" key={adjustment.id}>
					<div className="adj-main">
						<b className="num">{formatDays(adjustment.days)}</b>
						<span className="dim num">
							{adjustment.grantDate} → {adjustment.expiryDate}
						</span>
						<span className="adj-actions">
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
						</span>
					</div>
					{adjustment.note && (
						<div className="adj-note dim">{adjustment.note}</div>
					)}
				</div>
			))}
			{adjustments.length === 0 && (
				<div className="row dim">넣은 조정이 없습니다.</div>
			)}
			{open ? (
				<div className="adj-form">
					<label className="field">
						<span>일수</span>
						<input
							type="number"
							step="0.25"
							value={draft.days}
							aria-invalid={hasIssue(issues, "days")}
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
							aria-invalid={hasIssue(issues, "grantDate")}
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
							aria-invalid={hasIssue(issues, "expiryDate")}
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
							onChange={(event) =>
								setDraft({ ...draft, note: event.target.value })
							}
						/>
					</label>
					{issues.map((issue) => (
						<p className="error" key={issue.field}>
							{issue.message}
						</p>
					))}
					{error && <p className="error">{error}</p>}
					<div className="cta">
						<button
							type="button"
							className="primary"
							disabled={saving}
							onClick={handleSubmit}
						>
							{editingId ? "저장" : "추가"}
						</button>
						<button type="button" disabled={saving} onClick={handleClose}>
							취소
						</button>
					</div>
				</div>
			) : (
				<>
					{error && <p className="error">{error}</p>}
					<div className="cta">
						<button type="button" disabled={saving} onClick={handleOpenAdd}>
							조정 추가
						</button>
					</div>
				</>
			)}
		</>
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

/** 목록에 뜨는 일수 — 더하는 것인지 깎는 것인지가 부호로 먼저 읽혀야 한다. */
function formatDays(days: number): string {
	return `${days > 0 ? "+" : ""}${days}일`;
}
