# 03: CI·릴리스 전체 제품 검증 적용

**What to build:** 모든 커밋과 릴리스가 macOS·Windows 양쪽에서 기본 검사뿐 아니라 비활성
Electron 제품 흐름까지 통과한 뒤 다음 빌드·패키징 단계로 진행하는 원격 검증선.

**Blocked by:** 02/비활성·전면 Electron 제품 흐름.

**Status:** ready-for-agent

- [x] 일반 CI의 macOS·Windows 잡이 `pnpm verify:product`를 실행한다.
- [x] 릴리스의 macOS·Windows 빌드 잡이 패키징 전에 `pnpm verify:product`를 실행한다.
- [x] 한 운영체제의 실패가 다른 운영체제 검증을 취소하지 않는 기존 전략을 유지한다.
- [x] 기존 후속 앱 빌드, 플랫폼별 패키징과 단일 릴리스 게시 구조를 바꾸지 않는다.
- [x] 개발 안내가 무창 기본 검증, 비활성 제품 흐름, 전면 제품 흐름과 전체 제품 검증 명령을 구분한다.
- [x] 릴리스 안내가 패키징 전 전체 제품 검증 명령을 사용한다.
- [x] 문서는 CI의 비활성 제품 흐름을 실제 운영체제 포커스·블러·트레이 수용 증거와 구분한다.
- [x] 워크플로 정의가 양 운영체제에서 동일한 전체 제품 검증 명령을 호출하는지 정적으로 검증한다.
- [x] 로컬 `pnpm verify:product`와 워크플로 구문 검사가 마지막 변경 이후 통과한다.
- [x] 원격 잡을 실제로 실행하지 않았다면 macOS·Windows CI 통과로 표현하지 않는다.

## Comments

**2026-09-02, 구현 에이전트.** CI와 릴리스의 macOS·Windows 매트릭스에
`pnpm verify:product`를 연결하고, 기존 `fail-fast: false`, 앱 빌드·플랫폼별 패키징·단일
릴리스 게시 구조를 유지했다. `pnpm verify:workflows` 정적 계약 검사를 추가하고 Ruby YAML 구문
검사로 두 워크플로의 명령·순서·운영체제 매트릭스를 확인한다. 개발·릴리스 안내에는 네 실행선과
자동 제품 흐름이 실제 운영체제 포커스·블러·메뉴 막대·시스템 트레이 수용 증거가 아니라는 경계를
기록했다.

마지막 변경 이후 로컬 `pnpm verify:product`가 기본 검증 141개와 비활성 제품 흐름 28개를
통과했고, `pnpm verify:workflows`, YAML 구문 검사와 변경 파일 포맷 검사가 통과했다. 전면
제품 흐름과 원격 GitHub Actions 잡은 실행하지 않았으므로 macOS·Windows CI 통과로 표현하지
않는다.

**2026-09-02, 지원 범위 변경.** [ADR-0003](../../../docs/adr/0003-macos-only-desktop-build.md)에
따라 Windows 빌드·릴리스를 지원 범위에서 제외했다. 위 Windows 체크 항목과 구현 기록은 당시
계약의 이력이며 현재 수용 조건이 아니다. 제품 흐름 러너의 Windows `pnpm.cmd` 실행 제약은
알려진 상태로 수용하고, 기존 Windows CI·릴리스 매트릭스는 다음 워크플로 수정에서 복구하지
않고 제거한다.
