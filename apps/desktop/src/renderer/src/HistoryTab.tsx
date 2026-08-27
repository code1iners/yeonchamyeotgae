import type {
	Adjustment,
	Balance,
	ExpiryLoss,
	HistorySections,
	LeaveEntry,
} from "@yeoncha/core";
import { expiryLosses, groupHistory } from "@yeoncha/core";
import { useState } from "react";
import { CalendarGrid } from "./CalendarGrid";
import { UNITS, unitLabel } from "./units";
import { useCommit } from "./use-commit";

type Props = {
	/** 휴가 기록 전부. 두 뷰와 커밋할 배열이 여기서 나온다. */
	entries: LeaveEntry[];
	/** 조회일 기준 잔여 — 연차 연도와 소멸분을 파생할 발생 내역이 여기 있다. */
	balance: Balance;
	/** 조정 레코드. 소멸 줄에 붙는 메모의 출처다. */
	adjustments: Adjustment[];
	/** 조회일. 사용·예정의 경계이자 달력의 오늘 표시다. */
	today: string;
};

/** 달력 아래 그날 기록의 단위 선택지(스펙 5.3절) — 좁은 자리라 숫자로 줄인다. */
const CALENDAR_UNITS = [
	{ label: "1", days: 1 },
	{ label: "½", days: 0.5 },
	{ label: "¼", days: 0.25 },
] as const;

/**
 * 이력 탭 — 무엇을 언제 썼는지 훑는 화면(스펙 5.3절). 리스트와 달력 두 뷰가 전환된다.
 *
 * 사용·예정을 손으로 전환하는 UI는 **없다** — 둘은 날짜에서 파생되고(3.9절), 안 쓰게 된
 * 예정은 상태 변경이 아니라 삭제다. 수정·삭제 커밋이 끝나면 셸이 상태를 다시 밀어주므로
 * 트레이 숫자와 요약 탭은 여기서 손대지 않아도 함께 갱신된다.
 */
export function HistoryTab({ entries, balance, adjustments, today }: Props) {
	/** 지금 보는 뷰. */
	const [view, setView] = useState<"list" | "calendar">("list");

	/** 소멸일별로 사라진 미사용분 — 리스트 맨 아래 섹션과 달력의 빨간 밑줄이 같이 쓴다. */
	const losses = expiryLosses({ grants: balance.grants, adjustments });
	/**
	 * 예정 / 연차 연도별 사용 그룹. 두 뷰가 같은 판정을 본다 — 리스트의 예정 섹션과
	 * 달력의 파란 점이 갈리면 안 되므로 3.9절 경계는 코어의 이 결과 하나에서 나온다.
	 */
	const groups = groupHistory({ grants: balance.grants, entries, today });

	return (
		<div className="pane">
			<div className="hist-head">
				<div className="seg hist-views">
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
				</div>
			</div>
			{view === "list" ? (
				<HistoryList entries={entries} groups={groups} losses={losses} />
			) : (
				<HistoryCalendar
					entries={entries}
					groups={groups}
					losses={losses}
					today={today}
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
}: Pick<Props, "entries"> & {
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
	/**
	 * 수정 저장의 커밋 통로. 삭제와 나눈 이유는 실패 문구의 자리다 — 한 통로면 다른
	 * 행의 삭제 실패가 열려 있는 수정 폼 안에 뜬다.
	 */
	const edit = useCommit();
	/** 삭제의 커밋 통로. 실패 문구는 리스트 위에 뜬다. */
	const remove = useCommit();
	/** 어느 쪽이든 커밋이 오가는 중인가 — 그동안 모든 손잡이를 잠근다. */
	const saving = edit.saving || remove.saving;

	/** 연차 연도 섹션 접기·펼치기 핸들러. */
	const handleToggleYear = (year: number) => {
		/** 다음 펼침 상태. */
		const next = new Set(openYears);
		if (!next.delete(year)) {
			next.add(year);
		}
		setOpenYears(next);
	};

	/** 수정 시작 핸들러 — 행이 그 자리에서 폼으로 바뀐다. */
	const handleOpenEdit = (entry: LeaveEntry) => {
		setDraft({ id: entry.id, date: entry.date, days: entry.days });
		setIssue(null);
		edit.clearError();
	};

	/** 수정 닫기 핸들러. */
	const handleCloseEdit = () => {
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
			handleCloseEdit();
		}
	};

	/** 삭제 핸들러 — 안 쓰게 된 예정도 이 문으로 나간다(3.9절). */
	const handleDelete = async (id: string) => {
		// 지우는 기록을 고치고 있었나요? 폼에 남은 것이 유령이 되지 않게 닫는다.
		if (draft?.id === id) {
			handleCloseEdit();
		}
		await remove.commit({
			entries: entries.filter((entry) => entry.id !== id),
		});
	};

	/** 행 하나 — 수정 중이면 그 자리가 폼이 된다. */
	const renderRow = (entry: LeaveEntry, planned: boolean) =>
		draft?.id === entry.id ? (
			<div className="hist-edit" key={entry.id}>
				<div className="hist-edit-fields">
					<input
						type="date"
						value={draft.date}
						onChange={(event) =>
							setDraft({ ...draft, date: event.target.value })
						}
					/>
					<div className="seg">
						{UNITS.map((unit) => (
							<button
								type="button"
								key={unit.days}
								aria-pressed={draft.days === unit.days}
								onClick={() => setDraft({ ...draft, days: unit.days })}
							>
								{unit.label}
							</button>
						))}
					</div>
				</div>
				{issue && <p className="error">{issue}</p>}
				{edit.error && <p className="error">{edit.error}</p>}
				<div className="hist-edit-cta">
					<button
						type="button"
						className="mini"
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
			<div className="row hist-row" key={entry.id}>
				<b className="num">{entry.date}</b>
				<span>{unitLabel(entry.days)}</span>
				{planned && <span className="tag-planned">예정</span>}
				{entry.note && <span className="dim hist-note">{entry.note}</span>}
				<span className="hist-actions">
					<button
						type="button"
						className="mini"
						disabled={saving}
						onClick={() => handleOpenEdit(entry)}
					>
						수정
					</button>
					<button
						type="button"
						className="mini"
						disabled={saving}
						onClick={() => handleDelete(entry.id)}
					>
						삭제
					</button>
				</span>
			</div>
		);

	return (
		<>
			{/* 삭제 실패는 어느 행에서 났든 리스트 위에 뜬다 — 수정 폼과 통로가 다르다. */}
			{remove.error && <p className="error">{remove.error}</p>}
			<div className="hist-scroll">
				{groups.planned.length === 0 && groups.years.length === 0 && (
					<div className="row dim">휴가 기록이 없습니다.</div>
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
			</div>
		</>
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
}: Pick<Props, "entries" | "today"> & {
	/** 예정 / 사용 판정의 출처 — 파란 점과 회색 점이 리스트의 섹션과 같은 경계를 쓴다. */
	groups: HistorySections;
	/** 빨간 밑줄을 붙일 소멸 줄들. */
	losses: ExpiryLoss[];
}) {
	/** 눌러서 펼쳐둔 날짜. 처음에는 아무 날도 아니다. */
	const [selected, setSelected] = useState<string | null>(null);
	/** 셸에 변경을 커밋하는 통로. */
	const { commit, saving, error } = useCommit();

	/** 날짜 → 그날의 휴가 기록. 하루 1건이라 값이 하나다. */
	const entryByDate = new Map(entries.map((entry) => [entry.date, entry]));
	/** 예정인 날짜들 — 3.9절 경계를 여기서 다시 구현하지 않고 코어 판정을 옮겨 받는다. */
	const plannedDates = new Set(groups.planned.map((entry) => entry.date));

	/** 펼친 날짜의 기록. */
	const selectedEntry = selected ? entryByDate.get(selected) : undefined;
	/** 펼친 날짜에 소멸한 것들. */
	const selectedLosses = selected
		? losses.filter((loss) => loss.expiryDate === selected)
		: [];

	/** 단위 변경 핸들러 — 누르는 즉시 커밋한다. 폼이 아니라 그날 기록의 손잡이다. */
	const handleChangeDays = async (entry: LeaveEntry, days: number) => {
		await commit({
			entries: entries.map((item) =>
				item.id === entry.id ? { ...item, days } : item,
			),
		});
	};

	/** 삭제 핸들러. */
	const handleDelete = async (entry: LeaveEntry) => {
		await commit({ entries: entries.filter((item) => item.id !== entry.id) });
	};

	return (
		<>
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
						expired: losses.some((loss) => loss.expiryDate === date),
					};
				}}
				onPick={(date) => setSelected(date)}
			/>
			{selected && (
				<div className="hist-day">
					<div className="sec-title num">{selected}</div>
					{selectedLosses.map((loss) => (
						<div
							className="row warn"
							key={`${loss.source}-${loss.note}-${loss.days}`}
						>
							{lossLabel(loss)}
						</div>
					))}
					{selectedEntry ? (
						<div className="row">
							<span>{unitLabel(selectedEntry.days)}</span>
							{selectedEntry.note && (
								<span className="dim hist-note">{selectedEntry.note}</span>
							)}
							<span className="hist-day-actions">
								<span className="seg hist-day-units">
									{CALENDAR_UNITS.map((unit) => (
										<button
											type="button"
											key={unit.days}
											aria-pressed={selectedEntry.days === unit.days}
											disabled={saving}
											onClick={() => handleChangeDays(selectedEntry, unit.days)}
										>
											{unit.label}
										</button>
									))}
								</span>
								<button
									type="button"
									className="mini"
									disabled={saving}
									onClick={() => handleDelete(selectedEntry)}
								>
									삭제
								</button>
							</span>
						</div>
					) : (
						selectedLosses.length === 0 && (
							<div className="row dim">이 날에는 기록이 없습니다.</div>
						)
					)}
					{error && <p className="error">{error}</p>}
				</div>
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
