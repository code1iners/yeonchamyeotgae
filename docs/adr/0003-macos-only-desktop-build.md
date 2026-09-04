# ADR-0003 — 데스크톱 빌드와 릴리스는 macOS만 지원한다

- **상태**: 채택 (2026-09-02)
- **관련**: [ADR-0001 — 셸 프레임워크로 Electron을 쓴다](0001-electron-as-shell-framework.md)

초기 설계는 macOS 메뉴 막대와 Windows 알림 영역을 모두 대상으로 삼았지만, 현재 제품은
Windows에서 빌드하거나 릴리스하지 않는다. 따라서 지원하는 데스크톱 빌드·제품 흐름·릴리스
검증 대상은 macOS이며, Windows 전용 `pnpm.cmd` 실행 경로는 지원 계약에 포함하지 않는다.

`apps/desktop/scripts/run-product-flow.mjs`가 Windows에서 `.cmd` 파일을 셸 없이 실행하는 현재
제약은 알려진 상태로 수용한다. Windows 지원을 다시 시작하기 전에는 이 경로를 필수 수정 사항이나
릴리스 차단 결함으로 다루지 않는다.

## 결과

- ADR-0001의 Windows 알림 영역 지원 전제는 이 ADR이 대체한다. Electron 셸 선택 자체는 유지한다.
- GitHub Actions의 CI와 릴리스는 macOS에서만 실행한다. 과거 Windows 매트릭스와 Windows `.exe`
  패키징 정의는 제거했으며, Windows 잡을 릴리스의 선행 조건으로 두지 않는다.
- Windows 빌드나 배포가 다시 필요해지면 이 결정을 재검토하고 실제 Windows 환경에서 제품 흐름,
  트레이, 포커스와 패키징을 새로 검증한다.
