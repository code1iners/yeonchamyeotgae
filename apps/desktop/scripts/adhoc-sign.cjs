"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * electron-builder afterPack 훅 — mac 앱 번들 전체를 ad-hoc(무인증서) 서명한다.
 *
 * mac.identity: null이면 electron-builder는 코드 서명을 통째로 건너뛴다("skipped macOS
 * code signing" 로그). 남는 건 Electron/Chromium 프리빌트 바이너리 각각에 이미 박혀 있는
 * 링커 수준 ad-hoc 서명뿐이고, .app 번들 전체를 감싸는 _CodeSignature/CodeResources 봉인은
 * 아예 생기지 않는다. 로컬에서 Finder로 복사해 `open`으로 띄우는 검증(28~31번 티켓)은 이
 * 상태로도 통과한다 — 격리 속성(com.apple.quarantine)이 없는 파일은 Gatekeeper가 깊은
 * 서명 검증을 하지 않기 때문이다. 그런데 GitHub Release에서 실제로 내려받은 파일은
 * 브라우저가 격리 속성을 붙이므로 macOS가 첫 실행 때 전체 서명을 검증하고, 봉인이 없는
 * 이 상태에서는 "손상되었기 때문에 열 수 없습니다"로 죽는다(32번 티켓 실측 — v0.1.1도
 * `codesign --verify --deep --strict`가 이미 이 오류로 실패하고 있었다. 이 버그는 이번
 * 패키징 변경이 아니라 애초부터 있었던 것이다).
 *
 * 고친 방법은 electron-builder의 인증서 자동 탐색(identity 설정)은 그대로 두고, 패키징
 * 직후 우리가 직접 `codesign --deep --force --sign -`로 번들 전체를 ad-hoc 서명하는
 * 것이다. `-`는 키체인 인증서를 전혀 찾지 않는 무서명 봉인이라, 스펙 8.4절이 막으려던
 * "키체인의 진짜 인증서를 조용히 집어 쓰는" 사고와 무관하다. 서명 후에는 `codesign
 * --verify`가 통과하고, 격리된 상태에서도 macOS가 정상적인 "확인되지 않은 개발자" 흐름
 * (README가 안내하는 흐름)으로 넘어간다 — "손상됨"이 아니라.
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
};
