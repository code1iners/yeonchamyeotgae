# 28. 패키징 — electron-builder 설정과 첫 로컬 패키징

Type: task
Status: resolved
Blocked by: 15, 27

## What to build

로컬에서 `electron-builder`를 돌려 **arm64 DMG 하나와 NSIS 하나**가 나오는 상태. 워크플로는
29번이고, 이 티켓은 **설정 파일과 첫 패키징의 실측**이다.

세 가지가 여기서 확정된다.

**1. 서명 억제 세 줄**([스펙 8.4절](../spec.md)). 프로토타입을 로컬에서 패키징했을 때
electron-builder가 키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다.**

```yaml
mac:
  identity: null          # 인증서를 꽂을 때 이 줄을 지운다
  hardenedRuntime: false  # identity: null과 짝
win:
  signExecutable: false   # 서명만 끈다. 아이콘·버전 리소스 편집은 유지된다
```

`CSC_IDENTITY_AUTO_DISCOVERY=false`가 아니다 — 환경변수라 로컬 셸에서 빠뜨리면 사고가 재발한다.
**`win.signAndEditExecutable: false`를 쓰면 안 된다** — 리소스 편집까지 꺼져 27번의 `.ico`가
exe에 붙지 않는다.

**2. `@yeoncha/core`는 `devDependencies`에 둔다**(8.4절). `dependencies`에 두면 electron-builder가
`pnpm list --prod`로 수집해 `packages/core`를 `node_modules`로 성실히 복사하는데 **Electron은
`.ts`를 실행할 수 없다.** 이 배치가 `externalizeDepsPlugin` 함정도 동시에 없앤다 —
**`exclude: ['@yeoncha/core']`를 넣지 마라**(9절 13번). 이 축의 실패는 **개발 중에 보이지 않고
패키징된 앱만 실행 시점에 깨진다.** 그래서 `asar list` 확인이 필수다.

**3. 산출물과 이름**(8.3절). `productName`은 한국어 `연차몇개`지만 **파일 이름은 ASCII로 뽑는다** —
기본 매크로가 다운로드 파일명이 되면 릴리스 URL이 퍼센트 인코딩으로 덮인다.

`electron.build` 문서 사이트를 근거로 쓰지 마라(9절 9번). 그 사이트는 v27 알파를 렌더링한다.
근거는 **`26.15.7` 태그**의 `website/docs/`나 `packages/app-builder-lib/src/options/*.ts`다.
그리고 **문서 전체에 "pnpm"이 한 번도 나오지 않는다** — 문제가 나면 소스와 이슈 트래커를 본다.

## Acceptance criteria

- [x] `apps/desktop/electron-builder.yml`에 서명 억제 세 줄이 있고 `signAndEditExecutable`을 쓰지 않았다
- [x] mac 타깃에 **`target: [dmg]`를 명시**했다(기본값이 zip을 딸려온다) 그리고 arm64만 만든다
- [x] win 타깃이 `nsis`이고 `oneClick: true` 기본값을 쓴다(`portable`이 아니다 — 저장 파일이 `userData` 고정이라 portable exe는 실제로 portable하지 않다)
- [x] `artifactName: "yeonchamyeotgae-${version}-${arch}.${ext}"`이고 `executableName`도 ASCII다. `productName`은 `연차몇개`로 남아 메뉴 막대·시작 메뉴·DMG 볼륨 이름이 한국어다
- [x] `directories.output`이 `release/`다(`out/`과 갈라져 있다 — 프로토타입에서 둘 다 `dist/`를 써 asar가 자기 자신을 삼켜 320MB가 됐다)
- [x] 버전의 유일한 출처가 `apps/desktop/package.json`의 `version`이고 루트에는 `version`이 없다
- [x] `@yeoncha/core`가 `devDependencies`에 있고 `apps/desktop`의 `dependencies`가 **비어 있다**
- [x] `externalizeDepsPlugin`에 `exclude: ['@yeoncha/core']`를 넣지 않았다(플러그인 자체를 쓰지 않는다)
- [x] 첫 패키징 후 `npx asar list <app>/Contents/Resources/app.asar`로 확인했다 — **우리 번들 코어만 보이고 `node_modules/@yeoncha/core`가 없다**
- [x] 패키징된 앱이 실제로 실행되고 트레이에 뜬다(개발 모드가 아니라 설치본으로)
- [x] macOS 빌드가 서명 없이 성공하고, 키체인 조회가 일어나지 않았다
- [x] `electron-builder`가 `26.15.7`이다

## 구현 기록

산출물은 `electron-builder.yml` 완성본, `scripts/fix-helper-nfd.cjs`(afterPack 훅),
`package.json`의 `package` 스크립트. 실측 결과 `yeonchamyeotgae-0.1.0-arm64.dmg`(121MB)와
`yeonchamyeotgae-0.1.0-x64.exe`(114MB)가 나왔고, asar는 1.02MB에 번들 코어 11개 항목뿐이다
(프로토타입 201KB 대비 증가분은 React renderer 790KB). 빌드 로그에 `skipped macOS code signing
reason=identity explicitly is set to null`이 찍히고 키체인 조회가 없다.

티켓에 없던 실측 발견 셋:

**1. 한국어 productName은 mac에서 그대로 쓰면 앱이 시작 직후 무음 SIGTRAP으로 죽는다.**
macPackager가 헬퍼 번들 파일명을 NFD로 강제 정규화하는데(`appInfo.js`, `normalizeNfd=true`
하드코딩) Info.plist의 CFBundleName은 NFC다. Electron 44는 CFBundleName으로 헬퍼 경로를
만들어 띄우며, 이 NFD/NFC 불일치에서 메시지 없이 죽는다(크래시 리포트가 전부 동일 오프셋의
EXC_BREAKPOINT). 온디스크 이름을 NFC로 되돌리면 실행된다 — 스톡 Electron.app에 변형을 한
축씩 입혀 격리했다. 고침은 두 겹이다:
- `afterPack` 훅(`scripts/fix-helper-nfd.cjs`)이 헬퍼 번들·실행 파일·plist를 NFC로 되돌린다.
- `dmg.filesystem: APFS` — 기본 HFS+는 파일명을 다시 NFD로 강제해 **DMG 왕복이 훅을
  무효화한다**(설치본이 다시 죽는 것까지 재현). APFS는 NFC를 보존하고, 최소 지원(macOS 13)이
  APFS 요건(10.13+)을 넘는다.

**2. `executableName`은 파일명만 바꾸는 옵션이 아니다.** `productFilename`이 통째로 그 값이
되어(`appInfo.js`) .app 번들 이름과 **DMG 볼륨 이름 기본값**(`${productFilename} ${version}`)까지
ASCII가 된다. 볼륨 이름 한국어는 `dmg.title: "${productName} ${version}"`로 복구했다.
메뉴 막대는 CFBundleName(연차몇개)에서 나와 영향이 없다.

**3. win 타깃에 `arch: [x64]`를 명시해야 한다.** 명시하지 않으면 호스트 아키텍처를 따라가
로컬(arm64 mac)에서 `-arm64.exe`가 나온다. CI의 windows-latest는 x64라 우연히 맞지만,
릴리스 자산 이름(8.3절)은 설정이 보증해야 한다.

검증: DMG를 마운트해 설치본을 복사·실행하고 트레이 아이템(AX 이름 `12.75` = 잔여일)과
팝오버(요약 탭, 발생 15 / 사용 2.25 / 예정 0)를 눈으로 확인했다. `pnpm verify` 6/6 통과.
로컬 환경 특이사항 하나 — makensis가 uninterruptible로 매달리면 화면에 떠 있는 보안 승인
다이얼로그(시스템 정책 평가 직렬화)가 원인일 수 있다. 다이얼로그를 닫으면 40초에 끝난다.
