# AGENTS.md

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Push 검증 훅

- `pnpm install`의 `prepare` 단계가 Husky의 Git 훅 경로를 준비한다. 훅이 없거나 실행 환경이
  준비되지 않으면 `pnpm install`, `pnpm run prepare`, 필요 시 `pnpm exec husky init`과
  `node --version`·`pnpm --version`·`command -v node`·`command -v pnpm` 확인을 안내한다.
- 깨끗한 push 대상에서 pre-push 훅은 `pnpm verify`를 먼저 실행하고, 통과한 경우에만 네이티브
  창과 포커스 이동을 예고한 뒤 `pnpm test:product:foreground`를 실행한다. 에이전트는 사용자의
  별도 명시적 지시 없이 `git push`, `git push --no-verify` 또는 `HUSKY=0`으로 이 경계를
  우회하지 않는다.
- 지원하는 원격 제품 검증 대상은 macOS다. Windows에서는 빌드·릴리스하지 않으며,
  `apps/desktop/scripts/run-product-flow.mjs`의 Windows `pnpm.cmd` 실행 제약은
  [ADR-0003](docs/adr/0003-macos-only-desktop-build.md)에 따라 알려진 상태로 수용한다. 기존
  Windows CI·릴리스 매트릭스는 잔여 설정이므로 그 성공 여부를 제품 수용 증거로 사용하지 않는다.
- 원격 macOS CI의 `pnpm verify:product`는 로컬 훅과 독립적으로 비활성 제품 흐름을 다시
  검증한다. 이 자동 결과는 실제 운영체제의 포커스·블러·트레이 수용 증거가 아니다.
