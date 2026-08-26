# 13. 스캐폴딩과 검증 파이프라인

Type: task
Status: resolved
Blocked by: 없음 (바로 시작할 수 있다)

## What to build

빈 저장소에서 `pnpm install` → `pnpm verify` → `pnpm build`가 전부 통과하고 `pnpm dev`로 빈
Electron 창이 뜨는 상태. 앱 기능은 아직 하나도 없다. 이 티켓이 만드는 것은 **이후 모든 티켓이
그 안에서 일하게 되는 경계와 검증 루프**다.

[스펙 7절](../spec.md)의 트리와 설정값을 그대로 따른다. `CONTEXT.md`는 고치지 않는다.

**순서 지시가 하나 있다**: `git init`이 `turbo` 설치보다 먼저다([스펙 9절 1번](../spec.md)).
git 저장소가 없으면 turbo 캐시가 동일 재실행에도 동작하지 않는다.

`allowBuilds`는 추측하지 말고 **electron-builder까지 포함한 전체 설치를 한 번 돌려** pnpm이
`pnpm-workspace.yaml`에 써넣는 플레이스홀더를 전부 확인하고 값을 정해 커밋한다(9절 6번).

## Acceptance criteria

- [x] `git init`을 먼저 한 뒤 스캐폴딩했고, `pnpm verify`를 두 번 돌리면 두 번째가 `FULL TURBO`다
- [x] 루트 `package.json`에 `verify` / `build` / `format` / `lint` / `typecheck` / `test` 스크립트가 있고 `private: true`이며 **`version`이 없다**(8.3절)
- [x] `turbo.json`이 7.5절 그대로다 — `build`가 `lint`·`typecheck`·`^test`에 의존한다
- [x] `pnpm-workspace.yaml`에 `packages/*`·`apps/*`와 실측으로 확정한 `allowBuilds`가 있다(`esbuild: true` 필수, `electron-winstaller: false`, `electron` 항목은 두지 않는다)
- [x] `biome.json`에 `vcs.useIgnoreFile: true`, 제외 패턴은 `!**/out`, 규칙은 `rules.preset: "recommended"`
- [x] `tsconfig.base.json`이 7.6절의 값 그대로다(`allowImportingTsExtensions`·`noUncheckedIndexedAccess` 포함)
- [x] `packages/core`의 `exports`가 `./src/index.ts`를 가리키고 빌드 스크립트도 `dist`도 없으며 `dependencies`는 `temporal-polyfill` 하나뿐이다
- [x] 코어에 Vitest 4 표 기반 테스트가 최소 1건 있고 `pnpm test`로 통과한다
- [x] `apps/desktop`이 `electron-vite` 5 + Vite 7 + `@vitejs/plugin-react` 5.2로 main·preload·renderer 세 타깃을 빌드하고, `dependencies`가 **비어 있다**(8.4절 불변식)
- [x] `electron-vite` 출력은 `out/`, `electron-builder`의 `directories.output`은 `release/`로 갈라져 있다
- [x] `pnpm dev`로 빈 창이 뜨고 `pnpm build`가 `out/`을 만든다
- [x] 경계를 실측했다 — 코어에서 `electron`을 import하면 `TS2307`, 셸에서 미선언 의존성을 import하면 같은 오류
- [x] 코어에 린트 오류를 심으면 `build`가 실행되지 않고 산출물도 생기지 않는다
- [x] `.gitignore`에 `node_modules/` `out/` `dist/` `.turbo/` `release/`
- [x] `electron-builder`가 `26.15.7`로 정확히 핀되어 있다(9절 10번)

## Answer

커밋 e62db10에서 완료. 수용 기준 15개 전부 실측으로 확인했다.

- **설치 순서**: 저장소에 git이 이미 있었으므로 9절 1번 조건은 자동 충족.
  `pnpm verify` 두 번째 실행이 `FULL TURBO`(5/5 cached, 77ms)였다.
- **`allowBuilds` 실측**: electron-builder 포함 전체 설치에서 pnpm이 써넣은
  플레이스홀더는 `electron-winstaller`, `esbuild` 둘뿐이었다(스펙 9절 6번 예측과
  일치, `electron` 항목 없음). `esbuild: true` / `electron-winstaller: false`로 확정.
- **경계 실측**: 코어에서 `import { app } from "electron"` → `TS2307`. 셸에서
  미선언 `zod` import → 같은 `TS2307`. 부수효과 import(`import "electron"`)는
  TS 7이 전용 코드 `TS2882`를 쓰는 것도 확인했다 — 경계 강제는 동일하다.
- **린트 게이트**: 코어에 `let probe = 1`을 심으니 `@yeoncha/core#lint`가 실패하고
  `#build`가 실행되지 않았으며 `out/`이 생기지 않았다(스펙 7.5절 실험 재현).
  참고로 `turbo run build`가 코어의 `lint`도 그래프에 포함했다 — 8.2절이 "해석이
  갈린다"고 한 지점은 현 turbo 2.10.11에서 포함하는 쪽으로 동작한다.
- **`pnpm dev`**: 빈 창(제목 `연차몇개`)이 뜨는 것을 확인. 함정 하나 발견 —
  **Electron 42+는 postinstall이 없는 대신 첫 `require('electron')` 시점에
  바이너리를 지연 다운로드**하는데, electron-vite는 `path.txt`를 직접 읽으므로
  다운로드 전이면 `Error: Electron uninstall`로 죽는다. 새 클론에서는
  `node -e "require('electron')"` 한 번(또는 아무 electron CLI 실행)이 필요하다.
  CI는 electron을 실행하지 않고(`ci.yml`), electron-builder는 자체 `@electron/get`
  캐시를 쓰므로 영향 없다.
- 테스트는 Temporal.PlainDate 월말 클램프·`+1년 −1일` 윤년 경계를 표(`test.each`
  8케이스)로 고정했다 — 스펙 3.2절이 기대는 폴리필 기본 동작(`constrain`)의 계약이다.
- `electron-builder.yml`에는 이 티켓 몫(`directories.output: release`)에 더해
  8.4절 서명 억제 세 줄을 미리 넣었다(로컬 자동 서명 사고 방지). 타깃·artifactName
  등 패키징 상세는 28번 티켓 몫으로 주석에 표시했다.

지도(map.md)는 목적지 도달로 닫혔고 이 티켓은 구현 티켓이므로 map 갱신은 없다.
