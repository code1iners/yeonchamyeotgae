# 02: 릴리스 태그 게시와 GitHub Release 검증

**What to build:** 릴리스 담당자가 정확한 커밋의 CI 성공 뒤 같은 커밋을 가리키는 버전 태그를
게시하고, GitHub Release 워크플로와 macOS Apple Silicon DMG 공개까지 한 명령 안에서 확인할
수 있게 한다. 실패 시 만들어진 커밋과 태그를 삭제하지 않고 현재 상태와 안전한 재시도 방법을
알려준다.

**Blocked by:** 01 대화형 릴리스 후보 준비와 CI 승인

**Status:** resolved

- [x] 정확한 릴리스 커밋의 CI가 성공한 경우에만 `v<version>` 형식의 주석 태그를 같은 전체 SHA에 만들고 태그 메시지도 같은 버전으로 기록한다.
- [x] 동일한 로컬 또는 원격 태그가 이미 있거나 태그만 있고 Release가 없는 버전은 덮어쓰지 않고 기존 릴리스 복구 대상으로 안내한다.
- [x] 관계없는 태그 전체가 아니라 이번 릴리스 태그 하나만 push하며 기존 pre-push 훅의 두 번째 검증을 우회하지 않는다.
- [x] 태그 push 뒤 정확한 태그로 시작된 Release 워크플로를 찾아 성공까지 기다리고 다른 실행의 결과를 대체 증거로 사용하지 않는다.
- [x] 성공한 GitHub Release가 draft나 prerelease가 아닌 공개 상태이고, 기대한 태그와 전체 커밋 SHA를 대상으로 하는지 확인한다.
- [x] Release 자산에 `yeonchamyeotgae-<version>-arm64.dmg`가 존재하는지 확인해야 명령 전체가 성공한다.
- [x] 성공 결과는 버전, 태그, 전체 SHA, Release URL과 확인한 DMG 이름을 사용자에게 요약한다.
- [x] 태그 push가 실패하면 로컬 주석 태그를 보존하고, Release 워크플로 또는 자산 검증이 실패하면 원격 태그를 보존한다.
- [x] 실패 복구는 원격 태그 삭제, 태그 이동, 강제 push, 자동 revert 또는 훅 우회를 수행하지 않고 안전한 재실행 방법만 안내한다.
- [x] 블랙박스 명령 테스트가 정상 게시, 중복 태그, 태그 push 실패, Release 실패·불일치와 DMG 누락을 외부 저장소 상태와 명령 순서로 검증한다.
- [x] 릴리스 안내는 새 단일 명령을 기본 절차로 설명하면서 태그 기반 Release 정체성, 기존 정적 릴리스 본문과 수동 복구 계약을 보존한다.
- [x] 마지막 변경 이후 새 게시 테스트, 기존 훅 테스트, 워크플로 계약 검사와 기본 검증이 통과하며, 실제 GitHub Release와 DMG 게시 여부는 사용자가 명시적으로 실행한 최초 릴리스에서 별도 확인한다.

## Comments

- `codex/release-publish-automation` 브랜치의 `16529aa 릴리스 태그 게시와 GitHub Release 검증 추가` 커밋으로 `pnpm publish-release`가 정확한 CI 성공 뒤 annotated tag 하나를 push하고, 태그 기반 Release 워크플로·공개 상태·태그·자산과 원격 태그의 peeled SHA를 확인하도록 확장했다.
- `pnpm test:publish-release` 26건, `pnpm test:hooks` 15건, `pnpm verify:workflows`, `pnpm verify`, 셸·Node 문법 검사, Biome 검사와 `git diff --check`가 마지막 구현 변경 이후 통과했다. 게시 테스트는 임시 Git 원격과 가짜 GitHub CLI를 사용해 정상 게시, 태그 경합·push 실패, Release 실패·불일치·상태·DMG 누락 및 외부 명령 순서를 확인한다.
- Standards·Spec 고정점 리뷰를 수행했다. Standards 하드 위반과 Spec 누락·범위 초과·구현 오류는 없었고, selector 정규화 및 전·후 원격 태그 확인의 중복은 의도된 방어 로직을 포함한 판단형 smell로 남겼다.
- 실제 GitHub push·CI·태그·Release·DMG 게시는 수행하지 않았다. 가짜 원격 테스트는 실제 GitHub 권한, macOS 패키징과 공개 게시를 증명하지 않으며, 최초 운영 릴리스에서 별도로 확인한다.
