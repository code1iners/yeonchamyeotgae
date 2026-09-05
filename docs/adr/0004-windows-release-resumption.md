# ADR-0004 — Windows x64 패키징·릴리스 재개

- **상태**: 채택 (2026-09-05)
- **대체**: [ADR-0003 — 데스크톱 제품 흐름·수용 검증은 macOS만 지원한다](0003-macos-only-desktop-build.md)의 패키징·릴리스 범위

## 문맥

`apps/desktop/electron-builder.yml`에는 Windows x64 NSIS 설치 파일 설정이 이미 있었지만,
릴리스 워크플로가 macOS만 실행해 GitHub Release에 Windows 자산이 누락됐다. 사용자가
`v0.1.4`에 Windows 설치 파일을 추가하도록 요청했다.

현재 개발 호스트에서는 실제 Windows 트레이·포커스·팝오버 수용 검증을 할 수 없다. 따라서
Windows 패키징을 재개하되, Windows 기본 검증과 패키징 결과를 실제 Windows 제품 수용의
증거로 표현하지 않는다.

## 결정

- `release.yml`은 `macos-latest`와 `windows-latest` 매트릭스로 각각 패키징한다.
- macOS 잡은 `pnpm verify:product` 후 Apple Silicon `.dmg`를 만들고, Windows 잡은
  `pnpm verify` 후 x64 NSIS `.exe`를 만든다.
- 릴리스를 생성·수정하는 잡은 하나로 유지하고 두 빌드 잡의 아티팩트를 모아 하나의
  공개 Release에 올린다.
- `publish-release` 검증은 macOS DMG와 Windows x64 EXE가 모두 있어야 성공한다.
- 실제 Windows 트레이·포커스·팝오버 수용 검증은 별도 Windows 환경에서 수행할 때까지
  미완료 경계로 남긴다.

## 결과

- 릴리스 페이지에는 `yeonchamyeotgae-<버전>-arm64.dmg`와
  `yeonchamyeotgae-<버전>-x64.exe`가 함께 올라간다.
- Windows 빌드가 실패하면 수집 잡이 실행되지 않아 불완전한 릴리스가 게시되지 않는다.
- ADR-0003의 macOS 전용 결정은 실제 제품 흐름·OS 수용 검증에는 계속 적용되고,
  패키징·릴리스 범위에 대해서만 이 ADR로 대체된다.
