import { Temporal } from "temporal-polyfill";

/**
 * 기간을 휴가 기록이 될 날짜들로 펼친다 — **기간은 UI가 하루 1건씩 펼쳐 넣는다**(스펙 3.9절).
 * 기간 레코드를 만들지 않으므로 저장 직전의 모양이 여기서 정해진다.
 *
 * 이미 기록이 있는 날짜는 뺀다 — 하루 1건 불변식을 UI가 지키는 자리다(파서는 중복
 * date를 구조 위반으로 거부한다). 시작일보다 이른 종료일은 빈 배열로 돌려준다 —
 * 호출자가 입력 오류를 표시하고 등록을 막을 수 있게, 사용자의 두 날짜를 자동으로
 * 바꾸지 않는다.
 */
export function expandEntryDates({
	start,
	end,
	excludeWeekends,
	taken,
}: {
	/** 시작일. YYYY-MM-DD. */
	start: string;
	/** 종료일. YYYY-MM-DD. 시작일보다 앞이어도 된다. */
	end: string;
	/** 토·일을 뺄 것인가. 기간 등록의 기본값은 켜짐이다(스펙 5.2절). */
	excludeWeekends: boolean;
	/** 이미 휴가 기록이 있는 날짜들. */
	taken: ReadonlySet<string>;
}): string[] {
	/** 고른 두 날. 아직 순서를 모른다. */
	const picked = Temporal.PlainDate.from(start);
	const other = Temporal.PlainDate.from(end);
	// 종료일이 시작일보다 이른가요? 잘못된 의도를 다른 기간으로 바꾸지 않는다.
	if (Temporal.PlainDate.compare(picked, other) > 0) {
		return [];
	}

	/** 정상 순서로 입력된 기간의 시작일. */
	const first = picked;
	/** 정상 순서로 입력된 기간의 종료일. */
	const last = other;

	/** 펼쳐진 날짜들. */
	const dates: string[] = [];
	for (
		let date = first;
		Temporal.PlainDate.compare(date, last) <= 0;
		date = date.add({ days: 1 })
	) {
		// 주말인가요? dayOfWeek는 ISO 기준으로 월요일 1 · 일요일 7이다.
		if (excludeWeekends && date.dayOfWeek >= 6) {
			continue;
		}
		// 그날 이미 기록이 있나요?
		if (taken.has(date.toString())) {
			continue;
		}
		dates.push(date.toString());
	}
	return dates;
}
