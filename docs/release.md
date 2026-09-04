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
만듭니다. `main`은 push하지 않고 준비한 정확한 커밋을 가리키는 주석 태그 하나만 push합니다.
태그 push로 시작된 정확한 Release 워크플로의 성공·공개 상태·대상 커밋·Apple Silicon DMG까지
명령이 확인합니다.

```bash
pnpm publish-release
```

명령은 필요한 경우 `apps/desktop/package.json`의 `version`만 바꾸고
`릴리스: v<버전> 준비` 커밋을 만듭니다. 버전 선택은 `1) patch`, `2) minor`, `3) major`,
`4) 직접 입력`이며, 빈 입력은 `1`과 같습니다. 이미 `origin/main`에 있는 미게시 버전은
재사용하고, 로컬 `main`이 원격보다 앞선 경우 최종 확인에 포함 커밋을 표시합니다.
뒤처짐·분기·오류 상태에서는 태그를 만들지 않습니다. 태그와 Release가 모두 검증된 경우에만
성공으로 끝나며, 출력에 버전·태그·전체 SHA·Release URL·확인한 DMG 이름을 남깁니다.
GitHub Release API의 `targetCommitish`가 기준 브랜치 이름으로 반환되는 경우에도, 명령은 원격
annotated tag의 peeled ref를 통해 정확한 전체 SHA를 별도로 확인합니다.

실패하면 이미 만들어진 준비 커밋·로컬 태그·원격 태그를 삭제하지 않습니다. `main`은 이 명령으로
변경되지 않습니다. 태그 push 실패는 원인을 해결한 뒤 출력된 같은 `git push origin v<버전>`을
재시도하고, Release 워크플로 실패는 출력된 정확한 실행의 `gh run rerun <실행 ID>`를 사용합니다.
원격 태그 삭제·이동·강제 push와 `--no-verify`, `HUSKY=0` 우회는 수행하지 않습니다.

아직 태그를 만들지 않은 상태에서 수동 복구가 필요하면 아래 순서를 지킵니다.

1. `apps/desktop/package.json`의 `version`과 준비 커밋, `origin/main`과의 차이를 확인합니다.
2. `pnpm publish-release`로 같은 커밋의 태그 게시와 Release 검증을 다시 실행합니다.
3. 스크립트를 사용하지 않을 때만 태그 미존재와 준비 커밋을 확인한 뒤 버전과 같은 태그를 만들고
   푸시합니다.

```bash
git tag -a v<version> -m v<version>
git push origin v<version>
```

이미 태그가 있다면 다시 만들거나 강제로 덮어쓰지 말고, 해당 태그의 Release 워크플로와
자산을 확인·재실행합니다.

지원하는 릴리스 산출물은 macOS Apple Silicon용 `.dmg`입니다. CI와 릴리스 워크플로도 macOS만
검증하고 패키징합니다. 이 결정은 [ADR-0003](adr/0003-macos-only-desktop-build.md)에
기록했습니다. 릴리스 본문은
[.github/RELEASE_BODY.md](../.github/RELEASE_BODY.md)에서 읽습니다.
