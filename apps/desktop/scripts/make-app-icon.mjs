/**
 * 앱 아이콘 생성기(스펙 6.3절, 티켓 27번).
 *
 * 512px 원본 하나(`build/icon-512.png`)를 렌더하고, 그 비트맵을 축소해
 * `.icns`(macOS)와 `.ico`(Windows)를 만든다. 모든 작은 크기는 512 원본의
 * 축소 파생이다 — 별도의 크기별 드로잉이 없다.
 *
 * 트레이 글리프(src/main/glyph.ts)와는 별개의 그림이다. 트레이는 런타임
 * canvas 렌더이고 이 스크립트의 산출물을 쓰지 않는다. 16px 전용 아이콘
 * 파일도 만들지 않는다 — 16px은 .icns/.ico 컨테이너 안의 표준 엔트리로만
 * 존재한다.
 *
 * 실행: node scripts/make-app-icon.mjs   (apps/desktop에서)
 * 의존성: 없음. .icns 변환만 macOS의 iconutil을 쓴다.
 */

import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

/** 원본 캔버스 한 변(px). 여기서 모든 크기가 파생된다. */
const SOURCE_SIZE = 512;
/** 픽셀당 서브샘플 격자 한 변(4 → 16샘플). 도형 경계의 안티에일리어싱용. */
const SUPERSAMPLE = 4;

// ---------------------------------------------------------------------------
// 드로잉 기하(제작 결정 — 스펙은 "시스템 블루 squircle + 흰 달력"까지만 정했다)
// ---------------------------------------------------------------------------

/** squircle 반경(중심에서 변까지). 512 캔버스에 412px — macOS 아이콘 그리드 비율. */
const SQUIRCLE_A = 206;
/** squircle 초타원 지수. 5가 Apple 아이콘 실루엣의 통용 근사다. */
const SQUIRCLE_N = 5;
/** 배경 그라디언트 상단 색(밝은 시스템 블루). */
const BLUE_TOP = [51, 157, 255];
/** 배경 그라디언트 하단 색(짙은 시스템 블루). */
const BLUE_BOTTOM = [0, 102, 224];

/** 달력 본체(흰 라운드 사각형)의 영역과 모서리 반경. */
const BODY = { x0: 142, y0: 184, x1: 370, y1: 382, r: 30 };
/** 바인더 고리 둘 — 본체 위로 솟는 흰 라운드 바. 중심 x 좌표 둘. */
const RING_CENTERS = [206, 306];
/** 고리 바의 폭·세로 범위·모서리 반경. */
const RING = { w: 26, y0: 138, y1: 212, r: 13 };
/** 헤더 띠와 날짜 격자를 가르는 파란 틈(본체에서 빼는 영역). */
const DIVIDER = { y0: 240, y1: 254 };
/** 날짜 칸(파란 라운드 사각형, 본체에서 빼는 영역)의 크기·모서리 반경. */
const CELL = { w: 32, h: 20, r: 6 };
/** 날짜 칸 열의 좌측 x 좌표들(4열). */
const CELL_XS = [166, 215.3, 264.7, 314];
/** 날짜 칸 행의 상단 y 좌표들(3행). */
const CELL_YS = [272, 308, 344];

/** 점이 라운드 사각형 `{x0, y0, x1, y1, r}` 안에 있는지 — 모서리 반경만큼 줄인 심(core) 사각형까지의 거리로 판정. */
function insideRoundedRect(x, y, { x0, y0, x1, y1, r }) {
	const cx = Math.min(Math.max(x, x0 + r), x1 - r);
	const cy = Math.min(Math.max(y, y0 + r), y1 - r);
	const dx = x - cx;
	const dy = y - cy;
	return dx * dx + dy * dy <= r * r;
}

/** 점이 squircle(초타원) 안에 있는지. */
function insideSquircle(x, y) {
	const nx = Math.abs(x - SOURCE_SIZE / 2) / SQUIRCLE_A;
	const ny = Math.abs(y - SOURCE_SIZE / 2) / SQUIRCLE_A;
	return nx ** SQUIRCLE_N + ny ** SQUIRCLE_N <= 1;
}

/** 점이 흰 달력 실루엣 안에 있는지 — (본체 ∪ 고리들) − 파란 틈 − 날짜 칸들. */
function insideCalendar(x, y) {
	// 고리 둘 중 하나에 들어가나요?
	for (const ringCenterX of RING_CENTERS) {
		const ringRect = {
			x0: ringCenterX - RING.w / 2,
			y0: RING.y0,
			x1: ringCenterX + RING.w / 2,
			y1: RING.y1,
			r: RING.r,
		};
		if (insideRoundedRect(x, y, ringRect)) {
			return true;
		}
	}
	// 본체 밖이면 여기서 끝.
	if (!insideRoundedRect(x, y, BODY)) {
		return false;
	}
	// 헤더와 격자를 가르는 파란 틈을 뺀다.
	if (y >= DIVIDER.y0 && y <= DIVIDER.y1) {
		return false;
	}
	// 날짜 칸을 뺀다.
	for (const cellY of CELL_YS) {
		if (y < cellY || y > cellY + CELL.h) continue;
		for (const cellX of CELL_XS) {
			const cellRect = {
				x0: cellX,
				y0: cellY,
				x1: cellX + CELL.w,
				y1: cellY + CELL.h,
				r: CELL.r,
			};
			if (insideRoundedRect(x, y, cellRect)) {
				return false;
			}
		}
	}
	return true;
}

/** 512px 원본을 RGBA(straight alpha) 버퍼로 렌더한다. */
function renderSource() {
	const size = SOURCE_SIZE;
	const out = Buffer.alloc(size * size * 4);
	/** 서브샘플 하나의 픽셀 내 오프셋들. */
	const offsets = Array.from(
		{ length: SUPERSAMPLE },
		(_, i) => (i + 0.5) / SUPERSAMPLE,
	);
	const sampleCount = SUPERSAMPLE * SUPERSAMPLE;

	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			// 서브샘플을 premultiplied로 누적해 경계를 부드럽게 만든다.
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (const oy of offsets) {
				const y = py + oy;
				/** 이 y에서의 배경 그라디언트 보간 비율. */
				const t = y / size;
				for (const ox of offsets) {
					const x = px + ox;
					if (!insideSquircle(x, y)) continue;
					if (insideCalendar(x, y)) {
						r += 255;
						g += 255;
						b += 255;
					} else {
						r += BLUE_TOP[0] + (BLUE_BOTTOM[0] - BLUE_TOP[0]) * t;
						g += BLUE_TOP[1] + (BLUE_BOTTOM[1] - BLUE_TOP[1]) * t;
						b += BLUE_TOP[2] + (BLUE_BOTTOM[2] - BLUE_TOP[2]) * t;
					}
					a += 255;
				}
			}
			const i = (py * size + px) * 4;
			if (a > 0) {
				// premultiplied 누적을 straight alpha로 되돌린다.
				const alpha = a / sampleCount;
				out[i] = Math.round((r / a) * 255);
				out[i + 1] = Math.round((g / a) * 255);
				out[i + 2] = Math.round((b / a) * 255);
				out[i + 3] = Math.round(alpha);
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// 축소(area average) — 512 원본에서 모든 작은 크기를 파생
// ---------------------------------------------------------------------------

/** RGBA 버퍼를 임의 크기로 축소한다. premultiplied 평균이라 경계에 어두운 테두리가 생기지 않는다. */
function resample(src, srcSize, destSize) {
	const out = Buffer.alloc(destSize * destSize * 4);
	/** 목적지 1px이 덮는 원본 픽셀 수(한 축). */
	const scale = srcSize / destSize;

	for (let dy = 0; dy < destSize; dy++) {
		const sy0 = dy * scale;
		const sy1 = (dy + 1) * scale;
		for (let dx = 0; dx < destSize; dx++) {
			const sx0 = dx * scale;
			const sx1 = (dx + 1) * scale;
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let area = 0;
			// 목적지 픽셀이 덮는 원본 영역을 부분 겹침 가중치로 평균한다.
			for (let sy = Math.floor(sy0); sy < sy1; sy++) {
				const hy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
				for (let sx = Math.floor(sx0); sx < sx1; sx++) {
					const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
					const w = hy * wx;
					const i = (sy * srcSize + sx) * 4;
					const alpha = src[i + 3] / 255;
					r += src[i] * alpha * w;
					g += src[i + 1] * alpha * w;
					b += src[i + 2] * alpha * w;
					a += alpha * w;
					area += w;
				}
			}
			const o = (dy * destSize + dx) * 4;
			if (a > 0) {
				out[o] = Math.round(r / a);
				out[o + 1] = Math.round(g / a);
				out[o + 2] = Math.round(b / a);
				out[o + 3] = Math.round((a / area) * 255);
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// PNG 인코더(최소 구현: 8bit RGBA, 필터 0)
// ---------------------------------------------------------------------------

/** PNG 청크의 CRC-32를 계산한다. */
function crc32(buf) {
	let crc = 0xffffffff;
	for (const byte of buf) {
		crc ^= byte;
		for (let k = 0; k < 8; k++) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** type + data를 PNG 청크(길이·CRC 포함)로 감싼다. */
function pngChunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, "ascii");
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

/** RGBA 버퍼를 PNG 파일 바이트로 인코딩한다. */
function encodePng(rgba, size) {
	// 각 스캔라인 앞에 필터 타입 0을 붙인다.
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // 비트 깊이
	ihdr[9] = 6; // 컬러 타입: RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 9 })),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

// ---------------------------------------------------------------------------
// ICO 인코더 — 작은 크기는 BMP(구형 렌더러 호환), 256은 PNG(Vista+ 규약)
// ---------------------------------------------------------------------------

/** .ico에 담을 크기들. Windows가 탐색기·작업 표시줄·알림에서 고르는 표준 세트다. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** RGBA 버퍼를 ICO 내장용 BMP(32bpp BGRA + AND 마스크, bottom-up)로 인코딩한다. */
function encodeIcoBmp(rgba, size) {
	/** AND 마스크 한 행의 바이트 수(32비트 경계 패딩). */
	const maskRowBytes = Math.ceil(size / 32) * 4;
	const out = Buffer.alloc(40 + size * size * 4 + maskRowBytes * size);
	// BITMAPINFOHEADER. 높이는 픽셀+마스크 몫으로 2배를 적는 것이 ICO 규약이다.
	out.writeUInt32LE(40, 0);
	out.writeInt32LE(size, 4);
	out.writeInt32LE(size * 2, 8);
	out.writeUInt16LE(1, 12);
	out.writeUInt16LE(32, 14);

	// 픽셀(BGRA, bottom-up).
	for (let y = 0; y < size; y++) {
		const srcRow = size - 1 - y;
		for (let x = 0; x < size; x++) {
			const i = (srcRow * size + x) * 4;
			const o = 40 + (y * size + x) * 4;
			out[o] = rgba[i + 2];
			out[o + 1] = rgba[i + 1];
			out[o + 2] = rgba[i];
			out[o + 3] = rgba[i + 3];
		}
	}
	// AND 마스크(bottom-up): 완전 투명인 곳만 1.
	const maskBase = 40 + size * size * 4;
	for (let y = 0; y < size; y++) {
		const srcRow = size - 1 - y;
		for (let x = 0; x < size; x++) {
			if (rgba[(srcRow * size + x) * 4 + 3] === 0) {
				out[maskBase + y * maskRowBytes + (x >> 3)] |= 0x80 >> (x & 7);
			}
		}
	}
	return out;
}

/** 크기별 RGBA 맵에서 .ico 파일 바이트를 만든다. */
function encodeIco(rgbaBySize) {
	/** 크기별 이미지 바이트(256만 PNG, 나머지는 BMP). */
	const images = ICO_SIZES.map((size) =>
		size === 256
			? encodePng(rgbaBySize.get(size), size)
			: encodeIcoBmp(rgbaBySize.get(size), size),
	);
	const header = Buffer.alloc(6 + 16 * ICO_SIZES.length);
	header.writeUInt16LE(1, 2); // 타입: 아이콘
	header.writeUInt16LE(ICO_SIZES.length, 4);
	let offset = header.length;
	ICO_SIZES.forEach((size, idx) => {
		const entry = 6 + idx * 16;
		header[entry] = size === 256 ? 0 : size;
		header[entry + 1] = size === 256 ? 0 : size;
		header.writeUInt16LE(1, entry + 4); // 플레인
		header.writeUInt16LE(32, entry + 6); // 비트 수
		header.writeUInt32LE(images[idx].length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += images[idx].length;
	});
	return Buffer.concat([header, ...images]);
}

// ---------------------------------------------------------------------------
// .icns — macOS iconutil로 변환(iconset 파일 이름 규약이 크기를 정한다)
// ---------------------------------------------------------------------------

/**
 * iconset 파일 이름 → 실제 px. 512@2x(=1024)는 넣지 않는다 —
 * 512 원본에서 확대 파생이 되기 때문이다.
 */
const ICONSET_ENTRIES = [
	["icon_16x16.png", 16],
	["icon_16x16@2x.png", 32],
	["icon_32x32.png", 32],
	["icon_32x32@2x.png", 64],
	["icon_128x128.png", 128],
	["icon_128x128@2x.png", 256],
	["icon_256x256.png", 256],
	["icon_256x256@2x.png", 512],
	["icon_512x512.png", 512],
];

/** 크기별 PNG 맵으로 iconset을 만들고 iconutil로 .icns를 뽑는다. */
function writeIcns(pngBySize, destPath) {
	if (process.platform !== "darwin") {
		throw new Error(
			".icns 변환은 macOS의 iconutil이 필요합니다. macOS에서 실행하세요.",
		);
	}
	/** 임시 작업 디렉터리. iconutil이 요구하는 `.iconset` 확장자 디렉터리를 이 안에 만든다. */
	const workDir = mkdtempSync(join(tmpdir(), "yeoncha-icon-"));
	const iconset = join(workDir, "icon.iconset");
	mkdirSync(iconset);
	try {
		for (const [name, size] of ICONSET_ENTRIES) {
			writeFileSync(join(iconset, name), pngBySize.get(size));
		}
		execFileSync("iconutil", ["-c", "icns", "-o", destPath, iconset]);
	} finally {
		rmSync(workDir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// 실행 + 산출물 자가 검사
// ---------------------------------------------------------------------------

/** 산출물이 놓이는 electron-builder buildResources 디렉터리. */
const buildDir = join(dirname(fileURLToPath(import.meta.url)), "..", "build");

/** 이 스크립트가 파생해야 하는 모든 크기(512 = 원본 그대로). */
const ALL_SIZES = [
	...new Set([...ICO_SIZES, ...ICONSET_ENTRIES.map(([, s]) => s)]),
];

mkdirSync(buildDir, { recursive: true });

// 512 원본을 렌더하고 모든 크기를 파생한다.
const source = renderSource();
/** 크기 → RGBA 버퍼. */
const rgbaBySize = new Map(
	ALL_SIZES.map((size) => [
		size,
		size === SOURCE_SIZE ? source : resample(source, SOURCE_SIZE, size),
	]),
);
/** 크기 → PNG 바이트. */
const pngBySize = new Map(
	[...rgbaBySize].map(([size, rgba]) => [size, encodePng(rgba, size)]),
);

writeFileSync(join(buildDir, "icon-512.png"), pngBySize.get(SOURCE_SIZE));
writeFileSync(join(buildDir, "icon.ico"), encodeIco(rgbaBySize));
writeIcns(pngBySize, join(buildDir, "icon.icns"));

// 산출물 파일 서명을 자가 검사한다.
const icoBytes = readFileSync(join(buildDir, "icon.ico"));
if (
	icoBytes.readUInt16LE(2) !== 1 ||
	icoBytes.readUInt16LE(4) !== ICO_SIZES.length
) {
	throw new Error("icon.ico 헤더가 기대와 다릅니다.");
}
const icnsBytes = readFileSync(join(buildDir, "icon.icns"));
if (icnsBytes.toString("ascii", 0, 4) !== "icns") {
	throw new Error("icon.icns 서명이 기대와 다릅니다.");
}
console.log(`완료: ${buildDir}/{icon-512.png, icon.icns, icon.ico}`);
console.log(`  .ico 크기: ${ICO_SIZES.join(", ")}`);
console.log(
	`  .icns 크기: ${[...new Set(ICONSET_ENTRIES.map(([, s]) => s))].join(", ")}`,
);
