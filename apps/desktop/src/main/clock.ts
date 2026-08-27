import { Temporal } from "temporal-polyfill";

/**
 * 잔여가 걸려 있는 시간대. **고정 `Asia/Seoul`이고 설정값으로 빼지 않는다**(7.3절) —
 * 로컬 시간대를 쓰면 해외에 있는 폰의 v2 PWA와 집의 데스크톱이 같은 파일에서 하루
 * 다른 잔여를 띄운다. 자정 타이머도 이 시간대의 자정에 건다(4.5절).
 */
const ZONE = "Asia/Seoul";

/** 코어에 넘기는 **"오늘"**. 셸에서 이 함수 하나가 만든다(7.3절). */
export function todayInSeoul(): string {
	return Temporal.Now.plainDateISO(ZONE).toString();
}

/**
 * 다음 KST 자정까지 남은 밀리초.
 *
 * **하루를 상수로 적지 않는다** — 자정 간격은 시간대·서머타임 변경으로 24시간이
 * 아닐 수 있고, `startOfDay()`가 그 하루를 시간대에게 직접 물어보는 자리다(4.5절 2번).
 * KST는 서머타임이 없지만 그 사실에 기대면 이 함수가 시간대를 바꾸는 순간 틀린다.
 */
export function msUntilNextMidnight(): number {
	/** 지금(KST). */
	const now = Temporal.Now.zonedDateTimeISO(ZONE);
	/** 다음 자정 — 그 시간대에 자정이 없는 날이면 그날의 첫 순간이다. */
	const nextMidnight = now.add({ days: 1 }).startOfDay();
	return nextMidnight.epochMilliseconds - now.epochMilliseconds;
}
