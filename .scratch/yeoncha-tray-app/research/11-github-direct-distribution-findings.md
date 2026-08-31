# GitHub 직접 배포 앱의 코드 서명 대응 조사

조사일: 2026-08-31

## 질문과 결론

질문은 “사용자가 GitHub Releases에서 파일을 내려받아 설치하고 실행만 하면 되는가?”이다.
이 문서에서 말하는 “실행만”은 운영체제의 추가 보안 확인 없이 처음 실행되는 상태를 뜻한다.

결론은 운영체제별로 다르다.

- **macOS**: 가능하다. Apple Developer Program에 가입하고 Developer ID Application 인증서로 앱을 서명한 뒤 공증(notarization, Apple이 배포 전 악성 코드 여부를 확인해 Gatekeeper가 신뢰하도록 하는 절차)하고, 결과를 DMG에 스테이플(staple)하면 GitHub Releases 직배포에서도 첫 실행 경고를 없앨 수 있다.
- **Windows**: GitHub 직배포만으로는 신규 소규모 앱의 첫 실행 경고를 없앤다고 보장할 수 없다. 유효한 인증서로 서명해도 SmartScreen 평판이 쌓이기 전에는 경고가 남을 수 있고, EV 인증서도 즉시 우회하지 않는다.
- 따라서 이 앱에서 현실적인 정책은 **macOS는 먼저 서명·공증하고, Windows는 경고를 허용한 채 배포하거나 서명을 추가한 뒤 평판이 쌓이는지 관찰하는 것**이다. Windows에서 정말 추가 클릭을 허용하지 않으려면 GitHub 직배포 조건을 포기하고 Microsoft Store 배포를 검토해야 한다.

Apple은 Mac App Store 밖에서 배포하는 소프트웨어에 Developer ID 서명과 공증을 요구하는 경로를 공식적으로 안내한다. Apple Developer Program 가입비는 연간 미화 99달러다. [Apple Developer ID 지원 문서](https://developer.apple.com/support/developer-id/), [Apple Developer Program 등록 안내](https://developer.apple.com/help/account/membership/program-enrollment/)를 기준으로 했다.

## 공개 프로젝트에서 확인한 패턴

아래는 비슷한 규모의 개인·오픈소스 데스크톱 앱과, 배포 파이프라인을 참고할 만한 Electron 앱의 공개 저장소를 조사한 결과다. 저장소 문서와 워크플로 파일에 명시된 사실을 기록했으며, 각 릴리스를 새 기기에서 직접 설치해 검증했다는 뜻은 아니다.

| 프로젝트 | 공개 저장소에서 확인한 해결 방식 | 사용자 배포 경험 | 이 앱에 주는 시사점 |
| --- | --- | --- | --- |
| [Write.md](https://github.com/danielbilek/writemd) | macOS 릴리스를 서명·공증한다. 수동 `Release macOS` GitHub Actions가 Apple 인증 정보와 `CSC_*` 시크릿을 요구하고, `codesign`, `xcrun stapler`, `spctl`로 산출물을 검증한 뒤 GitHub Release에 업로드한다. [README](https://github.com/danielbilek/writemd), [release-macos.yml](https://github.com/danielbilek/writemd/blob/main/.github/workflows/release-macos.yml) | README가 DMG 다운로드 → 응용 프로그램 폴더로 이동 → 실행 흐름을 안내하며, 서명·공증된 릴리스는 Gatekeeper 우회 안내 없이 배포한다. | 개인이 유지하는 소형 Electron 앱도 macOS에 한해 유료 Apple 계정과 CI 시크릿을 붙이는 방식으로 원하는 경험을 만들고 있다. |
| [Itsyconnect](https://github.com/nickustinov/itsyconnect-macos) | Electron 앱의 릴리스 스크립트가 DMG를 만들고, Apple ID·앱 전용 암호·Team ID로 서명·공증한 뒤 GitHub Release를 만든다. 공개 GitHub Release를 업데이트 서버로도 사용한다. [README의 release 설명](https://github.com/nickustinov/itsyconnect-macos) | 저장소는 Apple 서명·공증으로 Gatekeeper 경고 없이 열 수 있다고 설명한다. | 앱 규모가 작아도 “GitHub에서 직접 받기”와 macOS 서명·공증은 함께 가져갈 수 있다. |
| [dsh-share](https://github.com/lixun910/dsh-share) | macOS·Windows·Linux를 electron-builder로 빌드한다. macOS 서명/공증과 Windows 서명을 모두 환경 변수로 선택적으로 켜며, GitHub Actions가 태그에서 릴리스를 만든다. [README의 release 설정](https://github.com/lixun910/dsh-share) | 서명 시크릿이 없으면 unsigned 산출물도 만들 수 있도록 구성하고, 서명된 업데이트를 권장한다. 실제 인증서 보유 여부보다 “같은 파이프라인에 나중에 서명을 연결할 수 있게 설계”한 사례다. | 초기에는 경고를 감수하되, 설정 파일을 갈아엎지 않고 나중에 양 OS 서명을 추가하는 점진적 경로가 가능하다. |
| [CodeBurn](https://github.com/getagentseal/codeburn) | 유료 Apple 계정이 없어 macOS는 ad-hoc 서명만 하고 공증하지 않으며, Windows/Linux는 unsigned로 배포한다. 문서에 macOS Gatekeeper와 Windows SmartScreen의 우회 절차, 향후 Developer ID·공증으로 올리는 설정 변경을 함께 적었다. [DISTRIBUTION.md](https://github.com/getagentseal/codeburn/blob/main/app/DISTRIBUTION.md), [electron-builder 설정](https://github.com/getagentseal/codeburn/blob/main/app/electron-builder.yml) | 사용자가 경고 화면에서 수동으로 허용한다. | 비용을 바로 지출하지 않고 제품을 공개하는 전형적인 초기 단계다. 사용자 경험의 한계와 향후 업그레이드 조건을 문서에 명시하는 것이 핵심이다. |
| [Maka](https://github.com/apache/maka) | macOS arm64 GitHub Release는 서명·공증하고, Windows preview는 unsigned로 배포하며 체크섬과 Windows 경고 안내를 제공한다. [README의 다운로드 안내](https://github.com/apache/maka/blob/main/README.md) | OS별 성숙도가 다르다는 점을 숨기지 않고, macOS와 Windows의 배포 정책을 분리한다. | “양 OS를 한 번에 완벽하게 만들기”보다 플랫폼별로 가능한 수준을 나누는 전략이 실제 공개 프로젝트에서도 쓰인다. |
| [Open WebUI Desktop](https://github.com/open-webui/desktop) | GitHub Actions에서 인증서가 있으면 macOS 서명·공증, Windows Azure Artifact Signing을 수행하고, 인증서가 없을 때는 unsigned fallback도 허용한다. [release.yml](https://github.com/open-webui/desktop/blob/main/.github/workflows/release.yml) | 릴리스 파이프라인은 서명 환경이 있는 경우와 없는 경우를 분기한다. | 규모가 커지면 시크릿을 로컬에 두지 않고 CI에만 주입하며, 플랫폼별 서명 공급자를 별도로 붙이는 구조가 일반적이다. |

## 공식 문서와 비교한 운영체제별 현실

### macOS

Electron 공식 문서는 Mac App Store 밖에서 배포하는 앱에 코드 서명과 공증이 필요하다고 설명한다. electron-builder의 현재 공증 안내도 다음 조건을 요구한다.

1. Apple Developer Program 가입
2. Developer ID Application 인증서
3. Hardened Runtime 활성화
4. 앱과 포함된 실행 파일 서명
5. Apple 공증 서비스에 업로드
6. 가능하면 공증 티켓을 산출물에 스테이플

관련 근거는 [Electron 코드 서명 안내](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md), [electron-builder 공증 안내](https://www.electron.build/docs/features/code-signing/notarization/), [Apple 공증 문서](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution?changes=_5)다.

현재 저장소의 릴리스 워크플로에는 이 전환 순서가 이미 기록되어 있다. [`.github/workflows/release.yml`](../../../.github/workflows/release.yml)은 `mac.identity: null` 제거, `hardenedRuntime: true`, `mac.notarize: true`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` 연결을 전제로 한다. 현재 앱 설정은 의도적으로 `identity: null`, `hardenedRuntime: false`이므로, Apple 계정을 만든 것만으로는 동작이 바뀌지 않는다. [electron-builder 설정](../../../apps/desktop/electron-builder.yml)도 함께 바꿔야 한다.

즉 macOS에 대한 답은 “개발자 등록만 하면 된다”가 아니라 **유료 등록 + 인증서 발급 + 앱 서명 + 공증 + CI 시크릿 연결 + 서명 산출물 검증**이다. 그래도 사용자에게는 GitHub에서 DMG를 내려받아 응용 프로그램에 넣고 실행하는 흐름을 제공할 수 있다.

### Windows

Microsoft의 최신 SmartScreen 안내는 서명 상태별로 다음을 명시한다.

- Microsoft Store에서 배포하면 Microsoft 인증서가 적용되어 SmartScreen 경고가 표시되지 않는 경로가 있다.
- 유효한 OV/EV 인증서로 서명해도 초기에는 경고가 나올 수 있다. EV 인증서도 더 이상 SmartScreen을 즉시 우회하지 않는다.
- unsigned 파일은 경고가 나며 사용자가 `Run anyway`를 선택해야 한다. 조직 정책에 따라 우회 자체가 막힐 수도 있다.
- Microsoft Artifact Signing은 비(非)스토어 배포의 권장 경로지만, 새 인증서·새 앱은 평판이 쌓이는 시간이 필요하다. Microsoft는 고정된 다운로드 수 임계값을 약속하지 않으며, 수 주와 수백 회의 정상 설치가 걸릴 수 있다고 설명한다.
- Windows 11의 Smart App Control이 켜져 있으면 unsigned 앱이 더 엄격하게 차단될 수 있다.

근거는 [Microsoft SmartScreen 평판 문서](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), [Microsoft Artifact Signing 빠른 시작](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)이다. Artifact Signing 공개 신뢰(public trust)는 한국의 **조직**도 지원 대상이지만, 개인 개발자 자격은 미국 또는 캐나다로 제한된다고 해당 문서가 안내한다. 가입 시 실제 사업자/조직 검증 조건을 확인해야 한다. 제품 페이지의 공개 기본 요금은 월 9.99달러부터지만, 실제 자격·지역·서명량에 따른 조건은 [Artifact Signing 제품 페이지](https://azure.microsoft.com/en-us/products/artifact-signing/)에서 다시 확인해야 한다.

따라서 Windows에서 “GitHub에서 받고 처음부터 아무 경고 없이 실행”은 인증서 구매만으로 달성되는 완료 조건이 아니다. **GitHub 직배포를 유지하면 경고가 남을 수 있다는 것을 받아들이거나, Microsoft Store라는 별도 배포 채널을 선택해야 한다.**

## `yeonchamyeotgae`에 대한 선택지

### 선택지 A — 가장 현실적인 권장안

- macOS: Apple Developer Program 가입 후 Developer ID Application과 공증을 연결한다.
- Windows: 현재처럼 unsigned로 유지하되, 릴리스 본문에서 `추가 정보 → 실행`을 짧게 안내한다.
- GitHub Releases: 기존 DMG·NSIS 산출물 구조를 유지한다.

이 선택지는 Mac 사용자에게는 원하는 설치 경험을 제공하고, Windows에서는 추가 확인 1회를 남긴다. 이 앱의 현재 릴리스 구조와 이미 작성된 전환 메모를 가장 적게 바꾼다.

### 선택지 B — Windows도 서명하되 경고 제거를 약속하지 않음

- Windows용 코드 서명 인증서 또는 Artifact Signing을 CI에 연결한다.
- 모든 릴리스의 실행 파일을 같은 서명 주체로 서명한다.
- SmartScreen 경고가 언제 없어질지는 약속하지 않고, 실제 설치량과 차단 사례를 관찰한다.

서명은 게시자 이름과 출처 신뢰를 개선하지만, 새 소규모 앱의 첫 다운로드에서 경고가 남을 수 있다는 Microsoft 조건은 그대로다. `signExecutable: false`를 제거하는 것만으로 사용자의 완료 조건을 보장할 수 없다.

### 선택지 C — 양 OS 모두 무경고에 가깝게 만들기

- macOS는 Developer ID + 공증을 사용한다.
- Windows는 Microsoft Store 배포를 사용한다.

이 경우 사용자는 GitHub에서 다운로드하지 않는다. GitHub를 변경 이력·소스·문서 채널로만 유지하고 설치 채널을 스토어로 분리하는 정책이다.

## 이번 조사에서 확인한 운영상 공통점

1. **인증서와 비밀번호를 저장소에 넣지 않는다.** Electron/electron-builder 문서는 `CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` 같은 값을 CI 시크릿으로 주입하도록 안내한다. [electron-builder 코드 서명 안내](https://www.electron.build/docs/features/code-signing/), [GitHub Actions 시크릿 문서](https://docs.github.com/en/actions/concepts/security/secrets)를 따른다.
2. **서명 여부와 릴리스 생성은 CI에서 분기한다.** 소규모 프로젝트는 unsigned로 시작하고, 인증서가 준비되면 같은 태그 릴리스 파이프라인에 서명 단계를 켠다.
3. **산출물 검증을 별도로 한다.** macOS는 `codesign`, `xcrun stapler validate`, `spctl`을 사용하고, Windows는 서명 상태와 게시자 정보를 확인한다. Write.md의 워크플로가 이 패턴을 구체적으로 보여준다.
4. **체크섬은 무결성 증명이지 OS 경고 제거 수단이 아니다.** SHA-256 또는 GitHub 릴리스 서명은 내려받은 파일이 바뀌지 않았는지 확인하는 데 유용하지만 Gatekeeper나 SmartScreen의 신뢰 평판을 대신하지 않는다. 이 구분은 공개 사례의 체크섬 안내와 Apple/Microsoft의 OS 신뢰 절차를 비교한 결론이다.
5. **포맷을 바꾸는 것으로 해결되지 않는다.** DMG를 ZIP으로, NSIS를 portable EXE로 바꾸어도 서명·공증·SmartScreen 평판 문제 자체는 해결되지 않는다. 사용자에게 배포하는 실행 코드의 출처와 서명 상태가 핵심이다.

## 조사 범위와 미실행 항목

- 공개 GitHub 저장소의 README, 릴리스 워크플로, 배포 문서와 Apple·Microsoft·Electron·GitHub 공식 문서를 조사했다.
- 사례는 정량적인 시장 조사 표본이 아니라, 소규모 앱의 실제 선택지를 비교하기 위한 질적 표본이다.
- 이번 문서 작성에서는 코드, electron-builder 설정, GitHub Actions, 릴리스 자산을 변경하지 않았다.
- 실제 Apple Developer 계정 등록, 인증서 발급, 새 GitHub Release 생성, 서명된 DMG/EXE의 클린 머신 설치 검증은 실행하지 않았다. 그러므로 “현재 이 저장소의 최종 릴리스가 무경고로 열린다”는 외부 수용 증거로 해석하면 안 된다.
