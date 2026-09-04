import type {
	Adjustment,
	Balance,
	ExpiryLoss,
	HistorySections,
	LeaveEntry,
} from "@yeoncha/core";
import { expiryLosses, groupHistory } from "@yeoncha/core";
import { useEffect, useRef, useState } from "react";
import { CalendarGrid } from "./CalendarGrid";
import { syncOpenYears } from "./history-state";
import { UNITS, unitLabel } from "./units";
import { useCommit } from "./use-commit";
import { useEntryRemoval } from "./use-entry-removal";

type Props = {
	/** 휴가 기록 전부. 두 뷰와 커밋할 배열이 여기서 나온다. */
	entries: LeaveEntry[];
	/** 조회일 기준 잔여 — 연차 연도와 소멸분을 파생할 발생 내역이 여기 있다. */
	balance: Balance;
	/** 조정 레코드. 소멸 줄에 붙는 메모의 출처다. */
	adjustments: Adjustment[];
	/** 조회일. 사용·예정의 경계이자 달력의 오늘 표시다. */
	today: string;
	/** 빈 이력에서 전역 휴가 등록 흐름을 시작한다. */
	onOpenEntry: () => void;
};

/**
 * 이력 탭 — 무엇을 언제 썼는지 훑는 화면(스펙 5.3절). 리스트와 달력 두 뷰가 전환된다.
 *
 * 사용·예정을 손으로 전환하는 UI는 **없다** — 둘은 날짜에서 파생되고(3.9절), 안 쓰게 된
 * 예정은 상태 변경이 아니라 삭제다. 수정·삭제 커밋이 끝나면 셸이 상태를 다시 밀어주므로
 * 트레이 숫자와 요약 탭은 여기서 손대지 않아도 함께 갱신된다.
 */
export function HistoryTab({
	entries,
	balance,
	adjustments,
	today,
	onOpenEntry,
}: Props) {
	/** 지금 보는 뷰. */
	const [view, setView] = useState<"list" | "calendar">("list");

	/** 소멸일별로 사라진 미사용분 — 리스트 맨 아래 섹션과 달력의 빨간 밑줄이 같이 쓴다. */
	const losses = expiryLosses({ grants: balance.grants, adjustments });
	/**
	 * 예정 / 연차 연도별 사용 그룹. 두 뷰가 같은 판정을 본다 — 리스트의 예정 섹션과
	 * 달력의 예정·사용 점이 갈리면 안 되므로 3.9절 경계는 코어의 이 결과 하나에서 나온다.
	 */
	const groups = groupHistory({ grants: balance.grants, entries, today });

	return (
		<div className="pane">
			<div className="hist-head">
				<fieldset className="seg hist-views">
					<legend className="sr-only">이력 보기</legend>
					{(
						[
							{ key: "list", label: "리스트" },
							{ key: "calendar", label: "달력" },
						] as const
					).map(({ key, label }) => (
						<button
							type="button"
							key={key}
							aria-pressed={view === key}
							onClick={() => setView(key)}
						>
							{label}
						</button>
					))}
				</fieldset>
			</div>
			{view === "list" ? (
				<HistoryList
					entries={entries}
					groups={groups}
					losses={losses}
					onOpenEntry={onOpenEntry}
				/>
			) : (
				<HistoryCalendar
					entries={entries}
					groups={groups}
					losses={losses}
					today={today}
					onOpenEntry={onOpenEntry}
				/>
			)}
		</div>
	);
}

/**
 * 리스트 뷰 — 예정 섹션 · 연차 연도별 사용 섹션 · 맨 아래 소멸 섹션(스펙 5.3절).
 *
 * 연차 연도는 현재 연도만 펼친 채로 연다 — 기록 수십 건 규모에서 이것 없이는 스크롤이
 * 끝나지 않는다. 스크롤은 이 리스트만 한다(팝오버 높이는 내용에 맞춰지므로, 여기가
 * 유일하게 높이를 자르는 자리다).
 */
function HistoryList({
	entries,
	groups,
	losses,
	onOpenEntry,
}: Pick<Props, "entries" | "onOpenEntry"> & {
	/** 예정 / 연차 연도별 사용 그룹. */
	groups: HistorySections;
	/** 소멸 섹션에 올릴 줄들. */
	losses: ExpiryLoss[];
}) {
	/** 펼쳐둔 연차 연도들. 처음에는 현재 연도 하나다. */
	const [openYears, setOpenYears] = useState<ReadonlySet<number>>(
		() => new Set([groups.currentYear]),
	);
	/** 수정 중인 기록의 초안. `null`이면 수정 중이 아니다. */
	const [draft, setDraft] = useState<{
		id: string;
		date: string;
		days: number;
	} | null>(null);
	/** 초안 검증에 걸린 문구. */
	const [issue, setIssue] = useState<string | null>(null);
	/** 마지막 성공 행동을 보조 기술에 알리는 문구. */
	const [successStatus, setSuccessStatus] = useState<string | null>(null);
	/** 인라인 수정이 열릴 때 먼저 포커스할 날짜 입력. */
	const editDateInputRef = useRef<HTMLInputElement>(null);
	/** 수정 폼이 닫힌 뒤 돌아갈 행별 수정 버튼. */
	const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	/** 삭제 확인이 열린 행의 focus 대상. */
	const deleteConfirmRefs = useRef(new Map<string, HTMLElement>());
	/** 삭제 확인을 닫은 뒤 돌아갈 삭제 버튼. */
	const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	/** 수정 폼을 연 기록 식별자. 닫힌 뒤 같은 행의 행동으로 돌아간다. */
	const focusReturnIdRef = useRef<string | null>(null);
	/** 삭제 확인을 닫거나 삭제한 뒤 돌아갈 기록 식별자. */
	const deleteFocusReturnIdRef = useRef<string | null>(null);
	/** 삭제한 행이 사라진 뒤에도 focus를 둘 리스트 영역. */
	const historyListRef = useRef<HTMLElement>(null);
	/** 사용자가 직접 접거나 펼친 연도. 자동 연도 전환이 이 선택을 덮지 않는다. */
	const touchedYearsRef = useRef(new Set<number>());
	/** 직전 상태 push에서의 기본 현재 연도. */
	const previousCurrentYearRef = useRef(groups.currentYear);
	/** 수정 폼의 열림 상태만 감지해 입력값 변경 때 포커스를 빼앗지 않는다. */
	const draftId = draft?.id ?? null;
	/**
	 * 수정 저장의 커밋 통로. 삭제와 나눈 이유는 실패 문구의 자리다 — 한 통로면 다른
	 * 행의 삭제 실패가 열려 있는 수정 폼 안에 뜬다.
	 */
	const edit = useCommit();
	/** 두 보기와 같은 삭제 저장 흐름. 성공 뒤 리스트 포커스만 여기서 정한다. */
	const removal = useEntryRemoval({
		entries,
		disabled: edit.saving,
		onSuccess: (id) => {
			deleteFocusReturnIdRef.current = id;
			setSuccessStatus("휴가 기록을 삭제했습니다.");
		},
	});
	/** 어느 쪽이든 커밋이 오가는 중인가 — 그동안 모든 손잡이를 잠근다. */
	const saving = edit.saving || removal.saving;
	/** 삭제 확인을 열어 둔 기록의 식별자. */
	const deleteTargetId = removal.targetId;

	useEffect(
		function syncHistoryCurrentYearEffect() {
			const previousCurrentYear = previousCurrentYearRef.current;
			if (previousCurrentYear === groups.currentYear) {
				return;
			}
			setOpenYears((current) =>
				syncOpenYears({
					openYears: current,
					previousCurrentYear,
					currentYear: groups.currentYear,
					touchedYears: touchedYearsRef.current,
				}),
			);
			previousCurrentYearRef.current = groups.currentYear;
		},
		[groups.currentYear],
	);

	useEffect(
		function manageHistoryEditFocusEffect() {
			if (deleteTargetId) {
				return;
			}
			// 행이 수정 폼으로 바뀌면 날짜 입력에서 바로 다음 키보드 조작을 시작한다.
			if (draftId) {
				editDateInputRef.current?.focus();
				return;
			}

			/** 삭제 확인을 닫은 뒤 돌아갈 기록 식별자. */
			const deleteTarget = deleteFocusReturnIdRef.current;
			if (deleteTarget) {
				deleteFocusReturnIdRef.current = null;
				deleteButtonRefs.current.get(deleteTarget)?.focus();
				if (
					document.activeElement !== deleteButtonRefs.current.get(deleteTarget)
				) {
					historyListRef.current?.focus();
				}
				return;
			}

			/** 수정 폼을 닫은 뒤 돌아갈 기록 식별자. */
			const targetId = focusReturnIdRef.current;
			if (!targetId) {
				return;
			}
			focusReturnIdRef.current = null;
			editButtonRefs.current.get(targetId)?.focus();
		},
		[draftId, deleteTargetId],
	);

	useEffect(
		function focusHistoryDeleteConfirmationEffect() {
			if (!deleteTargetId) {
				return;
			}
			deleteConfirmRefs.current.get(deleteTargetId)?.focus();
		},
		[deleteTargetId],
	);

	/** 이력 행의 수정 버튼을 현재 DOM과 함께 등록한다. */
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

	/** 이력 행의 삭제 버튼을 현재 DOM과 함께 등록한다. */
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
		element: HTMLElement | null,
	) => {
		if (element) {
			deleteConfirmRefs.current.set(id, element);
		} else {
			deleteConfirmRefs.current.delete(id);
		}
	};

	/** 연차 연도 섹션 접기·펼치기 핸들러. */
	const handleToggleYear = (year: number) => {
		touchedYearsRef.current.add(year);
		/** 다음 펼침 상태. */
		const next = new Set(openYears);
		if (!next.delete(year)) {
			next.add(year);
		}
		setOpenYears(next);
	};

	/** 수정 시작 핸들러 — 행이 그 자리에서 폼으로 바뀐다. */
	const handleOpenEdit = (entry: LeaveEntry) => {
		if (saving) {
			return;
		}
		focusReturnIdRef.current = entry.id;
		setDraft({ id: entry.id, date: entry.date, days: entry.days });
		setIssue(null);
		setSuccessStatus(null);
		removal.dismiss();
		edit.clearError();
	};

	/** 수정 닫기 핸들러. */
	const handleCloseEdit = () => {
		if (draft) {
			focusReturnIdRef.current = draft.id;
		}
		setDraft(null);
		setIssue(null);
		edit.clearError();
	};

	/** 수정 저장 핸들러 — 하루 1건 불변식(3.9절)을 여기서 지킨다. */
	const handleSaveEdit = async () => {
		// 초안이 없으면 저장할 것도 없다.
		if (!draft) {
			return;
		}
		// 날짜가 비었나요? date 입력은 지우기만 가능하고 형식은 깨지지 않는다.
		if (!draft.date) {
			setIssue("날짜를 고르세요");
			return;
		}
		// 다른 기록이 이미 있는 날짜인가요?
		if (
			entries.some(
				(entry) => entry.id !== draft.id && entry.date === draft.date,
			)
		) {
			setIssue("그날에는 이미 휴가 기록이 있습니다");
			return;
		}
		setIssue(null);

		/** 커밋할 기록 배열 — 수정한 것만 자리에서 갈아끼운다. */
		const next = entries.map((entry) =>
			entry.id === draft.id
				? { ...entry, date: draft.date, days: draft.days }
				: entry,
		);
		if (await edit.commit({ entries: next })) {
			setSuccessStatus("휴가 기록을 수정했습니다.");
			handleCloseEdit();
		}
	};

	/** 삭제 버튼을 누르면 같은 행 안에서 확인 단계를 연다(3.9절). */
	const handleDelete = (id: string) => {
		if (saving) {
			return;
		}
		setSuccessStatus(null);
		removal.open(id);
	};

	/** 확인한 기록만 삭제하고, 실패하면 확인 영역과 행을 그대로 남긴다. */
	const handleConfirmDelete = async (id: string) => {
		await removal.confirm(id);
	};

	/** 삭제를 취소하고 같은 행의 삭제 버튼으로 포커스를 되돌린다. */
	const handleCancelDelete = (id: string) => {
		if (removal.saving) {
			return;
		}
		deleteFocusReturnIdRef.current = id;
		removal.cancel();
	};

	/** 행 하나 — 수정 중이면 그 자리가 폼이 된다. */
	const renderRow = (entry: LeaveEntry, planned: boolean) => {
		/** 이 행이 수정 폼으로 바뀌었는가. */
		const isEditing = draft?.id === entry.id;
		/** 행의 접근 가능한 이름 — 날짜만으로 예정과 사용을 혼동하지 않게 한다. */
		const rowLabel = `${entry.date} ${planned ? "예정" : "사용"} 휴가 기록`;
		/** 이 행에서 표시할 삭제 실패 문구. */
		const rowDeleteError = deleteTargetId === entry.id ? removal.error : null;
		/** 이 행의 삭제 확인 제목·설명 식별자. */
		const deleteTitleId = `history-delete-title-${entry.id}`;
		const deleteDescriptionId = `history-delete-description-${entry.id}`;

		return (
			<article
				className="hist-row-container"
				key={entry.id}
				aria-label={rowLabel}
			>
				{isEditing ? (
					<div className="hist-edit" aria-busy={edit.saving}>
						<div className="hist-edit-fields">
							<input
								ref={isEditing ? editDateInputRef : undefined}
								type="date"
								aria-label="날짜"
								aria-invalid={issue !== null}
								value={draft.date}
								disabled={saving}
								onChange={(event) => {
									setDraft({ ...draft, date: event.target.value });
									setIssue(null);
								}}
							/>
							<fieldset className="seg" aria-label="단위">
								{UNITS.map((unit) => (
									<button
										type="button"
										key={unit.days}
										aria-pressed={draft.days === unit.days}
										disabled={saving}
										onClick={() => {
											setDraft({ ...draft, days: unit.days });
											setIssue(null);
										}}
									>
										{unit.label}
									</button>
								))}
							</fieldset>
						</div>
						<p className="history-edit-status" role="status" aria-live="polite">
							저장 전 초안: {draft.date} · {unitLabel(draft.days)}
						</p>
						{issue && (
							<p className="error" role="alert" aria-live="assertive">
								{issue}
							</p>
						)}
						{edit.error && (
							<p className="error" role="alert" aria-live="assertive">
								{edit.error}
							</p>
						)}
						<div className="hist-edit-cta">
							<button
								type="button"
								className="primary"
								disabled={saving}
								onClick={handleSaveEdit}
							>
								저장
							</button>
							<button
								type="button"
								className="mini"
								disabled={saving}
								onClick={handleCloseEdit}
							>
								취소
							</button>
						</div>
					</div>
				) : (
					<>
						<div className="row hist-row">
							<b className="num hist-date selectable">{entry.date}</b>
							<span className="hist-unit selectable">
								{unitLabel(entry.days)}
							</span>
							<span
								className={
									planned
										? "hist-status tag-planned"
										: "hist-status hist-status-used"
								}
							>
								{planned ? "예정" : "사용"}
							</span>
							<span className="dim hist-note selectable">{entry.note}</span>
							<span className="hist-actions">
								<button
									type="button"
									className="mini"
									disabled={saving || deleteTargetId !== null}
									ref={(element) => registerEditButton(entry.id, element)}
									onClick={() => handleOpenEdit(entry)}
								>
									수정
								</button>
								<button
									type="button"
									className="mini"
									disabled={saving || deleteTargetId !== null}
									ref={(element) => registerDeleteButton(entry.id, element)}
									onClick={() => handleDelete(entry.id)}
								>
									삭제
								</button>
							</span>
						</div>
						{deleteTargetId === entry.id && (
							<fieldset
								ref={(element) => registerDeleteConfirmation(entry.id, element)}
								className="hist-delete-confirm"
								tabIndex={-1}
								aria-labelledby={deleteTitleId}
								aria-describedby={deleteDescriptionId}
								onKeyDown={(event) => {
									if (event.key === "Escape") {
										event.preventDefault();
										handleCancelDelete(entry.id);
									}
								}}
							>
								<legend id={deleteTitleId}>삭제할까요?</legend>
								<p id={deleteDescriptionId}>
									{entry.date} 휴가 기록을 삭제합니다.
								</p>
								{rowDeleteError && (
									<p className="error" role="alert" aria-live="assertive">
										{rowDeleteError}
									</p>
								)}
								<div className="hist-delete-actions">
									<button
										type="button"
										className="danger"
										disabled={saving}
										onClick={() => handleConfirmDelete(entry.id)}
									>
										삭제
									</button>
									<button
										type="button"
										disabled={saving}
										onClick={() => handleCancelDelete(entry.id)}
									>
										취소
									</button>
								</div>
							</fieldset>
						)}
					</>
				)}
			</article>
		);
	};

	return (
		<section
			ref={historyListRef}
			className="hist-scroll"
			aria-label="휴가 이력 목록"
			aria-busy={saving}
			tabIndex={-1}
		>
			{saving && (
				<p className="history-status" role="status" aria-live="polite">
					저장 중…
				</p>
			)}
			{successStatus && !saving && (
				<p className="history-status" role="status" aria-live="polite">
					{successStatus}
				</p>
			)}
			{groups.planned.length === 0 && groups.years.length === 0 && (
				<div className="history-empty">
					<p className="row dim">휴가 기록이 없습니다.</p>
					<button type="button" onClick={onOpenEntry}>
						휴가 등록
					</button>
				</div>
			)}
			{groups.planned.length > 0 && (
				<>
					<div className="sec-title">예정</div>
					{groups.planned.map((entry) => renderRow(entry, true))}
				</>
			)}
			{groups.years.map((section) => (
				<div key={section.year}>
					<button
						type="button"
						className="hist-year"
						aria-expanded={openYears.has(section.year)}
						onClick={() => handleToggleYear(section.year)}
					>
						<span className="hist-chevron">
							{openYears.has(section.year) ? "▾" : "▸"}
						</span>
						<b className="num">{section.year}년</b>
						<span className="dim num">{section.entries.length}건</span>
					</button>
					{openYears.has(section.year) &&
						section.entries.map((entry) => renderRow(entry, false))}
				</div>
			))}
			{/* 소멸분은 맨 아래다 — 평소에 볼 것이 아니라 흐리게만 둔다(5.3절). */}
			{losses.length > 0 && (
				<>
					<div className="sec-title">소멸</div>
					{losses.map((loss) => (
						<div
							className="row dim"
							key={`${loss.expiryDate}-${loss.source}-${loss.note}`}
						>
							<span className="num">{lossLabel(loss)}</span>
							<span className="num hist-loss-date">{loss.expiryDate}</span>
						</div>
					))}
				</>
			)}
		</section>
	);
}

/**
 * 달력 뷰 — 등록 시트(25번)의 달력 격자를 그대로 쓰고, 예정·사용 점과 소멸 밑줄만
 * 장식으로 얹는다(스펙 5.3절). 날짜를 누르면 아래에 그날의 기록이 펼쳐진다.
 *
 * 소멸일의 빨간 밑줄이 소멸을 알아채는 두 번째 경로다(5.7절) — 그날을 누르면
 * `2025년 이월 3일 소멸`처럼 무엇이 몇 개 사라졌는지가 여기 뜬다.
 */
function HistoryCalendar({
	entries,
	groups,
	losses,
	today,
	onOpenEntry,
}: Pick<Props, "entries" | "today" | "onOpenEntry"> & {
	/** 예정 / 사용 판정의 출처 — 녹색 점과 회색 점이 리스트의 섹션과 같은 경계를 쓴다. */
	groups: HistorySections;
	/** 빨간 밑줄을 붙일 소멸 줄들. */
	losses: ExpiryLoss[];
}) {
	/** 눌러서 펼쳐둔 날짜. 처음에는 아무 날도 아니다. */
	const [selected, setSelected] = useState<string | null>(null);
	/** 단위 수정 전용 커밋 통로. */
	const edit = useCommit();
	/** 기록 삭제 뒤 상세 영역으로 포커스를 옮길 대상. */
	const detailsRef = useRef<HTMLElement>(null);
	/** 삭제 성공 뒤 상세 영역에 포커스를 요청했는가. */
	const restoreDetailsFocusRef = useRef(false);
	/** 마지막 성공 행동을 보조 기술에 알리는 문구. */
	const [successStatus, setSuccessStatus] = useState<string | null>(null);
	/** 삭제 확인 영역에 포커스를 둘 대상. */
	const deleteConfirmationRef = useRef<HTMLFieldSetElement>(null);
	/** 삭제 확인을 취소한 뒤 돌아갈 삭제 버튼. */
	const deleteButtonRef = useRef<HTMLButtonElement>(null);
	/** 선택한 기록에서 바꾼 단위의 저장 전 초안. */
	const [calendarDraft, setCalendarDraft] = useState<{
		id: string;
		days: number;
	} | null>(null);
	/** 단위 변경 뒤 같은 편집 위치로 포커스를 돌려줄 버튼들. */
	const calendarUnitButtonRefs = useRef(new Map<number, HTMLButtonElement>());
	/** 달력 초안 저장·취소 뒤 포커스를 복귀할 기록과 단위. */
	const calendarDraftFocusReturnRef = useRef<{
		id: string;
		days: number;
	} | null>(null);
	/** 두 보기와 같은 삭제 저장 흐름. 성공 뒤 달력 상세 포커스만 여기서 정한다. */
	const removal = useEntryRemoval({
		entries,
		disabled: edit.saving || calendarDraft !== null,
		onSuccess: () => {
			restoreDetailsFocusRef.current = true;
			setSuccessStatus("휴가 기록을 삭제했습니다.");
		},
	});
	/** 수정이나 삭제가 저장 중이면 달력의 모든 조작을 잠근다. */
	const saving = edit.saving || removal.saving;
	/** 삭제 확인을 열어 둔 기록의 식별자. */
	const deleteTargetId = removal.targetId;

	/** 날짜 → 그날의 휴가 기록. 하루 1건이라 값이 하나다. */
	const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
	/** 예정인 날짜들 — 3.9절 경계를 여기서 다시 구현하지 않고 코어 판정을 옮겨 받는다. */
	const plannedDates = new Set(groups.planned.map((entry) => entry.date));
	/** 소멸 내역이 있는 날짜들 — 셀마다 같은 배열을 다시 훑지 않는다. */
	const expiredDates = new Set(losses.map((loss) => loss.expiryDate));

	/** 펼친 날짜의 기록. */
	const selectedEntry = selected ? entryByDate.get(selected) : undefined;
	/** 펼친 날짜에 소멸한 것들. */
	const selectedLosses = selected
		? losses.filter((loss) => loss.expiryDate === selected)
		: [];
	/** 선택한 기록이 조회일 이후인지 — 예정/사용은 날짜에서만 나온다. */
	const selectedPlanned = selectedEntry
		? plannedDates.has(selectedEntry.date)
		: false;

	/** 현재 달력 단위 버튼을 DOM과 연결해 저장·취소 뒤 같은 위치를 찾는다. */
	const registerCalendarUnitButton = (
		days: number,
		element: HTMLButtonElement | null,
	) => {
		if (element) {
			calendarUnitButtonRefs.current.set(days, element);
		} else {
			calendarUnitButtonRefs.current.delete(days);
		}
	};

	useEffect(
		function restoreCalendarDetailsFocusEffect() {
			// 삭제가 실패했거나 아직 이전 기록이 남아 있으면 포커스를 빼앗지 않는다.
			if (!restoreDetailsFocusRef.current || saving || selectedEntry) {
				return;
			}
			restoreDetailsFocusRef.current = false;
			detailsRef.current?.focus();
		},
		[saving, selectedEntry],
	);

	useEffect(
		function focusCalendarDeleteConfirmationEffect() {
			if (deleteTargetId) {
				deleteConfirmationRef.current?.focus();
			}
		},
		[deleteTargetId],
	);

	useEffect(
		function manageCalendarDraftFocusEffect() {
			if (calendarDraft && selectedEntry?.id !== calendarDraft.id) {
				// 외부 상태 갱신으로 선택 기록이 바뀌면 오래된 초안을 버린다.
				setCalendarDraft(null);
				return;
			}
			if (calendarDraft) {
				return;
			}

			/** 저장·취소 뒤 돌아갈 기록의 단위 버튼. */
			const focusTarget = calendarDraftFocusReturnRef.current;
			if (!focusTarget || selectedEntry?.id !== focusTarget.id) {
				return;
			}
			calendarDraftFocusReturnRef.current = null;
			calendarUnitButtonRefs.current.get(focusTarget.days)?.focus();
		},
		[calendarDraft, selectedEntry?.id],
	);

	/** 단위 버튼은 초안만 바꾸고, 사용자가 명시적으로 저장할 때 커밋한다. */
	const handleChangeDays = (entry: LeaveEntry, days: number) => {
		if (saving || deleteTargetId !== null) {
			return;
		}
		edit.clearError();
		setSuccessStatus(null);
		setCalendarDraft(days === entry.days ? null : { id: entry.id, days });
	};

	/** 달력 단위 초안을 저장하고 셸 상태 갱신 뒤 선택한 단위로 포커스를 돌린다. */
	const handleSaveCalendarDraft = async () => {
		const draftToSave = calendarDraft;
		if (
			!draftToSave ||
			!selectedEntry ||
			selectedEntry.id !== draftToSave.id ||
			saving ||
			deleteTargetId !== null
		) {
			return;
		}
		edit.clearError();
		calendarDraftFocusReturnRef.current = draftToSave;
		if (
			await edit.commit({
				entries: entries.map((item) =>
					item.id === draftToSave.id
						? { ...item, days: draftToSave.days }
						: item,
				),
			})
		) {
			setCalendarDraft(null);
			setSuccessStatus("휴가 기록을 수정했습니다.");
		}
	};

	/** 달력 단위 초안을 버리고 저장 전의 원래 단위 버튼으로 포커스를 돌린다. */
	const handleCancelCalendarDraft = () => {
		if (!calendarDraft || !selectedEntry) {
			return;
		}
		calendarDraftFocusReturnRef.current = {
			id: selectedEntry.id,
			days: selectedEntry.days,
		};
		setCalendarDraft(null);
		edit.clearError();
		setSuccessStatus(null);
	};

	/** 삭제 버튼을 누르면 상세 안에서 확인 단계를 연다. */
	const handleDelete = (entry: LeaveEntry) => {
		if (saving || calendarDraft) {
			return;
		}
		edit.clearError();
		setSuccessStatus(null);
		removal.open(entry.id);
	};

	/** 확인한 기록만 삭제하고, 실패하면 상세와 확인 영역을 유지한다. */
	const handleConfirmDelete = async (entry: LeaveEntry) => {
		restoreDetailsFocusRef.current = true;
		if (!(await removal.confirm(entry.id))) {
			restoreDetailsFocusRef.current = false;
		}
	};

	/** 삭제를 취소하고 상세의 삭제 버튼으로 포커스를 되돌린다. */
	const handleCancelDelete = () => {
		if (saving) {
			return;
		}
		removal.cancel();
		deleteButtonRef.current?.focus();
	};

	/** 날짜 선택 핸들러 — 이전 날짜의 저장 실패 문구를 새 날짜로 가져가지 않는다. */
	const handlePickDate = (date: string) => {
		edit.clearError();
		calendarDraftFocusReturnRef.current = null;
		setCalendarDraft(null);
		removal.dismiss();
		setSelected(date);
	};

	return (
		<>
			<div className="hist-calendar">
				<fieldset className="cal-legend">
					<legend className="sr-only">달력 상태 안내</legend>
					<span>
						<i
							className="cal-legend-mark cal-legend-planned"
							aria-hidden="true"
						/>
						예정
					</span>
					<span>
						<i className="cal-legend-mark cal-legend-used" aria-hidden="true" />
						사용
					</span>
					<span>
						<i
							className="cal-legend-mark cal-legend-expired"
							aria-hidden="true"
						/>
						소멸일
					</span>
				</fieldset>
				<CalendarGrid
					today={today}
					initialMonth={today}
					decorate={(date) => {
						/** 그날의 휴가 기록. */
						const entry = entryByDate.get(date);
						return {
							selected: date === selected,
							dot: entry
								? plannedDates.has(date)
									? "planned"
									: "used"
								: undefined,
							expired: expiredDates.has(date),
						};
					}}
					onPick={handlePickDate}
				/>
			</div>
			{saving && (
				<p className="history-status" role="status" aria-live="polite">
					저장 중…
				</p>
			)}
			{successStatus && !saving && (
				<p className="history-status" role="status" aria-live="polite">
					{successStatus}
				</p>
			)}
			{entries.length === 0 && (
				<div className="history-empty">
					<p className="row dim">휴가 기록이 없습니다.</p>
					<button type="button" onClick={onOpenEntry}>
						휴가 등록
					</button>
				</div>
			)}
			{selected && (
				<section
					ref={detailsRef}
					className="hist-day"
					aria-label="선택한 날짜 상세"
					aria-live="polite"
					aria-busy={saving}
					tabIndex={-1}
				>
					<div className="hist-day-head">
						<h3 className="sec-title num">{selected}</h3>
						{selectedEntry && (
							<strong
								className={`hist-day-status ${selectedPlanned ? "tag-planned" : "hist-status-used"}`}
							>
								{selectedPlanned ? "예정" : "사용"}
							</strong>
						)}
					</div>
					{selectedLosses.map((loss) => (
						<div
							className="row warn"
							key={`${loss.expiryDate}-${loss.source}-${loss.note}-${loss.days}`}
						>
							{lossLabel(loss)}
						</div>
					))}
					{selectedEntry ? (
						<>
							{calendarDraft && calendarDraft.id === selectedEntry.id && (
								<p
									id="history-calendar-draft-status"
									className="history-edit-status"
									role="status"
									aria-live="polite"
								>
									저장 전 초안: {unitLabel(calendarDraft.days)}
								</p>
							)}
							<dl className="hist-day-record">
								<div>
									<dt>날짜</dt>
									<dd className="num selectable">{selectedEntry.date}</dd>
								</div>
								<div>
									<dt>단위</dt>
									<dd className="selectable">
										{unitLabel(selectedEntry.days)}
									</dd>
								</div>
								<div>
									<dt>메모</dt>
									<dd className="dim selectable">
										{selectedEntry.note || "메모 없음"}
									</dd>
								</div>
							</dl>
							<div className="hist-day-actions">
								<fieldset
									className="hist-day-unit-fieldset"
									aria-describedby={
										calendarDraft ? "history-calendar-draft-status" : undefined
									}
								>
									<legend>단위 변경</legend>
									<div className="seg hist-day-units">
										{UNITS.map((unit) => (
											<button
												type="button"
												key={unit.days}
												ref={(element) =>
													registerCalendarUnitButton(unit.days, element)
												}
												aria-pressed={
													(calendarDraft?.days ?? selectedEntry.days) ===
													unit.days
												}
												disabled={saving || deleteTargetId !== null}
												onClick={() =>
													handleChangeDays(selectedEntry, unit.days)
												}
											>
												{unit.label}
											</button>
										))}
									</div>
								</fieldset>
								{calendarDraft ? (
									<div className="hist-edit-cta">
										<button
											type="button"
											className="primary"
											disabled={saving}
											onClick={handleSaveCalendarDraft}
										>
											저장
										</button>
										<button
											type="button"
											className="mini"
											disabled={saving}
											onClick={handleCancelCalendarDraft}
										>
											취소
										</button>
									</div>
								) : (
									<button
										type="button"
										className="mini"
										disabled={saving || deleteTargetId !== null}
										ref={deleteButtonRef}
										onClick={() => handleDelete(selectedEntry)}
									>
										삭제
									</button>
								)}
							</div>
							{deleteTargetId === selectedEntry.id && (
								<fieldset
									ref={deleteConfirmationRef}
									className="hist-delete-confirm"
									tabIndex={-1}
									aria-labelledby="history-calendar-delete-title"
									aria-describedby="history-calendar-delete-description"
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											event.preventDefault();
											handleCancelDelete();
										}
									}}
								>
									<legend id="history-calendar-delete-title">
										삭제할까요?
									</legend>
									<p id="history-calendar-delete-description">
										{selectedEntry.date} 휴가 기록을 삭제합니다.
									</p>
									{removal.error && (
										<p className="error" role="alert" aria-live="assertive">
											{removal.error}
										</p>
									)}
									<div className="hist-delete-actions">
										<button
											type="button"
											className="danger"
											disabled={saving}
											onClick={() => handleConfirmDelete(selectedEntry)}
										>
											삭제
										</button>
										<button
											type="button"
											disabled={saving}
											onClick={handleCancelDelete}
										>
											취소
										</button>
									</div>
								</fieldset>
							)}
						</>
					) : (
						selectedLosses.length === 0 && (
							<div className="row dim">이 날에는 기록이 없습니다.</div>
						)
					)}
					{edit.error && !deleteTargetId && (
						<p className="error" role="alert" aria-live="assertive">
							{edit.error}
						</p>
					)}
				</section>
			)}
		</>
	);
}

/** 소멸 한 줄의 문구 — `2025년 이월 3일 소멸`(스펙 5.7절). */
function lossLabel(loss: ExpiryLoss): string {
	/** 무엇이 사라졌는지 — 조정은 메모가 있으면 메모가 이름이다. */
	const name =
		loss.source === "monthly"
			? "월차"
			: loss.source === "annual"
				? "연차"
				: loss.note || "조정";
	return `${loss.year}년 ${name} ${loss.days}일 소멸`;
}
