import { Temporal } from "temporal-polyfill";

/** 날짜를 달력 상태가 사용하는 `YYYY-MM` 월 키로 바꾼다. */
export function calendarMonthKey(date: string): string {
	return Temporal.PlainDate.from(date).toPlainYearMonth().toString();
}

/** 사용자가 달력을 움직이지 않았다면 상태 push의 새 오늘 월을 따른다. */
export function syncCalendarMonth({
	currentMonth,
	today,
	userNavigated,
}: {
	/** 현재 달력에 펼쳐진 월. */
	currentMonth: string;
	/** 셸이 새로 밀어준 오늘. */
	today: string;
	/** 사용자가 이전·다음 달을 직접 눌렀는가. */
	userNavigated: boolean;
}): string {
	return userNavigated ? currentMonth : calendarMonthKey(today);
}
