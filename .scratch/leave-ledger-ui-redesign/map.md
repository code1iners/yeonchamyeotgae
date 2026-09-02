# Wayfinder Map: 잔액 원장 UI 재설계

Labels: `wayfinder:map`

## Decisions-so-far

- [10. 원장형 데이터 관리와 파괴적 확인](issues/10-data-management.md): 설정의 데이터 영역을 저장 파일 확인·내보내기와 전체 교체 가져오기로 나누고, 교체 전 `data.json.bak` 백업 확인·원본 보존·대화상자 중 팝오버 유지·완료 후 상태 갱신을 제품 흐름으로 고정했다. [티켓](issues/10-data-management.md)
- [11. 첫 실행과 읽기 실패 복구](issues/11-onboarding-and-recovery.md): 입사일이 없는 동안 기본 설정만 남기고, 읽기 실패에서는 헤더·탭을 대체하는 오류별 복구 화면과 원본 보존·복구 후 재계산·포커스 복귀를 실제 Electron 제품 흐름으로 고정했다. [티켓](issues/11-onboarding-and-recovery.md)
- [12. 기존 시각 계약 제거와 공통 접근성 수축](issues/12-contract-cleanup-and-accessibility.md): 시각 호환 흔적을 제거하고 조정·이력·등록면의 내부 스크롤, 키보드 포커스 시작·복귀·순환과 상태 전달을 공통 계약으로 수축했다. 비활성·포그라운드 macOS Electron 제품 흐름을 각각 33/33으로 검증했다. [티켓](issues/12-contract-cleanup-and-accessibility.md)
