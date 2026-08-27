import { describe, expect, test } from "vitest";
import {
	ParseError,
	type ParseErrorKind,
	parse,
	serialize,
} from "./storage.ts";

/** parse가 던진 ParseError의 kind를 꺼낸다. 던지지 않으면 테스트를 실패시킨다. */
function parseErrorKind(raw: string): ParseErrorKind {
	try {
		parse(raw);
	} catch (error) {
		if (error instanceof ParseError) {
			return error.kind;
		}
		throw error;
	}
	throw new Error("parse가 거부하지 않았다");
}

/** 구조가 올바른 저장 파일 원문(JSON 문자열)을 만든다. overrides로 일부만 바꿔 변형을 만든다. */
function validFile(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		schemaVersion: 1,
		settings: { hireDate: "2024-01-01", grantBasis: "hireDate" },
		entries: [
			{
				id: "5cf1c8b7-3e51-4dbb-9db5-3a3ee1cbb7ce",
				date: "2025-03-10",
				days: 1,
				note: "",
			},
		],
		adjustments: [
			{
				id: "9f4a6a5e-8f5c-4f11-b0f0-59f9e9d4a11d",
				grantDate: "2025-01-01",
				expiryDate: "2025-12-31",
				days: 5,
				note: "이월",
			},
		],
		...overrides,
	});
}

// 스펙 2절 읽기 실패 표: 셸의 오류 화면이 셋을 다르게 다루므로 ParseError가
// invalid-json / schema-mismatch / future-version을 구분해야 한다.
describe("parse — 읽기 실패 구분", () => {
	test("JSON 파싱 실패는 invalid-json", () => {
		expect(parseErrorKind("{ not json")).toBe("invalid-json");
	});

	test("schemaVersion이 앱보다 높으면 future-version", () => {
		expect(parseErrorKind(validFile({ schemaVersion: 2 }))).toBe(
			"future-version",
		);
	});

	// 구조·타입·필수 필드·날짜 형식 위반은 전부 schema-mismatch다.
	test.each<[string, string]>([
		["루트가 객체가 아님", JSON.stringify([])],
		["루트가 null", JSON.stringify(null)],
		["schemaVersion 없음", validFile({ schemaVersion: undefined })],
		["schemaVersion이 문자열", validFile({ schemaVersion: "1" })],
		["settings 없음", validFile({ settings: undefined })],
		[
			"settings.hireDate 없음",
			validFile({ settings: { grantBasis: "hireDate" } }),
		],
		[
			"settings.hireDate가 날짜 형식이 아님",
			validFile({
				settings: { hireDate: "2024/01/01", grantBasis: "hireDate" },
			}),
		],
		[
			"settings.hireDate가 실재하지 않는 날짜",
			validFile({
				settings: { hireDate: "2024-02-30", grantBasis: "hireDate" },
			}),
		],
		[
			"settings.grantBasis가 열거값 밖",
			validFile({
				settings: { hireDate: "2024-01-01", grantBasis: "calendar" },
			}),
		],
		["entries 없음", validFile({ entries: undefined })],
		["entries가 배열이 아님", validFile({ entries: {} })],
		[
			"entry.id 없음",
			validFile({ entries: [{ date: "2025-03-10", days: 1, note: "" }] }),
		],
		[
			"entry.days가 문자열",
			validFile({
				entries: [{ id: "a", date: "2025-03-10", days: "1", note: "" }],
			}),
		],
		[
			"entry.note 없음",
			validFile({ entries: [{ id: "a", date: "2025-03-10", days: 1 }] }),
		],
		["adjustments 없음", validFile({ adjustments: undefined })],
		[
			"adjustment.expiryDate 없음",
			validFile({
				adjustments: [{ id: "b", grantDate: "2025-01-01", days: 5, note: "" }],
			}),
		],
	])("%s → schema-mismatch", (_label, raw) => {
		expect(parseErrorKind(raw)).toBe("schema-mismatch");
	});

	test("entries에 중복 date가 있으면 거부한다 (하루 1건 불변식)", () => {
		/** 같은 날짜의 휴가 기록 2건. */
		const raw = validFile({
			entries: [
				{ id: "a", date: "2025-03-10", days: 0.5, note: "" },
				{ id: "b", date: "2025-03-10", days: 0.5, note: "" },
			],
		});
		expect(parseErrorKind(raw)).toBe("schema-mismatch");
	});
});

// 파서는 구조만 본다 — 도메인 이상치를 거부하면 앱이 자기가 쓴 파일을 못 읽는다
// (스펙 5.4절의 삭제 거절). 도메인 이상치는 입력 UI가 막는다.
describe("parse — 도메인 이상치는 통과한다", () => {
	test.each<[string, Record<string, unknown>]>([
		[
			"입사일 이전 휴가 기록",
			{ entries: [{ id: "a", date: "2023-05-01", days: 1, note: "" }] },
		],
		[
			"0.25 배수가 아닌 일수",
			{ entries: [{ id: "a", date: "2025-03-10", days: 0.3, note: "" }] },
		],
		[
			"소멸일이 발생일보다 이른 조정",
			{
				adjustments: [
					{
						id: "b",
						grantDate: "2025-12-31",
						expiryDate: "2025-01-01",
						days: 5,
						note: "",
					},
				],
			},
		],
	])("%s", (_label, overrides) => {
		expect(() => parse(validFile(overrides))).not.toThrow();
	});

	// 파서 범위는 형식·타입·필수 필드·중복 date까지다(스펙 2절) — 모르는 키는
	// 거부 목록 밖이다. 신버전 필드의 손실 경로는 future-version 거부가 막는다.
	test.each<[string, Record<string, unknown>]>([
		["루트에 모르는 키", { extra: true }],
		[
			"휴가 기록에 모르는 키",
			{
				entries: [{ id: "a", date: "2025-03-10", days: 1, note: "", extra: 1 }],
			},
		],
	])("%s도 통과한다", (_label, overrides) => {
		expect(() => parse(validFile(overrides))).not.toThrow();
	});
});

// 내보내기 파일 = 저장 파일이므로 파서·직렬화가 한 벌이어야 한다(스펙 2절).
describe("serialize — 왕복", () => {
	test("serialize(parse(x)) === x (2칸 들여쓰기)", () => {
		/** 앱이 쓰는 정본 형태(2칸 들여쓰기)의 저장 파일 원문. */
		const canonical = JSON.stringify(JSON.parse(validFile()), null, 2);
		expect(serialize(parse(canonical))).toBe(canonical);
	});
});
