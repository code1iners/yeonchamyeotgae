"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * electron-builder afterPack 훅 — mac 앱 번들 전체를 ad-hoc(무인증서) 서명한다.
 *
 * `mac.identity: null`은 electron-builder의 서명 단계 자체를 건너뛰어 .app 번들을 감싸는
 * _CodeSignature/CodeResources 봉인 없이 내보낸다. 격리 속성(com.apple.quarantine)이 붙는
 * 실제 GitHub Release 다운로드에서만 Gatekeeper가 이 봉인을 요구해 "손상됨"으로 거부한다.
 * 원인·실측 근거는 스펙 8.4절과 32번 티켓(`.scratch/yeoncha-tray-app/issues/
 * 32-macos-adhoc-signing-required.md`)을 본다. `-`(무인증서) 서명은 스펙 8.4절이 막으려던
 * "키체인의 진짜 인증서를 조용히 집어 쓰는" 사고와 무관하다.
 *
 * 서명 직후 `--verify --deep --strict`로 봉인이 실제로 유효한지 재확인한다 — `codesign
 * --sign`은 종료 코드 0을 반환해도 결과 봉인이 검증을 통과한다는 보장까지는 하지 않는다.
 */
module.exports = async function adhocSign(context) {
	if (context.electronPlatformName !== "darwin") {
		return;
	}

	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);

	execFileSync("codesign", ["--deep", "--force", "--sign", "-", appPath]);

	try {
		execFileSync("codesign", ["--verify", "--deep", "--strict", appPath]);
	} catch (cause) {
		throw new Error(
			`ad-hoc 서명 직후 codesign --verify가 실패했습니다: ${appPath}`,
			{ cause },
		);
	}
};
