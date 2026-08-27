import {
	APP_SCHEMA_VERSION,
	computeBalance,
	computeGrants,
	type LeaveData,
} from "@yeoncha/core";
import { Temporal } from "temporal-polyfill";
import type { AppState, LeaveDataChange, ReadState } from "../shared/ipc";
import { readDataFile, writeDataFile } from "./data-file";

/** 저장 파일 읽기 상태. 쓰기 차단 여부가 여기서 나온다. */
let readState: ReadState = { status: "missing" };
/** 읽어낸 저장 데이터. 파일이 없거나 읽지 못했으면 `null`이다. */
let leaveData: LeaveData | null = null;
/** 상태가 바뀔 때 부를 구독자. 트레이 갱신과 렌더러 푸시가 이 하나를 탄다. */
let stateListener: ((state: AppState) => void) | null = null;

/**
 * 코어에 넘기는 **"오늘"**. 고정 `Asia/Seoul`이고 셸에서 이 함수 하나가 만든다(7.3절).
 *
 * 설정값으로 빼지 않는다 — 로컬 시간대를 쓰면 해외에 있는 폰의 v2 PWA와 집의
 * 데스크톱이 같은 파일에서 하루 다른 잔여를 띄운다.
 */
function todayInSeoul(): string {
	return Temporal.Now.plainDateISO("Asia/Seoul").toString();
}

/** 저장 파일을 읽어 상태를 세운다. 부팅과 백업 복구(23번)가 부른다. */
export function loadStore(): void {
	/** 파일 읽기 결과. */
	const { read, data } = readDataFile();
	readState = read;
	leaveData = data;
}

/**
 * 트레이와 렌더러가 보는 상태 전부.
 *
 * 잔여는 저장하지 않고 부를 때마다 오늘 기준으로 다시 낸다 — 계산이 순수 함수라
 * 재계산이 싸고, 캐시를 두면 자정을 넘긴 값이 남는 자리가 하나 더 생긴다(4.5절).
 */
export function getState(): AppState {
	/** 조회일. */
	const today = todayInSeoul();

	// 입사일이 없나요? 계산할 것이 없고 트레이는 대시를 띄운다.
	if (!leaveData) {
		return {
			read: readState,
			today,
			settings: null,
			entries: [],
			adjustments: [],
			balance: null,
		};
	}

	/** 저장된 셋 — 설정 / 휴가 기록 / 조정. */
	const { settings, entries, adjustments } = leaveData;
	/** 조회일까지의 발생 레코드. */
	const grants = computeGrants({ settings, entries, adjustments, today });

	return {
		read: readState,
		today,
		settings,
		entries,
		adjustments,
		balance: computeBalance({ grants, entries, today }),
	};
}

/** 쓰기가 막혀 있나 — **읽지 못한 파일에는 쓰지 않는다**(스펙 2절). */
export function isWriteBlocked(): boolean {
	return readState.status === "error";
}

/**
 * 변경을 커밋한다 — 준 필드만 덮어쓰고 즉시 원자적으로 쓴다(스펙 2절).
 *
 * 파일이 없으면 이 커밋이 파일을 만든다. 첫 실행에 미리 만들지 않으므로, 입사일
 * 없이 부른 첫 커밋은 만들 파일이 없다.
 */
export function commit(change: LeaveDataChange): AppState {
	// 읽지 못한 파일인가요? 사용자가 오류 화면에서 고를 때까지 쓰지 않는다.
	if (isWriteBlocked()) {
		throw new Error("읽지 못한 저장 파일에는 쓰지 않는다");
	}

	/** 덮어쓸 바탕 — 파일이 아직 없으면 이 커밋의 설정으로 새로 만든다. */
	const base = leaveData ?? emptyData(change.settings);

	/** 쓸 데이터. */
	const next: LeaveData = {
		// 언제나 앱이 아는 버전으로 쓴다. 읽기가 미래 버전을 이미 막았다.
		schemaVersion: APP_SCHEMA_VERSION,
		settings: change.settings ?? base.settings,
		entries: change.entries ?? base.entries,
		adjustments: change.adjustments ?? base.adjustments,
	};

	writeDataFile(next);
	leaveData = next;
	readState = { status: "ok" };

	/** 갱신된 상태. */
	const state = getState();
	stateListener?.(state);
	return state;
}

/** 상태 변경을 받을 구독자를 건다. 셸에 구독자는 하나뿐이다. */
export function setStateListener(listener: (state: AppState) => void): void {
	stateListener = listener;
}

/** 파일이 없을 때의 바탕 데이터. 입사일이 없으면 만들 파일이 없다. */
function emptyData(settings: LeaveDataChange["settings"]): LeaveData {
	if (!settings) {
		throw new Error("입사일 없이 저장 파일을 만들지 않는다");
	}
	return {
		schemaVersion: APP_SCHEMA_VERSION,
		settings,
		entries: [],
		adjustments: [],
	};
}
