# ADR-0003 — 데스크톱 제품 흐름·수용 검증은 macOS만 지원한다

- **상태**: 채택, 패키징·릴리스 범위는 [ADR-0004](0004-windows-release-resumption.md)로 부분 대체 (2026-09-05)
- **관련**: [ADR-0001 — 셸 프레임워크로 Electron을 쓴다](0001-electron-as-shell-framework.md)

초기 설계는 macOS 메뉴 막대와 Windows 알림 영역을 모두 대상으로 삼았지만, 실제 제품 흐름과
OS 수용 검증은 macOS에서만 수행한다. Windows x64 패키징·릴리스 범위는
[ADR-0004](0004-windows-release-resumption.md)에서 별도로 재개한다.

`apps/desktop/scripts/run-product-flow.mjs`가 Windows에서 `.cmd` 파일을 셸 없이 실행하는 현재
제약은 알려진 상태로 수용한다. Windows 실제 제품 수용을 다시 시작하기 전에는 이 경로를
필수 수정 사항이나 릴리스 차단 결함으로 다루지 않는다.

## 결과

- ADR-0001의 Windows 알림 영역 제품 수용 전제는 이 ADR이 대체한다. Electron 셸 선택 자체는 유지한다.
- CI의 제품 흐름 검증과 실제 OS 수용 검증은 macOS를 대상으로 한다.
- Windows 빌드·배포의 범위와 검증 경계는 ADR-0004를 따른다.
