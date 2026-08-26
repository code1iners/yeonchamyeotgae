# 13. 스캐폴딩과 검증 파이프라인

Type: task
Status: claimed
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

- [ ] `git init`을 먼저 한 뒤 스캐폴딩했고, `pnpm verify`를 두 번 돌리면 두 번째가 `FULL TURBO`다
- [ ] 루트 `package.json`에 `verify` / `build` / `format` / `lint` / `typecheck` / `test` 스크립트가 있고 `private: true`이며 **`version`이 없다**(8.3절)
- [ ] `turbo.json`이 7.5절 그대로다 — `build`가 `lint`·`typecheck`·`^test`에 의존한다
- [ ] `pnpm-workspace.yaml`에 `packages/*`·`apps/*`와 실측으로 확정한 `allowBuilds`가 있다(`esbuild: true` 필수, `electron-winstaller: false`, `electron` 항목은 두지 않는다)
- [ ] `biome.json`에 `vcs.useIgnoreFile: true`, 제외 패턴은 `!**/out`, 규칙은 `rules.preset: "recommended"`
- [ ] `tsconfig.base.json`이 7.6절의 값 그대로다(`allowImportingTsExtensions`·`noUncheckedIndexedAccess` 포함)
- [ ] `packages/core`의 `exports`가 `./src/index.ts`를 가리키고 빌드 스크립트도 `dist`도 없으며 `dependencies`는 `temporal-polyfill` 하나뿐이다
- [ ] 코어에 Vitest 4 표 기반 테스트가 최소 1건 있고 `pnpm test`로 통과한다
- [ ] `apps/desktop`이 `electron-vite` 5 + Vite 7 + `@vitejs/plugin-react` 5.2로 main·preload·renderer 세 타깃을 빌드하고, `dependencies`가 **비어 있다**(8.4절 불변식)
- [ ] `electron-vite` 출력은 `out/`, `electron-builder`의 `directories.output`은 `release/`로 갈라져 있다
- [ ] `pnpm dev`로 빈 창이 뜨고 `pnpm build`가 `out/`을 만든다
- [ ] 경계를 실측했다 — 코어에서 `electron`을 import하면 `TS2307`, 셸에서 미선언 의존성을 import하면 같은 오류
- [ ] 코어에 린트 오류를 심으면 `build`가 실행되지 않고 산출물도 생기지 않는다
- [ ] `.gitignore`에 `node_modules/` `out/` `dist/` `.turbo/` `release/`
- [ ] `electron-builder`가 `26.15.7`로 정확히 핀되어 있다(9절 10번)
