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

1. `apps/desktop/package.json`의 `version`을 올립니다.
2. `pnpm verify:product`와 빌드가 통과했는지 확인합니다.
3. 변경사항을 커밋하고 `main`에 푸시합니다.
4. 버전과 같은 태그를 만들고 푸시합니다.

```bash
git tag v<version>
git push --tags
```

지원하는 릴리스 산출물은 macOS Apple Silicon용 `.dmg`입니다. 현재 GitHub Actions에는 Windows
x64용 `.exe` 패키징이 잔여 설정으로 남아 있어 실제 워크플로 정의와 지원 정책이 일치하지
않습니다. Windows 잡의 성공 여부는 릴리스 준비 증거로 사용하지 않으며, 다음 워크플로 수정에서
복구하지 않고 제거합니다. 이 결정은
[ADR-0003](adr/0003-macos-only-desktop-build.md)에 기록했습니다. 릴리스 본문은
[.github/RELEASE_BODY.md](../.github/RELEASE_BODY.md)에서 읽습니다.
