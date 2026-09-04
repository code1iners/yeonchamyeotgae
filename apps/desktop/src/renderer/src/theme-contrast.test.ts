import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/** 실제 렌더러 스타일 원문. */
const STYLES = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
/** 다크 테마 변수 블록. */
const DARK_THEME = STYLES.match(
	/@media \(prefers-color-scheme: dark\)[\s\S]*?:root \{([\s\S]*?)\n\t\}/,
)?.[1];

/** CSS 블록에서 6자리 hex 변수를 읽는다. */
function hexVariable(block: string, name: string): string {
	/** 요청한 CSS 변수의 hex 값. */
	const value = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
	if (!value) {
		throw new Error(`--${name} hex 변수를 찾지 못했습니다.`);
	}
	return value;
}

/** 6자리 hex 색을 0~255 RGB 값으로 바꾼다. */
function rgb(hex: string): [number, number, number] {
	/** 두 자리씩 나눈 색상 채널. */
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		?.map((value) => Number.parseInt(value, 16));
	if (channels?.length !== 3) {
		throw new Error(`유효하지 않은 hex 색상입니다: ${hex}`);
	}
	return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
}

/** sRGB 채널 하나를 WCAG 상대 휘도 채널로 바꾼다. */
function linearChannel(value: number): number {
	/** 0~1 범위의 sRGB 채널. */
	const channel = value / 255;
	return channel <= 0.04045
		? channel / 12.92
		: ((channel + 0.055) / 1.055) ** 2.4;
}

/** hex 색상의 WCAG 상대 휘도를 계산한다. */
function luminance(hex: string): number {
	/** 색상의 RGB 채널. */
	const [red, green, blue] = rgb(hex);
	return (
		0.2126 * linearChannel(red) +
		0.7152 * linearChannel(green) +
		0.0722 * linearChannel(blue)
	);
}

/** 두 hex 색상의 WCAG 대비율을 계산한다. */
function contrastRatio(first: string, second: string): number {
	/** 두 색상 중 밝은 쪽 휘도. */
	const lighter = Math.max(luminance(first), luminance(second));
	/** 두 색상 중 어두운 쪽 휘도. */
	const darker = Math.min(luminance(first), luminance(second));
	return (lighter + 0.05) / (darker + 0.05);
}

describe("다크 테마 텍스트 대비", () => {
	test("작은 강조 텍스트가 배경 위에서 WCAG AA 대비를 확보한다", () => {
		if (!DARK_THEME) {
			throw new Error("다크 테마 변수 블록을 찾지 못했습니다.");
		}
		/** 다크 배경 위에 직접 놓이는 텍스트용 강조색. */
		const accentText = hexVariable(DARK_THEME, "accent-text");
		/** 다크 팝오버의 기본 배경색. */
		const background = hexVariable(DARK_THEME, "bg");

		expect(contrastRatio(accentText, background)).toBeGreaterThanOrEqual(4.5);
	});
});
