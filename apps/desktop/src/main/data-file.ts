import { readFileSync } from "node:fs";
import path from "node:path";
import { type LeaveData, ParseError, parse, serialize } from "@yeoncha/core";
import { app } from "electron";
import type { ReadState } from "../shared/ipc";
import { writeFileAtomic } from "./atomic-write";

/** 저장 파일 이름. */
const DATA_FILE = "data.json";
/** 백업 파일 이름 — 파괴적 조작 직전에만 생긴다. */
const BACKUP_FILE = "data.json.bak";

/** 파일 읽기 결과 — 읽기 상태와, 성공했을 때의 데이터. */
export type ReadResult = {
	/** 읽기 상태. `ok`가 아니면 `data`는 `null`이다. */
	read: ReadState;
	/** 읽어낸 저장 데이터. */
	data: LeaveData | null;
};

/**
 * 저장 파일 경로. `app.getPath('userData')` 고정이다(스펙 2절).
 *
 * 경로를 설정값으로 열지 않는다 — 열면 클라우드 동기화(Out of Scope)를 뒷문으로
 * 끌고 들어온다. 직접 열어보고 싶은 요구는 `[파일 위치 열기]`가 채운다(23번).
 */
export function dataFilePath(): string {
	return path.join(app.getPath("userData"), DATA_FILE);
}

/** 백업 파일 경로. */
export function backupFilePath(): string {
	return path.join(app.getPath("userData"), BACKUP_FILE);
}

/**
 * 저장 파일을 읽어 구조를 판정한다(스펙 2절 표).
 *
 * **파일이 없으면 만들지 않는다.** 파일 없음 = 입사일 없음이고, 그래서 코어에서
 * `hireDate`는 언제나 날짜다. 입사일을 처음 저장할 때 파일이 생긴다.
 */
export function readDataFile(): ReadResult {
	/** 저장 파일 원문. 파일이 없으면 `null`이다. */
	let raw: string | null;
	try {
		raw = readRaw(dataFilePath());
	} catch {
		// 파일은 있는데 읽지 못했다(권한 등). 스펙 2절 표에 없는 갈래라 깨진 파일과
		// 같이 다룬다 — 처리(쓰기 차단 + 복구 경로 제안)가 같고, 부팅 중에 죽는
		// 것보다 낫다.
		return { read: { status: "error", kind: "invalid-json" }, data: null };
	}

	// 파일이 없나요? 첫 실행이다.
	if (raw === null) {
		return { read: { status: "missing" }, data: null };
	}

	try {
		return { read: { status: "ok" }, data: parse(raw) };
	} catch (error) {
		// 코어가 판정한 세 갈래를 그대로 싣는다. 셸은 갈래를 만들지 않는다.
		if (error instanceof ParseError) {
			return { read: { status: "error", kind: error.kind }, data: null };
		}
		throw error;
	}
}

/**
 * 저장 파일에 쓴다 — **변경마다 즉시, 원자적으로**(스펙 2절). 디바운스하지 않는다.
 *
 * 수십 KB를 하루 몇 번 쓰는데 지연을 두면 "앱이 죽으면 마지막 몇 초를 잃는다"만
 * 새로 만든다. 부를 자격(읽지 못한 파일에는 쓰지 않는다)은 `store`가 판정한다.
 *
 * **쓰기 전에 자기가 쓴 원문을 파서에 태운다.** 타입이 막지 못하는 구조 위반이
 * 하나 남아 있기 때문이다 — `entries`의 중복 `date`(하루 1건 불변식)다. 그대로
 * 쓰면 저장은 성공하고 **다음 부팅에서 `schema-mismatch`로 쓰기가 영구 차단된다.**
 */
export function writeDataFile(data: LeaveData): void {
	/** 쓸 원문. */
	const raw = serialize(data);
	parse(raw);
	writeFileAtomic(dataFilePath(), raw);
}

/**
 * 파괴적 조작 직전에 `data.json.bak`을 남긴다(스펙 2절).
 *
 * **부르는 자리는 정확히 둘뿐이다** — 입사일 변경에 따른 기록 삭제, 가져오기 교체
 * (둘 다 23번). 그 밖에서 부르면 백업이 "직전 상태"를 가리키지 않게 되어 복구가
 * 사용자가 기대한 시점으로 돌아가지 않는다.
 *
 * 원문을 그대로 복사한다 — 다시 직렬화하면 백업이 원본과 다른 바이트가 된다.
 * 읽지 못하는 원본은 백업하지 않고 던진다. 깨진 원본으로 정상 백업을 덮으면
 * 23번의 `[백업에서 복구]`가 돌아갈 곳을 잃는다.
 */
export function backupDataFile(): void {
	/** 원본 파일 원문. */
	const raw = readRaw(dataFilePath());

	// 원본이 없나요? 백업할 것도 없다 — 첫 저장 전의 가져오기가 이 경로다.
	if (raw === null) {
		return;
	}

	parse(raw);
	writeFileAtomic(backupFilePath(), raw);
}

/** 파일 원문을 읽는다. 파일이 없으면 `null`이고 그 밖의 실패는 그대로 던진다. */
function readRaw(filePath: string): string | null {
	try {
		return readFileSync(filePath, "utf8");
	} catch (error) {
		if (isFileNotFound(error)) {
			return null;
		}
		throw error;
	}
}

/** 파일이 없어서 난 오류인가. */
function isFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
