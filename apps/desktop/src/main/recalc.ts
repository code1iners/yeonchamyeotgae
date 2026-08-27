import { powerMonitor } from "electron";
import { msUntilNextMidnight, todayInSeoul } from "./clock";

/**
 * 시스템 시각·시간대 변경을 알아채는 감시 주기(ms).
 *
 * 이 감시가 필요한 이유는 `setTimeout`이 **단조 시계**로 재기 때문이다 — 사용자가
 * 시스템 날짜를 내일로 넘겨도 예약된 자정 타이머는 원래 남은 실시간만큼 그대로
 * 기다린다. Electron `powerMonitor`에 시각 변경 이벤트가 없으므로 오늘이 바뀌었는지
 * 직접 본다. 한 번에 하는 일은 `PlainDate` 하나를 만들어 문자열을 비교하는 것뿐이다.
 */
const CLOCK_WATCH_MS = 60_000;

/** 예약된 자정 타이머. 다시 걸기 전에 지운다 — 예약은 언제나 한 건이다. */
let midnightTimer: ReturnType<typeof setTimeout> | null = null;
/** 마지막으로 재계산한 KST 날짜. 시각 감시가 이 값과 오늘을 비교한다. */
let lastDate: string | null = null;
/** 재계산 콜백. 트리거가 값을 다시 내는 유일한 통로다. */
let onRecalc: (() => void) | null = null;

/**
 * 잔여가 **바뀌는** 트리거를 건다(4.5절의 2·3번). 1번인 데이터 변경은 커밋이 상태
 * 구독자를 직접 부르므로 여기 없다.
 *
 * `nativeTheme.on('updated')`는 이 축이 아니다 — 저쪽은 같은 값을 다시 그리는 것이고
 * 이쪽은 값이 바뀌는 것이다(6.2절). **섞지 않는다.**
 */
export function startRecalcTriggers(recalc: () => void): void {
	onRecalc = recalc;
	lastDate = todayInSeoul();
	scheduleNextMidnight();

	// 절전 복귀. 며칠 뚜껑을 덮어둔 노트북이 실제 사용 패턴이고, 그동안 예약된
	// 타이머는 함께 잠들어 멈춰 있었다 — 무조건 다시 계산한다(4.5절 3번).
	powerMonitor.on("resume", recalcNow);
	// 잠금 해제. 잠들지 않은 데스크톱도 화면만 잠근 채 며칠이 지날 수 있다.
	powerMonitor.on("unlock-screen", recalcNow);

	setInterval(() => {
		// 오늘이 바뀌었나요? 예약된 타이머가 아직 남아 있어도 값은 이미 틀렸다.
		if (todayInSeoul() !== lastDate) {
			recalcNow();
		}
	}, CLOCK_WATCH_MS);
}

/**
 * 지금 다시 계산하고 다음 자정을 새로 예약한다. **모든 트리거가 이 하나로 모인다** —
 * 예약이 이미 지나갔는지를 트리거마다 따지지 않기 위해서다.
 */
function recalcNow(): void {
	lastDate = todayInSeoul();
	onRecalc?.();
	scheduleNextMidnight();
}

/**
 * 다음 KST 자정에 재계산을 **한 번** 예약한다.
 *
 * 발화하면 `recalcNow`가 이 함수를 다시 부르므로 지연은 매번 새로 계산된다 —
 * `setTimeout(24시간)` 반복은 드리프트가 쌓여 틀린다(4.5절 2번).
 */
function scheduleNextMidnight(): void {
	if (midnightTimer) {
		clearTimeout(midnightTimer);
	}
	midnightTimer = setTimeout(recalcNow, msUntilNextMidnight());
}
