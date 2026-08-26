# 14. CI 워크플로 — 커밋마다 양 OS 검증

Type: task
Status: claimed
Blocked by: 13

## What to build

main 푸시와 PR마다 **macOS와 Windows 양쪽에서** 검증이 도는 워크플로. 패키징은 하지 않는다.

이 티켓이 존재하는 이유는 소음 방지가 아니다 — 트레이·팝오버·구조·아이콘 결정이 전부
**"Windows에서 아무것도 실행하지 못했다"** 를 구멍으로 남겼고([스펙 「아직 검증하지 못한 것」](../spec.md)),
검증이 릴리스 시점에만 돌면 Windows가 깨진 것을 **릴리스를 자르는 순간에** 알게 된다.
이 워크플로가 그 구멍을 커밋 단위로 좁히는 유일한 장치다([스펙 8.1절](../spec.md)).

그러므로 이 티켓은 되도록 일찍 닫는다. 뒤에 오는 모든 UI·코어 티켓이 이 워크플로의 Windows
잡 위에서 검증된다.

## Acceptance criteria

- [x] `ci.yml`의 트리거가 `push: [main]` · `pull_request` · `workflow_dispatch`다
- [x] 매트릭스가 macOS + Windows이고 **`fail-fast: false`** 다 — Windows가 깨졌는데 macOS 실패로 취소되면 정확히 보고 싶었던 것을 못 본다
- [x] 러너 설정이 8.6절 그대로다 — `actions/checkout@v7`, `pnpm/setup@v2`(version 11, runtime node@24, cache true, **`install: false`**), 그다음 `pnpm install --frozen-lockfile`을 손으로 적는다
- [x] `pnpm verify` → `pnpm build` 순서이고 **`electron-builder`를 부르지 않는다**
- [x] Windows 잡의 `--frozen-lockfile`이 그냥 성공한다 — `supportedArchitectures`를 설정하지 않는다(9절 8번)
- [x] `actions/cache`로 `.turbo`를 잡지 않고 원격 캐시도 쓰지 않는다(8.2절 마지막 항목)
- [x] `actions/checkout`은 기본 `fetch-depth`를 쓴다(CI는 turbo 캐시에 기대지 않는다)
- [ ] 실제로 한 번 돌려 양 OS 잡이 초록인 것을 확인했다 — **블로커, 아래 Comments 참조**

## Comments

**2026-08-26, 구현 에이전트.** `.github/workflows/ci.yml` 작성 완료(커밋 2a70e67).
AC 1~7은 파일과 스펙 8.1·8.2·8.6절 대조로 충족을 확인했다. AC 5(Windows
`--frozen-lockfile`)는 스펙 9절 8번의 실측 근거(플랫폼별 optional deps가 lockfile에
전부 기록됨)에 기대며, 실제 확인은 AC 8의 첫 실행에서 함께 이뤄진다.

**AC 8이 푸시 블로커에 걸려 있다.** 커밋 854bd43(12번 티켓)이
`prototype-electron-tray/node_modules` 8,482개 파일을 실수로 커밋했고, 그 안의
Electron Framework 바이너리(192MB)가 GitHub 100MB 제한에 걸려 **main 푸시 전체가
거부된다**(origin에는 초기 2커밋만 있어 이후 로컬 히스토리 전부가 미푸시 상태).
히스토리에서 해당 경로를 제거하는 재작성이 필요한데, 이는 파괴적 작업이라
사용자 승인 대상이다. 승인 후 절차:

1. 백업은 `backup/main-pre-filter-20260826` 브랜치로 이미 떠 두었다.
2. `git filter-repo --invert-paths --path prototype-electron-tray/node_modules`
   (또는 내장 `git filter-branch --index-filter 'git rm -r -q --cached
   --ignore-unmatch prototype-electron-tray/node_modules' -- 854bd43~1..main`).
3. 재작성으로 854bd43 이후 커밋 SHA가 전부 바뀌므로, 13번 티켓 Answer의
   "커밋 e62db10" 참조를 새 SHA로 고친다.
4. `git push origin main` → push 트리거로 CI가 돌면 양 OS 잡 초록을 확인하고
   이 티켓의 AC 8을 체크한 뒤 resolve한다.

참고: `prototype-electron-tray/dist`도 같은 커밋에 딸려 들어와 추적 중이다
(`.gitignore`의 `dist/`와 모순). 작아서 푸시를 막지는 않지만 재작성 때 함께
빼는 것을 고려할 만하다.

**2026-08-26, 구현 에이전트(후속).** 사용자 승인을 받아 위 절차를 실행했다.
`filter-branch`로 `prototype-electron-tray/node_modules`를 히스토리에서 제거했고,
전 커밋 트리에 잔존 없음·푸시 범위 내 50MB 초과 blob 없음을 확인했다.
주요 SHA 매핑(구→신): 854bd43→838ec66(12번), e62db10→2b57ee2(13번 스캐폴딩),
2a70e67→73b575e(ci.yml). 13번 티켓 Answer의 SHA 참조는 고쳤다.
`prototype-electron-tray/dist`는 승인 범위를 좁게 지켜 이번 재작성에서 빼지 않았다.
