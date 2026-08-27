import {
	APP_SCHEMA_VERSION,
	computeBalance,
	computeGrants,
	type LeaveData,
} from "@yeoncha/core";
import type {
	AppState,
	HireDateDrop,
	LeaveDataChange,
	ReadState,
} from "../shared/ipc";
import { todayInSeoul } from "./clock";
import {
	backupDataFile,
	readDataFile,
	restoreBackupFile,
	writeDataFile,
} from "./data-file";

/** 저장 파일 읽기 상태. 쓰기 차단 여부가 여기서 나온다. */
let readState: ReadState = { status: "missing" };
/** 읽어낸 저장 데이터. 파일이 없거나 읽지 못했으면 `null`이다. */
let leaveData: LeaveData | null = null;
/** 상태가 바뀔 때 부를 구독자. 트레이 갱신과 렌더러 푸시가 이 하나를 탄다. */
let stateListener: ((state: AppState) => void) | null = null;

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

	return write({
		settings: change.settings ?? base.settings,
		entries: change.entries ?? base.entries,
		adjustments: change.adjustments ?? base.adjustments,
	});
}

/**
 * 입사일 변경에 따른 기록 삭제 — **지우기 직전에 백업을 남긴다**(2절·5.4절).
 *
 * 지울지는 사용자가 골랐고(거절할 수 있다), 남길 것을 화면이 이미 갈라 보냈다.
 * 셸이 하는 일은 백업을 남기고 그 결과를 쓰는 것까지다.
 */
export function dropRecordsBeforeHireDate(change: HireDateDrop): AppState {
	// 읽지 못한 파일인가요? 백업이 깨진 원본을 덮게 되므로 여기서 멈춘다.
	if (isWriteBlocked()) {
		throw new Error("읽지 못한 저장 파일에는 쓰지 않는다");
	}

	backupDataFile();
	return write(change);
}

/**
 * 가져온 데이터로 **전체를 교체한다**(23번). 직전에 백업을 남긴다(2절).
 *
 * 병합하지 않는다 — 실제 용도 둘(기기 옮기기, v2 이관)이 모두 통째로 옮기는 것이고,
 * 충돌 규칙을 사용자가 판단할 근거가 화면에 없다. 화면이 "지금 데이터가 대체됩니다"를
 * 먼저 말하는 것이 그래서 이 함수의 전제다.
 */
export function importData(data: LeaveData): AppState {
	// 읽지 못한 파일인가요? 백업이 깨진 원본을 덮게 되므로 여기서 멈춘다.
	if (isWriteBlocked()) {
		throw new Error("읽지 못한 저장 파일에는 쓰지 않는다");
	}

	backupDataFile();
	return write(data);
}

/**
 * `data.json.bak`을 되돌리고 상태를 다시 세운다(23번의 `[백업에서 복구]`).
 *
 * **쓰기 차단을 지나 파일을 건드리는 유일한 경로다.** 차단이 막으려는 것은 "읽지
 * 못한 파일을 조용히 덮어쓰는 것"이고, 이 버튼은 사용자가 오류 화면에서 직접
 * 고른 것이다 — 2절이 말하는 "고를 때까지 쓰지 않는다"의 그 선택이다.
 */
export function restoreBackup(): AppState {
	restoreBackupFile();
	loadStore();
	return publish();
}

/** 상태 변경을 받을 구독자를 건다. 셸에 구독자는 하나뿐이다. */
export function setStateListener(listener: (state: AppState) => void): void {
	stateListener = listener;
}

/**
 * 저장할 셋을 파일에 쓰고 상태를 갈아끼운다. 파일에 쓰는 자리는 전부 이것을 지난다.
 *
 * `schemaVersion`은 여기서 붙인다 — **언제나 앱이 아는 버전으로 쓴다.** 읽기가
 * 미래 버전을 이미 막았고, 가져온 파일의 버전이 낮아도 다음 저장은 지금 버전이다.
 */
function write(data: Omit<LeaveData, "schemaVersion">): AppState {
	/** 쓸 데이터. */
	const next: LeaveData = { ...data, schemaVersion: APP_SCHEMA_VERSION };
	writeDataFile(next);
	leaveData = next;
	readState = { status: "ok" };
	return publish();
}

/** 갱신된 상태를 내고 구독자에게도 밀어준다. 상태가 바뀌는 자리는 전부 이것을 지난다. */
function publish(): AppState {
	/** 갱신된 상태. */
	const state = getState();
	stateListener?.(state);
	return state;
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
