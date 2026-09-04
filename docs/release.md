# 릴리스 안내

릴리스는 `v*` 형식의 Git 태그를 올릴 때 GitHub Actions가 실행합니다.

## 릴리스 전 확인

버전의 유일한 출처는 `apps/desktop/package.json`의 `version`입니다.

```bash
pnpm verify:product
pnpm build
```

실행 정책은 [데스크톱 테스트 실행선 스펙](../.scratch/desktop-test-execution/spec.md)을 참조합니다.

## 릴리스 절차

대화형 터미널에서 다음 명령을 실행하면 현재 상태와 버전을 확인하고, 필요한 준비 커밋을
만들고, `main`에 푸시한 뒤 정확한 커밋의 CI 성공까지 기다립니다.

```bash
pnpm publish-release
```

명령은 필요한 경우 `apps/desktop/package.json`의 `version`만 바꾸고
`릴리스: v<버전> 준비` 커밋을 만듭니다. 이미 `origin/main`에 있는 미게시 버전은 재사용하며,
뒤처짐·분기·오류·CI 실패 상태에서는 태그를 만들지 않습니다. 정확한 CI 성공 뒤 버전 태그를
게시하는 후속 단계는 기존 태그 기반 Release 계약을 따릅니다.

수동 복구가 필요하면 아래 순서를 지킵니다.

1. `apps/desktop/package.json`의 `version`과 준비 커밋을 확인합니다.
2. `pnpm publish-release`로 같은 커밋의 CI 상태를 다시 확인합니다.
3. CI 성공 뒤 버전과 같은 태그를 만들고 푸시합니다.

```bash
git tag -a v<version> -m v<version>
git push origin v<version>
```

지원하는 릴리스 산출물은 macOS Apple Silicon용 `.dmg`입니다. CI와 릴리스 워크플로도 macOS만
검증하고 패키징합니다. 이 결정은 [ADR-0003](adr/0003-macos-only-desktop-build.md)에
기록했습니다. 릴리스 본문은
[.github/RELEASE_BODY.md](../.github/RELEASE_BODY.md)에서 읽습니다.
