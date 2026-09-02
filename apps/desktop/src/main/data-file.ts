import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type LeaveData, ParseError, parse, serialize } from "@yeoncha/core";
import { app, shell } from "electron";
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

/**
 * 저장 파일이 있는 폴더를 OS 파일 관리자에서 연다(23번).
 *
 * 저장 경로를 설정값으로 열지 않는 대신 두는 통로다(2절). 파일이 아직 없으면
 * (입사일을 넣기 전) 폴더만 연다 — 없는 파일을 가리키면 아무 일도 일어나지 않아
 * 사용자에게는 버튼이 죽은 것처럼 보인다.
 */
export async function revealDataFile(): Promise<void> {
	if (readRaw(dataFilePath()) === null) {
		/** 폴더를 열지 못했을 때 Electron이 돌려주는 사용자용 오류 문구. */
		const error = await shell.openPath(app.getPath("userData"));
		if (error) {
			throw new Error(error);
		}
		return;
	}
	shell.showItemInFolder(dataFilePath());
}

/**
 * 저장 파일을 그대로 복사해 내보낸다(23번).
 *
 * **내보내기 파일 = 저장 파일이다**(2절). 다시 직렬화하지 않고 원문을 옮기므로
 * 별도 포맷이 생길 자리가 없고, 내보낸 파일을 그대로 가져올 수 있다.
 *
 * 여기만 원자적으로 쓰지 않는다 — 원자적 쓰기가 지키는 것은 "덮어쓰다 죽어도 옛
 * 파일이 남는 것"인데, 내보내기는 덮을 옛 파일이 없고 실패하면 사용자가 다시 누른다.
 * 대신 사용자가 고른 폴더에 `.tmp` 잔여물을 남기지 않는다.
 */
export function exportDataFile(targetPath: string): void {
	/** 저장 파일 원문. */
	const raw = readRaw(dataFilePath());
	if (raw === null) {
		throw new Error("내보낼 저장 파일이 아직 없습니다");
	}
	writeFileSync(targetPath, raw, "utf8");
}

/** 가져올 파일을 읽어 구조를 판정한다. 판정은 저장 파일과 같은 파서 한 벌이다(2절). */
export function readImportFile(sourcePath: string): LeaveData {
	/** 고른 파일의 원문. */
	const raw = readRaw(sourcePath);
	if (raw === null) {
		throw new Error("고른 파일을 찾지 못했습니다");
	}
	return parse(raw);
}

/**
 * `data.json.bak`을 저장 파일 자리로 되돌린다(23번의 `[백업에서 복구]`).
 *
 * **백업을 남기지 않는다.** 이 경로를 타는 시점의 원본은 읽지 못하는 파일이고,
 * 그것으로 백업을 덮으면 되돌아갈 곳이 사라진다. **읽지 못하던 원본은 이 쓰기로
 * 사라진다** — 조용히 덮지 않는다는 규칙(사용자 스토리 47)이 막는 것은 앱이 혼자
 * 덮는 것이고, 여기까지는 사용자가 오류 화면에서 직접 고른 길이다. 원본을 먼저
 * 챙기고 싶으면 같은 화면의 `[파일 위치 열기]`가 그 경로다.
 *
 * 백업 자체가 깨져 있으면 쓰지 않고 던진다. 깨진 백업으로 깨진 원본을 덮으면
 * 오류 화면만 한 번 더 볼 뿐이다.
 */
export function restoreBackupFile(): void {
	/** 백업 원문. */
	const raw = readRaw(backupFilePath());
	if (raw === null) {
		throw new Error("복구할 백업 파일이 없습니다");
	}
	parse(raw);
	writeFileAtomic(dataFilePath(), raw);
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
