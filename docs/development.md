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

## 검증

```bash
pnpm verify
```

`pnpm verify`는 lint, typecheck, test를 모두 실행합니다.

## 관련 문서

- 용어와 도메인 모델: [CONTEXT.md](../CONTEXT.md)
- 설계 결정: [docs/adr](adr/)
