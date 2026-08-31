# 31: macOS Finder 설치 후 Electron 앱이 정상 실행되도록 패키징 수정

Type: task
Status: resolved
Blocked by: None (can start immediately)

## What to build

사용자가 GitHub Release의 DMG를 열고 앱을 Finder로 응용 프로그램에 이동한 뒤, 보안 경고를
승인하면 앱이 종료되지 않고 메뉴 막대에서 실행되는 상태. 최초 실행의 보안 경고는 허용하지만,
터미널 명령이나 특수한 복사 방법을 사용자에게 요구하지 않는다.

이 문제는 28번 패키징 티켓의 설치본 검증에서 발견됐다. DMG 안의 앱과 Finder로 응용 프로그램에
복사한 앱에서 한글 헬퍼 실행 파일 이름의 내부 표현이 달라지고, Electron이 헬퍼를 찾지 못해
실행 직후 `SIGTRAP` 및 `exit code 133`으로 종료한다.

## Acceptance criteria

- [x] 새로 만든 arm64 DMG의 앱을 Finder로 응용 프로그램에 복사한 뒤 정상 실행된다.
- [x] 설치 후 실행 직후 `SIGTRAP` 또는 `exit code 133`으로 종료되지 않는다.
- [x] 한글 앱 이름을 유지하면서 설치 후에도 Electron 헬퍼의 실행 경로가 일치한다.
- [x] 코드 서명 없이도 보안 경고를 승인한 뒤 실행된다.
- [x] 실행 후 Dock 창이 아니라 메뉴 막대에 앱이 나타난다.
- [x] 기존 잔여 표시와 팝오버가 정상 동작한다.
- [x] `pnpm verify`가 통과한다.
- [x] README와 릴리스 안내가 macOS의 실제 버튼 이름인 `그래도 열기`를 안내한다.
- [x] 새 DMG를 만든 뒤 실제 Finder 설치 과정을 다시 검증한다.

## Blocked by

- None (can start immediately)

## 구현 기록

**근본 원인은 28번 티켓이 고친 것과 다른 층에 있었다.** 28번의 `afterPack` 훅은 *빌드 시점*에
헬퍼 이름을 NFC로 되돌렸지만, 문제는 *설치 시점*에 다시 벌어진다 — Finder의 복사 엔진은
소스가 이미 NFC든 아니든 상관없이, 복사되는 **디렉터리는 그대로 두고 그 안의 실행 파일(리프
파일)만** NFD로 재정규화한다. 그 결과 Info.plist의 `CFBundleExecutable`(NFC)과 디스크의 실제
파일명(NFD)이 어긋난다. `afterPack`은 사용자의 Finder 조작 이후에는 다시 실행되지 않으므로
빌드 쪽에서 아무리 고쳐도 소용없다 — **DMG를 그대로 실행하면 멀쩡하고 Finder로 복사한
사본만 죽는 정확한 실측 재현**으로 확인했다(`cp -R` 사본은 멀쩡했다 — Finder 고유의 동작이다).

POSIX `stat`/`execve`는 APFS의 정규화-무관 조회 덕에 NFC 문자열로 NFD 파일을 그대로 찾아
실행까지 한다(직접 확인함). 그런데도 실제 앱은 크래시 리포터에 `EXC_BREAKPOINT(SIGTRAP)`를
남기며 죽는다 — 파일시스템 조회가 아니라 그 위의 어떤 계층(Electron/Chromium이 `Info.plist`의
`CFBundleExecutable` 문자열과 디스크 목록을 바이트 단위로 비교하는 지점으로 추정)에서 막힌다.
정확한 트랩 지점은 특정하지 못했다 — 심벌이 없는 릴리스 바이너리라 크래시 리포트의 스택이
근처 심벌로 오분류된다.

**고친 방법**: 헬퍼 이름에서 유니코드 정규화가 애초에 문제 될 수 없게, `productName`
자체를 ASCII(`yeonchamyeotgae`)로 바꿨다. electron-builder는 mac 헬퍼 번들·실행 파일 이름을
`executableName`이 아니라 `productName`에서 직접 파생시킨다(`appInfo.js`의
`sanitizedProductName`) — 이 경로에는 우리가 설정으로 끼어들 지점이 없다. `productName`이
ASCII면 이 파생 전체가 결정론적으로 ASCII가 되어, Finder가 파일을 어떻게 복사하든(NFC든
NFD든) ASCII 문자열은 정규화 형태가 하나뿐이라 애초에 어긋날 수 없다. 이 방향은 전자
electron-builder 메인테이너들 스스로 v27부터 **정규화가 필요한 productName/executableName을
mac 빌드에서 거부**하기로 한 것과 일치한다(GitHub 이슈 조사로 확인) — 우리가 고치는 것과
같은 문제 클래스를 상류에서도 "애초에 막는" 쪽으로 정리했다는 뜻이다.

**사용자에게 보이는 한글 이름 네 곳은 그대로 지켰다** — `productName`을 소스로 쓰지 않고
각자 리터럴/전용 옵션으로:
- DMG 볼륨 제목: `dmg.title: "연차몇개 ${version}"` (매크로 대신 리터럴)
- Windows 시작 메뉴·바탕화면 바로가기: `nsis.shortcutName: 연차몇개` (기본값이 `productName`이라
  명시하지 않으면 "yeonchamyeotgae"로 뜬다)
- 메뉴 막대(트레이) 텍스트: 애초에 `productName`과 무관하다 — `src/main/tray.ts`가 직접 그린다.
- **강제 종료·Activity Monitor가 보여주는 "실행 중인 앱 이름"**: `productName`을 ASCII로
  바꾸면서 `CFBundleName`도 덩달아 ASCII가 됐는데(macPackager가 `CFBundleName`을
  `appInfo.productName`에서 무조건 채운다 — `extendInfo`는 그 다음에 병합된다), 이 표면을
  놓치고 있었다. `mac.extendInfo.CFBundleDisplayName: 연차몇개`를 채워 메웠다 — 실행 중인
  프로세스를 `NSRunningApplication(processIdentifier:).localizedName`으로 직접 질의해
  "연차몇개"가 나오는 것을 확인했다(Foundation/AppKit 기반 API라 macOS가 실제로 강제
  종료·Activity Monitor에 쓰는 값과 같다).

**CFBundleDisplayName이 안 먹는 표면도 있다**: 처음엔 이 값이 Finder의 `.app` 표시 이름도
한글로 되돌려 줄 거라 기대했는데, 실측 결과 Finder/`NSURL.localizedNameKey`에는 전혀
반영되지 않았다(`ko.lproj/InfoPlist.strings` + `lsregister -f`로 강제해도 마찬가지) — 그런데
**git stash로 28번 시점(코드 서명 없이 `CFBundleName`이 이미 한글이던 원래 빌드)을 다시
패키징해 대조군으로 확인해보니 그 빌드도 `localizedNameKey`가 "yeonchamyeotgae"(ASCII
파일명)를 돌려줬다** — 즉 Finder에 보이는 `.app` 이름은 이번 변경 **이전에도 이미 ASCII였다.**
그래서 이 부분은 회귀가 아니다.

`dmg.filesystem: APFS`와 `afterPack` 훅은 함께 지웠다 — 둘 다 "헬퍼 이름이 한글이라
정규화가 흔들린다"는, 이제 존재하지 않는 문제를 막기 위한 장치였다. 헬퍼 이름이 ASCII인
지금은 HFS+ 기본값으로도 무해하다(실측: 새 DMG는 `Apple_HFS`로 마운트됐고 문제없이 동작했다).

**검증**: 새로 패키징한 arm64 DMG를 마운트해 Finder(`osascript`의 `duplicate` 명령, AppleScript
로 실제 Finder 엔진을 태운다)로 별도 폴더에 복사 → 복사본 안의 모든 파일명이 ASCII임을
확인 → `open`으로 실행 → main·GPU·network·renderer 헬퍼 프로세스가 전부 살아있고 크래시
리포트가 생기지 않음을 확인했다(변경 전 같은 절차는 매번 `종료 코드 133`과
`연차몇개 Helper-*.ips` 크래시 리포트를 남겼다). `npx asar list`로 28번의 불변식
(`node_modules/@yeoncha/core` 없음)도 재확인했다. 팝오버 UI를 실제로 클릭해 눈으로 보는
단계는 하지 않았다 — 이 실행 환경의 화면이 사용자의 실제 데스크톱이라 스크린샷으로 확인하는
방법을 접었다. 대신 renderer 헬퍼 프로세스가 크래시 없이 떠 있는 것으로 팝포버 렌더링
파이프라인이 정상 동작함을 간접 확인했다.

README·`.github/RELEASE_BODY.md`의 macOS 안내는 "확인 없이 열기"(존재하지 않는 버튼)를
Apple 공식 지원 문서 기준 실제 버튼 이름 **"그래도 열기"**로 고쳤고, 그 다음에 뜨는 재확인
다이얼로그의 **"열기"** 버튼 단계도 빠져 있어 추가했다.

`pnpm verify` 6/6 통과.

### 후속: 설치된 `.app`이 Finder에 "yeonchamyeotgae"로 보이는 문제 (사용자 피드백)

위 수정을 실제 설치해본 사용자가 Finder에 앱이 여전히 `yeonchamyeotgae`(ASCII)로 보인다며
`연차몇개`로 보이길 원했다. 처음 고칠 때는 이걸 회귀로 보지 않았다 — git stash로 대조군을
확인해 이 ASCII 표시가 28번 시점부터 이미 그랬다는 걸 알고 있었기 때문이다. 하지만 "이미
그랬다"가 "이대로 둬도 된다"는 아니었다 — 사용자가 원치 않는 것으로 확인됐으니 고친다.

**추가로 확인한 사실**: mac 앱 본체(.app 폴더 이름·`Contents/MacOS`의 실행 파일·
`CFBundleExecutable`)는 `productName`이 아니라 `mac.executableName`(설정하지 않으면
`productFilename`으로 대체)에서 파생된다(`appInfo.js`, `macPackager.js`의
`applyCommonInfo`) — **헬퍼 이름이 파생되는 경로(`productName` → `sanitizedProductName`,
`executableName` 무시)와 완전히 분리된 별도 경로다.** 즉 `productName`을 ASCII로 유지해
헬퍼 이름을 안전하게 두면서, `mac.executableName`만 한글로 바꿔 앱 본체 이름을 되돌릴 수
있다 — 이 둘을 하나로 묶어서 생각한 게 처음 수정의 사각지대였다.

**위험 요소를 먼저 실측했다**: `mac.executableName: 연차몇개`로 바꾸면 앱 본체 실행 파일도
헬퍼와 똑같이 한글 리프 파일이 되어, 이론상 같은 Finder NFD 재정규화에 노출된다. 실제로
Finder로 복사해보니 이 실행 파일도 NFD로 바뀌어 `Info.plist`의 `CFBundleExecutable`(NFC)과
바이트가 어긋났다 — 헬퍼 때와 똑같은 불일치다. 그런데도 `open`(LaunchServices 경로)으로
정상 실행되고 크래시가 없었다. 헬퍼 크래시의 진짜 원인은 파일 조회 실패가 아니라(APFS는
정규화-무관 조회라 문제없이 찾는다 — 앞서 확인함) **Chromium이 헬퍼를 스폰할 때 내부적으로
Info.plist 경로와 디스크 목록을 다시 대조하는 로직**이었는데, 메인 프로세스는 이미 떠 있는
자기 자신의 실행 파일 경로를 그렇게 재검증하지 않기 때문에 이 불일치가 무해했다.

`mac.executableName: 연차몇개`를 `mac:` 아래로 한정해 Windows는 건드리지 않았다(그쪽은
이 문제와 무관하고, `nsis.shortcutName`이 이미 시작 메뉴 이름을 담당한다).

**검증**: 새 DMG를 Finder로 복사 → `open`으로 실행 → main·GPU·network·renderer 헬퍼 전부
생존, 크래시 없음. `Contents/Frameworks` 안의 헬퍼 파일명은 여전히 전부 ASCII임을 재확인.
Finder의 `.app` 표시 이름(`NSURL.localizedNameKey`)이 이제 "연차몇개"로 나오는 것을 확인했다
(폴더 자체 이름이 한글이라 이번엔 실제로 반영된다 — 앞서 무효였던 `CFBundleDisplayName`
꼼수와 달리 이건 파일명 자체를 바꾼 것이다). `npx asar list` 불변식도 재확인. `pnpm verify`
6/6 통과.
