# 11. 스펙 문서 작성

Type: task
Status: open
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10, 12

## Question

앞선 모든 결정을 `to-spec`으로 종합해 목적지 산출물 두 개를 만든다.

1. **스펙 문서** → `.scratch/yeoncha-tray-app/spec.md`, `ready-for-agent` 상태. `to-spec`의 템플릿(Problem Statement / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes)을 따른다.
2. **셸 프레임워크 ADR** → `docs/adr/0001-<slug>.md`. [05번 티켓](05-shell-framework-adr.md)의 프로토타입 결과를 근거로 쓴다.

## 완료 조건

- 스펙이 `CONTEXT.md`의 용어를 일관되게 쓴다.
- Testing Decisions 절이 코어 계산 엔진의 seam과 [04번](04-accrual-rule-spec.md)의 검증 케이스 테이블을 담는다.
- Out of Scope 절이 이 지도의 Out of scope 섹션과 일치한다.
- 구현 에이전트가 스펙만 읽고 빈 저장소에 스캐폴딩을 시작할 수 있다. 파일 경로와 코드 조각은 넣지 않는다(프로토타입이 산출한 결정적 스니펫은 예외).

## 참고

이 티켓은 결정이 아니라 종합이다. 여기서 새로운 결정이 필요해지면 그건 앞선 티켓이 덜 닫혔다는 신호이므로, 스펙에 얼버무리지 말고 해당 티켓을 다시 연다.

### 09번 결정에서 넘어온 것 (2026-08-26)

[09번](09-project-structure.md)이 닫히면서 **지도의 "Not yet specified"가 비었다.**
"테스트 전략"이 마지막 안개였고 09번 6절이 seam 셋(계산·표시·직렬화)을 확정했다.

스펙 작성 시 09번에서 그대로 옮겨야 할 절들이다.

- **Implementation Decisions**: 09번 0절의 결정 표와 8절의 파일 트리·`tsconfig.base.json`.
  파일 경로를 넣지 않는 게 원칙이지만 **스캐폴딩 지시는 예외로 넣어야 한다** — 이 티켓의 완료
  조건이 "구현 에이전트가 스펙만 읽고 빈 저장소에 스캐폴딩을 시작할 수 있다"이기 때문이다.
- **Testing Decisions**: 09번 6절의 seam 표 + [04번](04-accrual-rule-spec.md) 9절의 검증
  케이스 14건. `today`가 인자라는 것이 이 절의 전제다.
- **함정 절이 필요하다**: 09번 9절의 일곱 개는 전부 실제로 밟은 것이고, 스펙에 없으면 구현
  에이전트가 다시 밟는다. 특히 **turbo 캐시가 git 저장소를 요구하는 것**(스캐폴딩 순서가
  바뀐다)과 **`externalizeDepsPlugin({ exclude: ['@yeoncha/core'] })`**(개발 중엔 안 보이고
  패키징된 앱만 깨진다)는 빠지면 안 된다.
- **ADR 후보 하나**: 날짜 라이브러리(Temporal + 폴리필) 결정이 ADR 세 조건을 다 만족한다.
  다만 지도의 목적지는 ADR을 하나(셸 프레임워크)로 명시했으므로 09번은 만들지 않았다.
  두 번째 ADR이 필요한지는 이 티켓이 판단한다.
- **`CONTEXT.md`는 09번도 고치지 않았다.** 새로 생긴 이름(`@yeoncha/core`, `computeGrants`,
  `parse`)은 전부 구현 용어다. 다만 스펙은 09번 8절의 내보내기 표가 `CONTEXT.md`의
  **발생·배정·잔여·초과**와 1:1인 것을 보이는 편이 좋다.

### 10번 결정에서 넘어온 것 (2026-08-26)

[10번](10-release-build-pipeline.md)이 닫히면서 **11번을 막던 것이 12번 하나만 남았다.**
스펙에 반드시 옮겨야 할 것들이다.

- **워크플로 둘의 경계**(10번 1절)와 **릴리스를 쓰는 잡이 하나라는 것**(2절). 후자는 **이유와
  함께** 적어야 한다 — `electron-builder`에 내장 publish가 있으므로, 이유를 모르면 "왜 굳이
  아티팩트를 거쳐 가지?"라며 되돌려진다. 이유는 `createRelease()`에 422 재시도가 없어 두 러너의
  동시 publish가 **확률적으로** 깨진다는 것이다.
- **`electron-builder.yml`의 서명 억제 세 줄과 켤 때의 4단계 체크리스트**(5절). 특히
  *"`mac.identity: null`을 지우지 않으면 `CSC_LINK`를 넣어도 조용히 서명되지 않는다"*.
  02번이 말한 "서명 훅 자리를 비워둔다"의 실체가 이것이다.
- **`apps/desktop`의 런타임 `dependencies`가 비어 있다는 불변식**(11절)과 확인 방법
  (`asar list`에 `node_modules/@yeoncha/core`가 없어야 한다).
  **09번 5절의 `externalizeDepsPlugin({ exclude: ['@yeoncha/core'] })`를 그대로 옮기면 안 된다** —
  코어를 `devDependencies`에 두는 것으로 대체되며, 그러면 `exclude`가 불필요한 설정이 된다.
- **`allowBuilds` 목록을 확정하는 순서**(10절 교정 2). electron-builder를 포함한 전체 설치를
  한 번 돌려 pnpm이 써넣는 플레이스홀더를 전부 확인하고 값을 정해 커밋한 **다음에** 첫 CI를
  돌린다. `esbuild: true`가 없으면 install이 종료 코드 1이고, pnpm이 `pnpm-workspace.yaml`을
  install 도중 수정한다. **09번이 넘긴 `electron` 항목은 불필요하다**(42부터 postinstall 없음).
- **09번 9절 함정 목록에서 하나가 무효화된다**: "turbo 캐시는 git 저장소를 요구한다"는 스캐폴딩
  순서 지시로는 유효하지만, CI에서는 turbo 캐시에 기대지 않으므로 `fetch-depth` 조정이 필요 없다.
  또 **"플랫폼별 lockfile" 걱정은 통째로 사라진다**(pnpm이 win32 optional 패키지를 전부 lockfile에
  적는 것을 실측). `supportedArchitectures`를 스펙에 넣지 마라.
- **`README.md`를 만들어야 한다**는 것 자체(6절). 저장소에 아직 없다. 같은 문장이
  `.github/RELEASE_BODY.md`에도 들어가 릴리스 본문이 된다. **스크린샷은 v1에 넣지 않는다** —
  첫 릴리스를 실제로 내려받아 두 경고를 만나는 시점에 추가한다(의도적 유예).
- **버전의 유일한 출처는 `apps/desktop/package.json`**이고 태그는 `v` + 그 값이며, 릴리스 잡이
  일치를 검사한다(7절). 루트 `package.json`은 버전을 갖지 않는다.
- **electron-builder 설정을 정할 때 `electron.build` 문서 사이트를 근거로 쓰지 마라**(13절).
  그 사이트는 v27 알파(`master`)를 렌더링한다. 근거는 `26.15.7` 태그의 소스다. 버전도
  **`26.15.7`로 정확히 핀**한다(npm `latest`는 26.15.3에 멈춰 있다).
- **12번과의 접점**: `win.signAndEditExecutable: false`를 쓰면 12번이 만들 아이콘이 exe에
  붙지 않는다. `signExecutable: false`여야 한다.

**두 번째 ADR 판단에 재료가 하나 늘었다.** 09번이 날짜 라이브러리(Temporal)를 후보로 남겼는데,
10번의 "릴리스를 쓰는 잡이 하나"도 되돌리기 어렵고 근거 없이는 놀라운 구조적 결정이다. 다만
목적지가 ADR을 하나로 명시했으므로 10번은 만들지 않았고, 필요 여부는 이 티켓이 판단한다.
