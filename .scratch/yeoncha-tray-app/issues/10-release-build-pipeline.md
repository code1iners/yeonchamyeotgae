# 10. GitHub Release 빌드 파이프라인 설계

Type: research
Status: open
Blocked by: 05

## Question

AI 에이전트가 main에 푸시하면서 macOS·Windows 실행 파일을 GitHub Release에 함께 올리려면 무엇이 필요한가?

**전제가 되는 제약**: macOS 앱은 macOS 러너에서만, Windows 앱은 Windows 러너에서만 빌드된다. 한 대에서 둘 다 뽑을 수 없다.

1. **GitHub Actions 매트릭스 구성**. `macos-latest` + `windows-latest` 두 잡에서 각각 빌드하고 아티팩트를 모아 하나의 Release에 올리는 워크플로의 모양.
2. **트리거**. main 푸시마다인가, 태그 푸시(`v*`)일 때인가? 에이전트가 어떤 행동을 하면 릴리스가 나가는지 명확해야 한다.
3. **아티팩트 형식**. macOS는 `.dmg`인가 `.zip`인가? Windows는 NSIS 설치 파일인가 portable `.exe`인가? 서명하지 않는다는 전제([02번](02-code-signing-and-smartscreen.md))가 이 선택에 영향을 주는가?
4. **Apple Silicon vs Intel**. macOS 빌드를 universal로 뽑는가, arm64만인가?
5. **서명 훅의 자리**. 지금은 켜지 않지만 나중에 인증서만 꽂으면 동작하도록, 워크플로의 어디에 무엇을 비워두는가?
6. **README 우회 안내**. macOS의 "확인 없이 열기", Windows SmartScreen의 "추가 정보 → 실행" 절차를 어떻게 안내하는가. 02번 조사 결과를 사용자용 문장으로 옮긴다.
7. **버전 관리**. 앱 버전을 어디서 읽고 Release 태그와 어떻게 맞추는가?

## 참고

- [05번 티켓](05-shell-framework-adr.md)의 결론에 따라 도구가 갈린다(electron-builder vs tauri-action). 각각의 공식 GitHub Actions 지원 현황을 1차 문서에서 확인한다.

## Comments

### 05번 결정에서 넘어온 것 (2026-08-25)

셸은 **Electron**으로 확정됐다([05번](05-shell-framework-adr.md)). 이 티켓이 받아야 할 것:

- **툴체인은 Node뿐이다.** Rust 툴체인·`cargo` 캐시가 CI에서 사라진다. `electron-builder`가
  macOS/Windows 타깃을 모두 설정한다.
- **서명을 명시적으로 꺼야 한다.** 05번 프로토타입을 로컬에서 패키징했을 때
  `electron-builder`가 키체인의 `Apple Development` 인증서를 찾아 **묻지 않고 자동 서명했다.**
  [02번](02-code-signing-and-smartscreen.md) 결정은 "서명하지 않는다"이므로 `mac.identity: null`로
  껐다는 걸 명시해야 한다. 그러지 않으면 러너의 키체인 상태에 따라 산출물이 달라진다.
  02번이 말한 "서명 훅 자리를 비워둔다"는 것의 실제 구현이 이것이다.
- **macOS 아키텍처를 정해야 한다.** arm64 단일 빌드의 `.app`이 286MB, DMG가 120.8MB다.
  universal(arm64 + x64)로 뽑으면 대략 두 배가 된다. 선택지: universal 하나 / arm64·x64
  DMG 두 개 / arm64만. **이 티켓에서 결정해야 한다.**
- **출력 경로가 vite 출력과 충돌하지 않게 해야 한다.** 프로토타입에서 둘 다 `dist/`를 써서
  asar가 자기 자신을 삼켜 320MB가 됐다. `directories.output`을 분리한다.

### 09번 결정에서 넘어온 것 (2026-08-26)

[09번](09-project-structure.md)이 툴체인 전체를 확정했다. 이 티켓이 받아야 할 것들이다.

- **워크플로가 부를 명령은 두 개다**: `pnpm verify`(lint·typecheck·test)와 `pnpm build`
  (= `turbo run build`). 후자가 이미 lint·typecheck·코어 테스트를 `dependsOn`으로 물고 있어
  **검증이 통과하지 못하면 산출물이 만들어지지 않는다.** 워크플로에서 검증을 따로 앞세울지,
  `pnpm build` 하나에 맡길지는 이 티켓의 판단이다.
- **turbo 캐시는 git 저장소가 있어야 동작한다.** `actions/checkout`의 기본 `fetch-depth: 1`에서
  turbo가 캐시를 제대로 쓰는지 확인해야 한다. 원격 캐시는 켜지 않는다(개인 도구).
- **TypeScript 7은 플랫폼별 바이너리다.** `@typescript/typescript-win32-x64`가 lockfile에
  들어 있어야 `windows-latest` 잡에서 `typecheck`가 돈다. `esbuild`·`electron`도 마찬가지다.
  `pnpm install --frozen-lockfile`이 러너별로 성공하는지가 실제 확인 지점이다.
- **`pnpm-workspace.yaml`의 `allowBuilds`에 `electron`과 `esbuild`가 있어야 한다.**
  빠지면 CI에서 `ERR_PNPM_IGNORED_BUILDS`로 설치가 실패한다.
- **`minimumReleaseAge` 공급망 정책이 CI에서도 적용된다.** 갓 릴리스된 버전이 lockfile에 들어가면
  러너에서 설치가 거부된다. 의존성 갱신 시 `minimumReleaseAgeExclude`를 함께 손봐야 한다.
- **Node는 24 LTS(Krypton)다.** `actions/setup-node`의 `node-version`을 여기 맞춘다.
  Node 26은 `Temporal`이 네이티브지만 09번이 폴리필을 쓰기로 해 이유가 사라졌다.
- **빌드 도구는 `electron-vite` 5 + Vite 7이다.** 출력이 `out/`이고 `electron-builder`의
  `directories.output`은 그와 겹치지 않게 `release/`로 둔다(프로토타입에서 둘 다 `dist/`를 써
  asar가 자기 자신을 삼킨 사고의 대응).
- **09번이 실행하지 못한 것**: `electron-vite` 통합 자체와 Windows. 이 티켓이 CI에서 처음
  확인하게 된다.
