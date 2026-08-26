# 16. 코어 seam 둘 — 직렬화와 표시

Type: task
Status: ready-for-agent
Blocked by: 13

## What to build

코어의 순수 함수 세 개 — `parse` / `serialize` / `formatTrayLabel`. 파일 I/O도 플랫폼 분기도
없다. 셋 다 표로 표현되는 seam이므로 이 티켓의 산출물은 **코드 + 그 표를 그대로 옮긴 테스트**다.

`parse`는 **구조만 본다.** 형식·타입·필수 필드·`entries`의 중복 `date`(하루 1건 불변식)까지다.
**도메인 이상치는 통과시킨다** — 입사일 이전 휴가 기록, 0.25 배수가 아닌 일수, 소멸일이 발생일보다
이른 조정. 이걸 거부하면 **앱이 자기가 쓴 파일을 못 읽는다**([스펙 5.4절](../spec.md)의 삭제 거절).
도메인 이상치는 입력 UI가 막는다.

`formatTrayLabel(balance, { maxGlyphs })`이 **플랫폼 분기 대신 예산 파라미터**다. 코어에
`process.platform`이 들어가면 v2가 코어를 못 받는다(4.3절).

**`Math.floor`다. `Math.trunc`가 아니다**(9절 14번) — 프로토타입 코드가 `trunc`로 되어 있고
그대로 옮기면 `-0.25`가 `0`으로 보여 초과 노출 결정이 조용히 무효화된다.

## Acceptance criteria

- [ ] `ParseError`가 `invalid-json` / `schema-mismatch` / `future-version` 셋을 구분한다 — 셸의 오류 화면이 셋을 다르게 다룬다
- [ ] `schemaVersion`이 앱보다 높으면 `future-version`으로 거부한다
- [ ] JSON 파싱 실패는 `invalid-json`, 구조·타입·필수 필드 위반은 `schema-mismatch`
- [ ] `entries`에 중복 `date`가 있으면 거부한다
- [ ] 도메인 이상치 셋(입사일 이전 휴가 기록 / 0.25 배수가 아닌 일수 / 소멸일이 발생일보다 이른 조정)이 **통과하는** 테스트가 있다
- [ ] `serialize(parse(x)) === x` 왕복이 성립한다(2칸 들여쓰기)
- [ ] 저장 키가 2절 그대로다 — `schemaVersion` / `settings.hireDate` / `settings.grantBasis` / `entries[].{id,date,days,note}` / `adjustments[].{id,grantDate,expiryDate,days,note}`. `note`는 항상 존재하고 기본값이 빈 문자열이다
- [ ] `id`는 `crypto.randomUUID()`이고 휴가 기록·조정 양쪽에 있다
- [ ] 표시 seam 표 4행이 테스트로 있다 — `12.75`→`12.75`/`12`, `-24.75`→`-24.75`/`-25`, `-0.25`→`-0.25`/**`-1`**, `0`→`0`/`0`
- [ ] 코어에 `process.platform`이 없다
