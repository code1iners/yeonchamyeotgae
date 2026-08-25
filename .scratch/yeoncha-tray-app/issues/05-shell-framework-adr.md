# 05. 셸 프레임워크 결정: Tauri vs Electron

Type: prototype
Status: resolved
Blocked by: -

## Question

macOS·Windows 트레이 앱의 셸로 Tauri v2와 Electron 중 무엇을 쓰는가? 결론은 `docs/adr/`에 ADR로 남긴다.

**주의: 이미 기각된 논거** — "TypeScript를 주로 쓴다", "React를 쓴다"는 둘을 가르지 못한다. Tauri v2도 UI는 웹뷰이고 React + Vite 공식 템플릿이 있다. ADR에 이 논거를 쓰면 안 된다.

**실제로 갈리는 지점** — 이걸 프로토타입으로 확인한다:

1. **트레이에 숫자를 상시 표시하는 난이도**. macOS 메뉴바는 아이콘 옆 텍스트가 되지만 Windows 트레이는 아이콘 이미지만 가능하다. 즉 Windows는 숫자를 이미지로 렌더링해야 한다. 양쪽 프레임워크에서 이게 얼마나 번거로운가? 런타임 이미지 생성 API가 있는가, 직접 그려야 하는가?
2. **번들 크기와 메모리**. Electron ~150MB / Tauri ~10MB로 알려져 있으나 실측한다. 트레이에 상주하는 앱이라 메모리가 특히 중요하다.
3. **크로스 빌드와 CI**. GitHub Actions 매트릭스로 두 OS 바이너리를 뽑을 때 각각의 마찰. Tauri는 Rust 툴체인이 CI에 필요하다.
4. **서명 훅 자리**. 지금은 서명하지 않지만([02번](02-code-signing-and-smartscreen.md)) 나중에 켤 수 있어야 한다. 양쪽의 서명 설정이 얼마나 나중에 끼워넣기 쉬운가?
5. **팝오버(포커스 잃으면 닫히는 무테 창)** 구현 난이도. runcat 같은 메뉴바 앱의 기본 인터랙션이다.

## 방법

양쪽에서 **버릴 프로토타입**을 만든다. 최소 조건: 트레이에 숫자가 뜨고, 클릭하면 React로 그린 팝오버가 열리고, 숫자를 바꾸면 트레이가 갱신된다. 03번에서 사용 단위가 0.25일까지 확정되어 **최대 표기가 `12.75` 다섯 글자**이므로, 이 문자열이 양쪽 OS 트레이에서 읽히는지 반드시 실측한다. macOS와 Windows 양쪽에서 실제로 띄워본다.

프로토타입은 `prototype` Skill의 규약대로 버리는 브랜치에 두고, 결과만 이 티켓과 ADR에 남긴다.

## Answer

**Electron으로 간다.** Tauri v2 프로토타입은 만들지 않았다 — 아래 1번이 프로토타입 없이도
갈리고, 그 방향이 지도의 확정 전제와 같기 때문이다.

프로토타입은 `prototype/electron-tray-spike` 브랜치의 `prototype-electron-tray/`에 있다.
main에 병합하지 않으며, 구현에 재활용하지 않는다 — 아래 실측치의 **근거 원본**으로만 남긴다.
꺼내 보려면:

```
git switch prototype/electron-tray-spike
cd prototype-electron-tray && pnpm install && pnpm start
```

처음 쓰면 헤매는 부분이 두 군데라 읽어볼 값은 있다: `renderer/drawTray.js`
(canvas → 트레이 이미지, Windows 필수 경로)와 `main.js`의 팝오버 위치 계산
(`tray.getBounds()` + 디스플레이 경계 클램프). 둘 다 import가 아니라 보고 새로 쓰는 것이다.

### 왜 Electron인가

**1. Windows 트레이 숫자 렌더링에서 Electron이 이긴다 — 이 티켓의 1순위 기준이다.**

양쪽 모두 `set_title()`은 macOS 전용이다(Tauri v2도 동일). Windows는 둘 다 이미지를
그려야 하는데 경로가 다르다:

- **Electron**: 렌더러 `<canvas>` → `toDataURL()` → IPC → `nativeImage.createFromDataURL()`.
  **네이티브 모듈 0개, 전부 TypeScript.** 실측 왕복 **0.9ms**.
- **Tauri**: `TrayIcon::set_icon(Image)`가 raw RGBA를 받는다. Rust에서 글자를 래스터화
  (`tiny-skia` + `fontdue`류)하거나, 웹뷰가 그린 바이트를 IPC로 Rust에 넘겨야 한다.

Tauri를 고르면 **이 저장소의 유일한 Rust 코드가 "트레이에 숫자 그리기"** 하나가 된다.

**2. 지도의 확정 전제와 같은 방향이다.** Notes에 "코어 계산 엔진은 순수 TypeScript 패키지.
Rust/WASM 아님"이 이미 박혀 있다. 코어에서 Rust를 거부한 판단이 셸에서 뒤집힐 이유가 없다.

**3. 구현 주체가 AI 에이전트다.** 단일 언어 스택이 실수 표면이 작고, Rust 컴파일 에러
디버그 루프가 TS보다 훨씬 길다. CI도 Rust 툴체인·캐시 튜닝 없이 끝난다.

**4. v2가 PWA다.** Electron은 양 OS 모두 Chromium이라 엔진이 하나다. Tauri는 macOS
WKWebView / Windows WebView2로 갈리는데, Windows를 테스트할 수 없는 상황에서 엔진이
둘인 건 순수 리스크다.

**5. 팝오버·서명 훅 모두 나왔다.** 아래 실측 참조.

### Tauri가 이기는 것, 그리고 그게 왜 안 통하는가

번들 ~10MB, 유휴 메모리 ~60MB 수준으로 알려져 있고 실측치보다 확실히 낫다. 하지만
**이 두 축은 이 제품을 위협하지 않는다.** [02번](02-code-signing-and-smartscreen.md)
결정으로 어차피 서명 없이 배포해 사용자가 Gatekeeper·SmartScreen 우회를 손으로 해야 한다.
120MB 다운로드가 그 마찰에 뭘 더하지 않는다. 사용자 0~1명 규모의 개인 도구다.

### 실측치 (2026-08-25, macOS 26.5 arm64, Electron 44.0.0)

| 항목 | 값 |
| --- | --- |
| DMG (다운로드) | **120.8 MB** |
| 설치된 `.app` (arm64 단일) | 286 MB |
| 우리 코드 (`app.asar`) | **201 KB** |
| 유휴 physical footprint | **약 114 MB** (Browser 45 + GPU 30 + Utility 7 + Renderer 32) |
| `setTitle("12.75")` 상태 항목 폭 | 53 pt |
| canvas → `nativeImage` IPC 왕복 | 0.9 ms |
| 16px 높이 `12.75` 렌더 크기 | 63×32 px @2x, fontPx 22 |

메모리는 `vmmap --summary`의 physical footprint 합이다. `ps` RSS 합(414MB)은 공유
프레임워크 페이지를 프로세스마다 중복 계산하므로 쓰지 않았다. 실행 직후 GPU 프로세스가
193MB까지 튀지만 몇 초 뒤 30MB로 내려간다 — 유휴 상주값은 114MB로 본다.

### 나온 메커니즘 (전부 macOS에서 확인)

- **트레이 네이티브 텍스트**: `new Tray(nativeImage.createEmpty())` + `setTitle()`.
  아이콘 없이 텍스트만 띄우는 게 된다. `12.75`는 53pt, `-1.25`는 51pt, `0`은 29pt로
  폭이 문자열을 따라간다 — macOS 상태 항목은 길이에 맞춰 스스로 늘어난다.
  **주의**: 이 티켓 본문은 최대 표기를 `12.75` 다섯 글자로 적고 있으나
  [06번 Comments](06-tray-display-spec.md)가 04번 결과로 이를 교정했다 — `24.75`가 나오고
  부호까지 붙어 `-24.75` 여섯 글자가 가능하다. 여섯 글자는 재보지 않았지만 폭이 글자당
  약 10pt로 선형이라 macOS에서는 문제가 되지 않는다. Windows에서만 의미가 있는 차이다.
- **canvas 이미지 경로**: 16px 높이로 렌더한 `12.75`가 실제 메뉴바에서 읽힌다.
  `setTemplateImage(true)`로 라이트/다크 메뉴바 반전이 공짜다.
- **팝오버**: `frame: false` + `transparent` + `vibrancy: 'popover'` + `blur` → `hide()`.
  `tray.getBounds()`로 아이콘 아래 위치를 잡는다. 창 30줄 남짓이다.
- **값 변경 반영**: `setTitle`은 즉시. 이미지 경로는 렌더러 왕복이 끼지만 0.9ms라 체감 없다.
- **Dock 아이콘 숨김**: `app.dock.hide()` 한 줄.

### 서명 훅 자리 ([02번](02-code-signing-and-smartscreen.md) 관련)

`electron-builder`는 `mac.notarize` / `win.certificateFile` 설정 한 줄로 켜진다 —
나중에 끼워넣기가 쉽다. **다만 반대 방향의 함정을 실측으로 밟았다**: electron-builder가
키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다.** 02번 결정은
"서명하지 않는다"이므로, 빌드 파이프라인은 서명을 **명시적으로 꺼야** 한다
(`mac.identity: null`). → [10번](10-release-build-pipeline.md)으로 넘긴다.

### 검증하지 못한 것

**Windows에서 아무것도 실행하지 못했다.** 이 머신은 macOS뿐이고 사용자도 현재 Windows를
확인할 수 없다. 다만 프레임워크 선택을 가른 것은 "어느 쪽이 canvas→트레이이미지 경로가
싼가"이고 그건 API 표면에서 갈리므로, Windows 실측이 이 결정을 뒤집을 수 있는 경로는 없다.
Windows에서 실제로 재야 하는 것은 **`12.75`가 읽히는가**이며, 그건 어느 프레임워크를 골라도
같은 문제이므로 [06번](06-tray-display-spec.md)의 몫이다.

**06번으로 넘기는 강한 의심 하나**: Windows 알림 영역 아이콘은 Win32 API 수준에서
**정사각형**(`SM_CXSMICON`, 100% DPI에서 16×16)이다. 우리가 그린 이미지는 63×32이므로
Windows가 이걸 16×16에 밀어넣으면 다섯 글자가 글자당 3px가 되어 거의 확실히 안 읽힌다.
검증하지 못했으므로 사실이 아니라 **06번이 반드시 확인해야 하는 가정**으로 남긴다.
사실이라면 06번 Q2의 답은 "절사"가 아니라 "두 줄" 또는 "정수만"이 된다.
