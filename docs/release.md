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

태그를 푸시하면 macOS Apple Silicon용 `.dmg`와 Windows x64용 `.exe`를 패키징해 하나의
GitHub Release로 올립니다. 릴리스 본문은 [.github/RELEASE_BODY.md](../.github/RELEASE_BODY.md)
에서 읽습니다.
