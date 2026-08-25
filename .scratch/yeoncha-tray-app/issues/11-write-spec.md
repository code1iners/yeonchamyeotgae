# 11. 스펙 문서 작성

Type: task
Status: open
Blocked by: 03, 04, 05, 06, 07, 08, 09, 10

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
