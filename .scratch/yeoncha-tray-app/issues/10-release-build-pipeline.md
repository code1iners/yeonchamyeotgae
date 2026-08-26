# 10. GitHub Release 빌드 파이프라인 설계

Type: research
Status: resolved
Blocked by: 05

## Question

AI 에이전트가 main에 푸시하면서 macOS·Windows 실행 파일을 GitHub Release에 함께 올리려면 무엇이 필요한가?

**전제가 되는 제약**: macOS 앱은 macOS 러너에서만, Windows 앱은 Windows 러너에서만 빌드된다. 한 대에서 둘 다 뽑을 수 없다.

1. **GitHub Actions 매트릭스 구성**. `macos-latest` + `windows-latest` 두 잡에서 각각 빌드하고 아티팩트를 모아 하나의 Release에 올리는 워크플로의 모양.
2. **트리거**. main 푸시마다인가, 태그 푸시(`v*`)일 때인가? 에이전트가 어떤 행동을 하면 릴리스가 나가는지 명확해야 한다.
3. **아티팩트 형식**. macOS는 `.dmg`인가 `.zip`인가? Windows는 NSIS 설치 파일인가 portable `.exe`인가? 서명하지 않는다는 전제([02번](02-code-signing-and-smartscreen.md))가 이 선택에 영향을 주는가?
4. **Apple Silicon vs Intel**. macOS 빌드를 universal로 뽑는가, arm64만인가?
5. **서명 훅의 자리**. 지금은 켜지 않지만 나중에 인증서만 꽂으면 동작하도록, 워크플로의 어디에 무엇을 비워두는가?
6. **README 우회 안내**. macOS의 "확인 없이 열기", Windows SmartScreen의 "추가 정보 → 실행" 절차를 어떻게 안내하는가. 02번 조사 결과를 사용자용 문장으로 옮긴다.
7. **버전 관리**. 앱 버전을 어디서 읽고 Release 태그와 어떻게 맞추는가?

## 참고

- [05번 티켓](05-shell-framework-adr.md)의 결론에 따라 도구가 갈린다(electron-builder vs tauri-action). 각각의 공식 GitHub Actions 지원 현황을 1차 문서에서 확인한다.

## Comments

### 05번 결정에서 넘어온 것 (2026-08-25)

셸은 **Electron**으로 확정됐다([05번](05-shell-framework-adr.md)). 이 티켓이 받아야 할 것:

- **툴체인은 Node뿐이다.** Rust 툴체인·`cargo` 캐시가 CI에서 사라진다. `electron-builder`가
  macOS/Windows 타깃을 모두 설정한다.
- **서명을 명시적으로 꺼야 한다.** 05번 프로토타입을 로컬에서 패키징했을 때
  `electron-builder`가 키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다.**
  [02번](02-code-signing-and-smartscreen.md) 결정은 "서명하지 않는다"이므로 `mac.identity: null`로
  껐다는 걸 명시해야 한다. 그러지 않으면 러너의 키체인 상태에 따라 산출물이 달라진다.
  02번이 말한 "서명 훅 자리를 비워둔다"는 것의 실제 구현이 이것이다.
- **macOS 아키텍처를 정해야 한다.** arm64 단일 빌드의 `.app`이 286MB, DMG가 120.8MB다.
  universal(arm64 + x64)로 뽑으면 대략 두 배가 된다. 선택지: universal 하나 / arm64·x64
  DMG 두 개 / arm64만. **이 티켓에서 결정해야 한다.**
- **출력 경로가 vite 출력과 충돌하지 않게 해야 한다.** 프로토타입에서 둘 다 `dist/`를 써서
  asar가 자기 자신을 삼켜 320MB가 됐다. `directories.output`을 분리한다.

### 09번 결정에서 넘어온 것 (2026-08-26)

[09번](09-project-structure.md)이 툴체인 전체를 확정했다. 이 티켓이 받아야 할 것들이다.

- **워크플로가 부를 명령은 두 개다**: `pnpm verify`(lint·typecheck·test)와 `pnpm build`
  (= `turbo run build`). 후자가 이미 lint·typecheck·코어 테스트를 `dependsOn`으로 물고 있어
  **검증이 통과하지 못하면 산출물이 만들어지지 않는다.** 워크플로에서 검증을 따로 앞세울지,
  `pnpm build` 하나에 맡길지는 이 티켓의 판단이다.
- **turbo 캐시는 git 저장소가 있어야 동작한다.** `actions/checkout`의 기본 `fetch-depth: 1`에서
  turbo가 캐시를 제대로 쓰는지 확인해야 한다. 원격 캐시는 켜지 않는다(개인 도구).
- **TypeScript 7은 플랫폼별 바이너리다.** `@typescript/typescript-win32-x64`가 lockfile에
  들어 있어야 `windows-latest` 잡에서 `typecheck`가 돈다. `esbuild`·`electron`도 마찬가지다.
  `pnpm install --frozen-lockfile`이 러너별로 성공하는지가 실제 확인 지점이다.
- **`pnpm-workspace.yaml`의 `allowBuilds`에 `electron`과 `esbuild`가 있어야 한다.**
  빠지면 CI에서 `ERR_PNPM_IGNORED_BUILDS`로 설치가 실패한다.
- **`minimumReleaseAge` 공급망 정책이 CI에서도 적용된다.** 갓 릴리스된 버전이 lockfile에 들어가면
  러너에서 설치가 거부된다. 의존성 갱신 시 `minimumReleaseAgeExclude`를 함께 손봐야 한다.
- **Node는 24 LTS(Krypton)다.** `actions/setup-node`의 `node-version`을 여기 맞춘다.
  Node 26은 `Temporal`이 네이티브지만 09번이 폴리필을 쓰기로 해 이유가 사라졌다.
- **빌드 도구는 `electron-vite` 5 + Vite 7이다.** 출력이 `out/`이고 `electron-builder`의
  `directories.output`은 그와 겹치지 않게 `release/`로 둔다(프로토타입에서 둘 다 `dist/`를 써
  asar가 자기 자신을 삼킨 사고의 대응).
- **09번이 실행하지 못한 것**: `electron-vite` 통합 자체와 Windows. 이 티켓이 CI에서 처음
  확인하게 된다.

## Answer

### 0. 한 줄 요약

**워크플로 둘로 가른다. `ci.yml`이 main 푸시마다 macOS·Windows 양쪽에서 검증하고, `release.yml`이 `v*` 태그 푸시에만 패키징한다.** 두 러너는 아무것도 publish하지 않고 아티팩트만 올리며, **릴리스를 만드는 잡은 하나뿐**이다. macOS는 **arm64 DMG 하나**, Windows는 **NSIS 설치 파일 하나**. 서명은 `mac.identity: null` / `win.signExecutable: false`로 설정 파일에서 명시적으로 끈다.

| 질문 | 결정 |
|---|---|
| 1. 매트릭스 구성 | 빌드 잡 2개(`macos-latest`·`windows-latest`) → 아티팩트 → **수집 잡 1개**가 릴리스 생성 |
| 2. 트리거 | **워크플로 둘**. 검증은 main 푸시·PR마다, 릴리스는 `v*` 태그 푸시에만 |
| 3. 아티팩트 형식 | macOS **`.dmg`만**(zip 없음), Windows **`nsis`** |
| 4. macOS 아키텍처 | **arm64 전용**. universal도 x64도 만들지 않는다 |
| 5. 서명 훅 | `electron-builder.yml`의 세 줄. 워크플로에는 주석으로 시크릿 목록만 |
| 6. README 우회 안내 | 새 `README.md` 설치 절 + 릴리스 본문. **v1은 글만, 스크린샷은 첫 릴리스 후** |
| 7. 버전 | **`apps/desktop/package.json`의 `version`이 유일 출처**, 태그는 `v` + 그 값. 릴리스 잡이 일치를 검사한다 |
| 검증을 앞세우는가 | **앞세운다.** `pnpm verify` 다음 `pnpm build` |

근거 조사는 [`research/10-release-pipeline-findings.md`](../research/10-release-pipeline-findings.md)에 있다. 1차 출처(electron-builder `26.15.7` 태그의 소스, actions/runner-images README, pnpm.io, npm registry API)와 로컬 pnpm 11.24.0 재현 실험이 근거다.

---

### 1. 왜 워크플로가 둘인가 — main 푸시마다 릴리스하지 않는다

지도의 확정 전제는 "AI 에이전트가 main 푸시 시 OS별 바이너리를 함께 업로드한다"이다. 그 전제가 정하는 것은 **누가 하는가**(사람이 아니라 에이전트)이지 **어떤 이벤트인가**가 아니다. 이 티켓의 Q2가 그걸 열어둔 이유다. 갈랐다.

**main 푸시마다 릴리스를 기각한 이유는 소음이 아니라 버전이다.** 7절이 정하듯 버전의 유일한 출처는 `apps/desktop/package.json`이다. 문서를 고친 커밋에도 릴리스가 나가면, **같은 버전 번호를 가진 릴리스가 여러 개** 생기거나 커밋마다 버전을 올려야 한다. 전자는 "v1.2.0을 받았는데 어느 v1.2.0인가"가 되고, 후자는 에이전트가 오타를 고칠 때마다 마이너를 올린다. 둘 다 성립하지 않는다.

그런데 **태그 푸시에만 워크플로를 걸면 main 푸시가 아무 검증도 받지 못한다.** 이 지도에는 그러면 안 되는 강한 이유가 있다 — 05·06·07·09번이 전부 **"Windows에서 아무것도 실행하지 못했다"**를 구멍으로 남겼다. 검증이 릴리스 시점에만 돈다면 Windows가 깨진 것을 **릴리스를 자르는 순간에** 알게 된다. 가장 나쁜 시점이다.

그래서 둘이다.

| 파일 | 트리거 | 러너 | 하는 일 |
|---|---|---|---|
| `ci.yml` | `push: [main]`, `pull_request`, `workflow_dispatch` | `macos-latest` + `windows-latest` | `pnpm install --frozen-lockfile` → `pnpm verify` → `pnpm build`. **패키징하지 않는다** |
| `release.yml` | `push: tags: ['v*']` | 같은 둘 + 수집 잡 하나 | 검증 후 `electron-builder`, 아티팩트 업로드, 릴리스 생성 |

`ci.yml`이 Windows 러너를 도는 것이 이 설계에서 값을 하는 지점이다. 09번이 10번에게 넘긴 "`pnpm install --frozen-lockfile`이 러너별로 성공하는가"가 **커밋 단위로** 확인된다. `ci.yml`은 `electron-builder`를 부르지 않으므로 Electron 배포본(약 100~200MB)을 내려받지 않아 잡당 비용이 작다.

**에이전트의 릴리스 절차**는 네 단계다. `apps/desktop/package.json`의 `version` 올리기 → 커밋 → main 푸시 → `git tag v<version> && git push --tags`.

여기에 조사가 밝힌 함정 하나가 붙는다. **워크플로가 `GITHUB_TOKEN`으로 푸시한 태그는 다른 워크플로를 트리거하지 않는다**(docs.github.com). 즉 "CI가 자동으로 태그를 밀어 릴리스를 트리거"하는 설계는 **동작하지 않는다.** 우리 설계는 에이전트가 **자기 로컬 세션에서 사용자 자격증명으로** 태그를 미는 것이라 이 제약에 걸리지 않는다. 자동 태깅을 나중에 붙이고 싶어지면 PAT가 필요해진다는 것만 알아두면 된다.

---

### 2. 릴리스를 만드는 잡은 하나다 — 매트릭스가 직접 publish하지 않는다

이것이 이 티켓의 **구조적 결정**이다.

`electron-builder`에 내장 publish가 있고 `--publish always`면 같은 태그의 draft를 찾아 재사용한다. 그래서 "두 러너가 각자 publish한다"가 자연스러워 보인다. **그런데 소스를 읽으면 성립하지 않는다.**

`packages/electron-publish/src/gitHubPublisher.ts`의 `getOrCreateRelease()`는 릴리스 목록을 훑어 draft가 있으면 재사용하고, 없으면 `createRelease()`를 부른다. 그리고 **`createRelease()`에는 422 `already_exists` 재시도가 없다.** 소스에서 422를 처리하는 곳은 **에셋 업로드 경로뿐**이다. macOS 잡과 Windows 잡은 거의 동시에 시작하므로 둘 다 "draft 없음"을 보고 둘 다 생성을 시도할 수 있고, **한쪽이 그냥 실패한다.** 실패가 확률적이라 더 나쁘다 — 세 번에 한 번 깨지는 릴리스 파이프라인은 고장 난 것보다 다루기 어렵다.

electron-builder 문서가 권장하는 회피책은 "**사람이 draft를 먼저 만들어 두고 CI는 붙이기만 한다**"인데, 이건 릴리스마다 수동 단계를 하나 넣는 것이라 "에이전트가 릴리스를 낸다"는 전제를 깬다.

**그래서 쓰기를 한 곳으로 모은다.**

```
build (macos-latest)  ─┐
   --publish never     │→  upload-artifact: dist-macos-latest
                       │
build (windows-latest) ─┤
   --publish never     │→  upload-artifact: dist-windows-latest
                       │
                       └→  release (ubuntu-latest, needs: build)
                              download-artifact: pattern dist-*, merge-multiple
                              버전·태그 일치 검사
                              softprops/action-gh-release@v3
```

**쓰는 잡이 하나면 경쟁 조건이 존재하지 않는다.** 이건 방어가 아니라 제거다.

**릴리스 생성 수단은 `softprops/action-gh-release@v3`으로 정한다.** `gh release create`도 후보였고 러너에 이미 깔려 있지만(macOS 2.96.0 / Windows 2.97.0), 조사가 **이미 존재하는 릴리스에 대한 동작을 1차 문서에서 확인하지 못했다.** 실패한 릴리스 워크플로를 **다시 돌리는 것**은 에이전트가 실제로 하게 될 행동이라 여기서 갈렸다 — `softprops` v3는 소스상 릴리스 생성·에셋 업로드 양쪽의 `already_exists`를 명시적으로 처리하고 `overwrite_files` 기본값이 `true`라 재실행이 멱등이다.

수집 잡은 `ubuntu-latest`다. 파일을 옮겨 붙일 뿐이라 Node도 pnpm도 필요 없다.

**부수 결정**
- 릴리스는 **draft로 만들지 않고 바로 publish한다.** 사용자의 통제 지점은 이미 "태그를 미는 것"이고, draft를 두면 한 번의 의도에 두 번의 수동 조작이 든다.
- 아티팩트 이름은 매트릭스마다 다르게 준다(`dist-${{ matrix.os }}`). `upload-artifact` v4부터 아티팩트가 **불변**이라 같은 이름 재업로드가 실패한다. 수집은 `pattern: dist-*` + `merge-multiple: true`.
- 릴리스 잡에만 `permissions: contents: write`를 붙인다. `GITHUB_TOKEN`의 기본 권한은 리포지토리·조직 설정에 따라 달라져 문서상 고정 기본값이 없으므로 명시가 정답이다. `permissions:`를 쓰면 적지 않은 스코프는 전부 `none`이 되므로 빌드 잡은 기본값(읽기)만 갖는다.
- 빌드 잡은 `--publish never`를 **명시한다.** 암묵적 publish는 v27에서 제거 예정이라고 문서가 경고한다. 지금 자동 감지에 기대면 업그레이드 때 조용히 깨진다.

---

### 3. 아티팩트 형식: macOS `.dmg` 하나, Windows `nsis` 하나

**macOS에서 `zip`을 뺀다.** electron-builder의 mac 기본 타깃은 `dmg` + `zip`이고, `zip`이 있는 유일한 이유는 **Squirrel.Mac 자동 업데이트**다. 자동 업데이트는 이 지도의 Out of scope다(서명이 전제라 02번 결정으로 성립하지 않는다). 따라서 zip은 할 일이 없다. 명시적으로 `target: [dmg]`를 적어야 기본값이 zip을 딸려오지 않는다.

조사는 **"서명 없이 배포할 때 zip이 dmg보다 유리한가"를 1차 문서로 확인하지 못했다.** Apple 개발자 문서 본문을 읽지 못했고 포럼 답변만 확보했다. 그래서 이 축으로는 판단하지 않았다. 위 근거(자동 업데이트가 범위 밖 → zip의 존재 이유가 없다)는 그것과 무관하게 선다.

**Windows는 `nsis`다.** `portable`(설치 없는 단일 exe)이 후보였다. 가른 것은 SmartScreen이 아니라 **데이터가 어디 사느냐**다. 08번이 저장 파일을 `userData` 고정으로 정했으므로 앱은 어차피 `%APPDATA%`에 상태를 남긴다. 즉 portable exe는 **실제로 portable하지 않다** — 파일을 옮겨도 데이터는 따라오지 않는다. 이름이 약속을 지키지 못하는 선택지다. 그리고 트레이 앱은 계속 떠 있는 물건이라 안정된 설치 위치와 제거 경로가 있는 편이 맞다. electron-builder 기본값 `oneClick: true`를 그대로 쓴다.

(SmartScreen 쪽으로도 NSIS가 나을 **가능성**은 있다 — 설치된 exe는 다운로드된 파일이 아니라 설치 프로그램이 쓴 파일이라 Mark-of-the-Web을 달지 않을 것이므로, 경고가 설치 시 한 번으로 끝날 수 있다. **다만 조사가 타깃별 SmartScreen 차이를 어느 1차 문서에서도 찾지 못했다.** 추측이므로 근거로 쓰지 않았고, 위의 데이터 위치 논거만으로 결정했다. Windows 실물에서 확인할 항목이다.)

**파일 이름은 ASCII로 뽑는다.** `productName`은 앱 이름이므로 한국어 `연차몇개`를 쓰지만, 기본 `artifactName` 매크로가 그대로 다운로드 파일명이 되면 릴리스 URL이 퍼센트 인코딩으로 뒤덮인다. `artifactName: "yeonchamyeotgae-${version}-${arch}.${ext}"`로 분리한다. `executableName`도 ASCII로 둔다. 사용자에게 보이는 이름(메뉴 막대, 시작 메뉴 바로가기, DMG 볼륨)은 `productName`에서 나오므로 한국어가 유지된다.

릴리스에 붙는 자산은 **정확히 둘**이다. `yeonchamyeotgae-<version>-arm64.dmg`와 `yeonchamyeotgae-<version>-x64.exe`.

---

### 4. macOS는 arm64만 만든다

05번이 열어두고 09번을 거쳐 여기로 온 결정이다. **arm64 전용 DMG 하나.** universal도, arm64·x64 두 개도 아니다.

가른 것은 용량이 아니라 **러너다.**

- `macos-latest`는 **macOS 26 arm64**다(actions/runner-images README). x64 macOS 러너는 `macos-26-intel` / `macos-latest-large`이고 **유료 large 러너 계열**이다. 개인 도구에 러너 요금이 붙는다.
- 그리고 겹쳐 걸린다 — **pnpm 11은 Intel macOS(`darwin-x64`) 바이너리를 배포하지 않는다**(`pnpm/setup@v2` README). Intel 러너를 쓰려면 pnpm 12가 필요하다. 09번이 정한 툴체인이 그 경로를 막고 있다.

`arch: universal`은 유료 러너를 피하면서 x64를 담는 유일한 길이지만, **그게 최악의 선택지다.** 소스를 읽으면 universal은 x64를 한 번, arm64를 한 번, 총 **두 번 패키징한 뒤 `@electron/universal`로 병합**한다. 빌드 시간과 Electron 다운로드가 2배가 되고, 프레임워크 바이너리가 fat binary가 되어 결과물이 커진다. 그 커진 파일을 **실제 사용자(arm64)가 내려받는다.** x64 사용자가 0명인데 arm64 사용자의 다운로드만 늘어난다.

두 개의 DMG(arm64·x64)를 따로 뽑는 안은 다운로드 용량 문제는 없지만, 유료 러너를 쓰거나 arm64 러너에서 x64를 크로스 빌드해야 한다. **후자는 아마 될 것이다** — 우리 앱은 네이티브 모듈이 0개라(05번이 Electron을 고른 근거다) electron-builder가 x64 Electron 배포본을 받아 파일을 복사할 뿐이고 arch 종속 작업이 없다. 다만 조사가 이걸 보증하는 문서를 찾지 못했다.

**결론은 "x64 사용자가 0명이다"에서 나온다.** 사용자는 arm64 Mac 한 명이다. 0명을 위해 빌드 시간·용량·유료 러너 중 무엇도 지불하지 않는다.

**되돌리는 비용이 작다는 것이 이 결정을 싸게 만든다.** x64가 필요해지면 순서는 (1) arm64 러너에서 `--x64`를 그냥 시도한다(무료, 아마 된다), (2) 안 되면 pnpm 12로 올리고 `macos-26-intel`을 매트릭스에 추가한다. `arch` 한 줄과 매트릭스 한 항목이다.

**참고로만 덧붙인다**: macOS 26이 Intel Mac을 지원하는 마지막 릴리스라고 알려져 있어 x64 대상 인구가 줄어드는 방향이다. **이 티켓에서 1차 출처로 확인하지 않았으므로 결정의 근거로 쓰지 않았다.** 위 세 논거만으로 선다.

---

### 5. 서명 훅의 자리 — 워크플로가 아니라 `electron-builder.yml`의 세 줄이다

05번이 "electron-builder가 키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다**"를 실측으로 남겼고, 02번은 "서명하지 않는다"로 끝났다. 그 둘을 잇는 것이 여기다.

**끄는 방법은 `mac.identity: null`이다. 환경변수가 아니다.** 소스가 두 방식의 차단 지점이 다르다는 것을 보여준다.

`macPackager.ts`의 `sign()`:

```ts
const qualifier = config.identity
if (qualifier === null) {
  return this.helper.handleNullIdentity()   // ← 키체인을 조회하기 전에 반환한다
}
const keychainFile = (await this.codeSigningInfo.value).keychainFile
```

`identity === null`이면 **키체인 조회 자체가 일어나지 않는다.** 반면 `CSC_IDENTITY_AUTO_DISCOVERY=false`는 `flags.ts`의 한 줄짜리 플래그로 "자동 탐색 단계"만 끄고, **환경변수라 로컬 셸에서 빠뜨리면 05번의 사고가 그대로 재발한다.** 설정 파일에 박으면 로컬과 CI가 같은 동작을 한다. `apps/desktop/electron-builder.yml`에 다음 세 줄이 들어간다.

```yaml
mac:
  identity: null          # 02번 결정. 인증서를 꽂을 때 이 줄을 지운다
  hardenedRuntime: false  # identity: null과 짝
win:
  signExecutable: false   # 서명만 끈다. 아이콘·버전 리소스 편집은 유지된다
```

**`win.signAndEditExecutable: false`를 쓰면 안 된다.** 이름이 비슷하지만 리소스 편집까지 꺼져 **12번이 만들 아이콘이 exe에 안 붙는다.** `signExecutable`이 "서명만 끄고 resedit은 유지"를 정확히 표현하는 26.x 전용 옵션이고, JSDoc이 둘의 차이를 명시한다. 이 구분은 문서 사이트보다 `winOptions.ts` 원문이 훨씬 분명하다.

`hardenedRuntime: false`는 문서 경고("서명을 끄면 Hardened Runtime도 꺼라 — 조합이 실행을 막을 수 있다")를 따른 것인데, 그 경고문의 제목이 ad-hoc 서명이라 `identity: null`에도 적용되는지 문면상 모호하다. **확인되지 않았으므로 안전한 쪽(끄는 쪽)으로 둔다.** 첫 macOS 빌드가 실제로 실행되는지 확인하는 것이 검증이다.

**나중에 켜는 방법 — 이게 "훅"의 실체다.** 워크플로 YAML에는 주석 블록 하나만 둔다. 켤 때 하는 일은:

1. `mac.identity: null`을 **지운다.** ← **가장 중요하다.** 지우지 않으면 `CSC_LINK`를 넣어도 위 코드가 그 앞에서 반환해 **조용히 서명되지 않는다.**
2. `mac.hardenedRuntime: true`로 되돌린다(공증의 전제다).
3. `mac.notarize: true`를 켠다.
4. 리포지토리 시크릿을 넣고 빌드 잡의 `env:`에 연결한다 — `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

**빈 시크릿을 미리 `env:`에 꽂아두는 안은 기각했다.** 워크플로 diff가 0이 되어 매력적이지만, 존재하지 않는 시크릿은 빈 문자열로 렌더되고 **electron-builder가 빈 `CSC_LINK`를 미설정으로 취급하는지 확인되지 않았다.** 서명을 켜지도 않았는데 빌드가 깨지는 위험을 지금 지불할 이유가 없다. 주석 + 위 체크리스트가 훅이다.

---

### 6. README 우회 안내

저장소에 **`README.md`가 아직 없다.** 만드는 것부터다. 02번이 조사한 것을 사용자용 문장으로 옮긴다. 안내는 **두 곳**에 있어야 한다 — README 설치 절과 **릴리스 본문**. 사람이 실제로 도착하는 곳은 릴리스 페이지이고, 거기서 파일을 받고 거기서 경고를 만난다. 릴리스 본문은 체크인된 파일 하나에서 읽어 매 릴리스에 같은 문장이 들어가게 한다.

들어갈 내용이다.

> **macOS**
> 1. `.dmg`를 열고 앱을 `응용 프로그램`으로 끌어다 놓습니다.
> 2. 처음 실행하면 *"확인되지 않은 개발자가 배포했기 때문에 열 수 없습니다"*가 뜹니다. **닫기**를 누릅니다.
> 3. **시스템 설정 → 개인정보 보호 및 보안**을 열고 아래로 스크롤하면 방금 차단된 앱이 보입니다. **확인 없이 열기**를 누릅니다.
> 4. 한 번 허용하면 다음부터는 그냥 열립니다.
>
> 우클릭 → 열기 방식은 최근 macOS에서 막혔습니다. 위 경로를 쓰세요.
>
> **Windows**
> 1. `.exe`를 실행하면 파란 화면으로 *"Windows에서 PC를 보호했습니다"*가 뜹니다.
> 2. **추가 정보**를 누르면 나타나는 **실행**을 누릅니다.
>
> **왜 이런 경고가 뜨나요?** 이 앱은 코드 서명을 하지 않았습니다. macOS 서명은 연 $99가 들고, Windows는 **돈을 내도 이 경고를 없앨 수 없습니다** — 2024년부터 EV 인증서도 SmartScreen 평판을 즉시 주지 않아 다운로드 수가 유기적으로 쌓여야 합니다. 사용자 한 명짜리 개인 도구 단계에서는 지불이 목적을 달성하지 못한다고 판단했습니다.

**스크린샷은 v1 README에 넣지 않는다.** 02번이 "스크린샷과 함께"를 남겼지만 지금 찍을 수 없다 — macOS 다이얼로그는 **서명 안 된 앱을 실제로 내려받아야** 나오고, Windows는 이 지도가 한 번도 접근하지 못한 환경이다. 없는 스크린샷을 기다리느라 README를 미루는 것보다 글로 먼저 쓰는 편이 낫다. **첫 릴리스를 실제로 내려받아 두 경고를 만나는 순간이 스크린샷을 찍을 유일하고 자연스러운 시점이다.** 그때 추가한다. 의도적으로 미룬 것이지 빠뜨린 것이 아니다.

---

### 7. 버전은 `apps/desktop/package.json`에서 온다

`packager.ts`를 읽으면 버전의 출처가 분명하다. electron-builder는 `<projectDir>/package.json`을 읽고, `projectDir`의 기본값은 실행 디렉터리다. `directories.app`을 설정한 two-package 레이아웃이 아닌 한 그 파일이 곧 메타데이터이며, `appInfo.ts`가 `this.version = info.metadata.version!`으로 받는다.

**즉 `apps/desktop`에서 electron-builder를 실행하면 `apps/desktop/package.json`의 `version`이 앱 버전이다. 루트 `package.json`은 관여하지 않는다.** 루트는 `private: true`에 버전을 두지 않거나 `0.0.0`으로 고정한다. 버전이 사는 곳은 한 군데다.

**태그는 `v` + 그 값이다.** 방향이 `package.json` → 태그다. 이것이 electron-builder 문서가 지지하는 유일한 패턴이고("Set the Tag version to the value of `version` in your application `package.json`, and prefix it with `v`"), 소스의 draft 매칭 조건(`release.tag_name === this.tag || release.tag_name === this.version`)과도 일치한다.

반대 방향(태그에서 파싱해 `-c.extraMetadata.version=`으로 주입)도 기술적으로 유효하지만 문서의 권고가 아니고, **더 나쁜 점은 앱이 자기 버전을 모른 채 빌드된다는 것**이다. 팝오버 설정 탭이 버전을 띄우게 되면 그 값이 CLI 인자에서 온다.

**대신 릴리스 잡에 일치 검사를 둔다.** `apps/desktop/package.json`의 `version`과 `GITHUB_REF_NAME`에서 `v`를 뗀 값을 비교해 다르면 실패시킨다. 이 검사가 없으면 태그는 `v1.2.0`인데 앱이 자기를 `1.1.0`이라고 말하는 릴리스가 **아무 오류 없이** 나간다. 조용히 틀리는 종류라 검사가 값을 한다.

**빌드 번호는 붙이지 않는다.** `appInfo.ts`가 `buildVersion`을 만들 때 읽는 환경변수 목록(`BUILD_NUMBER`, `TRAVIS_BUILD_NUMBER`, `CIRCLE_BUILD_NUM` 등)에 **GitHub Actions 것이 하나도 없다.** 따라서 `buildVersion === version`이 되고, 이게 우리가 원하는 바다. `GITHUB_RUN_NUMBER`를 넣고 싶다면 `-c.buildNumber=`로 명시해야 하지만 v1에서는 하지 않는다 — 버전 문자열이 두 개가 되는 만큼의 값이 없다.

---

### 8. 검증을 앞세운다 — `pnpm verify && pnpm build`

09번이 이 티켓에 넘긴 판단이다. **앞세운다.**

`turbo.json`의 `build`가 `["lint", "typecheck", "^test"]`에 의존하므로 `pnpm build` 하나로 충분해 보인다. 그런데 그 그래프를 정확히 펼치면 `@yeoncha/desktop#build`가 끌어오는 것은 **desktop의 lint**, `^typecheck`를 타고 온 **core의 typecheck**, `^test`가 끌어온 **core의 test**다. **core의 `lint`는 이 그래프에 들어오지 않는다** — `core`에는 `build` 태스크가 없어(09번 2절, 코어는 빌드하지 않는다) 그 패키지의 `build → lint` 간선이 애초에 생기지 않기 때문이다.

09번 7절은 "코어에 `let x = 1`을 심으니 `@yeoncha/core#lint`가 실패하고 `@yeoncha/desktop#build`가 실행되지 않았다"고 실측을 기록했다. 그 관찰과 위 그래프 해석이 어긋난다. **어느 쪽이 맞는지 여기서 판정하지 않는다** — 판정할 필요가 없기 때문이다. `pnpm verify`를 앞에 두면 두 해석 어느 쪽에서도 코어가 린트된다. 웜 캐시에서 `verify`는 0.49초이고 그 뒤 `build`는 겹치는 태스크를 전부 캐시 히트로 건너뛴다. **비용이 거의 0인데 그래프 해석에 대한 의존이 사라진다.**

두 번째 이유는 로그다. CI에서 `verify`와 `build`가 나뉘어 있으면 실패가 "검증에서 깨졌다"인지 "패키징에서 깨졌다"인지 스텝 이름으로 바로 갈린다. 에이전트가 읽을 로그다.

**turbo 원격 캐시는 켜지 않는다**(개인 도구). 로컬 캐시(`actions/cache`로 `.turbo`)도 v1에서는 붙이지 않는다 — 잡이 매번 새 러너라 캐시 히트가 나려면 캐시 저장·복원 비용을 먼저 내야 하는데, `pnpm verify` 콜드가 1.19초짜리다. 캐시가 아낄 것보다 캐시 자체가 비싸다.

09번이 남긴 "`fetch-depth: 1`에서 turbo 캐시가 도는가"는 **답이 필요 없어졌다.** 조사도 Turborepo 문서에서 명시적 서술을 찾지 못했다(가이드가 `fetch-depth: 2`를 예제로 쓰지만 이유를 밝히지 않는다). 우리는 CI에서 turbo 캐시에 기대지 않으므로 `actions/checkout` 기본값을 그대로 쓴다.

---

### 9. 러너 설정: `pnpm/setup@v2` 한 스텝

09번이 `actions/setup-node`의 `node-version`을 Node 24에 맞추라고 넘겼는데, **조사가 그 스텝 자체를 없앴다.**

`pnpm/action-setup` README 최상단이 후계자를 직접 지정한다 — *"This action has a successor: `pnpm/setup`. For pnpm v11 and newer, use `pnpm/setup` instead ... replacing `actions/setup-node`."* 09번이 pnpm 11로 정했으므로 해당된다.

```yaml
- uses: actions/checkout@v7
- uses: pnpm/setup@v2
  with:
    version: 11
    runtime: node@24
    cache: true
    install: false
- run: pnpm install --frozen-lockfile
```

두 액션이 한 스텝이 되면서 **순서 함정도 사라진다**(`setup-node`의 pnpm 캐싱은 `pnpm store path`를 실행해야 해서 pnpm이 PATH에 먼저 있어야 했다).

**`install: false`를 명시한다.** `pnpm/setup`의 `install` 기본값이 `true`라 `package.json`이 있으면 알아서 `pnpm install`을 돌린다. pnpm은 CI를 감지하면 frozen-lockfile로 기울지만, **`--frozen-lockfile`을 손으로 적어 로그에 보이게 하는 편이 낫다.** 09번이 lockfile 고정을 전제로 세운 것이 많다.

**Electron 캐시는 붙이지 않는다.** 조사가 밝힌 사실 하나가 여기 걸린다 — **Electron 42부터 postinstall이 없어졌다**(44.0.0의 `package.json`에 `scripts` 키 자체가 없는 것을 실측). 바이너리는 `require('electron')` 시점이나 electron-builder의 `@electron/get`이 각자 내려받고, **pnpm 스토어 캐시에는 안 들어간다.** 잡으려면 `~/Library/Caches/electron`·`~/Library/Caches/electron-builder`(Windows는 `%LOCALAPPDATA%`)를 `actions/cache`로 따로 잡아야 한다. v1에서는 하지 않는다 — `ci.yml`은 패키징하지 않아 애초에 Electron을 받지 않고, `release.yml`은 한 달에 몇 번 돈다. 릴리스 시간이 거슬려지면 그때 이 두 경로를 붙이면 된다.

---

### 10. 09번이 넘긴 것들에 대한 답 — 두 군데가 교정된다

09번 Comments가 이 티켓에 넘긴 여섯 항목을 하나씩 닫는다.

| 09번이 넘긴 것 | 이 티켓의 답 |
|---|---|
| `pnpm verify` / `pnpm build` 중 무엇을 부르는가 | 둘 다. 8절 |
| turbo 캐시가 `fetch-depth: 1`에서 도는가 | 답이 필요 없어졌다. CI에서 turbo 캐시에 기대지 않는다. 8절 |
| TS 7의 플랫폼별 바이너리가 lockfile에 드는가 | **든다. 문제가 존재하지 않는다** (아래) |
| `allowBuilds`에 `electron`·`esbuild` | **`electron`은 불필요하다. 다른 것이 필요하다** (아래) |
| `minimumReleaseAge`가 CI에도 적용되는가 | frozen install에는 사실상 무관하다 (아래) |
| Node 24 LTS에 `setup-node`를 맞춘다 | `setup-node`를 쓰지 않는다. 9절 |

**교정 1 — 플랫폼별 lockfile 문제는 존재하지 않는다.**

09번이 남긴 가장 큰 걱정이었다. 조사가 macOS arm64에서 우리 구조를 흉내낸 워크스페이스를 만들어 `pnpm-lock.yaml`을 실제로 생성해 확인했다. **`@typescript/typescript-win32-x64`를 포함한 20개, `@esbuild/win32-*`를 포함한 26개, `@biomejs/cli-win32-*` 포함 8개, `@turbo/windows-*` 포함 6개가 전부 lockfile에 기록됐다.** pnpm은 optionalDependencies를 플랫폼과 무관하게 lockfile에 다 적고, 설치할 때만 자기 플랫폼 것을 고른다. **`supportedArchitectures` 설정이 필요 없다.** Windows 러너의 `--frozen-lockfile`은 그냥 성공한다.

(TS 7의 실제 패키지 이름도 확인됐다. `@typescript/native-preview-*`가 아니라 **`@typescript/typescript-<os>-<arch>`** 형식이다.)

**교정 2 — `allowBuilds`는 `electron`이 아니라 `esbuild`가 관건이고, 목록이 아직 완전하지 않다.**

09번은 "`allowBuilds`에 `electron`과 `esbuild`가 있어야 한다"고 넘겼다. **`electron`은 필요 없다** — 42부터 postinstall이 사라져 pnpm이 애초에 플래그하지 않는다. 반대로 **`esbuild: true`는 반드시 커밋되어 있어야 한다.** 조사가 실측했다:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
```
종료 코드 **1**. `strictDepBuilds` 기본값이 `true`라 미승인 빌드 스크립트가 하나라도 있으면 install이 죽는다. 더 나쁜 건 **pnpm이 install 도중 `pnpm-workspace.yaml`에 플레이스홀더를 써넣는다**는 것이다 — CI 체크아웃이 더러워진다.

**그런데 이 실험의 픽스처에는 `electron-builder`가 없었다.** 05번 프로토타입의 실제 `pnpm-workspace.yaml`은 이랬다:

```yaml
allowBuilds:
  electron: true
  electron-winstaller: false
```

`electron-winstaller`는 electron-builder가 끌고 오는 이행 의존성이고(Squirrel Windows 타깃용), 우리는 그 타깃을 쓰지 않으므로 `false`가 맞다. **즉 실제 트리의 `allowBuilds` 목록은 아직 완전히 확인되지 않았다.** 스캐폴딩 지시는 이래야 한다 — **electron-builder를 포함한 전체 설치를 한 번 돌려 pnpm이 써넣는 플레이스홀더를 전부 확인하고, 값을 정해 `pnpm-workspace.yaml`에 커밋한 다음에 첫 CI를 돌린다.** 현재까지 알려진 값: `esbuild: true`(필수), `electron-winstaller: false`, `electron` 항목은 불필요.

**교정 3 — `minimumReleaseAge`는 CI에서 사실상 무해하다.**

`--frozen-lockfile`은 resolution 단계를 건너뛰므로(로그: `Lockfile is up to date, resolution step is skipped`) 이 설정이 작용할 자리가 없다. 영향을 받는 것은 lockfile을 갱신하는 **로컬** `pnpm add`/`pnpm update`다. 09번이 "의존성 갱신 시 `minimumReleaseAgeExclude`를 함께 손봐야 한다"고 쓴 것은 맞지만, 그건 로컬 작업의 이야기이지 러너의 이야기가 아니다.

다만 조사가 남긴 실마리가 하나 있다. pnpm 11의 frozen install 로그에 `✓ Lockfile passes supply-chain policies (verified 16s ago)`가 찍히는데, **이 검사가 무엇이고 실패 시 어떻게 되는지 pnpm 문서에 설명이 없다.** `minimumReleaseAge` 기본값이 v11부터 1440분(하루)이므로, **막 나온 버전으로 로컬에서 lockfile을 갱신한 직후 릴리스를 자르는 것은 피한다.** 실무 규칙 하나로 충분하다.

---

### 11. `@yeoncha/core`는 `devDependencies`에 둔다 — 그리고 09번의 함정 하나가 사라진다

조사가 `pnpmNodeModulesCollector.ts`를 읽어 확인한 사실: **electron-builder는 `pnpm list --prod --json --depth Infinity`로 의존성을 수집한다.** `--prod`이므로 **`dependencies`만 보고 `devDependencies`는 제외한다.**

여기에 09번 2절이 겹친다. `@yeoncha/core`의 `exports`는 `./src/index.ts`, 즉 **빌드되지 않은 TypeScript 소스**다. 그걸 `dependencies`에 두면 electron-builder가 `packages/core`를 `node_modules/@yeoncha/core`로 성실히 복사하는데, **Electron은 `.ts`를 실행할 수 없다.** 실행에 쓰이지 않는 죽은 파일이 asar에 들어간다.

정상 경로는 **Vite가 번들 시점에 인라인**하는 것이고, 그렇다면 `@yeoncha/core`는 `devDependencies`에 있어야 한다.

**그리고 이 배치가 09번 5절의 함정을 없앤다.** 09번은 이렇게 경고했다:

> `electron-vite`의 `externalizeDepsPlugin`은 `dependencies`를 전부 external로 빼는데 `@yeoncha/core`는 TypeScript 소스라 런타임에 `require`할 수 없다. `externalizeDepsPlugin({ exclude: ['@yeoncha/core'] })`로 번들에 포함시켜야 한다. **개발 중에는 보이지 않고 패키징된 앱만 실행 시점에 깨진다.**

`externalizeDepsPlugin`이 external로 빼는 대상이 `dependencies`이므로, **core가 `devDependencies`에 있으면 애초에 external 대상이 아니다.** `exclude`가 필요 없어진다. 09번의 함정과 electron-builder의 `--prod` 수집이 **같은 한 줄(어느 섹션에 두는가)로 동시에 풀린다.**

여기서 더 강한 것이 나온다. `react`·`react-dom`은 렌더러 전용이라 Vite가 번들하고, `electron`은 언제나 devDependency이며, `temporal-polyfill`은 core의 의존성이라 core와 함께 번들에 들어간다. **결과적으로 `apps/desktop`에는 런타임 `dependencies`가 하나도 없다.** electron-builder가 복사할 `node_modules`가 아예 없다는 뜻이고, 이건 검사 가능한 불변식이다.

> **불변식**: `apps/desktop/package.json`에 `dependencies`가 비어 있다. 여기에 항목이 하나라도 생기면 `externalizeDepsPlugin`과 electron-builder의 `--prod` 수집이 동시에 깨어나 패키징 이야기가 달라진다.

**확인 방법**: 첫 패키징 후 `npx asar list <app>/Contents/Resources/app.asar`. 우리 번들 코어(`out/`에서 온 것)만 보이고 `node_modules/@yeoncha/core`가 없어야 한다. 05번이 잰 `app.asar` 201KB가 대조군이다.

**주의**: `externalizeDepsPlugin`이 `dependencies`만 본다는 것은 electron-vite의 문서화된 동작이지만 **이 티켓이 실행으로 확인하지는 않았다.** 09번도 `electron-vite` 통합 자체를 돌려보지 못했다. 첫 패키징에서 위 `asar list`로 함께 확인할 항목이다.

---

### 12. 워크플로 골격

결정을 형태로 옮긴 것이다. 정확한 문법은 구현이 맞추고, 여기서 정한 것은 **잡의 개수와 경계, 그리고 각 스텝이 무엇을 보증하는가**다.

**`.github/workflows/ci.yml`**

```yaml
on:
  push: { branches: [main] }
  pull_request:
  workflow_dispatch:
jobs:
  verify:
    strategy:
      fail-fast: false                    # ← Windows만 깨진 것을 macOS 실패에 가리지 않는다
      matrix: { os: [macos-latest, windows-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - actions/checkout@v7
      - pnpm/setup@v2  (version: 11, runtime: node@24, cache: true, install: false)
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
      - run: pnpm build                   # electron-vite까지. 패키징은 하지 않는다
```

`fail-fast: false`가 이 워크플로의 존재 이유와 직결된다. Windows가 깨졌는데 macOS가 먼저 실패해 취소되면, **정확히 우리가 보고 싶었던 것을 못 본다.**

**`.github/workflows/release.yml`**

```yaml
on:
  push: { tags: ['v*'] }
jobs:
  build:
    strategy:
      fail-fast: false
      matrix: { os: [macos-latest, windows-latest] }
    runs-on: ${{ matrix.os }}
    steps:
      - checkout / pnpm setup / install --frozen-lockfile
      - run: pnpm verify
      - run: pnpm --filter @yeoncha/desktop exec electron-builder --publish never
        #   ↑ mac은 arm64 dmg, win은 nsis. 타깃·arch는 electron-builder.yml이 정한다
        # 서명을 켤 때 여기 env: 를 붙인다 → CSC_LINK / CSC_KEY_PASSWORD /
        #   APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
        #   그리고 electron-builder.yml의 mac.identity: null 을 반드시 지운다 (5절)
      - actions/upload-artifact@v7
          name: dist-${{ matrix.os }}
          path: apps/desktop/release/*.{dmg,exe}

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - actions/checkout@v7               # 버전 검사와 릴리스 본문 파일 때문에 필요하다
      - name: 태그와 앱 버전이 일치하는지 검사
        run: |
          v=$(node -p "require('./apps/desktop/package.json').version")
          [ "v$v" = "$GITHUB_REF_NAME" ] || { echo "태그 $GITHUB_REF_NAME ≠ 앱 버전 $v"; exit 1; }
      - actions/download-artifact@v8      # pattern: dist-*, merge-multiple: true, path: dist
      - softprops/action-gh-release@v3
          files: dist/*
          body_path: .github/RELEASE_BODY.md    # 6절의 우회 안내
```

`electron-builder`의 `directories.output`은 **`release`로 둔다.** 기본값은 `dist`이고 09번이 정한 `electron-vite` 출력은 `out`이라 기본값끼리 충돌하지는 않지만, 05번 프로토타입이 **둘 다 `dist`를 써서 asar가 자기 자신을 삼켜 320MB가 된 사고**를 밟았다. 이름을 갈라두는 편이 그 사고를 다시 밟을 여지를 없앤다. `.gitignore`에 `out/`·`release/` 둘 다 들어간다(09번 8절이 이미 그렇게 적었다).

**액션 버전** (조사 시점 최신): `actions/checkout@v7`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, `pnpm/setup@v2`, `softprops/action-gh-release@v3`(Node 24 런타임 필요 — 현재 러너 이미지는 충족).

`softprops`는 서드파티 액션이라 커밋 SHA로 핀하는 것이 공급망 관점에서 낫다. **v1에서는 태그(`@v3`)로 둔다** — 09번이 정한 pnpm `minimumReleaseAge` 정책은 npm 의존성에만 걸리고 액션에는 걸리지 않으므로 SHA 핀은 별개의 규율이며, 사용자 한 명짜리 도구에 지금 지불할 만큼의 값은 아니다. 판단이 바뀌면 한 줄이다.

---

### 13. electron-builder 버전과 설정을 읽을 때의 함정

**버전은 `26.15.7`로 정확히 핀한다.** npm의 `latest` 태그가 **26.15.3에 멈춰 있고**(2026-06-09) 실제 최신은 `v26` 태그의 26.15.7(2026-07-18)이다. `pnpm add -D electron-builder`를 그냥 치면 26.15.3이 들어온다. **pnpm v11 워크스페이스를 다루는 코드가 26.15.x 소스에 있으므로**(수집기가 pnpm 메이저를 감지해 워크스페이스 출력 형태를 분기한다) 최신 패치를 쓰는 편이 안전하다.

**설정을 결정할 때 `electron.build` 문서 사이트를 근거로 쓰면 안 된다.** 그 사이트는 **`master` 브랜치(= v27 알파)를 렌더링한다.** 사이트맵에 `/docs/migration/v26-to-v27`이 있고 `master`의 `mac.md`가 v26에 없는 파셜을 include한다. 조사 중 실제로 **존재하지 않는 옵션(`mac.sign.identity`)이 만들어졌고** 소스 확인으로 걸러졌다. 근거로 쓸 것은 `26.15.7` 태그의 `website/docs/`이거나 `packages/app-builder-lib/src/options/*.ts` 원문이다.

**그리고 electron-builder 저장소 문서 전체에 "pnpm"이라는 단어가 한 번도 나오지 않는다.** pnpm 지원은 소스와 테스트 픽스처에만 있다(픽스처에 `pnpm v11 workspace.txt`가 있으니 회귀 테스트 대상이긴 하다). **패키징에서 문제가 나면 문서가 아니라 소스와 이슈 트래커를 봐야 한다.** 구현 에이전트가 이걸 모르면 없는 문서를 찾느라 시간을 쓴다.

---

### 14. 11번이 스펙에 옮겨야 할 것

- **워크플로 둘의 경계**(1절)와 **쓰기 잡이 하나라는 것**(2절). 후자는 스펙에서 이유와 함께 적어야 한다 — 이유를 모르면 "electron-builder가 publish도 해주는데 왜 이렇게 돌아가지?"라며 되돌려진다.
- **`electron-builder.yml`의 서명 억제 세 줄**과 **켤 때의 4단계 체크리스트**(5절). 특히 *"`mac.identity: null`을 지우지 않으면 `CSC_LINK`를 넣어도 조용히 서명되지 않는다"*.
- **`apps/desktop`의 `dependencies`가 비어 있다는 불변식**(11절)과 그 확인 방법(`asar list`). 09번 5절의 `externalizeDepsPlugin({ exclude: [...] })` 함정은 **이 배치로 대체된다** — 스펙에 09번 문구를 그대로 옮기면 불필요한 설정을 넣게 된다.
- **`allowBuilds` 목록을 확정하는 순서**(10절 교정 2): electron-builder를 포함한 전체 설치를 한 번 돌려 플레이스홀더를 전부 본 뒤 값을 정해 커밋하고, 그 다음에 첫 CI를 돌린다. `esbuild: true`가 빠지면 종료 코드 1이다.
- **09번 9절의 함정 일곱 중 하나가 무효화된다**: "turbo 캐시는 git 저장소가 있어야 동작한다"는 스캐폴딩 순서 지시로 유효하지만, **CI에서는 turbo 캐시에 기대지 않으므로**(8절) `fetch-depth` 조정이 필요 없다.
- **`README.md`를 만들어야 한다**는 것 자체(6절). 저장소에 아직 없다. 그리고 `.github/RELEASE_BODY.md`도 같은 문장을 담는다.
- **버전의 유일한 출처**와 릴리스 잡의 일치 검사(7절).

---

### 15. 검증하지 못한 것

이 티켓은 조사와 설계다. **워크플로를 실제로 돌리지 않았다.** 첫 릴리스가 확인해야 할 것들이다.

- **Windows에서 아무것도 실행하지 못했다.** 05·06·07·09번이 남긴 것과 같은 구멍이고, `ci.yml`을 main 푸시에 거는 결정(1절)이 이 구멍을 커밋 단위로 좁히려는 조치다. 다만 **첫 CI 실행 전까지는 여전히 열려 있다.**
- **`@yeoncha/core`가 번들에 실제로 인라인되는지**(11절). `externalizeDepsPlugin`이 `dependencies`만 본다는 것은 문서화된 동작이지만 실행으로 확인하지 않았다. 첫 패키징에서 `asar list`로 확인한다. 이게 틀리면 **패키징된 앱만 실행 시점에 죽는다** — 개발 중에는 보이지 않는다.
- **`hardenedRuntime: false`가 `identity: null`에도 필요한지**(5절). 문서 경고문의 문면이 모호해 안전한 쪽으로 뒀다. 첫 macOS 빌드가 실행되는지가 검증이다.
- **`.dmg`와 `.zip`의 quarantine 차이**. 조사가 Apple 공식 문서 본문을 읽지 못했고 포럼 답변만 확보했다. **이 축으로 판단하지 않았으므로 3절의 결정은 영향받지 않지만**, 첫 릴리스를 다른 Mac에서 내려받아 6절의 안내가 실제로 맞는지 확인해야 한다.
- **`nsis`/`portable`의 SmartScreen 차이**. 어느 1차 문서에서도 찾지 못했다. 3절은 데이터 위치 논거로 결정했으므로 이 미확인에 기대지 않는다.
- **arm64 러너에서 x64 macOS 빌드가 되는지**. 4절이 x64를 만들지 않기로 했으므로 지금은 무관하다. 나중에 x64가 필요해지면 유료 Intel 러너보다 이걸 먼저 시도한다.
- **`allowBuilds`의 완전한 목록**(10절 교정 2). electron-builder를 포함한 실제 트리에서 pnpm이 무엇을 플래그하는지는 스캐폴딩 시점에 확인된다.
- **`esbuild: false`(빌드 스크립트 미승인)로도 Vite 빌드가 도는지**. esbuild는 optional 플랫폼 패키지로 바이너리를 받으므로 postinstall 없이도 될 가능성이 높지만 재보지 않았다. `true`로 두는 데 위험이 없으므로 굳이 확인할 필요는 없다.
- **pnpm 11의 "supply-chain policies" 검증이 정확히 무엇인지**. pnpm 문서에 설명이 없다. "릴리스 직전에 의존성을 갱신하지 않는다"는 실무 규칙으로 대응한다.
