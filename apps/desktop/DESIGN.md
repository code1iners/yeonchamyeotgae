---
name: 연차몇개
description: 작지만 필수적인 연차 잔여 추적 도구
colors:
  ink: "#202522"
  ink-dark: "#edf2ee"
  muted: "#66736b"
  muted-dark: "#a7b4ac"
  accent: "#1d6b52"
  accent-dark: "#287c60"
  accent-text: "#1d6b52"
  accent-text-dark: "#4fae88"
  accent-soft: "rgba(29, 107, 82, 0.12)"
  accent-soft-dark: "rgba(40, 124, 96, 0.22)"
  on-accent: "#fff"
  danger: "#b42318"
  danger-dark: "#ff8a80"
  canvas: "#f7f8f6"
  canvas-dark: "#1c2420"
  line: "rgba(32, 37, 34, 0.14)"
  line-dark: "rgba(237, 242, 238, 0.16)"
  line-strong: "rgba(32, 37, 34, 0.24)"
  line-strong-dark: "rgba(237, 242, 238, 0.26)"
  hover: "rgba(29, 107, 82, 0.08)"
  hover-dark: "rgba(40, 124, 96, 0.2)"
  fill: "rgba(32, 37, 34, 0.045)"
  fill-dark: "rgba(237, 242, 238, 0.07)"
  field: "rgba(255, 255, 255, 0.72)"
  field-dark: "rgba(237, 242, 238, 0.08)"
typography:
  title:
    fontFamily: '-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "1.4"
  body:
    fontFamily: '-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.4"
  supporting:
    fontFamily: '-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif'
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: "1.45"
  label:
    fontFamily: '-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "1.4"
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "1.4"
rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  dot: "50%"
  mark: "1px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "3px 9px"
  button-neutral:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "3px 9px"
  button-mini:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.supporting}"
    rounded: "{rounded.md}"
    padding: "1px 5px"
  text-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "3px 6px"
  tab-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "3px 9px"
  planned-tag:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    typography: "{typography.supporting}"
    rounded: "{rounded.sm}"
    padding: "0 5px"
  summary-row:
    typography: "{typography.body}"
    padding: "1px 12px"
    height: "22px"
  calendar-day:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0"
    height: "30px"
    width: "48px"
---

# Design System: 연차몇개

## Overview

**Creative North Star: "작지만 필수 도구"**

연차몇개의 화면은 상주 앱의 작은 팝오버 안에서 반드시 필요한 정보를 빠르게 읽게 한다. 시각적
목적은 관심을 끄는 것이 아니라, 잔여와 그 근거를 조용하고 정확하게 전달하는 것이다. 시스템
텍스트와 테마를 따르고, 한 가지 강조색과 얇은 구분선만으로 정보의 순서를 만든다.

이 시스템은 간단하지만 유용해야 한다. 버튼·목록·입력은 장식적인 카드가 아니라 검산 가능한
도구로 동작하며, 숫자는 흔들리지 않고 정렬되어야 한다. 상태가 바뀌어도 화면은 새 장식이나
새 색을 더하지 않고 같은 시각 언어 안에서 의미를 드러낸다. 승인된 컴프의 원장 선과 녹색은
구성의 기준이지, 실제 종이 질감을 화면에 복제하라는 뜻이 아니다.

**Key Characteristics:**

- 작지만 필수적인 정보 도구
- 시스템 네이티브 텍스트와 라이트·다크 테마
- Ledger Green & Graphite의 단일 강조색 구조
- 그림자 없는 평면과 hairline 구분선
- 표 형식의 정확한 숫자 정렬

## Approved reference

[승인된 잔액 원장 컴프](.impeccable/mocks/decision/model-pick.png)를 이 화면의 구성 기준으로
보존한다. 컴프를 다시 생성하거나 종이 질감·등록 표식을 장식으로 옮기지 않는다. 제품명과 잔여가
상단에서 먼저 읽히고, 검산 행·살아 있는 발생분·`휴가 등록`이 한 세로 흐름과 고정 열을 이루는
구성과 주요 행동 위치를 후속 화면에서도 유지한다. 정상적으로 읽힌 화면의 `휴가 등록`은 헤더의
전역 행동으로 제공하되, 이력이 비었을 때만 같은 행동을 빈 상태에도 반복해 다음 단계를 바로
찾게 한다.

## Colors

색상은 따뜻한 중립에 가까운 종이색(`#f7f8f6`)과 짙은 흑연 잉크(`#202522`)를 바탕으로 하며,
테마에 따라 같은 역할의 명도가 바뀐다. 승인된 방향의 원장 녹색(`#1d6b52`)은 선택·실행·예정
상태에만 쓰고, 빨강은 위험과 소멸처럼 손실을 알려야 하는 순간에만 쓴다.

### Primary

- **Ledger Green** (`--accent`): 선택된 탭, 주요 버튼, 예정 점처럼 사용자가 지금 보거나
  실행해야 하는 상태의 면과 표식을 표시한다. 다크 테마에서는 `--accent-dark`를 따른다.
- **Ledger Green Text** (`--accent-text`): 링크·진행 상태·오늘 날짜처럼 배경 위에 직접 놓이는
  작은 텍스트에 사용한다. 다크 테마에서는 원장 녹색의 정체성을 유지하면서 AA 대비를 확보한
  `--accent-text-dark`를 따른다.
- **On Accent** (`--on-accent`): 녹색 강조면 위의 텍스트와 선택된 달력 점에 사용한다.

### Neutral

- **Graphite** (`--fg`): 기본 본문과 핵심 숫자에 사용한다. 다크 테마에서는 `--fg`의 다크 값을
  따른다.
- **Muted Graphite** (`--fg-2`): 설명, 보조 날짜, 섹션 제목처럼 우선순위가 낮은 정보에 사용한다.
- **Canvas** (`--bg`): 팝오버의 기본 배경이다. 라이트·다크 테마 모두 시스템 설정을 따른다.
- **Field** (`--field`): 입력과 기본 버튼의 반투명 표면이다.
- **Hairline** (`--line`) 및 **Strong Hairline** (`--line-strong`): 영역을 나누되 카드처럼
  부풀리지 않는 구분선과 컨트롤 테두리다.
- **Fill** (`--fill`) 및 **Hover Fill** (`--hover`): 온보딩·확인·수정 영역과 마우스 오버를
  구분하는 얕은 면이다.

### Named Rules

**The One Accent Rule.** 원장 녹색은 한 화면에서 선택과 실행의 의미를 맡는다. 새로운 장식색을
추가해 정보 우선순위를 분산하지 않는다.

**The Theme Pair Rule.** 라이트·다크 테마는 같은 역할의 토큰 쌍으로 바뀐다. 화면마다 별도의
색을 고르지 않고 시스템 테마 변수를 따른다.

## Typography

**Display Font:** 사용하지 않음
**Body Font:** `-apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif`
**Label/Mono Font:** 라벨은 본문 시스템 글꼴을 사용하고, 저장 파일명·코드성 값은
`ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace`를 사용한다.

**Character:** 시스템 기본 글꼴의 친숙함과 작은 팝오버에 맞춘 조밀함을 우선한다. 큰 제목이나
개성 강한 디스플레이 서체로 도구의 정보를 가리지 않는다.

### Hierarchy

- **Title** (600, 17px, 1.4): 팝오버 헤더의 제품명과 `잔여` 숫자로 화면의 현재 맥락을 잡는다.
- **Body** (400, 13px, 1.4): 일반 버튼, 입력, 본문 행의 기본 크기다.
- **Supporting** (400, 11.5px, 1.35–1.45): 설명, 오류, 메모, 보조 날짜처럼 본문보다 한 단계
  낮은 정보에 사용한다.
- **Label** (600, 11px, 1.4): 섹션 제목과 필드 라벨에 사용한다.
- **Numeric** (본문 상속, tabular numerals): 잔여·일수·날짜 열을 같은 자리에 세운다.

### Named Rules

**The Stable Number Rule.** 숫자에는 tabular numerals를 사용해 잔여가 갱신될 때 열과 행이
흔들리지 않게 한다.

## Layout

팝오버는 380px 고정 폭이며 높이는 내용의 실제 높이에 맞춰진다. 정상 화면은 제품명·잔여를
포함한 헤더, 탭 막대, 탭 내용의 세 층으로 읽힌다. 휴가 등록 시트와 읽기 실패 화면은 이 구조를
잠시 대체하는 전체 상태다. Electron 셸은 화면 작업 영역을 넘지 않도록 높이를 자르며, 화면 안의
긴 발생분·휴가 이력·조정 목록만 별도 스크롤한다. 요약의 검산 행과 `휴가 등록`, 설정의
기본 입력·데이터 행동은 목록을 줄여도 첫 뷰포트에 남는다. 페이지 확대 배율을 사용하는 경우에도
콘텐츠 측정값과 네이티브 창 크기의 단위를 맞춰 200% 확대에서 핵심 정보가 잘리지 않게 한다.

기본 좌우 여백은 12px이고, 행은 약 25px 리듬으로 세운다. 간격은 2px·4px·6px·8px·10px·12px
단계를 사용한다. 주요 행은 `padding: 4px 12px`, 팝오버 본문은 위아래 4px·8px 여백을 사용하며,
버튼과 세그먼트는 2px 간격으로 붙인다.

달력은 7열 × 48px 셀을 중심으로 배치한다. 이 그리드가 380px 팝오버 안에서 날짜를 충분히
읽게 하는 고정 기준이다. 긴 발생분·조정 목록은 최대 240px, 이력 리스트는 최대 356px
높이에서 각각 스크롤하고, 나머지 화면은 내용에 따라 팝오버 높이가 변한다. 기본 크기에서는 별도의
반응형 재배치를 하지 않는다. 페이지 확대나 작은 작업 영역 때문에 팝오버가 340 CSS px 이하로
좁아지면 헤더 행동과 확인 버튼만 줄을 바꾸고, 달력과 조정 표처럼 2차원 구조가 의미를 갖는 영역은
해당 영역 안에서만 가로로 탐색한다. 화면 높이보다 내용이 길어진 경우에는 목록별 스크롤을 우선하되
팝오버 전체에도 세로 스크롤 폴백을 제공한다.

## Elevation & Depth

깊이감은 완전한 평면을 기본으로 한다. 그림자는 사용하지 않으며, `--bg` 위에 `--fill`을 얹고
`--line` 또는 `--line-strong`을 놓아 영역과 조작 가능 요소를 구분한다. 확인·온보딩·인라인 수정
영역도 모달 카드나 떠 있는 패널이 아니라 얕은 면과 hairline으로만 분리한다.

### Named Rules

**The Flat Surface Rule.** 정보 계층을 표현하기 위해 카드 스택, 그림자, 블러를 추가하지 않는다.
면의 톤과 얇은 선이면 충분한 곳은 그 방식으로 끝낸다.

## Shapes

컨트롤과 달력 셀은 부드럽지만 작게 둥근 6px 모서리를 사용한다. 예정 태그는 4px로 더 작고,
연차 연도 접기 버튼은 직사각형에 가까운 0px 모서리를 사용한다. 입력과 기본 버튼에는 1px
테두리가 있고, 선택된 탭·세그먼트·달력 셀은 테두리 대신 강조색 면으로 상태를 보여준다.

소멸 표시는 1px 모서리의 짧은 밑줄이고, 예정·사용 표시는 50% 원형 점이다. 큰 라운드 카드,
알약형 컨테이너, 장식적인 외곽선은 사용하지 않는다.

## Components

### Buttons

- **Shape:** 6px 모서리와 1px `--line-strong` 테두리.
- **Primary:** `--accent` 배경과 `--on-accent` 텍스트, 기본 `3px 9px` 패딩. 저장·등록·복구처럼
  다음 행동이 분명한 조작에만 사용한다.
- **Neutral:** `--field` 배경과 일반 텍스트로 보조 행동을 둔다.
- **Mini:** 투명 배경, muted 텍스트, `1px 5px` 패딩으로 목록 행 안의 수정·삭제·닫기를 처리한다.
- **Destructive:** 실제 삭제는 확인 단계 안에서만 danger 버튼으로 표시한다. 편집 초안의
  `저장`은 primary, `취소`는 neutral/mini로 두어 데이터 보존 행동과 파괴 행동을 혼동하지 않는다.
- **Hover / Focus:** hover는 `--hover` 또는 primary의 밝기 변화만 사용하고, 키보드 포커스는
  2px outline을 유지한다. 강조면 위에서는 `--on-accent`, 그 밖에서는 `--accent`를 쓴다.
  비활성은 opacity 0.4다.

### Inputs / Fields

- **Style:** `--field` 배경, `--line-strong` 1px 테두리, 6px 모서리, `3px 6px` 패딩.
- **Field Row:** 라벨은 68px 폭으로 고정하고 입력은 남은 폭을 채운다.
- **Focus:** 강조색 2px outline을 안쪽으로 둔다(`outline-offset: -1px`).
- **Error:** 오류 텍스트는 danger 색상과 11.5px 보조 크기로 입력 아래에 놓는다.

### Leave Entry Sheet

- **Mode:** 등록면은 팝오버의 헤더·탭·본문을 잠시 대신하는 `dialog`다. 별도 페이지나 중첩
  모달을 만들지 않고, 닫기와 취소를 같은 화면에 둔다.
- **Default:** 열리는 순간 `날짜`는 셸이 준 오늘이고 `하루`·`종일`이 선택된다. 오늘 표시는
  날짜 입력 옆의 문구로도 확인할 수 있으며, 등록면의 첫 포커스는 날짜 입력이다.
- **Expansion:** `기간으로`를 고르면 종료일과 `주말 제외`만 추가하고, 날짜·단위·메모 입력은
  같은 화면에 유지한다. 기간은 저장 전에 생성될 `휴가 기록 N건`을 설명한다.
- **Duplicate:** 이미 기록된 하루는 등록 버튼을 비활성화하고, 오늘이면 다른 날짜를 고르라는
  문구를 날짜 입력과 연결한다. 기간의 기존 날짜는 하루 1건 불변식에 따라 전개에서 건너뛴다.
- **Saving:** 저장 중에는 등록면에 `저장 중입니다…`를 live status로 표시하고 모든 입력과
  닫기·취소·등록 조작을 잠근다. 실패는 같은 등록면에 원인과 기존 초안을 남기며, 성공하면
  셸의 상태 푸시가 잔여·요약·이력·트레이를 함께 갱신한 뒤 등록면을 즉시 닫는다. 완료 문구는
  부모 셸의 `role="status"`에 남기고, 성공·취소·Escape 뒤에는 전역 `휴가 등록` 트리거로
  포커스를 돌린다.

### Data Management

- **Structure:** 설정 안에서 저장 파일을 다루는 행동을 `저장 파일`과 `가져올 저장 파일`로
  나눈다. `[파일 위치 열기]`와 `[내보내기]`는 현재 원장을 확인·복사하는 행동이고,
  `[가져오기]`는 다른 파일로 전체를 교체하는 별도 행동이다.
- **Feedback:** 진행·완료·취소·실패를 같은 데이터 영역의 live status 또는 alert로 설명한다.
  성공한 파일 경로는 mono 글꼴로 보여주며, 실패는 사용자가 다시 고를 위치나 파일을 문장으로
  안내한다. 색만으로 결과를 전달하지 않는다.
- **Confirmation:** 가져오기는 파일 선택 전에 `지금 데이터가 대체됩니다`와 전체 교체,
  교체 직전 상태를 자동 백업한다는 자연어를 먼저 읽히고, 정확한 파일명 `data.json.bak`은
  보조 정보로 제공한다. 취소하면 현재 원장·설정 입력·기존 안내를 그대로 두고 가져오기 버튼으로
  포커스를 돌린다.
- **Dialog:** 네이티브 파일 대화상자가 열리면 팝오버를 유지하고, 데이터 조작 세 버튼을
  비활성화한다. 파일 관리자 호출 뒤 늦게 도착하는 외부 앱 blur도 짧은 유예 안에 처리한다.
  대화상자가 끝나면 시작한 버튼으로 포커스를 돌리며, 성공한 가져오기는 셸의 상태 푸시로
  설정·잔여·이력을 함께 갱신한다.

### Read Failure

- **Mode:** 읽을 수 없는 저장 파일은 헤더·탭을 그리지 않고 팝오버 전체를 읽기 실패 화면으로
  대체한다. JSON 파싱 실패, 저장 구조 불일치와 미래 버전은 사용자가 다음 행동을 구분할 수
  있는 문장으로 설명한다.
- **Recovery:** 파싱·구조 실패에는 `[백업에서 복구]`와 `[파일 위치 열기]`를 제공하고, 미래
  버전에는 업데이트 안내만 둔다. 사용자가 행동을 고르기 전과 복구 검증이 실패한 뒤에는 원본을
  유지하며, 유효한 백업을 명시적으로 고른 경우에만 기존 원자적 복구 계약을 따른다.
- **Feedback:** 복구·파일 위치 열기의 진행, 성공과 실패를 live status 또는 alert로 같은 화면에
  남기고, 화면 진입 시 읽기 실패 맥락에 포커스를 둔다. 비동기 행동이 끝나면 시작한 버튼으로
  포커스를 돌려 키보드 흐름을 유지한다.

### Navigation

- **Tabs:** 세 탭을 같은 폭으로 나누고 2px 간격과 10px 좌우 여백을 사용한다. 선택된 탭은
  `--accent` 면과 `--on-accent` 텍스트로 표시한다. 각 탭은 `role="tab"`, `aria-selected`,
  `aria-controls`로 같은 화면의 `tabpanel`과 연결한다.
- **Global Entry:** 파일을 정상적으로 읽고 계산할 수 있는 상태에서만 헤더에 `휴가 등록`을
  하나 둔다. 요약·이력·설정 탭이 바뀌어도 같은 트리거와 `Cmd/Ctrl+Shift+N` 단축키를 유지하며,
  온보딩·로딩·읽기 실패 화면에는 노출하지 않는다. 헤더에는 `휴가 등록`만 직접 보이고,
  인접한 `?` 단축키 도움말에서 플랫폼에 맞는 단축키를 항목별 한 줄로 안내한다.
- **Onboarding:** 입사일이 없으면 기본 설정과 연차 계산 이유만 보여주고 조정·데이터 섹션은
  숨긴다. 요약·이력 탭은 비활성화하고 탭 아래에 muted 안내 한 줄을 둔다. 첫 설정을 저장하면
  설정 맥락은 유지한 채 요약·이력 탭과 계산 결과, 조정·데이터 섹션을 활성화한다.

### Segmented Controls

- **Style:** `--fill` 바탕의 버튼들을 2px 간격으로 붙인다.
- **Selected:** 선택된 항목만 `--accent`와 `--on-accent`를 사용한다.
- **Use:** 휴가 단위와 이력의 리스트·달력 전환처럼 서로 배타적인 선택에 사용한다.

### Summary Rows

- **Structure:** 라벨 30px, 숫자 46px, 설명 나머지의 세 열 구조다.
- **Number:** 숫자는 오른쪽 정렬하고 600 weight와 tabular numerals를 사용한다.
- **Equation:** `잔여` 위에 `발생 − 사용 − 예정 = 잔여`를 보이고, 초과가 있으면
  `발생 − 사용 − 예정 − 초과 = 잔여`를 보인다. `예정` 행은 현재 잔여에 배정된 몫만 담고,
  등록 총량과 미래 발생분 미반영량은 각주로 분리한다.
- **Grant Rows:** 살아 있는 발생분은 `출처`, `남은 양/총량`, `소멸일 또는 소멸까지` 헤더를
  보인다. 수량 열은 68px, 소멸일 또는 D-day 열은 100px로 고정해 값의 자릿수와 상태 배지가
  바뀌어도 같은 자리에 선다. 정확한 소멸일과 D-day는 시각 텍스트와 보조 기술용 이름에 함께
  남긴다.
- **Total:** `잔여` 행 위에 `--line` hairline을 두어 앞의 값에서 계산된 결과임을 보여준다.
- **Overflow:** 살아 있는 발생분이 많아지면 발생분 목록만 최대 240px 안에서 스크롤하고, 검산과
  `휴가 등록`은 화면에 남긴다.

### Calendar Grid

- **Cell:** 48px 폭·30px 높이의 6px 모서리 버튼을 7열로 배치한다.
- **States:** 오늘은 강조색 텍스트, 선택은 강조색 면, 예정은 녹색 점, 사용은 muted 점으로
  표시한다.
- **Expiry:** 소멸일에는 danger 색상의 짧은 밑줄을 붙인다. 색만으로 의미를 전달하지 않고 날짜와
  문맥을 함께 제공한다.
- **Edit:** 선택한 기록의 종일·반차·반반차 변경은 먼저 저장 전 초안으로 보인다. 명시적인
  `저장`을 눌러야 커밋하고, `취소`는 데이터를 바꾸지 않은 채 원래 단위와 편집 위치로 돌아간다.
  저장 중에는 두 조작을 잠그며, 성공·실패 후에도 선택한 날짜와 오류 맥락을 보존한다.

### History Rows

- **List:** 예정은 위에 따로 두고, 사용 기록은 연차 연도별로 접는다. 현재 연도만 처음 펼친다.
- **Actions:** 수정·삭제는 포인터 상태와 무관하게 항상 행 안에 보이고, 자리는 미리 확보해 행이 흔들리지 않게 한다.
- **Delete:** 일반 기록과 조정 삭제는 대상 바로 아래에 삭제할까요?와 삭제·취소를 인라인으로
  표시한다. 실패하면 대상 행과 오류 맥락을 유지하고, 성공·취소 뒤에는 원래 행동 자리로 포커스를 돌린다.
- **Help:** 발생·예정·배정·초과·조정 용어 옆에는 hover·click·focus로 열고 Escape·바깥 focus로 닫히는
  물음표 설명을 둔다. 질문 버튼의 실제 hit target은 최소 24×24px이고 인접 용어의 맥락을
  시각·접근성 이름에 함께 둔다. 설명은 380px 팝오버 안에서 잘리지 않아야 한다.
- **Tag:** `예정`은 작은 4px 태그로 본문 흐름을 방해하지 않게 표시한다.

### Adjustment Rows

- **Ledger:** 조정 표도 일수·발생일·소멸일·메모·행동의 고정 열을 사용한다. 숫자와 날짜는
  tabular numerals로 정렬하고, 메모가 길면 전체 행을 밀지 않고 줄임표로 줄인다.
- **Overflow:** 조정 행이 많아지면 표 영역만 최대 240px에서 스크롤한다. 기본 설정 입력과
  데이터 행동은 스크롤 영역 밖에 남긴다.
- **Focus:** 추가·수정 폼은 일수 입력에서 시작하고, 닫히면 열었던 추가 버튼 또는 같은 행의
  수정 버튼으로 포커스를 돌린다. 삭제로 행이 사라지면 조정 추가 버튼이 다음 시작점이 된다.

### Status & Focus

- **Completion:** 등록 성공은 시트를 지연해서 보여주는 확인 화면으로 처리하지 않는다. 커밋과
  셸 상태 갱신이 끝나는 즉시 시트를 닫고, 부모 정상 화면의 `role="status"`·`aria-live="polite"`
  문구로 결과를 유지한다. 탭을 바꿔도 상태는 수명 동안 읽을 수 있다.
- **Focus Return:** 등록면의 성공·취소·Escape, 달력 초안의 저장·취소는 사용자가 시작한 실제
  전역 트리거 또는 같은 편집 위치로 포커스를 돌린다. 포인터 클릭 여부가 아니라 실제
  `document.activeElement`와 키보드 포커스 표시를 기준으로 동작을 검증한다.

## Do's and Don'ts

### Do:

- **Do** 시스템 테마의 역할별 색상 토큰을 유지한다.
- **Do** 핵심 숫자를 tabular numerals와 고정 열 폭으로 정렬한다.
- **Do** 섹션 분리에 1px hairline과 얕은 fill을 사용한다.
- **Do** 선택·실행·예정에는 Ledger Green을, 위험·소멸에는 danger를 사용한다.
- **Do** 키보드 포커스가 보이도록 2px outline을 보존한다.

### Don't:

- **Don't** 그라디언트, 글로우, 큰 장식, 과도한 카드화를 추가하지 않는다.
- **Don't** 그림자·블러·큰 모서리로 평면 팝오버를 떠 있는 대시보드처럼 만들지 않는다.
- **Don't** 새 강조색을 추가해 단일 강조색의 의미를 흐리지 않는다.
- **Don't** 숫자 중심의 작은 도구에 히어로, 브랜딩 배너, 장식용 일러스트를 넣지 않는다.
- **Don't** 한 화면의 정보 우선순위를 색상이나 장식만으로 해결하지 않는다.
- **Don't** 실제 금융 앱의 브랜드, 종이 질감, 그림자와 같은 스큐어모피즘을 복제하지 않는다.
