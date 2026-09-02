import type { LeaveEntry } from "@yeoncha/core";
import {
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { expandEntryDates } from "./entry-dates";
import { trapFocus } from "./focus-scope";
import { UNITS, unitLabel } from "./units";
import { useCommit } from "./use-commit";

type Props = {
	/** 저장된 휴가 기록 전부. 중복 차단과 커밋할 배열이 여기서 나온다. */
	entries: LeaveEntry[];
	/** 조회일. 등록면의 기본 날짜다. */
	today: string;
	/** 시트를 닫는다 — 등록을 마쳤거나 그만뒀거나 같은 문이다. */
	onClose: () => void;
};

/** 하루와 기간 중 현재 등록 범위. 하루가 기본값인 흔한 흐름이다. */
type EntryMode = "day" | "range";

/** 등록면의 날짜 입력과 연결할 설명 식별자. */
const ENTRY_DATE_DESCRIPTION_ID = "entry-date-description";

/**
 * 휴가 등록면 — 팝오버의 현재 구조를 대신하는 한 화면 모드다(스펙 5.2절).
 *
 * 날짜와 단위는 처음부터 보인다. 그래서 기본값인 오늘·종일을 바꾸지 않으면
 * `[휴가 등록]`을 여는 조작과 `[등록]`을 누르는 조작만으로 저장된다. 다른 날짜와
 * 기간은 같은 화면에서 필요한 입력만 펼친다.
 */
export function LeaveEntrySheet({ entries, today, onClose }: Props) {
	/** 등록 범위. 하루가 기본이라 오늘 기록의 입력 비용이 가장 짧다. */
	const [mode, setMode] = useState<EntryMode>("day");
	/** 하루 등록 또는 기간 등록의 시작일. 오늘이 기본값이다. */
	const [startDate, setStartDate] = useState(today);
	/** 기간 등록의 종료일. 기간으로 바꿀 때도 오늘부터 시작해 빈 입력을 만들지 않는다. */
	const [endDate, setEndDate] = useState(today);
	/** 고른 휴가 단위. 종일이 기본값이다. */
	const [days, setDays] = useState<number>(1);
	/** 메모. 선택 사항이며 저장 직전에 앞뒤 공백을 제거한다. */
	const [note, setNote] = useState("");
	/** 기간에서 토·일을 뺄 것인가. 기존 기간 등록의 기본값을 유지한다. */
	const [excludeWeekends, setExcludeWeekends] = useState(true);
	/** 등록면에 들어왔을 때 기본 날짜를 바로 확인할 입력. */
	const startDateRef = useRef<HTMLInputElement>(null);
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, saving, error } = useCommit();
	/** 저장 성공 문구를 보여 주고 등록면을 닫을지 여부. */
	const [completed, setCompleted] = useState(false);
	/** 저장 중이거나 성공 상태라서 입력을 잠가야 하는가. */
	const busy = saving || completed;

	useEffect(function focusEntryDateEffect() {
		// 등록면을 열자마자 기본 날짜를 확인하고 키보드 입력을 시작할 수 있게 한다.
		startDateRef.current?.focus();
	}, []);

	useEffect(
		function closeCompletedEntryEffect() {
			if (!completed) {
				return;
			}

			/** 성공 상태를 확인할 수 있도록 잠시 기다린 뒤 등록면을 닫는다. */
			const closeTimer = window.setTimeout(onClose, 400);
			return () => window.clearTimeout(closeTimer);
		},
		[completed, onClose],
	);

	/** 이미 휴가 기록이 있는 날짜들. 하루 등록은 여기서 중복을 막는다. */
	const taken = new Set(entries.map((entry) => entry.date));
	/** 기간 등록인가. 종료일과 주말 제외는 이때만 의미가 있다. */
	const isRange = mode === "range";
	/** 현재 초안으로 실제 생성할 날짜들. 기간은 하루 1건씩 펼친다. */
	const dates =
		startDate && (!isRange || endDate)
			? expandEntryDates({
					start: startDate,
					end: isRange ? endDate : startDate,
					excludeWeekends: isRange && excludeWeekends,
					taken,
				})
			: [];
	/** 기본 날짜에 이미 기록이 있는가. 사용자가 다른 날짜를 고를 때까지 등록을 막는다. */
	const duplicateStart = !isRange && startDate !== "" && taken.has(startDate);
	/** 종료일이 비어 있어 기간을 계산할 수 없는가. */
	const missingEndDate = isRange && endDate === "";
	/** 현재 단위의 사용자 문구. 저장 전에 어떤 양이 들어가는지 설명한다. */
	const selectedUnitLabel = unitLabel(days);

	/** 닫기와 범위 전환은 저장 중이거나 성공 상태일 때 실행하지 않는다. */
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape" && !busy) {
			event.preventDefault();
			onClose();
		}
		trapFocus(event);
	};

	/** 등록 범위를 바꾸는 핸들러. 입력한 날짜와 메모는 그대로 둔다. */
	const handleModeChange = (nextMode: EntryMode) => {
		if (!busy) {
			setMode(nextMode);
		}
	};

	/** 등록 핸들러 — 날짜마다 휴가 기록 1건씩 만들어 붙인다. */
	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		// 저장 중이거나 저장할 날짜가 없으면 같은 조작을 다시 보내지 않는다.
		if (busy || dates.length === 0) {
			return;
		}

		/** 새로 만드는 휴가 기록들. */
		const added = dates.map((date) => ({
			id: crypto.randomUUID(),
			date,
			days,
			note: note.trim(),
		}));
		if (await commit({ entries: [...entries, ...added] })) {
			setCompleted(true);
		}
	};

	/** 날짜 입력 아래에 보여줄 설명. 중복이면 사용자가 바꿀 다음 행동까지 말한다. */
	const dateDescription = duplicateStart
		? startDate === today
			? "오늘은 이미 휴가 기록이 있습니다. 다른 날짜를 선택하세요."
			: `${startDate}에는 이미 휴가 기록이 있습니다. 다른 날짜를 선택하세요.`
		: isRange && dates.length === 0 && !missingEndDate
			? "선택한 기간에는 등록할 수 있는 날이 없습니다."
			: isRange && dates.length > 0
				? `휴가 기록 ${dates.length}건을 ${selectedUnitLabel}로 등록합니다.`
				: startDate
					? `${startDate === today ? "오늘" : startDate} ${selectedUnitLabel} 휴가를 등록합니다.`
					: "날짜를 입력하세요.";

	return (
		<div
			className="pane"
			role="dialog"
			aria-modal="true"
			aria-labelledby="entry-sheet-title"
			aria-busy={busy}
			onKeyDown={handleKeyDown}
		>
			<div className="sheet-head">
				<h2 id="entry-sheet-title" className="sec-title">
					휴가 등록
				</h2>
				<button
					type="button"
					className="mini"
					disabled={busy}
					onClick={onClose}
				>
					닫기
				</button>
			</div>
			<form className="entry-form" onSubmit={handleSubmit}>
				<fieldset className="entry-choice">
					<legend>등록 범위</legend>
					<div className="seg">
						<button
							type="button"
							aria-pressed={!isRange}
							disabled={busy}
							onClick={() => handleModeChange("day")}
						>
							하루
						</button>
						<button
							type="button"
							aria-pressed={isRange}
							disabled={busy}
							onClick={() => handleModeChange("range")}
						>
							기간으로
						</button>
					</div>
				</fieldset>

				<label className="field">
					<span>날짜</span>
					<input
						ref={startDateRef}
						id="entry-start-date"
						type="date"
						value={startDate}
						disabled={busy}
						aria-invalid={duplicateStart}
						aria-describedby={ENTRY_DATE_DESCRIPTION_ID}
						onChange={(event) => setStartDate(event.target.value)}
					/>
					{startDate === today && <small className="entry-today">오늘</small>}
				</label>

				{isRange && (
					<>
						<label className="field">
							<span>종료일</span>
							<input
								type="date"
								value={endDate}
								disabled={busy}
								aria-invalid={missingEndDate}
								aria-describedby={ENTRY_DATE_DESCRIPTION_ID}
								onChange={(event) => setEndDate(event.target.value)}
							/>
						</label>
						<label className="field entry-weekend-field">
							<span>주말 제외</span>
							<input
								className="entry-checkbox"
								type="checkbox"
								checked={excludeWeekends}
								disabled={busy}
								onChange={(event) => setExcludeWeekends(event.target.checked)}
							/>
						</label>
					</>
				)}

				<fieldset className="entry-choice entry-unit-choice">
					<legend>단위</legend>
					<div className="seg">
						{UNITS.map((unit) => (
							<button
								type="button"
								key={unit.days}
								aria-pressed={days === unit.days}
								disabled={busy}
								onClick={() => setDays(unit.days)}
							>
								{unit.label}
							</button>
						))}
					</div>
				</fieldset>

				<label className="field">
					<span>메모</span>
					<input
						type="text"
						value={note}
						disabled={busy}
						onChange={(event) => setNote(event.target.value)}
					/>
				</label>

				<p
					id={ENTRY_DATE_DESCRIPTION_ID}
					className={`entry-status ${duplicateStart ? "entry-status-warning" : "dim"}`}
					role={duplicateStart || dates.length === 0 ? "alert" : "status"}
					aria-live="polite"
				>
					{missingEndDate ? "종료일을 입력하세요." : dateDescription}
				</p>
				{error && !completed && (
					<p className="error" role="alert" aria-live="assertive">
						{error}
					</p>
				)}
				{saving && (
					<p className="entry-status" role="status" aria-live="polite">
						저장 중입니다…
					</p>
				)}
				{completed && (
					<p className="entry-status" role="status" aria-live="polite">
						저장했습니다. 등록면을 닫습니다.
					</p>
				)}

				<div className="cta">
					<button
						type="submit"
						className="primary"
						disabled={busy || dates.length === 0}
					>
						{saving ? "저장 중…" : completed ? "저장됨" : "등록"}
					</button>
					<button type="button" disabled={busy} onClick={onClose}>
						취소
					</button>
				</div>
			</form>
		</div>
	);
}
