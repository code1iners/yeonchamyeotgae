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

- [ ] `ci.yml`의 트리거가 `push: [main]` · `pull_request` · `workflow_dispatch`다
- [ ] 매트릭스가 macOS + Windows이고 **`fail-fast: false`** 다 — Windows가 깨졌는데 macOS 실패로 취소되면 정확히 보고 싶었던 것을 못 본다
- [ ] 러너 설정이 8.6절 그대로다 — `actions/checkout@v7`, `pnpm/setup@v2`(version 11, runtime node@24, cache true, **`install: false`**), 그다음 `pnpm install --frozen-lockfile`을 손으로 적는다
- [ ] `pnpm verify` → `pnpm build` 순서이고 **`electron-builder`를 부르지 않는다**
- [ ] Windows 잡의 `--frozen-lockfile`이 그냥 성공한다 — `supportedArchitectures`를 설정하지 않는다(9절 8번)
- [ ] `actions/cache`로 `.turbo`를 잡지 않고 원격 캐시도 쓰지 않는다(8.2절 마지막 항목)
- [ ] `actions/checkout`은 기본 `fetch-depth`를 쓴다(CI는 turbo 캐시에 기대지 않는다)
- [ ] 실제로 한 번 돌려 양 OS 잡이 초록인 것을 확인했다
