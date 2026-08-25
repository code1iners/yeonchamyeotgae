# 10. GitHub Release 빌드 파이프라인 설계

Type: research
Status: open
Blocked by: 05

## Question

AI 에이전트가 main에 푸시하면서 macOS·Windows 실행 파일을 GitHub Release에 함께 올리려면 무엇이 필요한가?

**전제가 되는 제약**: macOS 앱은 macOS 러너에서만, Windows 앱은 Windows 러너에서만 빌드된다. 한 대에서 둘 다 뽑을 수 없다.

1. **GitHub Actions 매트릭스 구성**. `macos-latest` + `windows-latest` 두 잡에서 각각 빌드하고 아티팩트를 모아 하나의 Release에 올리는 워크플로의 모양.
2. **트리거**. main 푸시마다인가, 태그 푸시(`v*`)일 때인가? 에이전트가 어떤 행동을 하면 릴리스가 나가는지 명확해야 한다.
3. **아티팩트 형식**. macOS는 `.dmg`인가 `.zip`인가? Windows는 NSIS 설치 파일인가 portable `.exe`인가? 서명하지 않는다는 전제([02번](02-code-signing-and-smartscreen.md))가 이 선택에 영향을 주는가?
4. **Apple Silicon vs Intel**. macOS 빌드를 universal로 뽑는가, arm64만인가?
5. **서명 훅의 자리**. 지금은 켜지 않지만 나중에 인증서만 꽂으면 동작하도록, 워크플로의 어디에 무엇을 비워두는가?
6. **README 우회 안내**. macOS의 "확인 없이 열기", Windows SmartScreen의 "추가 정보 → 실행" 절차를 어떻게 안내하는가. 02번 조사 결과를 사용자용 문장으로 옮긴다.
7. **버전 관리**. 앱 버전을 어디서 읽고 Release 태그와 어떻게 맞추는가?

## 참고

- [05번 티켓](05-shell-framework-adr.md)의 결론에 따라 도구가 갈린다(electron-builder vs tauri-action). 각각의 공식 GitHub Actions 지원 현황을 1차 문서에서 확인한다.
