import { useState } from "react";
import { Temporal } from "temporal-polyfill";

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

	/** 그 달의 1일. 요일과 길이가 여기서 나온다. */
	const first = month.toPlainDate({ day: 1 });
	/** 1일 앞에 두는 빈 칸 수. dayOfWeek는 월 1 · 일 7이라 일요일 시작으로 접는다. */
	const leadingBlanks = first.dayOfWeek % 7;

	return (
		<div className="cal">
			<div className="cal-nav">
				<button
					type="button"
					className="mini"
					aria-label="이전 달"
					onClick={() => setMonth(month.subtract({ months: 1 }))}
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
					onClick={() => setMonth(month.add({ months: 1 }))}
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
					const mark = decorate?.(date);
					return (
						<button
							type="button"
							key={date}
							className={[
								"cal-day num",
								date === today ? "cal-today" : "",
								mark?.selected ? "cal-selected" : "",
								mark?.dot ? `cal-dot-${mark.dot}` : "",
								mark?.expired ? "cal-expired" : "",
							].join(" ")}
							disabled={mark?.disabled}
							onClick={() => onPick(date)}
						>
							{index + 1}
						</button>
					);
				})}
			</div>
		</div>
	);
}
