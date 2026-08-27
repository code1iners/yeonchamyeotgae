# 앱 아이콘 (스펙 6.3절, 티켓 27번)

DMG · NSIS · Dock · 작업 표시줄에 뜨는 앱 아이콘. **512px 원본 하나에서 모든 크기가
축소 파생된다.**

| 파일 | 무엇 | 어떻게 만들어지나 |
| --- | --- | --- |
| `icon-512.png` | 512px 원본 | `scripts/make-app-icon.mjs`가 렌더 |
| `icon.icns` | macOS 아이콘(16·32·64·128·256·512) | 원본 축소 → `iconutil` |
| `icon.ico` | Windows 아이콘(16·24·32·48·64·128·256) | 원본 축소 → 스크립트가 직접 인코딩 |

## 재생성

```bash
node scripts/make-app-icon.mjs
```

`apps/desktop`에서 실행한다. 의존성 없음. `.icns` 변환만 macOS `iconutil`을 쓰므로 macOS에서
돌려야 한다. 그림을 고치려면 스크립트의 드로잉 기하 상수를 고치고 다시 돌린다 — 이 PNG를
직접 편집하지 않는다.

## electron-builder 연결

이 디렉터리는 electron-builder의 기본 `buildResources`다. `icon.icns`/`icon.ico`라는 이름이
규약이라 별도 설정 없이 자동으로 집힌다(패키징 설정 자체는 28번 티켓).

## 여기 없는 것

**트레이 글리프는 이 목록에 없다.** 트레이는 `src/main/glyph.ts`의 런타임 canvas 렌더이고
파일 자산이 아니다(스펙 6절 — 두 그림은 별개이며 하나에서 파생할 수 없다). 같은 이유로
**16px 전용 아이콘 파일을 만들지 않는다** — 16px은 `.icns`/`.ico` 컨테이너 안의 표준
엔트리로만 존재한다.
