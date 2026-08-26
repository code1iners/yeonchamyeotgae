# 29. 릴리스 워크플로와 배포 안내

Type: task
Status: ready-for-agent
Blocked by: 14, 28

## What to build

`apps/desktop/package.json`의 `version`을 올리고 `v<version>` 태그를 밀면 **양 OS 바이너리가
하나의 릴리스로 올라가고**, 사용자가 그 페이지에서 자기 OS용 파일 하나를 받아 보안 경고를 통과할
수 있는 상태.

**릴리스를 쓰는 잡은 하나다. 이 결정은 되돌리면 깨진다**([스펙 8.2절](../spec.md)).
`electron-builder`에 내장 publish가 있어서 "왜 굳이 아티팩트를 거쳐 가지?"라며 되돌려지기
쉽지만, `electron-publish`의 `createRelease()`에는 **422 `already_exists` 재시도가 없다**
(422 처리는 에셋 업로드 경로에만 있다). macOS 잡과 Windows 잡은 거의 동시에 시작하므로 둘 다
"draft 없음"을 보고 둘 다 생성을 시도할 수 있고 **한쪽이 그냥 실패한다. 실패가 확률적이라 더
나쁘다.** 쓰는 잡이 하나면 경쟁 조건이 **존재하지 않는다** — 방어가 아니라 제거다.
**이 이유를 워크플로 파일 주석으로 남긴다**(ADR로 올리지 않은 대신이다).

```
build (macos-latest)  ─┐  --publish never  → upload-artifact: dist-macos-latest
build (windows-latest) ─┤  --publish never  → upload-artifact: dist-windows-latest
                        └→ release (ubuntu-latest, needs: build)
                              download-artifact: pattern dist-*, merge-multiple
                              태그 ↔ 앱 버전 일치 검사
                              softprops/action-gh-release@v3
```

**안내는 두 곳에 있어야 한다**(8.5절) — README 설치 절과 **릴리스 본문**. 사람이 실제로 도착하는
곳은 릴리스 페이지이고, 거기서 파일을 받고 거기서 경고를 만난다. 릴리스 본문은 체크인된
`.github/RELEASE_BODY.md`에서 읽어 매 릴리스에 같은 문장이 들어가게 한다. 문장은 스펙 8.5절의
인용 블록을 그대로 쓴다(macOS 4단계 / Windows 2단계 / "왜 이런 경고가 뜨나요?").

**스크린샷은 v1에 넣지 않는다.** 지금 찍을 수 없다 — macOS 다이얼로그는 서명 안 된 앱을 실제로
내려받아야 나온다. **첫 릴리스를 실제로 내려받아 두 경고를 만나는 순간이 찍을 유일한 시점이다.**
의도적으로 미룬 것이지 빠뜨린 것이 아니다.

**서명을 나중에 켤 때의 4단계는 워크플로 YAML의 주석 블록 하나로 남긴다**(8.4절). **빈 시크릿을
미리 `env:`에 꽂아두지 않는다.**

## Acceptance criteria

- [ ] `release.yml`의 트리거가 `push: tags: ['v*']`다
- [ ] 빌드 잡이 macOS·Windows 매트릭스이고 **`--publish never`를 명시**하며 아티팩트 이름을 `dist-${{ matrix.os }}`로 매트릭스마다 다르게 준다(v4부터 아티팩트가 불변이라 같은 이름 재업로드가 실패한다)
- [ ] 빌드 잡이 `pnpm verify` → 패키징 순서다(CI 로그에서 "검증에서 깨졌다"와 "패키징에서 깨졌다"가 스텝 이름으로 갈린다)
- [ ] 수집 잡이 `ubuntu-latest`이고 `pattern: dist-*` + `merge-multiple: true`로 내려받는다(Node도 pnpm도 필요 없다)
- [ ] 수집 잡이 `apps/desktop/package.json`의 `version`과 `GITHUB_REF_NAME`에서 `v`를 뗀 값을 비교해 다르면 **실패시킨다**
- [ ] 릴리스 생성이 `softprops/action-gh-release@v3`이고 **draft가 아니라 바로 publish**된다
- [ ] **`permissions: contents: write`가 릴리스 잡에만** 있다(빌드 잡은 읽기만 갖는다)
- [ ] 릴리스 본문이 `.github/RELEASE_BODY.md`에서 온다
- [ ] 실패한 워크플로를 **재실행해도 같은 결과가 된다**(멱등)를 실제로 확인했다
- [ ] 릴리스에 붙는 자산이 정확히 둘이다 — `yeonchamyeotgae-<version>-arm64.dmg`와 `yeonchamyeotgae-<version>-x64.exe`
- [ ] `README.md`를 새로 만들었고 설치 절에 8.5절의 우회 안내가 있다(스크린샷은 없다)
- [ ] 워크플로에 "릴리스를 쓰는 잡은 하나" 이유 주석과 서명 활성화 4단계 주석이 있다. 빈 시크릿을 `env:`에 꽂아두지 않았다
- [ ] 액션 버전이 8.6절 그대로다 — `actions/checkout@v7`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, `pnpm/setup@v2`, `softprops/action-gh-release@v3`
- [ ] 실제로 태그를 밀어 릴리스가 하나 만들어지는 것을 확인했다
