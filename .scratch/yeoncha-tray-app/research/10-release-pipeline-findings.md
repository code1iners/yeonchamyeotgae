# 10번 — GitHub Release 빌드 파이프라인 1차 자료 조사

조사일: 2026-08-26
조사자: 조사 전담 에이전트
대상: 개인용 macOS·Windows Electron 트레이 앱 "연차몇개"의 GitHub Release 빌드 파이프라인 설계 근거 수집

## 조사 방법 및 한계

- 1차 출처만 사용했다: npm registry API, electron-builder GitHub 저장소의 **소스 코드와 저장소 안의 docs 마크다운 원본**(태그 `electron-builder@26.15.7` 기준), pnpm.io, turborepo.dev, actions/runner-images 저장소, 각 Action의 `action.yml`·README 원본, docs.github.com.
- **electron.build 문서 사이트는 `master` 브랜치(= v27 알파 개발본)를 렌더링한다.** 사이트맵에 `/docs/migration/v26-to-v27`, `/docs/migration/whats-new-v27`이 있고 `master`의 `website/docs/mac.md`는 `_upgrading-from-v26.md`를 include한다. 따라서 **문서 사이트에서 읽은 내용이 v26에 그대로 적용된다고 가정하면 안 된다.** 이 문서의 electron-builder 관련 서술은 전부 `electron-builder@26.15.7` 태그의 저장소 파일에서 직접 읽은 것이다.
- WebFetch의 요약 모델이 존재하지 않는 옵션(`mac.sign.identity`)을 만들어낸 사례가 있었다. 그래서 electron-builder 항목은 모두 원본 TypeScript 소스로 교차 검증했다.
- D절(플랫폼별 lockfile)은 **로컬에서 pnpm 11.24.0으로 실제 재현 실험을 수행**해 확인했다. 실험 내용은 해당 절에 기록했다.

---

## A. electron-builder 자체

### A-1. 현재 안정 버전과 릴리스 상태

**확인된 사실**

| 항목 | 값 |
|---|---|
| npm `dist-tags.latest` | **26.15.3** |
| npm `dist-tags.v26` | **26.15.7** |
| npm `dist-tags.next` | 27.0.0-alpha.7 |
| GitHub 최신 릴리스 | `electron-builder@26.15.7` (2026-07-18) |

- `latest` 태그가 26.15.3(2026-06-09)에 멈춰 있고, 그 뒤에 나온 26.15.4 ~ 26.15.7(최신 2026-07-18)은 `v26` 태그에만 붙어 있다. 26.15.4~7 중 deprecated 표시된 버전은 없다.
- **즉 `pnpm add -D electron-builder`(범위 미지정)는 26.15.3을 설치한다.** 26.15.7을 쓰려면 버전을 명시하거나 `electron-builder@v26` 태그를 지정해야 한다.
- 출처:
  - `https://registry.npmjs.org/electron-builder` (`.dist-tags`, `.time`)
  - `https://api.github.com/repos/electron-userland/electron-builder/releases/latest`

**확인하지 못한 것**

- `latest`가 26.15.3에 멈춘 것이 의도인지 릴리스 스크립트 사고인지. 메인테이너의 명시적 발언을 찾지 못했다.

---

### A-2. `mac.identity: null` vs `CSC_IDENTITY_AUTO_DISCOVERY=false`

**확인된 사실 — 원본 소스 인용**

`packages/app-builder-lib/src/options/macOptions.ts`의 `MacConfiguration.identity` JSDoc 원문:

> - **Not set** (default): electron-builder searches the keychain for a valid signing certificate. If none is found, signing is skipped for all architectures — there is no automatic ad-hoc fallback.
> - **`null`**: skip signing entirely.
> - **`"-"`**: opt in to ad-hoc signing explicitly.

타입은 `readonly identity?: string | null`.

출처: `https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder%4026.15.7/packages/app-builder-lib/src/options/macOptions.ts`

**두 방식의 실제 동작 차이 (코드 레벨)**

`packages/app-builder-lib/src/macPackager.ts`의 `sign()`:

```ts
if (!isSignAllowed()) {
  return false
}
const config = options ?? this.platformSpecificBuildOptions
const qualifier = config.identity
if (qualifier === null) {
  return this.helper.handleNullIdentity()
}
const keychainFile = (await this.codeSigningInfo.value).keychainFile
...
const identity = await this.helper.findSigningIdentity(isMas, isDevelopment, qualifier, keychainFile, config)
```

- `identity === null`이면 **키체인을 조회하기 전에 즉시 반환**한다. 인증서 탐색 자체가 일어나지 않는다.
- `CSC_IDENTITY_AUTO_DISCOVERY`는 `packages/app-builder-lib/src/util/flags.ts`에 다음이 전부다:

```ts
export function isAutoDiscoveryCodeSignIdentity() {
  return process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false"
}
```

  그리고 이 함수는 `codeSign/macCodeSign.ts`의 `findIdentityRawResult`/로그 경로에서만 쓰인다. 즉 **`CSC_IDENTITY_AUTO_DISCOVERY=false`는 "키체인 자동 탐색 단계"를 끄는 것**이고, `identity: null`은 **서명 단계 자체를 진입 전에 차단**한다. 차단 지점이 다르다.

**공식 문서의 서술** (`website/docs/features/code-signing/code-signing-mac.md`, v26.15.7 태그):

> | Not set (default) | electron-builder searches the keychain for a valid certificate; signing is skipped if none is found |
> | `null` | Signing is skipped entirely |
> | `"-"` | Ad-hoc signing — see caveats below |
>
> To skip signing, leave all `CSC_*` environment variables unset and set `CSC_IDENTITY_AUTO_DISCOVERY=false`, or set `mac.identity` to `null` in your config (CLI: `-c.mac.identity=null`).

같은 파일의 권장 표:

> | Local dev, no certificate | Leave identity unconfigured or set `mac.identity: null` |
> | CI/production distribution | Configure a Developer ID certificate via `CSC_LINK` / keychain |

**따라서 "로컬에서 키체인 인증서가 잡혀 자동 서명된 사고"의 정답은 `mac.identity: null`이다.** 설정 파일에 박히므로 로컬·CI 양쪽에서 동일하게 적용된다. `CSC_IDENTITY_AUTO_DISCOVERY=false`는 환경변수라서 로컬 셸에서 빠뜨리면 다시 사고가 난다. 문서는 둘 중 하나를 고르라고만 하고 "CI에서는 이쪽" 같은 우열을 명시하지 않는다 — 우열 판단은 위 코드 근거에 기반한 이 문서의 해석이다.

**부수 사실 (같은 소스에서 확인)**

- `macCodeSign.ts`의 `isSignAllowed()`: `process.platform !== "darwin"`이면 경고 후 서명 건너뜀. 또 PR 빌드에서는 `CSC_FOR_PULL_REQUEST=true`가 아니면 서명하지 않는다.
- `mac.hardenedRuntime` 기본값은 `true`. `mac.md`의 경고문:
  > If you disable code signing, you should also disable Hardened Runtime (`hardenedRuntime: false`), as the combination of no signing and enabled Hardened Runtime may prevent the app from launching.
  단, 이 경고 블록의 제목은 "Ad-hoc signing and Hardened Runtime"이고 본문은 "disable code signing"이라 적혀 있어 `identity: null`(서명 자체 미실행)에도 적용되는지 문면상 모호하다. **확인하지 못한 것**으로 분류한다. 안전하게 `hardenedRuntime: false`를 같이 두는 것이 문서 문면에 부합한다.

---

### A-3. Windows 타깃: nsis / portable / zip, 그리고 서명 비활성 옵션

**확인된 사실 — 타깃 목록** (`packages/app-builder-lib/src/options/winOptions.ts`, `WindowsConfiguration.target` JSDoc):

> The target package type: list of `nsis`, `nsis-web` (Web installer), `portable` (portable app without installation), `appx`, `msi`, `msi-wrapped`, `squirrel`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
> @default nsis

`website/docs/targets.md`의 Windows 결정 트리:

> Is this a consumer app?
>   → Normal installer: NSIS (default)
>   → Very large download: NSIS-Web
>   → No installation at all: Portable

**서명 비활성 옵션 — 26.x에 전용 옵션이 있다** (`winOptions.ts` 원문):

```ts
/**
 * Whether to sign and add metadata to executable via `resedit`.
 * Metadata includes information about the app name/description/version, publisher, copyright, etc.
 * This property also is responsible for adding the app icon and setting execution level.
 * Set to `false` only if you need to fully disable resedit-based resource editing.
 * To skip only code signing while keeping resource editing, use `signExecutable: false` instead.
 * @default true
 */
readonly signAndEditExecutable?: boolean

/**
 * Whether to sign Windows executables and any additional files matched by `signExts`.
 * Set to `false` to skip Windows code signing while still editing executable resources
 * (icon, metadata, etc. via `resedit`).
 * This option is not limited to the main executable edit/sign flow and can also affect
 * signing of Windows installers or other artifacts that use the standard signing path.
 * @default true
 */
readonly signExecutable?: boolean
```

**정리: 서명하지 않으면서 아이콘·버전 메타데이터는 유지하려면 `win.signExecutable: false`가 정답이고, `signAndEditExecutable: false`는 리소스 편집까지 꺼버리므로 쓰면 안 된다.** 이 구분은 26.x 소스에만 있고 문서 사이트에는 잘 드러나지 않는다.

**SmartScreen 언급**

`website/docs/troubleshooting.md`에 두 군데:

> **SmartScreen warning at install time**
> : Normal for standard OV certificates — trust builds over time based on download count. EV certificates bypass this. No fix needed; warn users in your release notes that the warning is expected.

> **"The publisher could not be verified" (Windows SmartScreen)**
> : The app isn't code-signed, or signed with an untrusted certificate. See Windows Code Signing.

**확인하지 못한 것**

- **`nsis` / `portable` / `zip` 각각이 SmartScreen과 어떻게 다르게 상호작용하는지에 대한 문서 서술은 electron-builder 저장소 안에 존재하지 않는다.** 위 두 항목은 "서명 안 하면 경고 뜬다" 수준이고 타깃별 차이를 다루지 않는다. Microsoft 1차 문서까지는 이번 조사 범위에서 확인하지 못했다.
- `zip` 타깃이 Windows에서 SmartScreen 대상인지(Mark-of-the-Web 전파) 여부도 electron-builder 문서에 없다.

---

### A-4. macOS 타깃 dmg vs zip, quarantine

**확인된 사실 — electron-builder 쪽**

`website/docs/mac.md` (v26.15.7):

> The default targets are `zip` and `dmg` (both are required for Squirrel.Mac auto-update).

`macOptions.ts`의 `target` JSDoc:

> Note: Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be enabled, even when only `dmg` is used. Disabling `zip` will break auto update in `dmg` packages.
> @default default (dmg and zip for Squirrel.Mac)

`website/docs/targets.md`:

> **ZIP** — use as the update payload for electron-updater.
> - Smaller than DMG for the same content
> - Not user-facing — used internally by the auto-update mechanism
> - Commonly built alongside DMG

`website/docs/dmg.md`:

> The app bundle inside the DMG is always signed (when signing is configured). The `sign` option here refers to signing the DMG container file itself. Signing the DMG is not required for Gatekeeper but may be requested in some enterprise environments.

`website/docs/troubleshooting.md`:

> **"App is damaged and can't be opened"**
> : Usually means the app was downloaded without Gatekeeper quarantine being cleared, and notarization failed or wasn't performed. Run `xattr -dr com.apple.quarantine /path/to/app` temporarily during testing.

**Apple 쪽 — 확인 수준이 낮다**

- support.apple.com 102445 (Gatekeeper 사용자 안내)에서 확인한 것: 서명·공증되지 않은 앱은 **시스템 설정 → 개인정보 보호 및 보안 → "확인 없이 열기"**로 사용자가 예외를 등록해야 실행된다. 한 번 등록하면 이후에는 더블클릭으로 열린다.
  출처: `https://support.apple.com/en-us/102445`
- Apple Developer Forums(Apple DTS 엔지니어 Quinn "The Eskimo!" 작성)의 검색 결과에서 다음 취지의 서술이 확인됐다: Safari가 zip을 내려받으면 zip 파일에 `com.apple.quarantine`을 붙이고, 사용자 레벨 압축 해제 도구는 quarantine을 **보존**한다. Archive Utility로 풀면 결과 파일에도 quarantine이 붙는다.
  출처(포럼 태그/스레드 목록): `https://developer.apple.com/forums/tags/gatekeeper`, `https://developer.apple.com/forums/thread/710738`

**확인하지 못한 것 (중요)**

- **`.zip`과 `.dmg`의 quarantine 부착 차이를 Apple 공식 문서(개발자 문서 본문)에서 직접 확인하지 못했다.** `https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution`은 본문이 JS 렌더링이라 WebFetch로 본문을 가져오지 못했다.
- 위 zip 관련 서술은 Apple 직원의 **개발자 포럼 답변**이 출처다. 공식 문서가 아니다. 이 조사의 신뢰 기준(공식 이슈 트래커 메인테이너 발언은 인정)에 준해 참고 수준으로만 취급해야 한다.
- 결론적으로 **"서명·공증 없이 배포할 때 zip이 dmg보다 유리하다/불리하다"를 1차 문서로 뒷받침하지 못했다.** 설계 시 이 항목은 실물 검증(실제로 GitHub Release에서 내려받아 두 형식 모두 열어보기)이 필요하다.

---

### A-5. `mac.target`의 arch, universal 빌드의 실제 동작

**확인된 사실 — 설정 문법** (`website/docs/cli.md`, `TargetConfiguration`):

> * **target** String - The target name. e.g. `snap`.
> * arch "x64" | "ia32" | "armv7l" | "arm64" | "universal" - The arch or list of archs.

```yaml
mac:
  target:
    - target: dmg
      arch: universal
```

CLI 플래그: `--x64`, `--ia32`, `--armv7l`, `--arm64`, `--universal`.

**universal이 실제로 어떻게 만들어지는가 — 소스 확인**

`macPackager.ts` (v26.15.7). `arch === Arch.universal`일 때:

1. `sign: false, disableAsarIntegrity: true, disableFuses: true` 옵션으로 **x64를 `<appOutDir>-x64-temp`에 한 번 패키징**한다.
2. 같은 옵션으로 **arm64를 `<appOutDir>-arm64-temp`에 또 한 번 패키징**한다.
3. x64 쪽 `Contents/Resources/Assets.car`가 있으면 arm64 쪽으로 복사해 둘을 동일하게 맞춘다.
4. `@electron/universal`(app-builder-lib의 의존성, 버전 `2.0.3`)의 `makeUniversalApp()`을 동적 import해서 병합한다:

```ts
await makeUniversalApp({
  x64AppPath: ..., arm64AppPath: ..., outAppPath: ...,
  force: true,
  mergeASARs: platformSpecificBuildOptions.mergeASARs ?? true,
  singleArchFiles: platformSpecificBuildOptions.singleArchFiles || undefined,
  x64ArchFiles: platformSpecificBuildOptions.x64ArchFiles || undefined,
})
```

5. 두 temp 디렉터리를 삭제하고, 병합된 앱에 `afterPack` 훅 → Electron Fuses → 서명 순으로 적용한다.

**즉 "두 번 빌드 후 병합"이 맞다.** 빌드 시간은 대략 2배, Electron 배포본도 x64·arm64 두 벌을 내려받아야 한다. 용량은 프레임워크 바이너리가 fat binary가 되므로 단일 arch보다 크다(정확한 배수는 문서에 없음).

**universal 관련 주의사항 — `macOptions.ts` 원문**

```ts
/** Whether to merge ASAR files for different architectures or not.
 *  This option has no effect unless building for "universal" arch.
 *  @default true */
readonly mergeASARs?: boolean

/** Minimatch pattern of paths that are allowed to be present in one of the
 *  ASAR files, but not in the other.
 *  This option has no effect unless building for "universal" arch and applies
 *  only if `mergeASARs` is `true`. */
readonly singleArchFiles?: string | null

/** Minimatch pattern of paths that are allowed to be x64 binaries in both
 *  ASAR files
 *  This option has no effect unless building for "universal" arch and applies
 *  only if `mergeASARs` is `true`. */
readonly x64ArchFiles?: string | null
```

`website/docs/mac.md`의 추가 권고:

> ### Recommended: Build Per-Arch on Correct Hardware
> While cross-compilation is possible, the most reliable approach is to build `arm64` on Apple Silicon and `x64` on Intel (or use a matrix in CI). Universal builds work best when both arches are produced natively and then merged.

**확인하지 못한 것**

- arm64 러너에서 x64 패키징을 하는 것이 실제로 성공하는지 여부에 대한 electron-builder 측 명시적 보증. 코드상으로는 Electron x64 배포본을 내려받아 파일 복사만 하므로 arch 종속 작업이 없어 보이지만(`lipo`는 arm64 macOS에서도 동작), 네이티브 모듈이 없는 앱에 한정된 이야기다. 우리 앱에 네이티브 모듈이 없다면 문제가 없을 것으로 보이나 **실측 필요**.
- universal 빌드의 정확한 시간·용량 배수는 어느 1차 문서에도 없다.

---

### A-6. `directories.output` 기본값

**확인된 사실** — `packages/app-builder-lib/src/configuration.ts`:

```ts
/**
 * The output directory. [File macros](https://www.electron.build/file-patterns#file-macros) are supported.
 * @default dist
 */
readonly output?: string | null
```

- 기본값 **`dist`**. `projectDir` 기준 상대 경로로 해석된다(`packager.ts`의 `path.resolve(this.projectDir, expandMacro(this.config.directories!.output!, ...))`).
- 변경은 설정 파일의 `directories.output` 또는 CLI `-c.directories.output=...`.
- **`out/`은 electron-vite의 빌드 출력이고 `dist/`는 electron-builder의 패키징 출력이라 기본값끼리 충돌하지 않는다.**
- 출처: `packages/app-builder-lib/src/configuration.ts`, `packages/app-builder-lib/src/packager.ts` (태그 26.15.7)

---

### A-7. pnpm(엄격 node_modules)·모노레포 `workspace:*` 처리 — **핵심**

**확인된 사실 — 26.x에는 pnpm 전용 수집기가 있고, pnpm v11 워크스페이스를 명시적으로 지원한다**

`packages/app-builder-lib/src/node-module-collector/` 아래에 패키지 매니저별 수집기가 있다:
`pnpmNodeModulesCollector.ts`, `npmNodeModulesCollector.ts`, `yarnNodeModulesCollector.ts`, `yarnBerryNodeModulesCollector.ts`, `bunNodeModulesCollector.ts`, `traversalNodeModulesCollector.ts`.

`PnpmNodeModulesCollector`의 핵심 사실:

1. **실행 명령**: `pnpm list --prod --json --depth Infinity --silent --loglevel=error`
   → `--prod`이므로 **`dependencies`(+`optionalDependencies`)만 수집하고 `devDependencies`는 제외**한다.

2. **pnpm 메이저 버전을 감지해 워크스페이스 출력 형태를 분기한다** (원본 주석):
   > - pnpm v11+: multi-entry workspace output → return the full parsed array
   > - pnpm < v11 / non-workspace / detection failure: single-tree behavior → return only [0]

   그리고 `getTreeFromWorkspaces`의 주석:
   > pnpm v10 workspace: app is nested as a dependency of root — handled by base class
   > pnpm v11 workspace: each workspace package is a separate top-level array entry

   **즉 pnpm 11 워크스페이스는 electron-builder 26.15.x가 명시적으로 다루는 케이스다.** (이 처리가 언제 들어왔는지는 확인하지 못했으므로, 26.15.3이 아니라 **26.15.7을 명시적으로 핀**하는 편이 안전하다.)

3. **`node-linker=hoisted`는 요구되지 않는다.** `nodeModulesCollector.ts`의 `isHoisted`는 `pnpm config list`를 실행해 `node-linker=hoisted` 여부를 **감지**한 뒤 탐색 전략만 바꾼다. 원본 주석:
   > pnpm's default `.pnpm` virtual store is flat, so `downwardSearch` would burn thousands of `readdir`/`lstat` calls finding nothing. With `nodeLinker: hoisted`, however, the layout is a traditional nested `node_modules` tree ... downward BFS is needed to find them.

   기본(isolated) 레이아웃에서도 동작하도록 설계돼 있다.

4. **pnpm 10+ optional 플랫폼 패키지 주의** (원본 주석):
   > pnpm 10+ does not automatically preserve transitive optional platform-specific packages (e.g. sass-embedded-linux-x64) across lock file regeneration. Users must list them as direct optionalDependencies. Missing ones are emitted as `PKG_OPTIONAL_PLATFORM_NOT_INSTALLED` warnings in the log summary.

출처: `packages/app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector.ts`, `.../nodeModulesCollector.ts` (태그 26.15.7)

**`@yeoncha/core`(TypeScript 소스 패키지)에 대한 실측**

로컬 재현 실험(pnpm 11.24.0, 아래 D절 실험과 동일 픽스처)에서 `apps/desktop`의 `dependencies`에 `"@yeoncha/core": "workspace:*"`를 두면 `pnpm-lock.yaml`에 다음처럼 기록된다:

```yaml
'@yeoncha/core':
  specifier: workspace:*
  version: link:../../packages/core
```

즉 워크스페이스 의존성은 **심볼릭 링크(`link:`)** 로 표현된다. electron-builder의 pnpm 수집기는 `pnpm list --prod --json`이 보고하는 `path`를 따라가 실제 디렉터리를 찾아 복사한다.

**설계상 중요한 함의 — 확인된 사실에서 도출한 판단**

- `@yeoncha/core`의 `exports`가 `./src/index.ts`(빌드하지 않는 TS 소스)이므로, **런타임에 `node_modules`로 복사돼봐야 Electron이 `.ts`를 실행할 수 없다.** 따라서 정상적인 경로는 **electron-vite/Vite가 번들 시점에 인라인**하는 것이고, 그러면 `@yeoncha/core`는 `devDependencies`에 있어야 하며 electron-builder가 이를 수집할 필요가 없다.
- `--prod` 수집이므로 `devDependencies`에 두면 자동으로 번들 대상에서 빠진다. 이 조합이 앞뒤가 맞는다.
- 반대로 `dependencies`에 두면 electron-builder가 `packages/core`(TS 소스 그대로)를 `node_modules/@yeoncha/core`로 복사해 넣는데, 실행에 쓰이지 않는 죽은 파일이 된다.

**확인하지 못한 것**

- electron-builder 저장소의 `website/docs/` 안에는 **"pnpm"이라는 단어가 단 한 번도 등장하지 않는다.** (`grep -rin "pnpm" website/docs/` 결과 0건. `monorepo`/`workspace`는 `contents.md`의 "Two-Package Structure" 항목에서만 언급된다.) 즉 **pnpm 지원은 소스와 테스트 픽스처에는 있으나 문서화되어 있지 않다.**
- `test/fixtures/lockfiles/HoistedNodeModuleTest/` 아래에 `pnpm v11 workspace.txt`, `pnpm node-linker=hoisted.txt`, `pnpm workspace with native module.txt`, `pnpm optional dependencies.txt` 등의 스냅샷 픽스처가 존재하는 것은 확인했으나 내용까지는 열어보지 않았다.

---

### A-8. 내장 publish: `--publish`, GitHub provider, 여러 러너의 draft 공유 — **핵심**

**확인된 사실 — CLI 값** (`website/docs/publish.md`, `website/docs/cli.md`):

| 값 | 의미 |
|---|---|
| `onTag` | on tag push only |
| `onTagOrDraft` | on tag push or if draft release exists |
| `always` | always publish |
| `never` | never publish |

자동 규칙(문서 원문):
> * If CI server detected, — `onTagOrDraft`.
> * If CI server reports that a tag was pushed, — `onTag`.
> * If npm script named `release`, — `always`.

**암묵적 publish는 v27에서 제거된다 — 문서 경고 원문:**

> :::warning[Deprecation Notice: Implicit Publishing]
> **This implicit publishing behavior is deprecated and will be disabled in electron-builder v27.**
> To prepare for this change, please explicitly specify your publish intent using the `--publish` CLI flag (e.g., `--publish always`, `--publish onTag`) or set the `publish` configuration in your `package.json` or `electron-builder.yml`.

**토큰 환경변수 — 문서 원문:**

> If `GH_TOKEN` or `GITHUB_TOKEN` is defined — defaults to `[{provider: "github"}]`.
> If `GITHUB_RELEASE_TOKEN` is defined, it will be used instead of (`GH_TOKEN` or `GITHUB_TOKEN`) to publish your release.
> - the `GITHUB_TOKEN` will still be used when your app checks for updates, etc.
> - "Contents" fine-grained permission was sufficient. (at time of writing - Apr 2024)

**`releaseType` 기본값** (`packages/builder-util-runtime/src/publishOptions.ts`, `GithubOptions`):

```ts
/**
 * The type of release. By default `draft` release will be created.
 * Also you can set release type using environment variable. If `EP_DRAFT` is set to `true` — `draft`,
 * if `EP_PRE_RELEASE` is set to `true` — `prerelease`.
 * @default draft
 */
releaseType?: "draft" | "prerelease" | "release" | null
```

**여러 러너가 같은 태그의 draft를 공유하는가 — `gitHubPublisher.ts` 소스 확인**

`getOrCreateRelease()` 실제 동작:

```ts
// we don't use "Get a release by tag name" because "tag name" means existing git tag,
// but we draft release and don't create git tag
const releases = await this.githubRequest<Array<Release>>(`/repos/${owner}/${repo}/releases`, this.token)
for (const release of releases) {
  if (!(release.tag_name === this.tag || release.tag_name === this.version)) continue
  if (release.draft) {
    return release            // ← draft가 있으면 그대로 재사용
  }
  ...
}
if (this.options.publish === "always" || getCiTag() != null) {
  return this.createRelease() // ← 없으면 새로 만든다
}
```

**따라서 "같은 태그의 draft를 찾아 재사용한다"는 맞다.** 하지만 실측 가능한 함정이 세 가지 있다:

1. **경쟁 조건에 대한 방어가 없다.** `createRelease()`는 `POST /releases`를 그대로 호출하며, 이 호출에 대한 422 `already_exists` 재시도 로직이 **없다.** 소스의 `doesErrorMeanAlreadyExists()`/422 처리는 **에셋 업로드 경로에만** 붙어 있다(`doUploadFile`의 `.catch`). macOS 잡과 Windows 잡이 거의 동시에 시작하면 둘 다 "draft 없음"을 보고 둘 다 생성을 시도할 수 있고, 한쪽이 422로 **실패**한다.
2. **릴리스 목록에 페이지네이션이 없다.** `githubRequest`가 `/repos/{owner}/{repo}/releases`를 `per_page` 없이 한 번 호출하고 배열을 그대로 훑는다(소스에 `per_page`/`page` 문자열 자체가 없다). GitHub 기본은 페이지당 30개이므로, **릴리스가 30개를 넘어가면 오래된 draft를 못 찾는다.** 개인 도구 규모에서는 당분간 문제되지 않는다.
3. **이미 publish된(=draft가 아닌) 릴리스에 대해서는 2시간 제한이 있다.** 소스 주석 그대로:
   > if release created < 2 hours — allow to upload

   `EP_GH_IGNORE_TIME=true`로 무시 가능.

**태그 감지** (`packages/electron-publish/src/publisher.ts`의 `getCiTag()`):

```ts
process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG ||
process.env.BITRISE_GIT_TAG || process.env.CI_BUILD_TAG || process.env.CI_COMMIT_TAG ||
process.env.BITBUCKET_TAG ||
(process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null)
```

**GitHub Actions의 태그 푸시를 정식으로 인식한다.**

**문서가 권장하는 멀티 플랫폼 워크플로** (`website/docs/publish.md`):

> ### Recommended GitHub Releases Workflow
> 1. Draft a new release. Set the "Tag version" to the value of `version` in your application `package.json`, and prefix it with `v`.
> 2. Push some commits. Every CI build will update the artifacts attached to this draft.
> 3. Once you are done, publish the release. GitHub will tag the latest commit for you.

**즉 electron-builder 문서의 공식 답은 "draft를 사람이 먼저 만들어 두고, CI는 그 draft에 붙이기만 한다"이다.** 이렇게 하면 A-8-1의 경쟁 조건이 원천 차단된다.

`website/docs/features/github-actions.md`의 매트릭스 예제도 `--publish always` + `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 조합을 쓰고 다음과 같이 서술한다:

> The `--publish always` flag uploads artifacts to the GitHub release for the pushed tag. If no release exists, electron-builder creates a draft release.

**확인하지 못한 것**

- electron-builder가 **멀티 러너 동시 publish의 경쟁 조건을 명시적으로 다룬 문서 서술**은 저장소 어디에도 없다. 위 위험 판단은 소스 코드 독해에서 나온 것이다.
- `--publish` 정책 타입(`PublishPolicy`)의 정확한 정의 파일 위치는 찾지 못했다(문서와 CLI 헬프 출력으로만 확인).

---

## B. GitHub Actions

### B-9. 러너 이미지 (2026년 기준)

**확인된 사실** — `actions/runner-images` README의 Available Images 표 원문 발췌:

| 이미지 | Architecture | YAML Label |
|---|---|---|
| macOS 26 Arm64 | **arm64** | **`macos-latest`**, `macos-26`, `macos-26-xlarge` |
| macOS 26 | x64 | `macos-latest-large`, `macos-26-intel`, `macos-26-large` |
| macOS 15 Arm64 | arm64 | `macos-15`, `macos-15-xlarge` |
| macOS 15 | x64 | `macos-15-large`, `macos-15-intel` |
| Windows Server 2025 | x64 | **`windows-latest`**, `windows-2025`, `windows-2025-vs2026` |
| Windows 11 Arm64 | arm64 | `windows-11-arm` |
| Ubuntu 24.04 | x64 | `ubuntu-latest`, `ubuntu-24.04` |

Label scheme 원문:
> In general the `-latest` label is used for the latest OS image version that is GA.
> The `-xlarge` and `-large` suffixes are unique to macOS images and are only available for GitHub Actions.

출처: `https://raw.githubusercontent.com/actions/runner-images/main/README.md`

**따라서 `macos-latest`는 arm64(Apple Silicon)다.** x64 macOS 빌드가 필요하면 `macos-26-intel`(또는 `macos-latest-large`)을 명시해야 하며, 이들은 유료 large 러너 계열이다.

**부수 사실 (러너 프리인스톨 소프트웨어)**

- macOS 26 arm64 러너: **Node.js 24.18.0**, **GitHub CLI 2.96.0** 프리인스톨.
  출처: `https://raw.githubusercontent.com/actions/runner-images/main/images/macos/macos-26-arm64-Readme.md`
- Windows Server 2025 러너: **GitHub CLI 2.97.0** 프리인스톨.
  출처: `https://raw.githubusercontent.com/actions/runner-images/main/images/windows/Windows2025-VS2026-Readme.md`

---

### B-10. `actions/setup-node` 최신 버전과 Node 24, pnpm 캐시 순서

**확인된 사실**

- 최신 릴리스: **`v7.0.0`** (2026-07-14). `runs.using: 'node24'`.
  출처: `https://api.github.com/repos/actions/setup-node/releases/latest`, `https://raw.githubusercontent.com/actions/setup-node/v7.0.0/action.yml`
- `node-version` 입력은 "Version Spec"이므로 `node-version: 24`, `'24.x'`, `'24.18.0'` 모두 유효. `node-version-file`로 `package.json`/`.nvmrc`/`.tool-versions`를 가리킬 수도 있다.
- `cache` 입력: "Used to specify a package manager for caching in the default directory. Supported values: **npm, yarn, pnpm**."
- `package-manager-cache` (기본 `true`): "Set to false to disable automatic caching."
- `cache-dependency-path`: 락파일 경로. 모노레포에서 유용.

**순서 함정 — 공식 문서가 pnpm/action-setup을 먼저 둔다** (`docs/advanced-usage.md`, v7.0.0):

```yaml
# NOTE: pnpm caching support requires pnpm version >= 6.10.0
steps:
- uses: actions/checkout@v6
- uses: pnpm/action-setup@v4
  with:
    version: 10
- uses: actions/setup-node@v6
  with:
    node-version: '24'
    cache: 'pnpm'
- run: pnpm install
```

**`pnpm/action-setup`이 `actions/setup-node`보다 먼저다.** setup-node의 pnpm 캐싱은 `pnpm store path`를 실행해 스토어 위치를 알아내야 하므로 pnpm이 PATH에 이미 있어야 한다(문서가 순서를 그렇게 제시한다는 것이 확인된 사실이고, "왜"는 문서에 명시돼 있지 않다).

같은 문서:
> Ensure that `pnpm-lock.yaml` is always committed, when on CI pass `--frozen-lockfile` to `pnpm install` when installing packages.

---

### B-11. `pnpm/action-setup` — **그러나 pnpm 11에서는 후계 액션을 써야 한다**

**확인된 사실**

- `pnpm/action-setup` 최신 릴리스: **`v6.0.10`** (2026-08-03).
- README 최상단의 경고 원문:
  > [!IMPORTANT]
  > **This action has a successor: [`pnpm/setup`](https://github.com/pnpm/setup).**
  > For pnpm v11 and newer, use `pnpm/setup` instead. It downloads pnpm's self-contained release binary (no Node.js or npm required) and can install a JavaScript runtime (Node.js, Bun, or Deno) in the same step, **replacing `actions/setup-node`**.
  > `pnpm/action-setup` remains the action to use for installing pnpm v10 and older.

  출처: `https://raw.githubusercontent.com/pnpm/action-setup/v6.0.10/README.md`

- **`pnpm/setup` 최신 릴리스: `v2.0.2`** (2026-08-09).
  출처: `https://api.github.com/repos/pnpm/setup/releases/latest`

- `pnpm/setup@v2` README 원문:
  > `pnpm/setup@v2` installs pnpm v11 and newer only ... `v1` installed pnpm through npm and could set up pnpm 10; if you need pnpm 10 or older, use `pnpm/action-setup` instead.
  > **One caveat: pnpm v11 publishes no binary for Intel macOS (`darwin-x64`); use v12 or newer on Intel macOS runners.**

  권장 사용법:
  ```yaml
  steps:
    - uses: actions/checkout@v7
    - uses: pnpm/setup@v2
      with:
        version: 11
        runtime: node@24
        cache: true
  ```
  `install` 입력 기본값이 `true`라 `package.json`이 있으면 **`pnpm install`이 자동 실행**된다. 끄려면 `install: false`.

- `pnpm/setup@v2` 입력: `version`, `dest`, `runtime`, `cache`(기본 false), `cache-dependency-path`(기본 `pnpm-lock.yaml`), `package-json-file`, `install`(기본 true), `token`(deprecated).
  출처: `https://raw.githubusercontent.com/pnpm/setup/main/action.yml`

**`packageManager` 필드로 버전 잡기 — 확인된 사실**

- `pnpm/action-setup`: `version` 입력은 "**Optional** when there is a `packageManager` or `devEngines.packageManager` field in the `package.json`". `package_json_file` 입력으로 읽을 파일 경로를 지정한다(리포지토리 루트 기준 상대 경로).
- `pnpm/setup@v2`: `version`을 생략하면 `devEngines.packageManager` 또는 `packageManager`에서 읽는다. 단 **v11 이상으로 해석돼야 한다.**

**우리 파이프라인에 대한 함의 (판단)**

- pnpm 11 + Node 24이므로 `pnpm/setup@v2` + `runtime: node@24` 한 스텝으로 `actions/setup-node`를 대체할 수 있다. 스텝 순서 함정도 사라진다.
- 단, **x64 macOS 빌드를 Intel 러너(`macos-26-intel`)에서 하려면 pnpm 11 바이너리가 없다는 위 caveat에 걸린다.** arm64 러너 + universal(또는 arm64 전용)로 가면 무관하다.

---

### B-12. artifact 액션 최신 버전, 여러 잡의 산출물 모으기

**확인된 사실**

- `actions/upload-artifact` 최신: **`v7.0.1`** (2026-04-10)
- `actions/download-artifact` 최신: **`v8.0.1`** (2026-03-11)
- `actions/checkout` 최신: **`v7.0.1`** (2026-07-20)
  출처: 각 저장소의 `/releases/latest` API

**아티팩트 이름은 유일해야 한다 — upload-artifact v7 README 원문:**

> Previously the behavior _allowed_ for the artifact names to be the same which resulted in unexpected mutations and accidental corruption. **Artifacts created by upload-artifact@v4 are immutable.**

권장 패턴(README 예시): `binary-ubuntu-latest-a`, `binary-windows-latest-b` — 즉 **매트릭스 잡마다 `name: dist-${{ matrix.os }}`처럼 이름을 다르게** 준다.

`overwrite` 입력:
> If true, an artifact with a matching name will be deleted before a new one is uploaded. If false, the action will fail if an artifact for the given name already exists.
(기본 `false`. `true`로 덮어써도 **아티팩트 ID가 새로 발급되고 이전 것은 사라진다.**)

기타 입력: `include-hidden-files`(기본 false), `archive`(기본 true).
출력: `artifact-id`, `artifact-url`, `artifact-digest`(SHA-256).

**여러 잡 산출물을 한 잡에 모으기 — download-artifact v8 README 원문:**

```yaml
- uses: actions/download-artifact@v8
  with:
    # A glob pattern to the artifacts that should be downloaded.
    # Ignored if name is specified.
    pattern:
    # When multiple artifacts are matched, this changes the behavior of the destination directories.
    # If true, the downloaded artifacts will be in the same directory specified by path.
    # If false, the downloaded artifacts will be extracted into individual named directories within the specified path.
    # Optional. Default is 'false'
    merge-multiple:
```

> If the `name` input parameter is not provided, all artifacts will be downloaded. To differentiate between downloaded artifacts, by default a directory denoted by the artifacts name will be created for each individual artifact. This behavior can be changed with the `merge-multiple` input parameter.

**즉 수집 잡에서 `pattern: dist-*` + `merge-multiple: true` + `path: dist`가 정석이다.**

---

### B-13. GitHub Release를 만드는 세 가지 방법과 각각의 동시성 문제

**확인된 사실 — 방법별 비교**

| 방법 | 러너 설치 | 동시 생성 시 동작 |
|---|---|---|
| `softprops/action-gh-release@v3` | 액션(설치 불필요) | **명시적으로 방어함** (아래 참조) |
| `gh release create` (GitHub CLI) | **프리인스톨** (win 2.97.0 / mac 2.96.0) | 문서에 명시 없음 — **확인 못 함** |
| electron-builder `--publish` | 프로젝트 의존성 | **방어 없음** (A-8 참조) |

**`softprops/action-gh-release@v3`의 경쟁 조건 방어 — 소스 확인**

`src/github.ts` (v3.0.2):

릴리스 생성 시 422:
```ts
case 422:
  const errorData = githubError.response?.data;
  if (errorData?.errors?.[0]?.code === 'already_exists') {
    console.log('⚠️ Release already exists (race condition detected), retrying to find and update existing release...');
    // Don't throw - allow retry to find existing release
  } else {
    console.log('Skip retry - validation failed');
    throw error;
  }
  break;
```
(`release()` 함수는 `maxRetries: number = 3`으로 재귀 재시도한다.)

에셋 업로드 시 422:
```ts
// Handle race conditions across concurrent workflows uploading the same asset.
if (config.input_overwrite_files !== false && errorStatus === 422 &&
    errorData?.errors?.[0]?.code === 'already_exists' && releaseId !== undefined) {
  console.log(`⚠️ Asset ${name} already exists (race condition), refreshing assets and retrying once...`);
  // delete + re-upload
}
```

출처: `https://raw.githubusercontent.com/softprops/action-gh-release/v3.0.2/src/github.ts`

**즉 두 잡이 동시에 같은 태그로 릴리스를 만들려 하면, softprops v3는 한쪽이 422를 받고 기존 릴리스를 찾아 업데이트하는 쪽으로 전환한다.** electron-builder는 그냥 실패한다.

**softprops v3 기타 확인 사항** (README):

- `v3`는 **Node 24 런타임**을 요구한다. Node 20 계열이 필요하면 `v2.6.2`.
- `draft` 입력: "Keep the release as a draft. Defaults to false. **When reusing an existing draft release, set this to true to keep it draft**; omit it to publish after upload."
- `overwrite_files` 기본값 **true**.
- `files`는 개행 구분 glob. `working_directory`로 기준 디렉터리 지정 가능.
- 필요 권한:
  ```yaml
  permissions:
    contents: write
  ```
- README의 경고:
  > Note that if you intend to run workflows on the release event (`on: { release: { types: [published] } }`), you need to use a personal access token for this action, as the default `secrets.GITHUB_TOKEN` does not trigger another workflow.

**`gh release create` 확인 사항** (cli.github.com/manual):

- 주요 플래그: `-d/--draft`, `-n/--notes`, `-F/--notes-file`, `--generate-notes`, `--notes-from-tag`, `--notes-start-tag`, `-t/--title`, `--target <branch|SHA>`, `-p/--prerelease`, `--latest`(기본 자동), `--verify-tag`("Abort in case the git tag doesn't already exist in the remote repository"), `--discussion-category`, `--fail-on-no-commits`.
- 에셋은 파일명을 위치 인자로 전달. `파일명#레이블` 형식으로 표시 레이블 지정.
- 출처: `https://cli.github.com/manual/gh_release_create`

**확인하지 못한 것**

- **`gh release create`가 이미 존재하는 태그의 릴리스에 대해 어떻게 동작하는지 공식 매뉴얼에 명시가 없다.** (에러인지 멱등인지) 실측 필요. 참고로 `gh release upload`는 별도 명령이며, 존재하는 릴리스에 에셋만 추가하는 용도다.
- GitHub REST API가 동일 태그 릴리스 중복 생성 시 반환하는 422 `already_exists`는 softprops 소스에서 확인되지만, docs.github.com REST 레퍼런스 원문으로는 직접 확인하지 못했다.

---

### B-14. `permissions:`와 `GITHUB_TOKEN` 기본 권한

**확인된 사실**

- Release를 만들려면 `contents: write`가 필요하다. softprops README 원문:
  ```yaml
  permissions:
    contents: write
  ```
- workflow-syntax 문서: 사용 가능한 스코프는 `actions`, `artifact-metadata`, `attestations`, `checks`, `code-quality`, `contents`, `deployments`, `discussions`, `id-token`, `issues`, `packages`, `pages`, `pull-requests`, `security-events`, `statuses`, `vulnerability-alerts`. 값은 `read`/`write`/`none`이고 `write`는 `read`를 포함한다.
- **`permissions` 키를 쓰면 명시하지 않은 스코프는 전부 `none`이 된다** — 단, `metadata` 스코프는 항상 read를 받는다.
  출처: `https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions`,
  `https://docs.github.com/actions/security-guides/automatic-token-authentication`
- `GITHUB_TOKEN`의 기본 권한은 **엔터프라이즈/조직/리포지토리 레벨 설정에 따라 달라진다.** 문서는 고정된 기본값을 명시하지 않고 "initially set to the default setting for the enterprise, organization, or repository"라고만 한다. 워크플로에서 `permissions:`로 덮어쓸 수 있다.

**확인하지 못한 것**

- 신규 개인 리포지토리의 실제 기본값(현재 GitHub 기본은 "Read repository contents and packages permissions"로 알려져 있으나 이번 조사에서 1차 문서로 못 박지 못했다). **어차피 워크플로에 `permissions: contents: write`를 명시하는 것이 정답이므로 실무상 문제되지 않는다.**

---

### B-15. `actions/checkout`의 `fetch-depth`와 Turborepo

**확인된 사실**

- Turborepo 공식 GitHub Actions 가이드의 **모든 패키지 매니저 예제가 `fetch-depth: 2`를 쓴다:**

```yaml
- name: Check out code
  uses: actions/checkout@v4
  with:
    fetch-depth: 2

- uses: pnpm/action-setup@v3
  with:
    version: 8

- name: Setup Node.js environment
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install
- name: Build
  run: pnpm build
- name: Test
  run: pnpm test
```
출처: `https://turborepo.dev/docs/guides/ci-vendors/github-actions` (마크다운 원본: 같은 URL + `.mdx`)

- 같은 문서의 로컬 캐시 절:
  > Configure your GitHub pipeline with a step which uses the `actions/cache@v4` action before the build steps of your CI file.
  > * Make sure that the `path` attribute set within the `actions/cache` action matches the output location above. In the example below, `path` was set to `.turbo`.
  > * State the cache key ... `${{ runner.os }}-turbo-${{ github.sha }}` ... `restore-keys` ... `${{ runner.os }}-turbo-`

- 원격 캐시(Vercel Remote Cache)는 OIDC 방식(`vercel/setup-turborepo-remote-cache-action@v1.0.0`, `permissions: contents: read` + `id-token: write`) 또는 `TURBO_TOKEN`(secret) + `TURBO_TEAM`(variable) 환경변수.

- 참고: `turbo` npm `dist-tags.latest` = **2.10.12**.

**확인하지 못한 것 (중요 — 질문에 정확히 답하지 못했다)**

- **"`fetch-depth: 1`에서 Turborepo 캐시가 동작하는지"에 대한 명시적 서술을 Turborepo 공식 문서에서 찾지 못했다.** 가이드는 `fetch-depth: 2`를 쓰라고 예제로 보여줄 뿐, 이유도 얕은 클론의 제약도 설명하지 않는다.
- 우리 워크플로는 `turbo run build`를 태그 푸시 시 1회 실행하는 구조라 캐시 히트가 사실상 무의미하다. 이 항목은 설계에 큰 영향을 주지 않는다.

---

### B-16. 태그 푸시 트리거와 `GITHUB_TOKEN`의 워크플로 트리거 제약

**확인된 사실**

- electron-builder가 태그를 인식하는 경로는 `GITHUB_REF_TYPE === "tag"` → `GITHUB_REF_NAME`이다(B-A-8 참조). `on: push: tags: ['v*']`로 트리거되면 이 환경변수들이 세팅되므로 `--publish onTag`/자동 규칙이 동작한다.
- `GITHUB_TOKEN`으로 만든 이벤트는 **새 워크플로 런을 만들지 않는다**는 규칙이 존재한다. docs.github.com "Events that trigger workflows" 페이지에서 확인:
  > With the exception of `workflow_dispatch` and `repository_dispatch`, other `GITHUB_TOKEN`-triggered events do not create workflow runs at all.

  그리고 softprops README도 같은 취지로 경고한다(B-13 참조).
- 같은 페이지의 태그 관련 제한:
  > Events will not be created for tags when more than three tags are pushed at once.

  출처: `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows`

**우리 설계에 관련이 있는가 — 판단**

- **관련 있다. 단, 사슬의 한 고리에서만 그렇다.**
  - "태그를 사람이 푸시 → 워크플로 트리거"는 사람이 만든 이벤트라 정상 동작한다. 제약과 무관하다.
  - 제약이 걸리는 건 "**워크플로가 릴리스를 publish → `on: release: types: [published]`인 다른 워크플로를 돌린다**" 같은 연쇄다. 우리는 그런 후속 워크플로가 없으므로 현재 설계에는 걸리지 않는다.
  - 또한 "워크플로가 `GITHUB_TOKEN`으로 태그를 푸시해서 릴리스 워크플로를 트리거"하는 자동 릴리스 방식은 **동작하지 않는다.** 태그는 사람이 밀거나 PAT를 써야 한다.

**확인하지 못한 것**

- 위 인용문은 WebFetch의 요약 모델을 거쳐 나온 것이고, 해당 페이지 원문을 직접 대조하지는 못했다(페이지가 매우 크다). 문장 자체는 GitHub 문서에 오래 유지돼 온 잘 알려진 서술이지만, **인용 정확도를 100% 보증하지 않는다.**

---

## C. 버전 관리

### C-17. Electron 앱 버전이 어디서 오는가

**확인된 사실 — `packages/app-builder-lib/src/packager.ts`의 실제 로직**

```ts
const projectDir = this.projectDir
const devPackageFile = path.join(projectDir, "package.json")
this._devMetadata = await orNullIfFileNotExist(readPackageJson(devPackageFile))
...
this._appDir = await computeDefaultAppDirectory(projectDir, configuration.directories!.app)
this.isTwoPackageJsonProjectLayoutUsed = this._appDir !== projectDir
const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

if (this.devMetadata != null && !this.isTwoPackageJsonProjectLayoutUsed) {
  this._metadata = this.devMetadata
} else {
  this._metadata = await this.readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile)
}
this._originalMetadata = deepAssign({}, this._metadata)
deepAssign(this._metadata, configuration.extraMetadata)
```

그리고 `packages/app-builder-lib/src/appInfo.ts`:

```ts
this.version = info.metadata.version!
```

**정리:**

1. 버전은 **`<projectDir>/package.json`의 `version`** 에서 온다. `projectDir`는 CLI `--projectDir`(기본: 현재 작업 디렉터리)다.
2. `directories.app`을 설정한 경우에만 two-package 레이아웃이 되어 앱 쪽 `package.json`을 읽는다.
3. **모노레포에서 `apps/desktop`에서 `electron-builder`를 실행하면 `apps/desktop/package.json`의 `version`이 쓰인다.** 루트 `package.json`은 관여하지 않는다.
4. `extraMetadata`가 마지막에 **덮어쓴다** → `electron-builder -c.extraMetadata.version=1.2.3`이 유효하다(이 CLI 문법은 `website/docs/cli.md`에 `-c.extraMetadata.foo=bar` 예제로 문서화돼 있다).

**`buildVersion`과의 차이 — `appInfo.ts` 원문 로직**

```ts
if (buildVersion == null) { buildVersion = info.config.buildVersion }
const buildNumberEnvs =
  process.env.BUILD_NUMBER || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER ||
  process.env.CIRCLE_BUILD_NUM || process.env.BUILD_BUILDNUMBER || process.env.CI_PIPELINE_IID
this.buildNumber = info.config.buildNumber || buildNumberEnvs
if (buildVersion == null) {
  buildVersion = this.version
  if (!isEmptyOrSpaces(this.buildNumber)) {
    buildVersion += `.${this.buildNumber}`
  }
}
this.buildVersion = buildVersion
```

- `version`은 사용자에게 보이는 마케팅 버전. `buildVersion`은 여기에 빌드 번호를 붙인 것이며, `config.buildVersion`으로 직접 지정할 수 있다.
- **GitHub Actions는 위 빌드 번호 환경변수 중 어느 것도 세팅하지 않는다.** 따라서 `buildVersion === version`이 된다. `GITHUB_RUN_NUMBER`는 목록에 없다 — 넣고 싶으면 `-c.buildNumber=${{ github.run_number }}`로 명시해야 한다.
- 또한 `appInfo.ts`의 `channel` getter는 `semver.prerelease(this.version)`을 읽어 `1.2.3-beta.1` 같은 버전에서 채널(`beta`)을 뽑는다. 프리릴리스 태그를 쓸 계획이면 관련 있다.

---

### C-18. 태그 이름 `v1.2.3`과 `package.json` version 맞추기

**확인된 사실 — 1차 문서에 근거가 있는 것은 하나뿐이다**

`website/docs/publish.md`의 "Recommended GitHub Releases Workflow" 1번 항목:

> Draft a new release. **Set the "Tag version" to the value of `version` in your application `package.json`, and prefix it with `v`.** "Release title" can be anything you want.
> For example, if your application `package.json` version is `1.0`, your draft's "Tag version" would be `v1.0`.

**즉 electron-builder가 문서로 지지하는 유일한 패턴은 "`package.json`의 version이 진실의 원천(source of truth)이고, 태그는 거기에 `v`를 붙인 것"이다.** 방향이 `package.json` → 태그다.

이것이 소스와도 일치한다. `gitHubPublisher.ts`의 draft 매칭 조건:

```ts
if (!(release.tag_name === this.tag || release.tag_name === this.version)) continue
```

**태그 이름과 `version`이 둘 다 후보로 비교된다.** 즉 `v1.2.3` 태그와 `1.2.3` version 조합이 정상 경로다.

**확인하지 못한 것**

- 반대 방향(태그 → `package.json`, 예: 태그에서 버전을 파싱해 `-c.extraMetadata.version`으로 주입)에 대한 **1차 문서의 직접적 지지는 찾지 못했다.** `-c.extraMetadata.foo=bar` CLI 문법 자체는 문서화돼 있으므로 기술적으로 가능하고 유효하지만, "이렇게 하라"는 권고는 없다.
- `semantic-release`, `changesets` 등 버저닝 도구 연계에 대한 electron-builder 1차 문서 서술은 찾지 못했다.

---

## D. 플랫폼별 lockfile 문제 — **실측 포함**

### 실험 설계

로컬(macOS **arm64**, pnpm **11.24.0**, Node **24.18.0**)에 우리 구조를 흉내낸 워크스페이스를 만들고 `pnpm install --lockfile-only`로 lockfile을 생성한 뒤, **다른 플랫폼(win32-x64)의 optional 바이너리가 lockfile에 기록되는지**를 직접 확인했다.

픽스처:
- 루트 `package.json` devDependencies: `typescript@7.0.2`, `turbo@2.10.12`, `@biomejs/biome@2.5.10`
- `pnpm-workspace.yaml`: `packages: [apps/*, packages/*]`, `minimumReleaseAge: 0`
- `apps/desktop/package.json`: dependencies `{"@yeoncha/core": "workspace:*"}`, devDependencies `{"electron": "44.0.0", "esbuild": "0.28.2"}`
- `packages/core/package.json`: `exports: {".": "./src/index.ts"}`

### D-19. TypeScript 7의 배포 형태

**확인된 사실**

npm registry의 `typescript@7.0.2` 메타데이터:

- `bin`: `{"tsc": "bin/tsc"}`
- `os`: null, `cpu`: null (루트 패키지 자체는 플랫폼 중립)
- **`optionalDependencies`에 20개의 플랫폼별 패키지가 있다.** 이름은 `@typescript/native-preview-*`가 **아니라** **`@typescript/typescript-<platform>-<arch>`** 다:

```
@typescript/typescript-aix-ppc64        @typescript/typescript-linux-arm
@typescript/typescript-linux-x64        @typescript/typescript-sunos-x64
@typescript/typescript-win32-x64        @typescript/typescript-darwin-x64
@typescript/typescript-netbsd-x64       @typescript/typescript-freebsd-x64
@typescript/typescript-linux-arm64      @typescript/typescript-linux-ppc64
@typescript/typescript-linux-s390x      @typescript/typescript-openbsd-x64
@typescript/typescript-win32-arm64      @typescript/typescript-darwin-arm64
@typescript/typescript-netbsd-arm64     @typescript/typescript-freebsd-arm64
@typescript/typescript-linux-loong64    @typescript/typescript-linux-riscv64
@typescript/typescript-openbsd-arm64    @typescript/typescript-linux-mips64el
```

(모두 `7.0.2` 고정. registry API는 optionalDependencies를 `dependencies`에도 중복 표시하는데, 이는 npm의 표준 표현 방식이다.)

출처: `https://registry.npmjs.org/typescript/7.0.2`

**실측 결과: macOS arm64에서 생성한 lockfile에 `@typescript/typescript-win32-x64`, `@typescript/typescript-win32-arm64`를 포함한 20개 전부가 기록됐다.**

**따라서 Windows 러너에서 `pnpm install --frozen-lockfile`은 `supportedArchitectures` 설정 없이 성공한다.** lockfile에 win32 바이너리가 이미 들어 있다.

### D-20. esbuild / electron / @biomejs/biome / turbo

**확인된 사실 — npm 메타데이터 (각 패키지 latest)**

| 패키지 | latest | 플랫폼별 optionalDependencies |
|---|---|---|
| `esbuild` | 0.28.2 | **26개** (`@esbuild/win32-x64`, `@esbuild/darwin-arm64`, …) |
| `@biomejs/biome` | 2.5.10 | **8개** (`@biomejs/cli-win32-x64`, `@biomejs/cli-darwin-arm64`, … + musl 변종) |
| `turbo` | 2.10.12 | **6개** (`@turbo/windows-64`, `@turbo/darwin-arm64`, …) |
| `electron` | 44.0.0 | **없음** — dependencies는 `@types/node`, `@electron/get`, `@electron-internal/extract-zip` |

**실측 결과 — 생성된 `pnpm-lock.yaml`에 다음이 전부 기록됐다:**
- `@esbuild/*` 26개 전부 (`win32-x64`, `win32-ia32`, `win32-arm64` 포함)
- `@biomejs/cli-*` 8개 전부 (`win32-x64`, `win32-arm64` 포함)
- `@turbo/*` 6개 전부 (`windows-64`, `windows-arm64` 포함)
- `@typescript/typescript-*` 20개 전부

lockfile 헤더: `lockfileVersion: '9.0'`.

**pnpm이 lockfile에 모든 플랫폼의 optionalDependencies를 기록하는가 — 결론: 그렇다 (실측).**

**`supportedArchitectures` — pnpm 공식 문서 원문**

> You can specify architectures for which you'd like to install optional dependencies, even if they don't match the architecture of the system running the install.

```yaml
supportedArchitectures:
  os:
    - win32
  cpu:
    - x64
```

```yaml
supportedArchitectures:
  os:
    - win32
    - darwin
    - current
  cpu:
    - x64
    - arm64
```

> Additionally, `supportedArchitectures` also supports specifying the `libc` of the system.

출처: `https://pnpm.io/settings/dependency-resolution#supportedarchitectures`

**즉 `supportedArchitectures`는 lockfile에 무엇이 기록되는지가 아니라 "어느 플랫폼의 optional 의존성을 `node_modules`에 실제로 설치할지"를 정하는 설정이다. 우리 CI에는 필요 없다** — 각 러너가 자기 플랫폼 것만 설치하면 되고, lockfile에는 이미 전부 들어 있다.

**단, 반례가 하나 있다** — electron-builder 소스 주석(A-7-4):
> pnpm 10+ does not automatically preserve transitive optional platform-specific packages ... across lock file regeneration. Users must list them as direct optionalDependencies.

이건 **직접 의존성이 아니라 이행 의존성(transitive)의 optional 플랫폼 패키지**에 대한 이야기다. 우리 네 패키지는 모두 직접 devDependency이므로 해당하지 않는다.

**보너스 발견: Electron 42부터 postinstall 스크립트가 사라졌다**

| electron 버전 | `scripts` |
|---|---|
| 37.10.3 | `{"postinstall": "node install.js"}` |
| 40.10.6 | `{"postinstall": "node install.js"}` |
| **42.10.1** | **없음** |
| 43.4.1 | 없음 |
| **44.0.0** | **없음** |

설치된 `electron@44.0.0`의 `package.json` 키 목록(실측): `name, version, repository, description, license, author, keywords, main, types, bin, files, engines, dependencies` — `scripts` 키 자체가 없다.

패키지 안에 `install.js`는 여전히 있고, `index.js`가 다음처럼 **지연 다운로드**한다:

```js
function downloadElectron() {
  console.log('Downloading Electron binary...');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'install.js')], { stdio: 'inherit' });
  ...
}
function getElectronPath() {
  let executablePath;
  if (fs.existsSync(pathFile)) executablePath = fs.readFileSync(pathFile, 'utf-8');
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
  if (executablePath) {
    const fullPath = path.join(__dirname, 'dist', executablePath);
    if (!fs.existsSync(fullPath)) downloadElectron();
    return fullPath;
  }
  ...
}
```

**함의: `pnpm install` 시점에 Electron 바이너리가 내려오지 않는다.** 설치 직후 `node_modules/.../electron/`에는 `dist/`도 `path.txt`도 없다(실측). 다운로드는 `require('electron')`이 처음 호출될 때(=`pnpm dev`) 일어난다. 그리고 **electron-builder는 이와 별개로 `@electron/get`으로 자기 캐시(`ELECTRON_BUILDER_CACHE` / `~/Library/Caches/electron-builder`, `~/.cache/electron`)에 배포본을 내려받는다.** CI 캐싱을 붙인다면 pnpm 스토어가 아니라 이 두 캐시 디렉터리를 대상으로 해야 한다.

### D-21. `onlyBuiltDependencies` / `allowBuilds`와 `ERR_PNPM_IGNORED_BUILDS`

**확인된 사실 — pnpm 11에서 설정 이름이 바뀌었다**

pnpm 11.0 릴리스 노트: `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `onlyBuiltDependenciesFile`, `ignoreDepScripts`가 **제거되고 `allowBuilds` 하나로 통합**됐다.
출처: `https://pnpm.io/blog/releases/11.0`

**`pnpm.io/settings/build` 원문:**

> ### strictDepBuilds
> Added in: v10.3.0 / Default: `true` / Type: Boolean
> When `strictDepBuilds` is enabled, the installation will exit with a **non-zero exit code** if any dependencies have unreviewed build scripts (aka postinstall scripts).

> ### allowBuilds
> Added in: v10.26.0
> A map of package matchers to explicitly allow (`true`) or disallow (`false`) script execution.
> ```yaml
> allowBuilds:
>   esbuild: true
>   core-js: false
>   # nx versions with build scripts not listed below will
>   # fail by default with ERR_PNPM_IGNORED_BUILDS
>   nx@21.6.4 || 21.6.5: true
>   nx@21.6.0: false
> ```

> **Default behavior:** Packages not listed in `allowBuilds` are disallowed by default and are treated as unreviewed. By default, an error is printed (`strictDepBuilds` defaults to `true`). If `strictDepBuilds` is set to `false`, a warning is printed instead.
> During install, dependencies with ignored builds that are not yet listed in `allowBuilds` are **automatically added to `pnpm-workspace.yaml` with a placeholder value**, so you can manually set them to `true` or `false`.

출처: `https://pnpm.io/settings/build`

**실측 결과 (핵심)**

`pnpm install --frozen-lockfile`을 위 픽스처에서 실행한 결과:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**종료 코드: `1`** (`pnpm install --frozen-lockfile >/dev/null 2>&1; echo $?` → `1`)

그리고 **`pnpm-workspace.yaml`이 install 중에 자동으로 수정됐다:**

```yaml
packages:
  - apps/*
  - packages/*
allowBuilds:
  esbuild: set this to true or false     # ← install이 써 넣음
minimumReleaseAge: 0
```

`pnpm ignored-builds` 출력:
```
Automatically ignored builds during installation:
  esbuild
hint: To allow the execution of build scripts for a package, add its name to "allowBuilds" and set to "true", then run "pnpm rebuild".
```

**결론:**

1. **`esbuild`만 걸린다.** `electron`(D-20에서 확인했듯 postinstall 없음), `typescript`, `@biomejs/biome`, `turbo`는 install 스크립트가 없어 걸리지 않는다.
2. **`pnpm-workspace.yaml`에 `allowBuilds: { esbuild: true }`를 미리 커밋해 두지 않으면 CI의 첫 `pnpm install`이 종료 코드 1로 실패한다.**
3. CI에서 pnpm이 워크스페이스 파일을 수정하려 드는 것도 바람직하지 않다(`git status`가 더러워지고, 읽기 전용 체크아웃이면 다른 실패가 날 수 있다).

**확인하지 못한 것**

- `--frozen-lockfile`이 `pnpm-workspace.yaml` 자동 수정을 막는 옵션이 있는지. 실측에서는 `--frozen-lockfile`에도 수정이 일어났다.
- `esbuild`의 postinstall(`node install.js`)을 **허용하지 않아도** electron-vite/Vite 빌드가 정상 동작하는지. esbuild는 optional 플랫폼 패키지(`@esbuild/darwin-arm64` 등)로 바이너리를 받으므로 postinstall 없이도 동작할 가능성이 높지만 실측하지 않았다. `esbuild: false`로 두는 선택지가 가능한지는 검증 필요.

### D-22. `minimumReleaseAge`가 CI에도 적용되는가

**확인된 사실 — pnpm 공식 문서 원문:**

> ### minimumReleaseAge
> Added in: v10.16.0
> **Default: `1440` (since v11)**, `0` (before v11)
> Type: number (minutes)
> To reduce the risk of installing compromised packages, you can delay the installation of newly published versions. In most cases, malicious releases are discovered and removed from the registry within an hour.
> `minimumReleaseAge` defines the minimum number of minutes that must pass after a version is published before pnpm will install it. **This applies to all dependencies, including transitive ones.**

> ### minimumReleaseAgeExclude
> Added in: v10.16.0 / Default: `undefined` / Type: string[]
> If you set `minimumReleaseAge` but need certain dependencies to always install the newest version immediately, you can list them under `minimumReleaseAgeExclude`. The exclusion works by **package name** and applies to all versions of that package.

문법 (버전별 기능 추가가 명시돼 있다):

```yaml
# 기본형 (v10.16.0+)
minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - webpack
  - react

# 패턴 (v10.17.0+)
minimumReleaseAgeExclude:
  - '@myorg/*'

# 특정 버전 / disjunction (v10.19.0+)
minimumReleaseAgeExclude:
  - nx@21.6.5
  - webpack@4.47.0
  - 'webpack@4.47.0 || 5.102.1'
```

출처: `https://pnpm.io/settings/dependency-resolution#minimumreleaseage`, `#minimumreleaseageexclude`

**CI 적용 여부 — 판단과 실측**

- 이 설정은 `pnpm-workspace.yaml`에 들어가고 **resolution 단계**에 작용한다. `--frozen-lockfile`은 resolution 단계를 건너뛰므로(실측 로그: `Lockfile is up to date, resolution step is skipped`) **CI의 frozen install에는 사실상 영향이 없다.** 영향을 받는 건 lockfile을 갱신하는 로컬 `pnpm add`/`pnpm update`다.
- 실측 로그에 pnpm 11의 새 검증 라인이 찍혔다: `✓ Lockfile passes supply-chain policies (verified 16s ago)` — 즉 **frozen install에서도 lockfile이 supply-chain 정책(=minimumReleaseAge 포함으로 추정)을 만족하는지 검사한다.**
- **확인하지 못한 것: 이 "supply-chain policies" 검증이 정확히 무엇을 검사하며, 정책 위반 시 CI install이 실패하는지.** pnpm 문서에서 이 메시지에 대한 설명을 찾지 못했다. 다만 **막 릴리스된 버전으로 로컬에서 lockfile을 갱신했는데 24시간이 지나지 않았다면 CI에서 문제가 될 수 있다**는 가능성은 남는다.

**추가로 확인된 pnpm 11 변경 — 설정 파일 위치가 바뀌었다**

pnpm 11.0 릴리스 노트 요지: **`.npmrc`는 인증/레지스트리 전용이 되었고, 나머지 설정은 `pnpm-workspace.yaml` 또는 전역 `config.yaml`에 두어야 한다.** 환경변수 접두사도 `npm_config_*` → `pnpm_config_*`. Node.js 22 이상 필요.
출처: `https://pnpm.io/blog/releases/11.0`

**즉 `.npmrc`에 `node-linker=hoisted`를 써도 pnpm 11에서는 먹지 않는다. `pnpm-workspace.yaml`의 `nodeLinker: hoisted`여야 한다.** (`nodeLinker` 기본값은 `isolated`. 출처: `https://pnpm.io/settings/node-modules#nodelinker`)

**참고: pnpm npm `dist-tags`** — `latest: 11.24.0`, `latest-11: 11.24.0`, `next-12: 12.0.0-rc.11`.

---

## 파이프라인 설계에 직접 영향을 주는 것 12가지 (우선순위 순)

### 1. `pnpm-workspace.yaml`에 `allowBuilds: { esbuild: true }`를 반드시 커밋해 둬라 — 없으면 CI 첫 install이 종료 코드 1로 죽는다

실측으로 확인했다(D-21). `strictDepBuilds` 기본값이 `true`라서 `esbuild`의 미승인 postinstall 때문에 `ERR_PNPM_IGNORED_BUILDS`가 나고 exit 1이다. 게다가 pnpm이 `pnpm-workspace.yaml`에 `esbuild: set this to true or false` 플레이스홀더를 **install 중에 써넣는다** — CI 워크스페이스가 더러워진다.
→ 조치: `pnpm-workspace.yaml`에 `allowBuilds: { esbuild: true }`를 미리 넣고 커밋. `electron`은 42부터 postinstall이 없으므로 항목이 필요 없다.

### 2. 두 러너가 동시에 릴리스를 만들면 electron-builder는 방어하지 못한다 — draft를 먼저 만들거나 publish를 한 잡으로 몰아라

`gitHubPublisher.ts`의 `createRelease()`는 422 `already_exists` 재시도가 없다(A-8). macOS/Windows 매트릭스가 동시에 시작하면 한쪽이 실패할 수 있다.
→ 선택지 셋:
  - **(a) 문서가 권장하는 방식**: draft 릴리스를 사람이 먼저 만들어 두고 CI는 붙이기만 한다 (`publish.md`의 "Recommended GitHub Releases Workflow").
  - **(b) 가장 견고**: 빌드 잡은 `--publish never` + `upload-artifact`, 별도 수집 잡 하나에서 `download-artifact`(`pattern` + `merge-multiple`) → `softprops/action-gh-release@v3`. softprops v3는 릴리스 생성·에셋 업로드 양쪽의 `already_exists` 경쟁을 명시적으로 처리한다(B-13).
  - **(c)** macOS 잡이 먼저 끝나도록 `needs:`로 직렬화 (빌드 시간이 두 배가 된다).
  **개인 도구 0~1명 규모에는 (b)가 가장 단순하고 재현 가능하다.**

### 3. `mac.identity: null`을 electron-builder 설정 파일에 박아라 — 환경변수 말고

`identity === null`이면 키체인 조회 전에 서명 경로가 차단된다(A-2, 소스 확인). `CSC_IDENTITY_AUTO_DISCOVERY=false`는 환경변수라 로컬에서 빠뜨리면 "키체인의 Apple Development 인증서로 자동 서명" 사고가 재발한다. 설정 파일에 두면 로컬·CI 동일 동작이 보장된다. 나중에 인증서를 꽂을 때는 이 한 줄을 지우거나 `CSC_LINK`/`CSC_KEY_PASSWORD`를 넣으면 된다.
→ 함께: `mac.hardenedRuntime: false`, `win.signExecutable: false`. **`win.signAndEditExecutable: false`는 쓰지 마라** — 아이콘·버전 메타데이터 편집까지 꺼진다(A-3).

### 4. `macos-latest`는 arm64다 — x64 macOS가 필요한지 지금 결정하라

`macos-latest` = macOS 26 **arm64**. x64는 `macos-26-intel`/`macos-latest-large`이며 large 러너 계열이다(B-9).
→ 선택지: (a) **arm64 전용 dmg만 배포** — 가장 싸고 빠르다. 개인용 도구라면 본인 Mac이 Apple Silicon인지만 확인하면 끝. (b) `arch: universal` — arm64 러너 한 대에서 x64/arm64를 **연속으로 두 번 패키징한 뒤 `@electron/universal`로 병합**하므로 빌드 시간·Electron 다운로드가 2배, 산출물도 크다(A-5).
**0~1명짜리 개인 도구에는 arm64 전용을 권한다.**

### 5. pnpm 11이면 `pnpm/action-setup`이 아니라 `pnpm/setup@v2`다

`pnpm/action-setup` README가 직접 "This action has a successor... For pnpm v11 and newer, use `pnpm/setup`"이라고 명시한다(B-11). `pnpm/setup@v2`는 `runtime: node@24`로 `actions/setup-node`까지 대체하고 `pnpm install`을 자동 실행하므로, 스텝 순서 함정(pnpm이 setup-node보다 먼저여야 하는 것)도 사라진다.
→ **단 하나의 함정**: pnpm v11은 **Intel macOS(`darwin-x64`) 바이너리를 배포하지 않는다.** 4번에서 Intel 러너를 쓰기로 했다면 `pnpm/setup`을 쓸 수 없다(또는 pnpm 12 필요).

### 6. electron-builder 버전을 26.15.7로 명시하라 — `latest`는 26.15.3이다

npm `latest` 태그가 26.15.3에 멈춰 있고 실제 최신은 `v26` 태그의 26.15.7이다(A-1). 그리고 **pnpm v11 워크스페이스 지원 코드가 26.15.x 소스에 들어 있으므로**(A-7) 최신 패치를 쓰는 편이 안전하다.
→ `"electron-builder": "26.15.7"`처럼 정확히 핀.

### 7. `@yeoncha/core`는 `apps/desktop`의 `devDependencies`에 둬라

electron-builder의 pnpm 수집기는 `pnpm list --prod`를 쓴다(A-7). `dependencies`에 두면 TS 소스 그대로 `node_modules`에 복사되는데 Electron은 `.ts`를 실행할 수 없어 죽은 파일이 된다. 정상 경로는 electron-vite/Vite가 번들 시점에 인라인하는 것이고, 그렇다면 devDependency가 맞다.
→ **번들이 실제로 `@yeoncha/core`를 인라인하는지는 실물 확인이 필요하다.** 인라인되지 않고 런타임 `require`로 남으면 패키징된 앱이 실행 시점에 죽는다.

### 8. 아티팩트 이름을 매트릭스마다 다르게 — v4부터 아티팩트는 불변이다

`upload-artifact` v4+ 아티팩트는 immutable이고, 같은 이름 재업로드는 `overwrite: true` 없이는 실패한다(B-12).
→ `name: dist-${{ matrix.os }}`, 수집 잡에서 `pattern: dist-*` + `merge-multiple: true`.

### 9. 워크플로에 `permissions: contents: write`를 명시하라

`GITHUB_TOKEN`의 기본 권한은 리포지토리/조직 설정에 따라 달라지므로 문서상 고정 기본값이 없다(B-14). `permissions:`를 쓰면 명시하지 않은 스코프는 전부 `none`이 되므로, 릴리스 잡에만 최소 권한으로 붙이는 것이 깔끔하다.

### 10. 버전은 `apps/desktop/package.json`에서 온다 — 루트가 아니다

`electron-builder`를 `apps/desktop`에서 실행하면 `projectDir = apps/desktop`이고 `metadata = apps/desktop/package.json`이다(C-17, 소스 확인). 태그는 `v` + 그 version이 문서가 지지하는 유일한 패턴(C-18).
→ 태그에서 버전을 역주입하고 싶다면 `-c.extraMetadata.version=...`가 기술적으로 유효하지만 **문서의 권고는 아니다.** 릴리스 전에 `apps/desktop/package.json`의 version과 태그가 일치하는지 검증하는 스텝을 두는 편이 문서 노선에 맞는다.
→ GitHub Actions는 electron-builder가 인식하는 빌드 번호 환경변수를 하나도 세팅하지 않으므로 `buildVersion === version`이다.

### 11. Electron 42+는 postinstall이 없다 — 캐시 대상이 pnpm 스토어가 아니다

`pnpm install` 시점에 Electron 바이너리가 내려오지 않고, `require('electron')` 또는 electron-builder의 `@electron/get`이 각자 내려받는다(D-20 실측).
→ CI 캐싱을 붙일 거면 `~/.cache/electron`(또는 macOS의 `~/Library/Caches/electron`)과 `~/.cache/electron-builder` 두 곳을 `actions/cache`로 잡아야 한다. pnpm 스토어 캐시(`pnpm/setup`의 `cache: true`)만으로는 Electron 배포본 다운로드가 매번 반복된다.

### 12. 암묵적 publish는 v27에서 제거된다 — 지금부터 `--publish`를 명시하라

`publish.md`의 deprecation 경고(A-8). 지금 CI 자동 감지에 의존하는 워크플로를 짜면 v27 업그레이드 시 조용히 깨진다.
→ 빌드 잡은 `--publish never`, 릴리스 잡이 있다면 `--publish always`처럼 항상 명시.

---

## 질문 목록 밖에서 나온 것

### (가) electron.build 문서 사이트는 v27 알파(master)를 보여준다

사이트맵에 `/docs/migration/v26-to-v27`, `/docs/migration/whats-new-v27`, `/docs/partials/_upgrading-from-v26`이 있고, `master`의 `website/docs/mac.md`는 v26에는 없는 `{!./partials/_upgrading-from-v26.md!}`를 include한다. **v26.15.7을 쓰면서 문서 사이트를 읽으면 존재하지 않는 옵션을 설정하게 될 수 있다.** 실제로 이번 조사 중 WebFetch 요약이 존재하지 않는 `mac.sign.identity`를 만들어냈고, 소스 확인 결과 `MacConfiguration.sign`은 `CustomMacSign | string | null`(커스텀 서명 함수/경로)이지 객체가 아니었다.
→ **설정을 결정할 때는 `https://github.com/electron-userland/electron-builder/tree/electron-builder%4026.15.7/website/docs/` 또는 `packages/app-builder-lib/src/options/*.ts`를 직접 읽어라.**

### (나) electron-builder 저장소 문서에 "pnpm"이라는 단어가 단 한 번도 없다

`website/docs/` 전체에 `pnpm` 0건, `monorepo`/`workspace`는 `contents.md`의 "Two-Package Structure" 한 항목뿐이다. **pnpm 지원은 소스(`node-module-collector/pnpmNodeModulesCollector.ts`)와 테스트 픽스처에만 존재하고 문서화되어 있지 않다.** 문제가 생기면 문서가 아니라 소스와 이슈 트래커를 봐야 한다. 참고로 픽스처에 `pnpm v11 workspace.txt`, `pnpm node-linker=hoisted.txt`, `pnpm workspace with native module.txt`, `pnpm optional dependencies.txt`가 있어 회귀 테스트 대상이긴 하다.

### (다) pnpm 11에서 `.npmrc`가 무력화됐다

`.npmrc`는 인증/레지스트리 전용이 되었고 나머지 설정은 `pnpm-workspace.yaml`(또는 전역 `config.yaml`)에 두어야 한다. 환경변수 접두사도 `npm_config_*` → `pnpm_config_*`. **`.npmrc`에 `node-linker=hoisted`나 `shamefully-hoist=true`를 쓰던 기존 관행이 조용히 무시된다.** (출처: pnpm 11.0 릴리스 노트)

### (라) pnpm 11 frozen install이 "supply-chain policies"를 검증한다

실측 로그: `✓ Lockfile passes supply-chain policies (verified 16s ago)`. 이 검사가 정확히 무엇이고 실패 시 어떻게 되는지는 pnpm 문서에서 설명을 찾지 못했다. `minimumReleaseAge` 기본값이 v11부터 1440분(1일)이므로, **막 나온 버전으로 로컬에서 lockfile을 갱신한 직후 CI를 돌리면 문제가 될 소지가 있다.** 릴리스 직전 의존성 업데이트는 피하는 편이 안전하다.

### (마) `win.signExecutable`은 26.x에만 있는 세밀한 옵션이다

"서명은 끄되 아이콘·버전 정보는 넣는다"를 정확히 표현하는 옵션이다. 문서 사이트보다 `winOptions.ts` JSDoc이 훨씬 명확하다. `signAndEditExecutable: false`와 혼동하면 앱에 아이콘이 안 붙는다.

### (바) `EP_GH_IGNORE_TIME` — 2시간 제한 우회 환경변수

이미 publish된(=draft가 아닌) 릴리스에 electron-builder가 에셋을 붙이려 할 때, 그 릴리스가 2시간 이상 전에 publish됐으면 거부한다. `EP_GH_IGNORE_TIME=true`로 무시할 수 있다(소스 확인). 릴리스를 publish한 뒤 나중에 산출물을 추가할 일이 생기면 알아둘 만하다.

### (사) `GITHUB_RELEASE_TOKEN`으로 토큰 권한을 분리할 수 있다

`publish.md` 원문: `GITHUB_RELEASE_TOKEN`이 정의되면 `GH_TOKEN`/`GITHUB_TOKEN` 대신 릴리스 publish에 사용되고, `GITHUB_TOKEN`은 앱의 업데이트 확인 등에 계속 쓰인다. fine-grained PAT의 "Contents" 권한만으로 충분하다고 문서가 명시한다(2024년 4월 기준). 개인 도구에는 과할 수 있으나, 자동 업데이트를 붙일 때 유용하다.

### (아) 러너에 GitHub CLI가 이미 깔려 있다

macOS 26 arm64: gh 2.96.0 / Windows Server 2025: gh 2.97.0. 별도 설치 스텝이 필요 없다. macOS 러너에는 Node.js 24.18.0도 프리인스톨돼 있다.

### (자) softprops/action-gh-release v3는 Node 24 런타임을 요구한다

README: "`v3` requires a GitHub Actions runtime that supports Node 24. If you still need the last Node 20-compatible line, stay on `v2.6.2`." 현재 러너 이미지는 문제없다.

### (차) `gitHubPublisher`의 릴리스 목록에 페이지네이션이 없다

`/repos/{owner}/{repo}/releases`를 `per_page` 없이 한 번 호출한다(소스에 `per_page`/`page` 문자열 자체가 없다). GitHub 기본 페이지 크기 30을 넘어가면 오래된 draft를 못 찾는다. 개인 도구에서는 릴리스가 30개를 넘길 때까지 문제되지 않지만, 넘긴 뒤에는 "draft가 있는데 새로 만든다"는 증상으로 나타난다.

---

## 미해결 항목 정리 (설계 전에 실측이 필요한 것)

| # | 항목 | 왜 못 확인했나 | 어떻게 확인하나 |
|---|---|---|---|
| 1 | `.zip` vs `.dmg`의 quarantine 부착 차이 | Apple 개발자 문서 본문이 JS 렌더링이라 못 읽음. 포럼 답변만 확보 | 실제로 릴리스에 두 형식을 올려 다른 Mac에서 내려받아 열어보기 |
| 2 | `nsis`/`portable`/`zip`의 SmartScreen 차이 | electron-builder 문서에 서술 없음. Microsoft 1차 문서 미조사 | Windows에서 실제 실행해 확인 |
| 3 | `gh release create`가 기존 태그 릴리스에 대해 하는 행동 | CLI 매뉴얼에 명시 없음 | 테스트 리포지토리에서 두 번 실행 |
| 4 | arm64 러너에서 x64/universal macOS 빌드 성공 여부 | 문서상 보증 없음 | 실제 CI 1회 실행 |
| 5 | `fetch-depth: 1`에서 Turborepo 캐시 동작 여부 | Turborepo 문서가 `fetch-depth: 2`를 쓰되 이유를 안 밝힘 | 우리 파이프라인에는 영향 작음 — 굳이 확인 안 해도 됨 |
| 6 | `esbuild: false`(빌드 스크립트 미승인)로 Vite 빌드가 동작하는지 | 실측 안 함 | `allowBuilds: { esbuild: false }`로 두고 빌드 |
| 7 | pnpm 11 "supply-chain policies" 검증의 정확한 동작 | pnpm 문서에 설명 없음 | pnpm 이슈 트래커 확인 필요 |
| 8 | `hardenedRuntime: false`가 `identity: null`에도 필요한지 | 문서 경고문의 문면이 모호 | 실제 빌드해 실행 |
| 9 | `@yeoncha/core`가 번들에 실제로 인라인되는지 | electron-vite 설정 미확인 | 패키징 후 `asar list`로 확인 |

---

## 주요 출처 URL 목록

**electron-builder (모두 태그 `electron-builder@26.15.7` 기준)**
- 소스 베이스: `https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder%4026.15.7/`
  - `packages/app-builder-lib/src/options/macOptions.ts`
  - `packages/app-builder-lib/src/options/winOptions.ts`
  - `packages/app-builder-lib/src/macPackager.ts`
  - `packages/app-builder-lib/src/codeSign/macCodeSign.ts`
  - `packages/app-builder-lib/src/util/flags.ts`
  - `packages/app-builder-lib/src/configuration.ts`
  - `packages/app-builder-lib/src/packager.ts`
  - `packages/app-builder-lib/src/appInfo.ts`
  - `packages/app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector.ts`
  - `packages/app-builder-lib/src/node-module-collector/nodeModulesCollector.ts`
  - `packages/electron-publish/src/gitHubPublisher.ts`
  - `packages/electron-publish/src/publisher.ts`
  - `packages/builder-util-runtime/src/publishOptions.ts`
  - `website/docs/{mac,win,nsis,dmg,publish,cli,targets,troubleshooting,contents}.md`
  - `website/docs/features/{github-actions,multi-platform-build}.md`
  - `website/docs/features/code-signing/code-signing-mac.md`
- npm: `https://registry.npmjs.org/electron-builder`
- GitHub: `https://api.github.com/repos/electron-userland/electron-builder/releases/latest`

**GitHub Actions**
- `https://raw.githubusercontent.com/actions/runner-images/main/README.md`
- `https://raw.githubusercontent.com/actions/runner-images/main/images/macos/macos-26-arm64-Readme.md`
- `https://raw.githubusercontent.com/actions/runner-images/main/images/windows/Windows2025-VS2026-Readme.md`
- `https://raw.githubusercontent.com/actions/setup-node/v7.0.0/action.yml`
- `https://raw.githubusercontent.com/actions/setup-node/v7.0.0/docs/advanced-usage.md`
- `https://raw.githubusercontent.com/actions/upload-artifact/v7.0.1/README.md`
- `https://raw.githubusercontent.com/actions/download-artifact/v8.0.1/README.md`
- `https://raw.githubusercontent.com/pnpm/action-setup/v6.0.10/README.md`
- `https://raw.githubusercontent.com/pnpm/setup/main/action.yml`
- `https://raw.githubusercontent.com/pnpm/setup/main/README.md`
- `https://raw.githubusercontent.com/softprops/action-gh-release/v3.0.2/README.md`
- `https://raw.githubusercontent.com/softprops/action-gh-release/v3.0.2/src/github.ts`
- `https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions`
- `https://docs.github.com/actions/security-guides/automatic-token-authentication`
- `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows`
- `https://cli.github.com/manual/gh_release_create`

**pnpm / Turborepo / npm**
- `https://pnpm.io/settings/dependency-resolution`
- `https://pnpm.io/settings/node-modules`
- `https://pnpm.io/settings/build`
- `https://pnpm.io/blog/releases/11.0`
- `https://turborepo.dev/docs/guides/ci-vendors/github-actions` (+ `.mdx` 원본)
- `https://registry.npmjs.org/{typescript,esbuild,electron,@biomejs%2fbiome,turbo,pnpm}`

**Apple**
- `https://support.apple.com/en-us/102445`
- `https://developer.apple.com/forums/thread/710738` (Apple DTS 엔지니어 답변 — 공식 문서 아님)
