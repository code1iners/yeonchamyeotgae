# 16. 코어 seam 둘 — 직렬화와 표시

Type: task
Status: resolved
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

- [x] `ParseError`가 `invalid-json` / `schema-mismatch` / `future-version` 셋을 구분한다 — 셸의 오류 화면이 셋을 다르게 다룬다
- [x] `schemaVersion`이 앱보다 높으면 `future-version`으로 거부한다
- [x] JSON 파싱 실패는 `invalid-json`, 구조·타입·필수 필드 위반은 `schema-mismatch`
- [x] `entries`에 중복 `date`가 있으면 거부한다
- [x] 도메인 이상치 셋(입사일 이전 휴가 기록 / 0.25 배수가 아닌 일수 / 소멸일이 발생일보다 이른 조정)이 **통과하는** 테스트가 있다
- [x] `serialize(parse(x)) === x` 왕복이 성립한다(2칸 들여쓰기)
- [x] 저장 키가 2절 그대로다 — `schemaVersion` / `settings.hireDate` / `settings.grantBasis` / `entries[].{id,date,days,note}` / `adjustments[].{id,grantDate,expiryDate,days,note}`. `note`는 항상 존재하고 기본값이 빈 문자열이다
- [x] `id`는 `crypto.randomUUID()`이고 휴가 기록·조정 양쪽에 있다
- [x] 표시 seam 표 4행이 테스트로 있다 — `12.75`→`12.75`/`12`, `-24.75`→`-24.75`/`-25`, `-0.25`→`-0.25`/**`-1`**, `0`→`0`/`0`
- [x] 코어에 `process.platform`이 없다

## Answer

`packages/core/src/{storage,tray-label}.ts` + 표 테스트로 구현했다. 코어 테스트 37건
(직렬화 25 + 표시 4 + 기존 Temporal 8), `pnpm verify` 전체 통과.

- **`formatTrayLabel`** — [tray-label.ts](../../../packages/core/src/tray-label.ts).
  정확한 표기가 `maxGlyphs`에 담기면 그대로, 아니면 `Math.floor` 정수. 표시 seam 표
  4행 × 예산 2종(Infinity/3)이 [tray-label.test.ts](../../../packages/core/src/tray-label.test.ts)에
  그대로 있다. `-0.25 → -1`(9절 14번 함정)이 핵심 행이다.
- **`parse`/`serialize`** — [storage.ts](../../../packages/core/src/storage.ts).
  `ParseError.kind`가 세 갈래를 구분하고, `future-version` 검사를 구조 검증 **앞**에
  둔다 — 신버전 파일은 구조가 다를 수 있고, 그때 `schema-mismatch`로 오분류되면 셸이
  `[백업에서 복구]`를 띄운다(2절 표 위반). 날짜는 정규식 + `Temporal.PlainDate.from(…,
  { overflow: "reject" })`로 본다 — 기본 `constrain`은 `2024-02-30`을 조용히 고쳐
  통과시킨다.
- **파서 범위는 2절 문장 그대로 닫았다** — 형식·타입·필수 필드·중복 `date`까지.
  도메인 이상치 3종이 통과하는 테스트가 있고, **모르는 키도 통과**한다(거부 목록
  밖이며, 신버전 필드의 손실 경로는 `future-version` 거부가 담당). 처음엔 모르는 키를
  거부했다가 코드 리뷰(Spec 축)가 스코프 크리프로 짚어 제거했다.
- **왕복** — `parse`가 2절 예시와 같은 키 순서로 객체를 재구성하므로 앱이 쓴
  정본(2칸 들여쓰기)에 대해 `serialize(parse(x)) === x`. 끝 개행은 스펙에 근거가
  없어 붙이지 않는다(리뷰 반영).
- **`id`** — 스키마상 휴가 기록·조정 양쪽에 필수이고 생성기는 `crypto.randomUUID()`로
  타입 주석에 문서화했다. 실제 생성 코드는 레코드를 만드는 티켓(22·25번) 몫이다 —
  이 티켓의 산출물은 순수 함수 셋이라 난수 생성을 코어 파서에 넣지 않았다.
- **`process.platform` 부재** — grep 실측 0건. 코어 의존성은 `temporal-polyfill` 하나다.
