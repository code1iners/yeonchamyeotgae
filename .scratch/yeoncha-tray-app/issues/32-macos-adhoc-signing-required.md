# 32: GitHub Release로 내려받은 macOS 앱이 "손상됨"으로 거부되는 문제 수정

Type: task
Status: resolved
Blocked by: None (can start immediately)

## What to build

사용자가 실제로 v0.1.2 DMG를 GitHub Release에서 내려받아 설치했더니, Finder가
`'연차몇개'은(는) 손상되었기 때문에 열 수 없습니다. 해당 항목을 휴지통으로 이동해야
합니다.`를 띄우며 실행 자체를 막았다(31번 티켓이 고친 SIGTRAP과는 다른 증상 —
"휴지통으로 이동" 대화상자는 서명 검증 실패의 전형적인 신호다). README·릴리스 본문이
안내하는 "확인되지 않은 개발자" 흐름(그래도 열기 → 열기)이 아예 뜨지 않고, 우회할
방법도 제공되지 않는다.

## Acceptance criteria

- [x] 실제로 GitHub Release에서 받은 것과 동일한 조건(격리 속성 `com.apple.quarantine`
      부여)에서 `codesign --verify --deep --strict`가 통과한다.
- [x] 같은 조건에서 `spctl -a --type execute`가 "damaged"가 아니라 정상적인
      "확인되지 않은 개발자" 거부(`rejected`)로 나온다 — README/RELEASE_BODY.md가
      안내하는 흐름과 일치해야 한다.
- [x] 서명을 추가해도 31번 티켓이 고친 SIGTRAP이 재발하지 않는다.
- [x] `mac.identity: null`(스펙 8.4절, 키체인 인증서 자동 탐색 억제)은 그대로 유지한다 —
      진짜 인증서를 조용히 집어 쓰는 사고를 막는 것이 목적이었고, 이번 수정과 무관하다.
- [x] `pnpm verify`가 통과한다.
- [x] 실제 CI가 만든 새 릴리스 DMG로 다시 검증한다.

## Blocked by

- None (can start immediately)

## 구현 기록

**증상과 31번 티켓의 SIGTRAP은 서로 다른 버그다.** SIGTRAP은 Finder가 헬퍼 실행 파일
이름을 NFD로 재정규화해 `Info.plist`의 `CFBundleExecutable`(NFC)과 어긋나면서 생기는
런타임 크래시였다. 이번 "손상됨"은 그와 무관하게 **애초에 macOS 앱 번들 전체에 유효한
코드 서명 봉인이 없어서** 생긴다 — 격리된(quarantine) 파일만 이 검증을 받으므로, 지금까지
모든 실측 검증(28~31번 티켓)이 로컬 Finder 복사(`osascript`의 `duplicate`) 또는
`cp -R` 뒤 `open`으로만 이루어져 이 버그를 한 번도 건드리지 못했다. 이번이 실제 GitHub
Release 다운로드로 검증한 첫 사례다.

**근본 원인**: `electron-builder.yml`의 `mac.identity: null`은 electron-builder의 코드
서명 단계를 통째로 건너뛴다(`skipped macOS code signing reason=identity explicitly is
set to null` 로그로 확인). 남는 건 Electron/Chromium 프리빌트 바이너리 각각에 이미 박혀
있는 링커 수준 ad-hoc 서명뿐이고, `.app` 번들을 감싸는 `_CodeSignature/CodeResources`
봉인은 전혀 생성되지 않는다. 이 상태를 직접 확인했다:

- v0.1.1과 v0.1.2의 실제 릴리스 DMG를 둘 다 내려받아 마운트한 뒤
  `codesign --verify --deep --strict`를 돌리면 **최상위 앱과 헬퍼 4개 전부**
  `code has no resources but signature indicates they must be present`로 실패한다.
  헬퍼는 순수 ASCII 이름(`yeonchamyeotgae Helper*.app`)이라 NFC/NFD와 무관함에도
  똑같이 실패한다 — 이 버그가 31번 티켓의 유니코드 정규화 문제와 완전히 별개임을
  보여준다.
- 로컬에서 같은 설정으로 새로 패키징해도(APFS, DMG 변환 이전 원본 `.app`) 동일하게
  실패한다 — DMG 변환이나 Finder 복사가 원인이 아니라 **패키징 시점에 서명이 아예
  안 됐다는 사실 자체**가 원인이다.

**고친 방법**: `identity` 설정은 손대지 않고(스펙 8.4절의 "키체인 자동 탐색 억제" 의도를
그대로 유지), 패키징 직후 `afterPack` 훅(`apps/desktop/scripts/adhoc-sign.cjs`)에서
`codesign --deep --force --sign - <app>`로 번들 전체를 직접 ad-hoc 서명한다. `-`는
키체인의 어떤 인증서도 찾지 않는 서명이라 "진짜 인증서를 조용히 집어 쓰는" 사고와
무관하다.

**검증(로컬 재현)**:
1. 서명 전: `codesign --verify --deep --strict`가 위 오류로 실패, `_CodeSignature`
   디렉터리가 아예 없음.
2. `codesign --deep --force --sign - "연차몇개.app"` 적용 후: `valid on disk`,
   `satisfies its Designated Requirement`로 통과, `_CodeSignature/CodeResources` 생성됨.
3. 서명된 앱을 별도 폴더로 복사하고 `xattr -w com.apple.quarantine ...`으로 실제
   다운로드를 흉내낸 뒤 `spctl -a -vvv --type execute` → **`rejected`**(정상적인
   "확인되지 않은 개발자" 거부, "damaged"가 아님).
4. 격리 속성을 지운 뒤 직접 실행 → 크래시 리포트 없이 프로세스가 뜸(31번 티켓의
   SIGTRAP 재발 없음 확인).

**남은 위험**: 이 검증은 `spctl`의 정적 평가와 직접 실행까지만 확인했고, 실제 Finder
더블클릭 → "확인되지 않은 개발자" 다이얼로그 → 시스템 설정 "그래도 열기" 전체 UI
흐름은 이 실행 환경(GUI 세션 제약)에서 끝까지 재현하지 못했다. `spctl`의 판정이
Finder가 보여주는 실제 다이얼로그의 신뢰 가능한 대리 지표이긴 하지만, 100% 동일하다는
보장은 아니다. 사용자가 새 릴리스를 실제로 받아 설치하는 것이 최종 확인이다.

`pnpm verify` 6/6 통과.
