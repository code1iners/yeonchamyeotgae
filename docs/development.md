# 개발 안내

이 문서는 연차몇개를 로컬에서 실행하고 검증하는 방법을 설명합니다.

## 사전 요구 사항

- Node.js 24 이상
- `package.json`에 고정된 pnpm 11.24.0

## 설치와 실행

```bash
pnpm install
pnpm dev
```

`pnpm dev`는 데스크톱 앱을 개발 모드로 실행합니다.

## 검증 실행선

실행 정책의 권위 문서는 [데스크톱 테스트 실행선 스펙](../.scratch/desktop-test-execution/spec.md)입니다.
로컬에서 선택할 명령은 다음 네 가지입니다.

```bash
pnpm verify
pnpm test:product
pnpm test:product:foreground
pnpm verify:product
```

CI (Continuous Integration: 커밋마다 자동으로 검사하는 통합 검증)·릴리스와 실제 운영체제 수용
검증의 경계는 위 스펙을 참조합니다.

macOS는 전체 제품 흐름과 Apple Silicon DMG를 검증·패키징합니다. 릴리스의 Windows x64 NSIS
패키지는 Windows 러너에서 기본 검증 후 패키징하며, 실제 Windows 트레이·포커스 수용 검증은
별도 경계입니다. 지원 범위 변경은 [ADR-0004](adr/0004-windows-release-resumption.md)에
기록했습니다.

훅 자체의 청결성·실행 순서·실패 경로를 실제 push 없이 확인하려면 다음 명령을 실행합니다.

```bash
pnpm test:hooks
```

## 관련 문서

- 용어와 도메인 모델: [CONTEXT.md](../CONTEXT.md)
- 설계 결정: [docs/adr](adr/)
