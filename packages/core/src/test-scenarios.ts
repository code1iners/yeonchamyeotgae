import { Temporal } from "temporal-polyfill";
import { computeBalance } from "./balance.ts";
import { computeGrants, type Grant } from "./grants.ts";
import type { Adjustment, LeaveEntry, Settings } from "./storage.ts";

/*
 * 검증 케이스를 세우는 공통 도구. 테스트에서만 쓰며 코어의 공개 API(index.ts)로는
 * 나가지 않는다. 계산 seam을 보는 테스트가 둘 이상이라 여기 한 벌만 둔다.
 */

/** 검증 케이스 한 건의 입력 — 스펙 Testing Decisions의 표 한 줄에 그대로 대응한다. */
export type Scenario = {
	/** 입사일. */
	hireDate: string;
	/** 기준방식. */
	grantBasis: Settings["grantBasis"];
	/** 휴가 이력. */
	entries?: LeaveEntry[];
	/** 조정 레코드. */
	adjustments?: Adjustment[];
	/** 조회일. */
	today: string;
};

/** 조회일만 빼둔 시나리오 — 같은 데이터를 여러 조회일로 훑는 케이스가 이것을 편다. */
export type Snapshot = Omit<Scenario, "today">;

/** 시나리오에서 발생 목록을 거쳐 잔여까지 한 번에 낸다(계산 seam 전체). */
export function balanceOf({
	hireDate,
	grantBasis,
	entries = [],
	adjustments = [],
	today,
}: Scenario) {
	/** 설정. */
	const settings: Settings = { hireDate, grantBasis };
	/** 조회일 기준 발생 레코드. */
	const grants = computeGrants({ settings, entries, adjustments, today });
	return computeBalance({ grants, entries, today });
}

/** 연속한 날짜의 휴가 기록 — 하루 1건 불변식대로 하루씩 끊어 만든다. */
export function entriesFrom(
	start: string,
	count: number,
	days = 1,
): LeaveEntry[] {
	/** 만들어진 기록. */
	const entries: LeaveEntry[] = [];
	/** 시작일을 하루씩 밀며 쓰는 커서. */
	let date = start;
	for (let n = 0; n < count; n += 1) {
		entries.push({ id: `entry-${date}`, date, days, note: "" });
		date = nextDate(date);
	}
	return entries;
}

/** YYYY-MM-DD의 다음 날. `entriesFrom`의 커서를 미는 데만 쓴다. */
function nextDate(date: string): string {
	return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}

/** 조정 레코드 1건. */
export function adjustmentOf(
	grantDate: string,
	expiryDate: string,
	days: number,
): Adjustment {
	return {
		id: `adjustment-${grantDate}-${days}`,
		grantDate,
		expiryDate,
		days,
		note: "",
	};
}

/** 발생 레코드 1건 — allocate만 단독으로 볼 때 쓴다. */
export function grantOf(
	grantDate: string,
	expiryDate: string,
	days: number,
	source: Grant["source"] = "annual",
): Grant {
	return { grantDate, source, days, expiryDate };
}
