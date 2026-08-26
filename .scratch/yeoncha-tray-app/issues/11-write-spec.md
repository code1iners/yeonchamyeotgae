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
