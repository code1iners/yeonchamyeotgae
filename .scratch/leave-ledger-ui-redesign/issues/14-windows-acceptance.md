# 14: Windows 제품 수용 검증

**What to build:** 실제 Windows Electron 앱에서 macOS와 같은 잔액 원장 정보 위계와 조작 순서를
검증하고, Windows 글꼴·포커스·트레이와 팝오버에서만 나타나는 문제를 같은 범위에서 해소한다.

**Blocked by:** 13/macOS 제품 수용 검증과 컴프 대조.

**Status:** ready-for-agent

- [ ] 실제 Windows 환경에서 트레이 숫자, 툴팁과 팝오버 열기·닫기가 기존 계약대로 동작한다.
- [ ] 동일한 결정론적 시드로 잔여 첫 화면, 등록, 이력 변경, 설정과 복구 제품 흐름을 수행한다.
- [ ] 380px 팝오버에서 시스템 글꼴의 줄바꿈, 숫자·날짜 정렬과 주요 행동 위치가 유지된다.
- [ ] 라이트·다크 테마, 키보드 탭 순서와 포커스 표시가 Windows에서 읽힌다.
- [ ] 화면 작업 영역 가장자리에서도 팝오버가 잘리지 않고 필요한 목록만 스크롤된다.
- [ ] Windows 전용으로 발견한 시각·포커스·트레이 문제를 제품 계약을 깨지 않는 범위에서 수정한다.
- [ ] 마지막 수정 이후 정적 검사, 전체 자동 테스트와 Windows Electron 제품 흐름이 통과한다.
- [ ] Windows 검증 결과와 macOS 재검증 결과를 별도 증거로 기록한다.
- [x] Windows 환경을 사용할 수 없다면 이 티켓을 완료 처리하지 않고 검증 경계를 명시한다.

## Comments

### 2026-09-02 — Windows 수용 검증 경계 기록

- 현재 작업 환경은 macOS(`Darwin`, arm64)이며 Windows 실행 환경(`pwsh`, `powershell`, `wine`)을 사용할 수 없다. 현재 로컬 HEAD에 대해 실제 Windows Electron 앱의 작업 표시줄 트레이 클릭, 툴팁, Windows 글꼴, 네이티브 포커스·블러와 작업 영역 가장자리 동작을 관찰할 수 없다.
- `.github/workflows/ci.yml`의 `macos-latest`·`windows-latest` 매트릭스와 `pnpm verify:product` 실행선은 유지되고 있다. 다만 원격 실행 결과는 현재 로컬 HEAD에 대한 Windows 증거가 아니며, 별도 Windows 실행 후 이 티켓에 결과를 추가해야 한다.
- 현재 코드의 Windows 분기(`showInactive`, 작업 영역 기준 팝오버 위치 보정, 정사각형 트레이 숫자 이미지, 우클릭 메뉴 분리)를 정적으로 확인했다. macOS에서 재현되거나 안전하게 확정할 수 있는 Windows 전용 시각·포커스·트레이 결함은 발견되지 않아 추측에 의한 제품 코드 변경은 하지 않았다.
- 로컬 검증은 `pnpm exec turbo run lint typecheck test --force --concurrency=1` 6/6 작업 성공(코어 123개·데스크톱 18개 단위 테스트), `pnpm test:product` 33/33, `pnpm test:product:foreground` 33/33, `git diff --check` 통과다. 모두 macOS 증거이며 Windows 수용 증거로 대체하지 않는다.
- 실제 Windows 실행과 그 결과 기록이 남기 전까지 Windows 관련 체크리스트와 티켓 `resolved` 처리를 보류한다.
