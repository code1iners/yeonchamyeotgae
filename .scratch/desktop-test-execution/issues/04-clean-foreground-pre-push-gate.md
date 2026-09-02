# 04: 깨끗한 작업 트리의 전면 pre-push 게이트

**What to build:** 사용자가 push를 시작하면 검사 대상과 push 대상이 같은지 먼저 확인하고,
모든 기본 검사와 전면 Electron 제품 흐름을 순서대로 통과한 경우에만 push를 허용하는 로컬
안전 게이트.

**Blocked by:** 02/비활성·전면 Electron 제품 흐름.

**Status:** ready-for-agent

- [x] Husky가 개발 의존성으로 설치되고 패키지 설치의 `prepare` 단계에서 저장소 Git 훅을 준비한다.
- [x] pre-push 훅은 macOS와 Windows에서 동작하는 POSIX 호환 명령으로 실행된다.
- [x] 훅은 검증 전에 수정된 추적 파일, 스테이징된 파일과 Git이 무시하지 않는 새 파일을 각각 감지해 push를 차단한다.
- [x] Git이 무시하는 의존성, 빌드 산출물과 캐시만 존재하면 작업 트리를 깨끗한 것으로 취급한다.
- [x] 깨끗한 작업 트리에서는 `pnpm verify`를 먼저 실행하고 성공한 경우에만 전면 제품 흐름을 실행한다.
- [x] 전면 제품 흐름을 시작하기 전에 네이티브 창과 포커스 이동이 발생한다는 안내를 출력한다.
- [x] 기본 검증이나 전면 제품 흐름이 실패하면 남은 단계를 중단하고 push를 차단한다.
- [x] Node 또는 pnpm을 찾지 못하거나 Husky가 준비되지 않은 경우 검증 성공으로 폴백하지 않는다.
- [x] 실행 환경 오류는 `pnpm install`, `pnpm run prepare`, Husky 초기화와 Node/PATH 확인 방법을 안내한다.
- [x] 훅의 청결성 검사, 실행 순서, 단계별 실패와 무시 파일 허용을 실제 push 없이 결정론적으로 검증한다.
- [x] 에이전트가 사용자 지시 없이 `--no-verify`나 `HUSKY=0`으로 훅을 우회할 수 없다는 정책을 에이전트 안내에 기록한다.
- [x] push 자체와 전면 제품 흐름은 사용자의 명시적 요청 또는 macOS·Windows 수용 검증에서만 에이전트가 실행한다.
- [x] 원격 CI가 로컬 훅과 독립적으로 비활성 전체 제품 검증을 다시 수행한다는 경계를 문서화한다.
- [x] 마지막 변경 이후 훅 회귀 검사, 기본 검증과 전면 제품 흐름이 통과하고 Git diff 검사가 깨끗하다.

## Comments

**2026-09-02, 구현 에이전트.** 루트 `husky@9.1.7`과 `prepare: "husky"`, POSIX
`.husky/pre-push`를 추가했다. 훅은 현재 `HEAD`와 push 대상 커밋을 먼저 비교한 뒤 추적 수정·스테이징·무시되지 않은 새 파일을 각각 검사하고, 깨끗할 때 `pnpm verify`와
`pnpm test:product:foreground`를 순서대로 실행한다. 단계 실패와 Node·pnpm·Husky 미준비 시에는
push를 차단하고 복구 명령을 안내한다. `scripts/pre-push.test.mjs`와 `pnpm test:hooks`로 실제
push 없이 임시 Git 저장소의 성공·실패·오류·무시 파일 경로를 결정론적으로 검증했다.

`AGENTS.md`에는 `--no-verify`·`HUSKY=0` 우회 금지와 push·전면 흐름의 명시적 실행 경계를,
개발 안내에는 훅 회귀 테스트 명령을 기록했다. 원격 macOS·Windows CI는 로컬 훅과 독립적으로
`pnpm verify:product`를 다시 수행하며, 그 결과는 실제 운영체제 포커스·블러·트레이 수용 증거가
아님을 명시했다.

최종 로컬 검증: `pnpm test:hooks` 15개, `pnpm verify`, `pnpm verify:product`의 비활성 제품 흐름
28개, `pnpm test:product:foreground`의 전면 제품 흐름 28개, `pnpm verify:workflows`, `sh -n
.husky/pre-push`, 변경 파일 포맷 및 `git diff --check` 통과. 실제 push와 원격 CI 잡은 실행하지
않았다.
