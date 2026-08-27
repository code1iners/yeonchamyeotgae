import type { LeaveEntry } from "@yeoncha/core";
import { useState } from "react";
import { CalendarGrid } from "./CalendarGrid";
import { expandEntryDates } from "./entry-dates";
import { useCommit } from "./use-commit";

type Props = {
	/** 저장된 휴가 기록 전부. 중복 차단과 커밋할 배열이 여기서 나온다. */
	entries: LeaveEntry[];
	/** 조회일. 처음 펼칠 달이자 달력의 오늘 표시다. */
	today: string;
	/** 시트를 닫는다 — 등록을 마쳤거나 그만뒀거나 같은 문이다. */
	onClose: () => void;
};

/**
 * 시트가 서 있는 자리(스펙 5.2절의 흐름).
 *
 * `detail`의 `end`가 `null`이면 하루 등록이다 — 날짜 한 번에 확정되는 흔한 쪽이고,
 * 기간은 `[기간으로]`가 `pick-end`를 거쳐 `end`를 채운다.
 */
type Step =
	| { kind: "pick-start" }
	| { kind: "pick-end"; start: string }
	| { kind: "detail"; start: string; end: string | null };

/** 단위 선택지(스펙 3.9절). 열거형이 아니라 소수 일수로 저장한다. */
const UNITS = [
	{ label: "종일", days: 1 },
	{ label: "반차", days: 0.5 },
	{ label: "반반차", days: 0.25 },
] as const;

/**
 * 휴가 등록 시트 — 팝오버를 덮는 모드 전환이다(스펙 5.2절). 하루가 3클릭, 기간이
 * 5클릭이 되도록 날짜 한 번 클릭이 그 하루를 확정한다.
 *
 * `[오늘]`·`[내일]` 바로가기와 끌어서 기간 지정은 **의도적으로 없다** — 진입은 달력
 * 하나이고, 380px 팝오버의 셀 드래그는 오조작을 만든다.
 */
export function LeaveEntrySheet({ entries, today, onClose }: Props) {
	/** 지금 서 있는 단계. */
	const [step, setStep] = useState<Step>({ kind: "pick-start" });
	/** 고른 단위. 흔한 쪽이 기본이라 종일이다. */
	const [days, setDays] = useState<number>(1);
	/** 메모. 선택이다. */
	const [note, setNote] = useState("");
	/** 기간에서 토·일을 뺄 것인가. 기본 켜짐이다(스펙 5.2절). */
	const [excludeWeekends, setExcludeWeekends] = useState(true);
	/** 셸에 변경을 커밋하는 통로 — 진행 중 잠금과 실패 문구가 함께 온다. */
	const { commit, saving, error } = useCommit();

	/** 이미 휴가 기록이 있는 날짜들. 달력에서 비활성이고 기간 펼치기에서도 빠진다. */
	const taken = new Set(entries.map((entry) => entry.date));

	// 날짜를 고르는 단계인가요? 시트의 본문이 달력 하나로 바뀐다.
	if (step.kind !== "detail") {
		/** 종료일을 고르는 중이면 그 시작일. */
		const start = step.kind === "pick-end" ? step.start : null;
		return (
			<div className="pane sheet">
				<SheetHead onClose={onClose} />
				<p className="cal-hint dim">
					{start ? "종료일을 고르세요" : "휴가 날짜를 고르세요"}
					{/* 잘못 눌러 들어온 사람의 문 — 없으면 시트를 닫고 3클릭을 처음부터 다시 밟는다. */}
					{start && (
						<button
							type="button"
							className="mini"
							onClick={() => setStep({ kind: "detail", start, end: null })}
						>
							하루로
						</button>
					)}
				</p>
				<CalendarGrid
					today={today}
					initialMonth={start ?? today}
					decorate={(date) => ({
						disabled: taken.has(date),
						selected: date === start,
					})}
					onPick={(date) =>
						setStep(
							// 종료일이 시작일과 같으면 하루 등록으로 접는다 — 그날을 집어 고른
							// 것이므로 기간에만 있는 주말 제외가 그 하루를 지우면 안 된다.
							start && date !== start
								? { kind: "detail", start, end: date }
								: { kind: "detail", start: start ?? date, end: null },
						)
					}
				/>
			</div>
		);
	}

	/** 기간 등록인가. 주말 제외와 건수 미리보기가 기간에만 붙는다. */
	const isRange = step.end !== null;

	/**
	 * 저장될 날짜들. 하루 1건씩이며 기간 레코드가 아니다(스펙 3.9절). 주말 제외는
	 * 기간에만 있는 선택지라 하루 등록에는 적용하지 않는다 — 그날을 집어 고른 사람이
	 * 토요일을 골랐다면 그 토요일이 맞다.
	 */
	const dates = expandEntryDates({
		start: step.start,
		end: step.end ?? step.start,
		excludeWeekends: isRange && excludeWeekends,
		taken,
	});

	/** 등록 핸들러 — 날짜마다 휴가 기록 1건씩 만들어 붙인다. */
	const handleSubmit = async () => {
		/** 새로 만드는 휴가 기록들. */
		const added = dates.map((date) => ({
			id: crypto.randomUUID(),
			date,
			days,
			note: note.trim(),
		}));
		if (await commit({ entries: [...entries, ...added] })) {
			onClose();
		}
	};

	return (
		<div className="pane sheet">
			<SheetHead onClose={onClose} />
			<div className="row">
				<b className="num">
					{isRange ? `${step.start} ~ ${step.end}` : step.start}
				</b>
				{!isRange && (
					<button
						type="button"
						className="mini"
						onClick={() => setStep({ kind: "pick-end", start: step.start })}
					>
						기간으로
					</button>
				)}
			</div>
			<div className="field">
				<span>단위</span>
				<div className="seg">
					{UNITS.map((unit) => (
						<button
							type="button"
							key={unit.days}
							aria-pressed={days === unit.days}
							onClick={() => setDays(unit.days)}
						>
							{unit.label}
						</button>
					))}
				</div>
			</div>
			<label className="field">
				<span>메모</span>
				<input
					type="text"
					value={note}
					onChange={(event) => setNote(event.target.value)}
				/>
			</label>
			{isRange && (
				<>
					<label className="field">
						<span>주말 제외</span>
						<input
							type="checkbox"
							checked={excludeWeekends}
							onChange={(event) => setExcludeWeekends(event.target.checked)}
						/>
					</label>
					{/* 며칠이 만들어지는지 등록 전에 보인다 — 주말·기존 기록이 빠진 결과가 여기 있다. */}
					<div className="row dim">
						{dates.length > 0
							? `휴가 기록 ${dates.length}건을 만듭니다`
							: "선택한 기간에 등록할 날이 없습니다"}
					</div>
				</>
			)}
			{error && <p className="error">{error}</p>}
			<div className="cta">
				<button
					type="button"
					className="primary"
					disabled={saving || dates.length === 0}
					onClick={handleSubmit}
				>
					등록
				</button>
				<button type="button" disabled={saving} onClick={onClose}>
					취소
				</button>
			</div>
		</div>
	);
}

/** 시트 머리 — 제목과 닫기. 어느 단계에서든 같은 문으로 나간다. */
function SheetHead({ onClose }: { onClose: () => void }) {
	return (
		<div className="sheet-head">
			<span className="sec-title">휴가 등록</span>
			<button type="button" className="mini" onClick={onClose}>
				닫기
			</button>
		</div>
	);
}
