# 연차몇개

한국 근로기준법상 연차 유급휴가가 언제 몇 개 생기고, 얼마나 남았고, 언제 없어지는지를
개인이 추적하는 메뉴 막대(macOS)·시스템 트레이(Windows) 앱입니다. 트레이 아이콘에 잔여
연차 일수가 항상 떠 있고, 클릭하면 발생·사용·소멸 이력을 볼 수 있습니다.

## 설치

[Releases 페이지](https://github.com/code1iners/yeonchamyeotgae/releases)에서 자기 OS용 파일
하나를 내려받습니다.

- **macOS (Apple Silicon)**: `yeonchamyeotgae-<버전>-arm64.dmg`
- **Windows (x64)**: `yeonchamyeotgae-<버전>-x64.exe`

이 앱은 코드 서명을 하지 않아 처음 실행할 때 OS 보안 경고가 뜹니다. 아래 순서로 통과합니다.

<!-- 같은 안내가 .github/RELEASE_BODY.md(릴리스 본문)에도 있다 — 둘 중 하나를 고치면 다른 쪽도 고친다. -->

**macOS**

1. `.dmg`를 열고 앱을 `응용 프로그램`으로 끌어다 놓습니다.
2. 처음 실행하면 *"확인되지 않은 개발자가 배포했기 때문에 열 수 없습니다"*가 뜹니다. **닫기**를 누릅니다.
3. **시스템 설정 → 개인정보 보호 및 보안**을 열고 아래로 스크롤하면 방금 차단된 앱이 보입니다. **확인 없이 열기**를 누릅니다.
4. 한 번 허용하면 다음부터는 그냥 열립니다.

우클릭 → 열기 방식은 최근 macOS에서 막혔습니다. 위 경로를 쓰세요.

**Windows**

1. `.exe`를 실행하면 파란 화면으로 *"Windows에서 PC를 보호했습니다"*가 뜹니다.
2. **추가 정보**를 누르면 나타나는 **실행**을 누릅니다.

**왜 이런 경고가 뜨나요?** 이 앱은 코드 서명을 하지 않았습니다. macOS 서명은 연 $99가 들고,
Windows는 **돈을 내도 이 경고를 없앨 수 없습니다** — 2024년부터 EV 인증서도 SmartScreen
평판을 즉시 주지 않아 다운로드 수가 유기적으로 쌓여야 합니다. 사용자 한 명짜리 개인 도구
단계에서는 지불이 목적을 달성하지 못한다고 판단했습니다.

## 개발

```bash
pnpm install
pnpm dev        # 데스크톱 앱 개발 모드
pnpm verify     # lint + typecheck + test
```

용어와 도메인 모델은 [CONTEXT.md](CONTEXT.md)를 따릅니다.

## 릴리스

버전의 유일한 출처는 `apps/desktop/package.json`의 `version`입니다.

1. `apps/desktop/package.json`의 `version`을 올린다.
2. 커밋하고 main에 푸시한다.
3. `git tag v<version> && git push --tags` — 태그 푸시가 릴리스 워크플로를 트리거한다.
