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
    textColor: "{colors.accent}"
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
구성과 주요 행동 위치를 후속 화면에서도 유지한다.

## Colors

색상은 따뜻한 중립에 가까운 종이색(`#f7f8f6`)과 짙은 흑연 잉크(`#202522`)를 바탕으로 하며,
테마에 따라 같은 역할의 명도가 바뀐다. 승인된 방향의 원장 녹색(`#1d6b52`)은 선택·실행·예정
상태에만 쓰고, 빨강은 위험과 소멸처럼 손실을 알려야 하는 순간에만 쓴다.

### Primary

- **Ledger Green** (`--accent`): 선택된 탭, 주요 버튼, 현재 날짜, 예정 표시처럼 사용자가 지금
  보거나 실행해야 하는 상태를 표시한다. 다크 테마에서는 `--accent-dark`를 따른다.
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
목록만 별도 스크롤한다.

기본 좌우 여백은 12px이고, 행은 약 25px 리듬으로 세운다. 간격은 2px·4px·6px·8px·10px·12px
단계를 사용한다. 주요 행은 `padding: 4px 12px`, 팝오버 본문은 위아래 4px·8px 여백을 사용하며,
버튼과 세그먼트는 2px 간격으로 붙인다.

달력은 7열 × 48px 셀을 중심으로 배치한다. 이 그리드가 380px 팝오버 안에서 날짜를 충분히
읽게 하는 고정 기준이다. 이력 리스트만 최대 356px 높이에서 스크롤하고, 나머지 화면은 내용에
따라 팝오버 높이가 변한다. 별도의 모바일 브레이크포인트나 반응형 재배치는 현재 시스템에 없다.

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
- **Hover / Focus:** hover는 `--hover` 또는 primary의 밝기 변화만 사용하고, 키보드 포커스는
  강조색 2px outline을 유지한다. 비활성은 opacity 0.4다.

### Inputs / Fields

- **Style:** `--field` 배경, `--line-strong` 1px 테두리, 6px 모서리, `3px 6px` 패딩.
- **Field Row:** 라벨은 68px 폭으로 고정하고 입력은 남은 폭을 채운다.
- **Focus:** 강조색 2px outline을 안쪽으로 둔다(`outline-offset: -1px`).
- **Error:** 오류 텍스트는 danger 색상과 11.5px 보조 크기로 입력 아래에 놓는다.

### Navigation

- **Tabs:** 세 탭을 같은 폭으로 나누고 2px 간격과 10px 좌우 여백을 사용한다. 선택된 탭은
  `--accent` 면과 `--on-accent` 텍스트로 표시한다. 각 탭은 `role="tab"`, `aria-selected`,
  `aria-controls`로 같은 화면의 `tabpanel`과 연결한다.
- **Onboarding:** 입사일이 없으면 설정만 활성화하고, 탭 아래에 muted 안내 한 줄을 둔다.

### Segmented Controls

- **Style:** `--fill` 바탕의 버튼들을 2px 간격으로 붙인다.
- **Selected:** 선택된 항목만 `--accent`와 `--on-accent`를 사용한다.
- **Use:** 휴가 단위와 이력의 리스트·달력 전환처럼 서로 배타적인 선택에 사용한다.

### Summary Rows

- **Structure:** 라벨 30px, 숫자 46px, 설명 나머지의 세 열 구조다.
- **Number:** 숫자는 오른쪽 정렬하고 600 weight와 tabular numerals를 사용한다.
- **Total:** `잔여` 행 위에 `--line` hairline을 두어 앞의 값에서 계산된 결과임을 보여준다.

### Calendar Grid

- **Cell:** 48px 폭·30px 높이의 6px 모서리 버튼을 7열로 배치한다.
- **States:** 오늘은 강조색 텍스트, 선택은 강조색 면, 예정은 녹색 점, 사용은 muted 점으로
  표시한다.
- **Expiry:** 소멸일에는 danger 색상의 짧은 밑줄을 붙인다. 색만으로 의미를 전달하지 않고 날짜와
  문맥을 함께 제공한다.

### History Rows

- **List:** 예정은 위에 따로 두고, 사용 기록은 연차 연도별로 접는다. 현재 연도만 처음 펼친다.
- **Actions:** 수정·삭제는 포인터 hover 또는 키보드 포커스에서 나타나며, 자리는 미리 확보해 행이 흔들리지 않게 한다.
- **Tag:** `예정`은 작은 4px 태그로 본문 흐름을 방해하지 않게 표시한다.

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
