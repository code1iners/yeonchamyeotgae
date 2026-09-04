import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { syncCalendarMonth } from "./calendar-state";

/**
 * 달력 한 칸에 얹는 장식. 등록 시트(25번)는 선택·비활성만 쓰고, 이력 달력(26번)이
 * 예정·사용 점과 소멸 밑줄을 이 틈으로 넣는다.
 */
export type DayDecoration = {
	/** 누를 수 없는 날. 이미 휴가 기록이 있는 날짜가 여기로 온다. */
	disabled?: boolean;
	/** 고른 날로 표시한다. 종료일을 고르는 동안의 시작일이 여기로 온다. */
	selected?: boolean;
	/** 숫자 아래의 점 — 그날 휴가 기록이 예정(녹색)인지 사용(회색)인지(5.3절). */
	dot?: "planned" | "used";
	/** 숫자 아래의 빨간 밑줄 — 그날 미사용분이 소멸했다(5.7절). */
	expired?: boolean;
};

type Props = {
	/** 조회일. 그날 칸에 오늘 표시가 붙는다. */
	today: string;
	/** 처음 펼칠 달을 정하는 날짜. YYYY-MM-DD. */
	initialMonth: string;
	/** 날짜 칸을 눌렀을 때. YYYY-MM-DD를 받는다. */
	onPick: (date: string) => void;
	/** 칸별 장식. 없으면 모든 칸이 맨 칸이다. */
	decorate?: (date: string) => DayDecoration | undefined;
};

/** 요일 머리 행. 일요일 시작이다. */
const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 월 달력 격자 — 등록 시트(25번)와 이력 달력(26번)이 같이 쓴다.
 *
 * 달력 계산은 코어의 seam이 아니다(스펙 7.7절) — 1일의 요일, 그 달의 길이, 월 이동이
 * 전부 `Temporal.PlainDate`의 속성이라 여기서 직접 얻는다.
 */
export function CalendarGrid({ today, initialMonth, onPick, decorate }: Props) {
	/** 지금 펼쳐진 달. */
	const [month, setMonth] = useState(() =>
		Temporal.PlainDate.from(initialMonth).toPlainYearMonth(),
	);
	/** 사용자가 이전·다음 달을 직접 움직였는지. 상태 push 때 기본 월 복귀 여부를 가른다. */
	const userNavigatedRef = useRef(false);
	/** 달력 안에서 유일하게 Tab으로 진입할 날짜. */
	const [rovingDate, setRovingDate] = useState(initialMonth);
	/** 날짜별 실제 버튼. 방향키가 달을 넘을 때 다음 렌더 뒤 포커스하는 데 쓴다. */
	const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	/** 달을 바꾸는 키 입력 뒤 포커스를 받을 날짜. */
	const pendingFocusRef = useRef<string | null>(null);

	useEffect(
		function syncCalendarTodayMonthEffect() {
			/** 현재 월의 문자열 표현. 순수 상태 판정과 Temporal 값을 연결한다. */
			const currentMonth = month.toString();
			/** 상태 push 뒤에도 따라가야 할 월. 사용자의 명시적 탐색은 보존한다. */
			const nextMonth = syncCalendarMonth({
				currentMonth,
				today: initialMonth,
				userNavigated: userNavigatedRef.current,
			});
			if (nextMonth !== currentMonth) {
				setMonth(Temporal.PlainYearMonth.from(nextMonth));
			}
			if (!userNavigatedRef.current) {
				setRovingDate(initialMonth);
			}
		},
		[initialMonth, month],
	);

	useEffect(function focusPendingCalendarDayEffect() {
		/** 달 이동 렌더가 끝난 뒤 실제로 생긴 목표 버튼. */
		const pendingDate = pendingFocusRef.current;
		if (!pendingDate) {
			return;
		}
		/** 새 달에 렌더된 목표 날짜 버튼. */
		const target = dayButtonRefs.current.get(pendingDate);
		if (!target) {
			return;
		}
		pendingFocusRef.current = null;
		target.focus();
	});

	/** 그 달의 1일. 요일과 길이가 여기서 나온다. */
	const first = month.toPlainDate({ day: 1 });
	/** 1일 앞에 두는 빈 칸 수. dayOfWeek는 월 1 · 일 7이라 일요일 시작으로 접는다. */
	const leadingBlanks = first.dayOfWeek % 7;
	/** 마지막 주를 7칸으로 채우기 위한 뒤쪽 빈 칸 수. */
	const trailingBlanks = (7 - ((leadingBlanks + month.daysInMonth) % 7)) % 7;
	/** 날짜와 앞뒤 빈 칸을 포함한 달력 셀. */
	const cells: Array<string | null> = [
		...Array.from({ length: leadingBlanks }, () => null),
		...Array.from({ length: month.daysInMonth }, (_, index) =>
			first.add({ days: index }).toString(),
		),
		...Array.from({ length: trailingBlanks }, () => null),
	];
	/** 7일씩 끊은 달력 주. */
	const weeks = Array.from({ length: cells.length / 7 }, (_, index) =>
		cells.slice(index * 7, index * 7 + 7),
	);
	/** 현재 달에서 Tab 정지점으로 삼을 날짜. */
	const tabStopDate = rovingDate.startsWith(`${month.toString()}-`)
		? rovingDate
		: first.toString();

	/** 달 이동 버튼이 현재 날짜 위치를 최대한 보존해 다음 달을 연다. */
	const handleMoveMonth = (months: number) => {
		/** 현재 달 안의 roving 날짜 또는 그 달의 첫날. */
		const source = rovingDate.startsWith(`${month.toString()}-`)
			? Temporal.PlainDate.from(rovingDate)
			: first;
		/** 월말을 넘으면 Temporal의 constrain 규칙으로 새 달의 마지막 날에 맞춘다. */
		const target = source.add({ months });
		userNavigatedRef.current = true;
		setRovingDate(target.toString());
		setMonth(target.toPlainYearMonth());
	};

	/** 날짜 하나에서 방향키·Home·End·PageUp·PageDown 이동을 처리한다. */
	const handleDayKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		date: string,
	) => {
		/** 키 이동의 출발 날짜. */
		const current = Temporal.PlainDate.from(date);
		/** 일요일 시작 주에서의 열 위치. */
		const column = current.dayOfWeek % 7;
		/** 키가 가리키는 다음 날짜. 지원하지 않는 키면 그대로 둔다. */
		let target: Temporal.PlainDate | null = null;
		switch (event.key) {
			case "ArrowLeft":
				target = current.subtract({ days: 1 });
				break;
			case "ArrowRight":
				target = current.add({ days: 1 });
				break;
			case "ArrowUp":
				target = current.subtract({ days: 7 });
				break;
			case "ArrowDown":
				target = current.add({ days: 7 });
				break;
			case "Home":
				target = current.subtract({ days: column });
				break;
			case "End":
				target = current.add({ days: 6 - column });
				break;
			case "PageUp":
				target = current.subtract({ months: 1 });
				break;
			case "PageDown":
				target = current.add({ months: 1 });
				break;
			default:
				return;
		}

		event.preventDefault();
		/** 다음 렌더에서 찾아 포커스할 날짜 문자열. */
		const targetDate = target.toString();
		userNavigatedRef.current = true;
		pendingFocusRef.current = targetDate;
		setRovingDate(targetDate);
		setMonth(target.toPlainYearMonth());
	};

	return (
		<fieldset className="cal">
			<legend className="sr-only">달력</legend>
			<div className="cal-nav">
				<button
					type="button"
					className="mini"
					aria-label="이전 달"
					onClick={() => {
						handleMoveMonth(-1);
					}}
				>
					‹
				</button>
				<span className="cal-title num">
					{month.year}년 {month.month}월
				</span>
				<button
					type="button"
					className="mini"
					aria-label="다음 달"
					onClick={() => {
						handleMoveMonth(1);
					}}
				>
					›
				</button>
			</div>
			<table className="cal-grid">
				<caption className="sr-only">
					{month.year}년 {month.month}월 달력
				</caption>
				<thead>
					<tr className="cal-grid-row">
						{DOW_LABELS.map((label) => (
							<th className="cal-dow dim" scope="col" key={label}>
								{label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{weeks.map((week, weekIndex) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: 주의 위치가 달력 격자 안에서의 정체성이다.
						<tr className="cal-grid-row" key={weekIndex}>
							{week.map((date, dayIndex) => {
								if (!date) {
									return (
										<td
											// biome-ignore lint/suspicious/noArrayIndexKey: 빈 칸은 날짜가 없어 열 위치가 정체성이다.
											key={`blank-${dayIndex}`}
										/>
									);
								}
								/** 이 칸의 장식. */
								const decoration = decorate?.(date);
								return (
									<td key={date}>
										<button
											ref={(element) => {
												if (element) {
													dayButtonRefs.current.set(date, element);
												} else {
													dayButtonRefs.current.delete(date);
												}
											}}
											type="button"
											className={[
												"cal-day num",
												date === today ? "cal-today" : "",
												decoration?.selected ? "cal-selected" : "",
												decoration?.dot ? `cal-dot-${decoration.dot}` : "",
												decoration?.expired ? "cal-expired" : "",
											].join(" ")}
											aria-label={calendarDayLabel(date, today, decoration)}
											aria-current={date === today ? "date" : undefined}
											aria-pressed={decoration?.selected ?? false}
											tabIndex={date === tabStopDate ? 0 : -1}
											disabled={decoration?.disabled}
											onFocus={() => setRovingDate(date)}
											onKeyDown={(event) => handleDayKeyDown(event, date)}
											onClick={() => {
												setRovingDate(date);
												onPick(date);
											}}
										>
											{Temporal.PlainDate.from(date).day}
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</fieldset>
	);
}

/** 달력 날짜의 상태를 색과 독립적으로 읽어 주는 접근 가능한 이름. */
function calendarDayLabel(
	date: string,
	today: string,
	mark: DayDecoration | undefined,
): string {
	/** 날짜 셀에서 함께 안내할 상태 문구. */
	const statuses: string[] = [];
	if (date === today) {
		statuses.push("오늘");
	}
	if (mark?.dot === "planned") {
		statuses.push("예정");
	}
	if (mark?.dot === "used") {
		statuses.push("사용");
	}
	if (mark?.expired) {
		statuses.push("소멸일");
	}
	if (mark?.selected) {
		statuses.push("선택됨");
	}
	if (mark?.disabled) {
		statuses.push("선택할 수 없음");
	}

	return statuses.length > 0 ? `${date}, ${statuses.join(", ")}` : date;
}
