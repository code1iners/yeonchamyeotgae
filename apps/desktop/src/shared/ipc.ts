import type {
	Adjustment,
	Balance,
	LeaveEntry,
	ParseErrorKind,
	Settings,
} from "@yeoncha/core";

/** preload가 쓰는 IPC 채널 이름. 메인과 preload가 이 상수 하나를 공유한다. */
export const IPC = {
	/** 팝오버 본문 높이 보고(5.6절). */
	CONTENT_HEIGHT: "popover:content-height",
	/** 셸 상태 전체를 한 번 가져온다. */
	GET_STATE: "data:get-state",
	/** 변경을 커밋하고 갱신된 상태를 돌려받는다. */
	COMMIT: "data:commit",
	/** 셸이 상태를 다시 낸 것을 렌더러에 밀어준다(커밋·자정·절전 복귀). */
	STATE_CHANGED: "data:state-changed",
} as const;

/**
 * 저장 파일 읽기 결과(스펙 2절 표).
 *
 * `error`는 **쓰기 차단**을 뜻한다 — 읽지 못한 파일에는 쓰지 않는다. 세 갈래를
 * 하나로 뭉치지 않는 이유는 `future-version`만 복구 버튼을 띄우지 않기 때문이다(23번).
 */
export type ReadState =
	| { status: "ok" }
	| { status: "missing" }
	| { status: "error"; kind: ParseErrorKind };

/** 렌더러가 화면을 그리는 데 필요한 셸 상태 전부. */
export type AppState = {
	/** 저장 파일 읽기 결과. `error`면 팝오버 전체가 오류 화면이 된다(5.5절). */
	read: ReadState;
	/** 조회일. 셸이 만든 `Asia/Seoul` 오늘이며 코어에 넘긴 것과 같은 값이다(7.3절). */
	today: string;
	/** 설정. 파일이 없거나 읽지 못했으면 `null`이고 그것이 곧 입사일 미설정이다. */
	settings: Settings | null;
	/** 휴가 기록. */
	entries: LeaveEntry[];
	/** 조정 레코드. */
	adjustments: Adjustment[];
	/** 잔여와 발생분별 내역. 입사일이 없으면 `null`이고 트레이는 대시를 띄운다. */
	balance: Balance | null;
};

/**
 * 렌더러가 커밋하는 변경. 준 필드만 덮어쓴다.
 *
 * 저장되는 셋(설정 / 휴가 기록 / 조정)이 그대로 세 필드다 — 발생과 배정은 계산
 * 결과이므로 커밋할 것이 없다(2절).
 */
export type LeaveDataChange = {
	/** 설정. 파일이 아직 없을 때는 이 필드가 있어야 파일이 생긴다. */
	settings?: Settings;
	/** 휴가 기록 전체. */
	entries?: LeaveEntry[];
	/** 조정 레코드 전체. */
	adjustments?: Adjustment[];
};
