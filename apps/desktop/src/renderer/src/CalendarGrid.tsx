import { useEffect, useRef, useState } from "react";
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
		},
		[initialMonth, month],
	);

	/** 그 달의 1일. 요일과 길이가 여기서 나온다. */
	const first = month.toPlainDate({ day: 1 });
	/** 1일 앞에 두는 빈 칸 수. dayOfWeek는 월 1 · 일 7이라 일요일 시작으로 접는다. */
	const leadingBlanks = first.dayOfWeek % 7;

	return (
		<fieldset className="cal">
			<legend className="sr-only">달력</legend>
			<div className="cal-nav">
				<button
					type="button"
					className="mini"
					aria-label="이전 달"
					onClick={() => {
						userNavigatedRef.current = true;
						setMonth(month.subtract({ months: 1 }));
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
						userNavigatedRef.current = true;
						setMonth(month.add({ months: 1 }));
					}}
				>
					›
				</button>
			</div>
			<div className="cal-grid">
				{DOW_LABELS.map((label) => (
					<span className="cal-dow dim" key={label}>
						{label}
					</span>
				))}
				{Array.from({ length: leadingBlanks }, (_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: 빈 칸은 내용이 없어 자리 그 자체가 정체성이다.
					<span key={`blank-${index}`} />
				))}
				{Array.from({ length: month.daysInMonth }, (_, index) => {
					/** 이 칸의 날짜. */
					const date = first.add({ days: index }).toString();
					/** 이 칸의 장식. */
					const decoration = decorate?.(date);
					return (
						<button
							type="button"
							key={date}
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
							disabled={decoration?.disabled}
							onClick={() => onPick(date)}
						>
							{index + 1}
						</button>
					);
				})}
			</div>
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
