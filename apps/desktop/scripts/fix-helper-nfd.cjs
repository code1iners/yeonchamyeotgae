"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * electron-builder afterPack 훅 — mac 헬퍼 번들 이름을 NFC로 되돌린다.
 *
 * macPackager는 헬퍼 파일명을 만들 때 sanitizedProductName을 NFD로 강제
 * 정규화한다(appInfo.js, normalizeNfd=true 하드코딩). 반면 Info.plist의
 * CFBundleName은 NFC다. Electron 44는 CFBundleName으로 헬퍼 경로를 만들어
 * 띄우는데, 이 NFD/NFC 불일치가 있으면 macOS 26에서 실행 직후 아무 메시지
 * 없이 SIGTRAP으로 죽는다. 온디스크 이름과 plist를 전부 NFC로 맞추면
 * 실행된다 — 28번 티켓의 실측으로 확인했다.
 *
 * Contents/Library/LoginItems의 Login Helper는 다루지 않는다 — Electron 44
 * 산출물에 없다. 생기면 같은 처리가 필요하다.
 */
module.exports = async function fixHelperNfd(context) {
	if (context.electronPlatformName !== "darwin") {
		return;
	}

	const appFilename = context.packager.appInfo.productFilename;
	const frameworksDir = path.join(
		context.appOutDir,
		`${appFilename}.app`,
		"Contents",
		"Frameworks",
	);

	for (const entry of fs.readdirSync(frameworksDir)) {
		if (!entry.includes(" Helper")) {
			continue;
		}
		const bundleName = renameToNfc(frameworksDir, entry) ?? entry;
		const bundleDir = path.join(frameworksDir, bundleName);
		const macosDir = path.join(bundleDir, "Contents", "MacOS");
		for (const executable of fs.readdirSync(macosDir)) {
			const nfcExecutable = renameToNfc(macosDir, executable);
			if (nfcExecutable === null) {
				continue;
			}
			execFileSync("plutil", [
				"-replace",
				"CFBundleExecutable",
				"-string",
				nfcExecutable,
				path.join(bundleDir, "Contents", "Info.plist"),
			]);
		}
	}
};

/**
 * 디렉터리 안 항목 이름을 NFC로 바꾼다. 이미 NFC면 null을 반환한다.
 * APFS는 정규화 무시 조회라 NFD→NFC 직접 rename이 "같은 파일" 취급될 수
 * 있어, 임시 이름을 거쳐 바이트 수준에서 확실히 NFC로 만든다.
 */
function renameToNfc(parentDir, name) {
	const nfcName = name.normalize("NFC");
	if (name === nfcName) {
		return null;
	}
	const tempPath = path.join(parentDir, `${nfcName}.nfc-tmp`);
	fs.renameSync(path.join(parentDir, name), tempPath);
	fs.renameSync(tempPath, path.join(parentDir, nfcName));
	return nfcName;
}
