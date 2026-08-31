# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

한국 근로기준법상 연차 유급휴가를 개인적으로 추적해야 하는 직장인. 사용자는 회사 그룹웨어에
로그인하지 않고도 현재 잔여를 알고, 발생분과 휴가 기록을 직접 대조할 수 있어야 한다.

## Product Purpose

연차 유급휴가가 언제 몇 개 생기고, 얼마나 남았고, 언제 소멸하는지를 개인이 추적하게 한다.
앱은 macOS 메뉴 막대와 Windows 시스템 트레이에 잔여를 숫자로 상시 표시하며, 사용자가 앱을
열지 않고도 현재 잔여를 알아보는 것을 성공으로 삼는다.

## Positioning

잔여를 트레이에 숫자 하나로 상시 표시해, 그룹웨어에 로그인하거나 별도 창을 찾지 않고도 확인할
수 있게 하는 개인용 도구다. 데이터는 사용자 기기의 로컬 파일 하나에만 저장하며 계정·서버·동기화
없이 동작한다.

## Operating Context

- 앱은 상주하며 macOS 메뉴 막대 또는 Windows 시스템 트레이에서 동작한다. macOS에서는 Dock을
  차지하지 않는다.
- 트레이 숫자를 누르면 380px 팝오버가 열리고, `요약`·`이력`·`설정` 탭을 제공한다. 입사일이
  없으면 첫 실행 시 설정 화면을 연다.
- `요약`에서는 `발생`·`사용`·`예정`·`잔여`와 살아 있는 발생분 및 소멸 임박 정보를 확인한다.
  `이력`에서는 휴가 이력을 보고, `설정`에서는 입사일·기준방식·조정을 관리한다.
- 데이터는 Electron의 사용자 데이터 경로에 있는 JSON (JavaScript Object Notation: 구조화된
  텍스트 형식) 파일 하나에 저장한다. 사용자는 저장 파일의 위치를 열거나 파일을 내보내고
  가져올 수 있다.
- 잔여 계산의 오늘은 `Asia/Seoul` 기준이다. 앱을 켜 둔 채 날짜가 바뀌거나 절전에서 복귀해도
  상태를 다시 계산한다.

## Capabilities and Constraints

- 발생은 `월차`·`연차`·`조정` 레코드로 표현하며, 각각의 `발생일`과 `소멸일`을 보존한다.
  `휴가 기록`은 날짜별 한 건이고 `종일`·`반차`·`반반차`를 지원한다.
- `예정`도 잔여에서 차감한다. 발생분에 대한 `배정`은 조회 시 계산하며, 배정되지 못한 기록은
  `초과`로 잔여에 반영한다.
- 기간으로 휴가를 등록할 수 있고, 주말 제외·메모·기존 기록 수정·예정 삭제를 지원한다.
- 데이터 파일을 읽지 못하면 원본을 덮어쓰지 않는다. 백업 복구와 가져오기 전 백업을 제공하며,
  더 새 버전의 저장 형식은 임의로 변경하지 않는다.
- 계산 엔진은 플랫폼과 입출력을 모르는 순수 TypeScript 패키지이고, 셸은 Electron·React로
  구현한다. 코어 계산은 향후 PWA (Progressive Web App: 설치형 웹 앱)에서도 재사용할 수 있어야
  한다.
- 배포 대상은 macOS Apple Silicon용 DMG와 Windows x64용 설치 파일이며 GitHub Release에서
  제공한다. 첫 버전은 코드 서명·공증과 자동 업데이트를 제공하지 않고 수동 설치·업데이트를
  안내한다.
- 회사 시스템 연동, 팀 공유, 서버 백엔드, 다중 사용자, 클라우드 동기화, 캘린더 연동, 소멸
  알림, 결근일·출근율 판정, 퇴직 정산은 제품 범위에 포함하지 않는다. 로컬 파일 내보내기와
  가져오기는 포함한다.
- 용어는 저장소의 [`CONTEXT.md`](../../CONTEXT.md)를 유일한 출처로 삼는다. 특히 `연차`는
  넓은 제품 개념과 `source: 'annual'` 발생 종류를 문맥에 따라 구분한다.

## Brand Commitments

- 제품 이름은 `연차몇개`다.
- 제품과 화면의 핵심 용어는 [`CONTEXT.md`](../../CONTEXT.md)의 한국어 용어를 그대로 사용한다.

## Evidence on Hand

- 제품 목적·설치·업데이트·개발 진입점: [`README.md`](../../README.md)
- 도메인 용어: [`CONTEXT.md`](../../CONTEXT.md)
- 첫 버전 기능·범위·배포 계약: [`.scratch/yeoncha-tray-app/spec.md`](../../.scratch/yeoncha-tray-app/spec.md)
- Electron 셸과 날짜 처리 결정: [`docs/adr/0001-electron-as-shell-framework.md`](../../docs/adr/0001-electron-as-shell-framework.md),
  [`docs/adr/0002-temporal-plaindate-for-dates.md`](../../docs/adr/0002-temporal-plaindate-for-dates.md)
- 현재 구현: `apps/desktop/src/main/`, `apps/desktop/src/preload/`,
  `apps/desktop/src/renderer/src/`
- 배포 아이콘 원본과 파생 자산: `apps/desktop/build/icon-512.png`,
  `apps/desktop/build/icon.icns`, `apps/desktop/build/icon.ico`
- 외부 고객 사례·추천사·정량 성과 자료는 현재 저장소에 없다. 이후 작업에서 이를 만들어내지
  않는다.

## Product Principles

1. 잔여는 앱을 열지 않아도 항상 보여야 한다.
2. 발생분의 소멸일과 휴가 기록의 날짜를 보존해 사용자가 무엇이 먼저 사라지는지 이해할 수 있어야
   한다.
3. 계산이 만든 발생과 사용자가 입력한 조정을 분리해, 잔여의 이유를 추적할 수 있어야 한다.
4. 예정 휴가를 포함한 실제 잔여를 계산해 낙관적인 숫자를 보여주지 않는다.
5. 기능은 잔여의 정확성을 높이는지 검토하며, 단순함을 해치는 기능은 추가하지 않는다.
