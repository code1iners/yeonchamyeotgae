# ADR-0001 — 셸 프레임워크로 Electron을 쓴다

- **상태**: 채택 (2026-08-26)
- **결정 티켓**: [`.scratch/yeoncha-tray-app/issues/05-shell-framework-adr.md`](../../.scratch/yeoncha-tray-app/issues/05-shell-framework-adr.md)
- **관련**: [ADR-0002 — 날짜는 Temporal.PlainDate로 다룬다](0002-temporal-plaindate-for-dates.md),
  [ADR-0003 — 데스크톱 빌드와 릴리스는 macOS만 지원한다](0003-macos-only-desktop-build.md)

> **범위 변경:** 이 ADR의 Windows 알림 영역 지원 전제는 ADR-0003이 대체한다. Electron을 셸
> 프레임워크로 사용하는 결정은 유지한다.

## 맥락

**연차몇개**는 macOS 메뉴 막대와 Windows 알림 영역에 **잔여**를 숫자로 상시 표시하는 트레이
앱이다. 숫자 하나가 제품의 전부다. 셸 프레임워크 후보는 Tauri v2와 Electron이었다.

**먼저 기각한 논거부터 적는다.** "TypeScript를 주로 쓴다", "React를 쓴다"는 둘을 가르지
못한다 — Tauri v2도 UI는 웹뷰이고 React + Vite 공식 템플릿이 있다. 번들 크기와 메모리도
가르지 못한다(아래 "대안").

실제로 갈린 지점은 하나다. **Windows 알림 영역에 숫자를 그리는 경로.** `set_title()`은 양쪽
모두 macOS 전용이므로 Windows는 어느 쪽을 골라도 **글자를 이미지로 래스터화**해야 한다.
문제는 그 이미지를 누가 어떤 언어로 만드느냐다.

## 결정

**Electron을 쓴다.** Tauri v2 프로토타입은 만들지 않았다 — 아래 근거가 프로토타입 없이 갈리고,
그 방향이 이 프로젝트의 확정 전제("코어 계산 엔진은 순수 TypeScript, Rust/WASM 아님")와
같기 때문이다.

## 근거

**1. Windows 트레이 숫자 렌더링 경로가 갈랐다. 이것이 1순위 기준이다.**

| | 경로 |
| --- | --- |
| **Electron** | 렌더러 `<canvas>` → `toDataURL()` → IPC → `nativeImage.createFromDataURL()`. **네이티브 모듈 0개, 전부 TypeScript.** 실측 왕복 **0.9ms** |
| Tauri v2 | `TrayIcon::set_icon(Image)`가 raw RGBA를 받는다. Rust에서 글자를 래스터화(`tiny-skia` + `fontdue`류)하거나, 웹뷰가 그린 바이트를 IPC로 Rust에 넘겨야 한다 |

Tauri를 고르면 **이 저장소의 유일한 Rust 코드가 "트레이에 숫자 그리기" 하나**가 된다.
제품의 전부인 숫자를 화면에 올리는 마지막 한 걸음만 다른 언어로 쓰는 구조다.

**2. 코어에서 Rust를 거부한 판단이 셸에서 뒤집힐 이유가 없다.** 계산 엔진을 순수 TypeScript로
둔 이유는 v2 PWA가 그대로 가져가야 하기 때문이다. 같은 논리가 셸에도 적용된다.

**3. 구현 주체가 AI 에이전트다.** 단일 언어 스택이 실수 표면이 작고, Rust 컴파일 에러 디버그
루프가 TS보다 훨씬 길다. CI도 Rust 툴체인·캐시 튜닝 없이 끝난다.

**4. v2가 PWA다.** Electron은 양 OS 모두 Chromium이라 렌더링 엔진이 하나다. Tauri는 macOS
WKWebView / Windows WebView2로 갈리는데, **Windows를 테스트할 수 없는 상황에서 엔진이 둘인 것은
순수 리스크다.**

**5. 필요한 메커니즘이 전부 나왔다** (실측, macOS 26.5 arm64, Electron 44.0.0).

| 항목 | 결과 |
| --- | --- |
| 트레이 네이티브 텍스트 | `new Tray(nativeImage.createEmpty())` + `setTitle()`. 아이콘 없이 텍스트만 가능. `12.75` = 53pt, `0` = 29pt (문자열 길이에 맞춰 늘어난다) |
| canvas 이미지 경로 | 16px 높이 `12.75`가 메뉴바에서 읽힌다. `setTemplateImage(true)`로 라이트/다크 반전이 공짜 |
| 팝오버 | `frame: false` + `transparent` + `vibrancy: 'popover'` + `blur` → `hide()`. `tray.getBounds()`로 위치. **창 30줄 남짓** |
| Dock 아이콘 숨김 | `app.dock.hide()` 한 줄 |
| 값 변경 반영 | `setTitle`은 즉시, 이미지 경로는 0.9ms |

## 대안

**Tauri v2** — 번들 약 10MB, 유휴 메모리 약 60MB 수준으로 알려져 있고 Electron 실측치보다
확실히 낫다.

| Electron 실측 | 값 |
| --- | --- |
| DMG (다운로드) | **120.8 MB** |
| 설치된 `.app` (arm64 단일) | 286 MB |
| 우리 코드 (`app.asar`) | **201 KB** |
| 유휴 physical footprint | **약 114 MB** |

**그런데 이 두 축이 이 제품을 위협하지 않는다.** 코드 서명을 하지 않기로 했으므로
([`02번 티켓`](../../.scratch/yeoncha-tray-app/issues/02-code-signing-and-smartscreen.md))
사용자는 어차피 Gatekeeper·SmartScreen 우회를 손으로 해야 한다. **120MB 다운로드가 그 마찰에
무엇을 더하지 않는다.** 사용자 0~1명 규모의 개인 도구다.

메모리는 `vmmap --summary`의 physical footprint 합이다. `ps` RSS 합(414MB)은 공유 프레임워크
페이지를 프로세스마다 중복 계산하므로 쓰지 않았다.

## 결과

- **네이티브 모듈 0개가 이후 결정의 근거가 됐다.** 저장 형식에서 SQLite를 기각한 이유 중 하나가
  이것이고, 릴리스 파이프라인에서 macOS x64 크로스 빌드가 "아마 될 것"이라고 본 근거도 이것이다.
  **이 불변식을 깨는 의존성을 추가하려면 이 ADR을 다시 봐야 한다.**
- **서명 훅은 설정 파일 세 줄이다.** 다만 반대 방향의 함정을 실측으로 밟았다 — electron-builder가
  키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다.** 서명하지 않기로 한
  이상 `mac.identity: null`로 **명시적으로 꺼야 한다.** 자세한 것은 스펙 8.4절.
- Electron 44 = Chromium 152 / Node 24.18.1. **렌더러에는 `Temporal`이 네이티브로 있지만 메인
  프로세스에는 없다** — 이 비대칭이 ADR-0002의 근거가 됐다.

## 검증하지 못한 것

**Windows에서 아무것도 실행하지 못했다.** 이 머신은 macOS뿐이다.

다만 프레임워크 선택을 가른 것은 "어느 쪽이 canvas → 트레이 이미지 경로가 싼가"이고 그건
**API 표면에서 갈리므로 Windows 실측이 이 결정을 뒤집을 수 있는 경로는 없다.**
Windows에서 실제로 재야 하는 것은 "16px 정사각에서 숫자가 읽히는가"이며, 그건 어느 프레임워크를
골라도 같은 문제다(스펙 4절).

## 프로토타입

`prototype/electron-tray-spike` 브랜치의 `prototype-electron-tray/`. main에 병합하지 않으며
구현에 재활용하지 않는다 — 위 실측치의 **근거 원본**으로만 남긴다.

```bash
git switch prototype/electron-tray-spike
cd prototype-electron-tray && pnpm install && pnpm start
```

읽어볼 값이 있는 곳은 둘이다 — `renderer/drawTray.js`(canvas → 트레이 이미지, Windows 필수
경로)와 `main.js`의 팝오버 위치 계산(`tray.getBounds()` + 디스플레이 경계 클램프).
**import가 아니라 보고 새로 쓰는 것이다.**
