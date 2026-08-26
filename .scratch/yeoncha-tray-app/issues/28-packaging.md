# 28. 패키징 — electron-builder 설정과 첫 로컬 패키징

Type: task
Status: ready-for-agent
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

- [ ] `apps/desktop/electron-builder.yml`에 서명 억제 세 줄이 있고 `signAndEditExecutable`을 쓰지 않았다
- [ ] mac 타깃에 **`target: [dmg]`를 명시**했다(기본값이 zip을 딸려온다) 그리고 arm64만 만든다
- [ ] win 타깃이 `nsis`이고 `oneClick: true` 기본값을 쓴다(`portable`이 아니다 — 저장 파일이 `userData` 고정이라 portable exe는 실제로 portable하지 않다)
- [ ] `artifactName: "yeonchamyeotgae-${version}-${arch}.${ext}"`이고 `executableName`도 ASCII다. `productName`은 `연차몇개`로 남아 메뉴 막대·시작 메뉴·DMG 볼륨 이름이 한국어다
- [ ] `directories.output`이 `release/`다(`out/`과 갈라져 있다 — 프로토타입에서 둘 다 `dist/`를 써 asar가 자기 자신을 삼켜 320MB가 됐다)
- [ ] 버전의 유일한 출처가 `apps/desktop/package.json`의 `version`이고 루트에는 `version`이 없다
- [ ] `@yeoncha/core`가 `devDependencies`에 있고 `apps/desktop`의 `dependencies`가 **비어 있다**
- [ ] `externalizeDepsPlugin`에 `exclude: ['@yeoncha/core']`를 넣지 않았다
- [ ] 첫 패키징 후 `npx asar list <app>/Contents/Resources/app.asar`로 확인했다 — **우리 번들 코어만 보이고 `node_modules/@yeoncha/core`가 없다**
- [ ] 패키징된 앱이 실제로 실행되고 트레이에 뜬다(개발 모드가 아니라 설치본으로)
- [ ] macOS 빌드가 서명 없이 성공하고, 키체인 조회가 일어나지 않았다
- [ ] `electron-builder`가 `26.15.7`이다
