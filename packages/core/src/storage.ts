import { isIsoDate } from "./iso-date.ts";

/** 앱이 읽고 쓸 수 있는 저장 형식 버전. 파일의 schemaVersion이 이보다 높으면 거부한다. */
export const APP_SCHEMA_VERSION = 1;

/** 읽기 실패의 세 갈래(스펙 2절 표). 셸의 오류 화면이 셋을 다르게 다룬다. */
export type ParseErrorKind =
	| "invalid-json"
	| "schema-mismatch"
	| "future-version";

/** parse가 저장 파일을 거부할 때 던지는 오류. */
export class ParseError extends Error {
	/** 실패 갈래. */
	readonly kind: ParseErrorKind;

	constructor(kind: ParseErrorKind, message: string) {
		super(message);
		this.name = "ParseError";
		this.kind = kind;
	}
}

/** 설정(스펙 2절). */
export type Settings = {
	/** 입사일. YYYY-MM-DD. */
	hireDate: string;
	/** 기준방식 — 입사일 또는 회계연도. */
	grantBasis: "hireDate" | "fiscalYear";
};

/** 휴가 기록 1건. 하루에 한 건이다. */
export type LeaveEntry = {
	/** 레코드 식별자(crypto.randomUUID()). */
	id: string;
	/** 휴가 날짜. YYYY-MM-DD. */
	date: string;
	/** 쓴 일수. */
	days: number;
	/** 메모. 항상 존재하고 기본값은 빈 문자열. */
	note: string;
};

/** 조정 레코드 1건. 사용자가 손으로 넣는 발생이며 음수를 허용한다. */
export type Adjustment = {
	/** 레코드 식별자(crypto.randomUUID()). 자연키가 없어 필수다. */
	id: string;
	/** 발생일. YYYY-MM-DD. */
	grantDate: string;
	/** 소멸일. YYYY-MM-DD. */
	expiryDate: string;
	/** 조정 일수. */
	days: number;
	/** 메모. 항상 존재하고 기본값은 빈 문자열. */
	note: string;
};

/** 저장 파일 전체. 설정 / 휴가 기록 / 조정만 저장한다 — 발생과 배정은 계산 결과다. */
export type LeaveData = {
	/** 저장 형식 버전. */
	schemaVersion: number;
	/** 설정. */
	settings: Settings;
	/** 휴가 기록. */
	entries: LeaveEntry[];
	/** 조정 레코드. */
	adjustments: Adjustment[];
};

/**
 * LeaveData를 저장 파일 원문으로 만든다. serialize(parse(x)) === x가 성립한다.
 *
 * 2칸 들여쓰기 — 설정 탭의 [파일 위치 열기]로 사람이 직접 열어보는 파일이라
 * 사람이 읽을 수 있는 형태가 저장 형식의 일부다(스펙 2절).
 */
export function serialize(data: LeaveData): string {
	return JSON.stringify(data, null, 2);
}

/** 구조 위반을 schema-mismatch로 던진다. */
function mismatch(message: string): never {
	throw new ParseError("schema-mismatch", message);
}

/** 값이 평범한 객체인지 확인하고, 아니면 거부한다. */
function requireRecord(value: unknown, where: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		mismatch(`${where}가 객체가 아니다`);
	}
	return value as Record<string, unknown>;
}

/** 필수 문자열 필드를 확인한다. */
function requireString(value: unknown, where: string): string {
	if (typeof value !== "string") {
		mismatch(`${where}가 문자열이 아니다`);
	}
	return value;
}

/** 필수 숫자 필드를 확인한다. */
function requireNumber(value: unknown, where: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		mismatch(`${where}가 숫자가 아니다`);
	}
	return value;
}

/** YYYY-MM-DD 형식과 실재하는 날짜인지 확인한다. Temporal.PlainDate와 1:1이어야 한다. */
function requireIsoDate(value: unknown, where: string): string {
	const text = requireString(value, where);
	if (!isIsoDate(text)) {
		mismatch(`${where}가 YYYY-MM-DD 형식의 실재하는 날짜가 아니다`);
	}
	return text;
}

/** 휴가 기록 1건의 구조를 검증한다. */
function parseEntry(value: unknown, where: string): LeaveEntry {
	const record = requireRecord(value, where);
	return {
		id: requireString(record.id, `${where}.id`),
		date: requireIsoDate(record.date, `${where}.date`),
		days: requireNumber(record.days, `${where}.days`),
		note: requireString(record.note, `${where}.note`),
	};
}

/** 조정 레코드 1건의 구조를 검증한다. */
function parseAdjustment(value: unknown, where: string): Adjustment {
	const record = requireRecord(value, where);
	return {
		id: requireString(record.id, `${where}.id`),
		grantDate: requireIsoDate(record.grantDate, `${where}.grantDate`),
		expiryDate: requireIsoDate(record.expiryDate, `${where}.expiryDate`),
		days: requireNumber(record.days, `${where}.days`),
		note: requireString(record.note, `${where}.note`),
	};
}

/** 설정의 구조를 검증한다. */
function parseSettings(value: unknown): Settings {
	const record = requireRecord(value, "settings");
	/** 기준방식 후보. */
	const grantBasis = requireString(record.grantBasis, "settings.grantBasis");
	if (grantBasis !== "hireDate" && grantBasis !== "fiscalYear") {
		mismatch(`settings.grantBasis가 hireDate/fiscalYear 밖의 값이다`);
	}
	return {
		hireDate: requireIsoDate(record.hireDate, "settings.hireDate"),
		grantBasis,
	};
}

/**
 * 저장 파일 원문을 검증해 LeaveData로 만든다(스펙 2절).
 *
 * 구조만 본다 — 형식·타입·필수 필드·entries의 중복 date까지다. 도메인 이상치
 * (입사일 이전 휴가 기록, 0.25 배수가 아닌 일수, 소멸일이 발생일보다 이른 조정)는
 * 통과시킨다. 거부하면 앱이 자기가 쓴 파일을 못 읽는다(5.4절의 삭제 거절).
 * 모르는 키도 통과시킨다 — 알려진 키만 옮겨 담으므로 다음 저장에서 사라진다.
 * 신버전 필드의 손실 경로는 이 관용이 아니라 future-version 거부가 막는다(2절).
 */
export function parse(raw: string): LeaveData {
	/** JSON 파싱 결과. */
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		throw new ParseError("invalid-json", "JSON 파싱에 실패했다");
	}

	// 미래 버전인가요? 구조 검증보다 먼저 본다 — 신버전 파일은 구조가 다를 수 있고,
	// 그때 schema-mismatch로 잘못 분류되면 셸이 [백업에서 복구]를 띄운다(2절 표 위반).
	if (
		typeof json === "object" &&
		json !== null &&
		"schemaVersion" in json &&
		typeof json.schemaVersion === "number" &&
		json.schemaVersion > APP_SCHEMA_VERSION
	) {
		throw new ParseError(
			"future-version",
			`schemaVersion ${json.schemaVersion}은 앱이 아는 버전(${APP_SCHEMA_VERSION})보다 높다`,
		);
	}

	/** 루트 객체. */
	const root = requireRecord(json, "루트");

	/** 저장 형식 버전. */
	const schemaVersion = requireNumber(root.schemaVersion, "schemaVersion");

	// 휴가 기록·조정이 배열인가요?
	if (!Array.isArray(root.entries)) {
		mismatch("entries가 배열이 아니다");
	}
	if (!Array.isArray(root.adjustments)) {
		mismatch("adjustments가 배열이 아니다");
	}

	/** 검증된 휴가 기록. */
	const entries = root.entries.map((entry, index) =>
		parseEntry(entry, `entries[${index}]`),
	);

	// 하루 1건 불변식 — 같은 date가 두 번 나오면 구조 위반이다.
	const seenDates = new Set<string>();
	for (const entry of entries) {
		if (seenDates.has(entry.date)) {
			mismatch(`entries에 중복 date ${entry.date}가 있다`);
		}
		seenDates.add(entry.date);
	}

	return {
		schemaVersion,
		settings: parseSettings(root.settings),
		entries,
		adjustments: root.adjustments.map((adjustment, index) =>
			parseAdjustment(adjustment, `adjustments[${index}]`),
		),
	};
}
