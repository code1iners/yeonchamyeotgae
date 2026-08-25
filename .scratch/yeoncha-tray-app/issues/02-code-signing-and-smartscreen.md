# 02. 코드서명·SmartScreen 실태 조사

Type: research
Status: resolved
Blocked by: -

## Question

GitHub Release로 macOS·Windows 실행 파일을 배포할 때, 사용자가 "위험한 프로그램" 경고를 보지 않게 하려면 무엇이 필요하고 얼마가 드는가? 서명 없이 배포하면 실제로 무슨 일이 벌어지는가?

## Answer

**출처**
- [SmartScreen reputation for Windows app developers — Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [EV certs do not grant immediate reputation anymore — ToDesktop](https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore)
- [Trusted Signing 개인 개발자 공개 — Microsoft Community Hub](https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554)
- [Code Signing for Windows — electron-builder](https://www.electron.build/docs/features/code-signing/code-signing-win/)

### macOS: 돈으로 해결된다

Apple Developer Program **연 $99** → Developer ID Application 인증서 → 서명 → **notarization** → **stapling**. 이렇게 하면 Gatekeeper 경고가 완전히 사라진다. 목표 달성 가능.

서명하지 않으면: "확인되지 않은 개발자가 배포했기 때문에 열 수 없습니다" 경고. 사용자가 **시스템 설정 → 개인정보 보호 및 보안 → "확인 없이 열기"** 를 눌러야 실행된다. 우클릭 → 열기 방식은 최근 macOS에서 막혔다.

### Windows: 돈으로 해결되지 않는다

**핵심 사실**: Microsoft가 2024년에 **EV 인증서의 SmartScreen 즉시 평판 부여를 폐지**했다. 지금은 OV든 EV든 다운로드 수가 유기적으로 쌓여야 경고가 사라진다.

즉 인증서를 사도(OV 연 $200~400, EV 연 $300~600 + 하드웨어 토큰) **초기 사용자는 여전히 "Windows에서 PC를 보호했습니다" 경고를 본다.** 목표 달성 불가.

싼 대안인 **Azure Artifact Signing**(구 Trusted Signing, Basic $9.99/월)은 개인 개발자의 경우 **미국·캐나다 거주자만** 가입 가능하다. 한국 개인 개발자는 해당되지 않는다.

서명하지 않으면: SmartScreen 파란 경고 → **"추가 정보" → "실행"** 두 번 클릭으로 실행된다. 서명한 경우와 초기 사용자 경험 차이가 사실상 크지 않다.

### 결론 (v1 범위 결정의 근거)

**v1은 양쪽 다 서명하지 않는다.** 근거:

1. Windows는 지불해도 목표를 달성하지 못한다. 실패가 확정된 지출이다.
2. macOS만 서명하는 것은 사용자가 0~1명인 개인 도구 단계에서 연 $99의 값을 못 한다.
3. macOS 서명은 언제든 나중에 켤 수 있고 그때도 같은 $99다. 되돌리기 어려운 결정이 아니다.

**대신 반드시 할 것**: 빌드 파이프라인에 서명 훅이 들어갈 자리를 비워둔 채로 설계하고, README에 OS별 실행 우회 방법을 스크린샷과 함께 적는다. → [10번 티켓](10-release-build-pipeline.md)

**중단 조건 / 재검토 트리거**: 실제 사용자가 경고 때문에 못 쓰겠다고 보고하면 macOS 서명($99)부터 켠다. Windows는 다운로드 수가 쌓일 때까지 어차피 방법이 없으므로 그대로 둔다.
