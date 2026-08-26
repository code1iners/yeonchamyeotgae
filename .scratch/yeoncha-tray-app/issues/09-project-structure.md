# 09. 프로젝트 구조와 날짜 라이브러리 결정

Type: grilling
Status: resolved
Blocked by: 05

## Question

빈 저장소에 무엇을 어떻게 깔 것인가? 구현 에이전트가 스캐폴딩을 시작할 수 있을 만큼 구체적이어야 한다.

1. **모노레포 여부**. 코어를 별도 패키지로 뗀다는 게 전제이므로 pnpm workspace로 `packages/core` + `apps/desktop` 구조가 자연스럽다. 하지만 v1에 앱이 하나뿐인데 워크스페이스가 값을 하는가? 아니면 단일 패키지 안의 디렉터리 분리로 충분한가? 판단 기준은 **v2 PWA가 이 코어를 실제로 가져다 쓸 때의 마찰**이다.
2. **날짜 라이브러리**. 연차 계산은 전부 날짜 산술이고, "1개월 개근", "366일째", "회기 경계" 같은 게 전부 함정이다. Temporal(Stage 3, 폴리필 필요) / date-fns / dayjs 중 무엇인가? 시간대는 고정(KST)인가 사용자 로컬인가?
3. **빌드 도구**. Vite 전제. 코어 패키지는 어떤 형태로 빌드되는가(ESM only? 타입 선언 생성?).
4. **테스트 러너**. Vitest 전제인가? 코어의 순수성 덕분에 테스트가 쉬워야 하는데 실제로 그런가?
5. **린트·포맷·타입체크**. 구현 에이전트가 검증할 명령어 셋을 정한다.
6. **패키지 매니저**. pnpm / npm / bun.

## 참고

- [05번 티켓](05-shell-framework-adr.md)의 결론(Tauri or Electron)에 따라 `apps/desktop`의 모양이 갈린다.
- `codebase-design` Skill이 코어 패키지의 인터페이스를 깊은 모듈로 설계하는 데 도움이 된다.

## Comments

### 05번 결정에서 넘어온 것 (2026-08-25)

셸은 **Electron**으로 확정됐다([05번](05-shell-framework-adr.md)). Q1(모노레포 여부)에
들어가는 사실 하나: 프로토타입에서 **렌더러가 트레이 아이콘 이미지를 그렸다**.
canvas는 렌더러에만 있으므로, Windows에서 트레이 숫자를 띄우는 경로가
`renderer → IPC → main`을 반드시 지난다. 즉 main·preload·renderer 셋이 같은 타입을 공유해야
하고, 이게 구조 결정의 실제 압력이다. 프로토타입의 최소 구성은
`main.js` + `preload.js` + `renderer/`(Vite root) + `vite.config.mjs`였다.

### 06번 결정에서 넘어온 것 (2026-08-25)

[06번](06-tray-display-spec.md)이 코어와 셸의 경계를 한 군데 못박았다. Q1(모노레포 여부)에
직접 걸린다.

- **코어가 순수 함수 `formatTrayLabel(balance, { maxGlyphs })`를 내보낸다.** macOS는 잔여를
  그대로 띄우고 Windows는 내림 정수만 띄우는 비대칭을, 셸의 `if (isMac)` 분기가 아니라
  코어에 넘기는 **예산 파라미터**로 표현하기로 했다. 플랫폼 지식은 셸의 상수
  두 개(`Infinity` / `3`)로 줄고 표기 규칙은 코어 한 곳에만 산다. v2 PWA가 자기 예산으로
  같은 함수를 쓴다. **즉 코어에 표시 계층이 하나 있다** — 순수 계산만 있는 게 아니다.
- **코어는 "오늘"을 스스로 읽지 않고 인자로 받아야 한다.** 06번 Q5가 자정·절전 복귀·
  시각 변경에서 재계산하기로 했는데, 코어가 내부에서 `new Date()`를 부르면 그 트리거들이
  아무 효과가 없고 테스트도 못 한다. Q2(날짜 라이브러리)와 Q4(테스트 러너)에 같이 걸린다.
- 렌더링(`setTitle` 대 정사각 canvas)은 셸의 몫이다. 코어는 문자열까지만 만든다.

## Answer

### 0. 한 줄 요약

**pnpm workspace + Turborepo, 패키지 둘(`packages/core` + `apps/desktop`), 코어는 빌드하지 않고 TypeScript 소스 그대로 소비한다. 날짜는 `Temporal.PlainDate`(`temporal-polyfill`)이고 "오늘"은 고정 `Asia/Seoul`이다. 검증은 `pnpm verify` 하나이며, `turbo run build`는 lint·typecheck·코어 테스트를 전부 통과해야 산출물을 낸다.**

| | 결정 |
|---|---|
| 저장소 | 같은 저장소. v2 PWA는 나중에 `apps/web`으로 붙는다 |
| 구조 | pnpm workspace + Turborepo. 패키지는 v1에 **정확히 둘** |
| 코어 소비 | **Just-in-Time** — `exports`가 `./src/index.ts`. `dist` 없음, 빌드 스크립트 없음 |
| 날짜 | **Temporal**, `temporal-polyfill` 1.0.4를 코어의 정식 `dependencies`로 |
| 시간대 | **고정 `Asia/Seoul`**. 셸이 `Temporal.Now.plainDateISO('Asia/Seoul')`로 만들어 코어에 넘긴다 |
| 셸 빌드 | `electron-vite` 5.0.0 + Vite 7 + `@vitejs/plugin-react` 5.2.0 |
| 테스트 | Vitest 4. **코어만** 테스트한다 |
| 린트·포맷 | Biome 2.5 하나 |
| 타입체크 | TypeScript 7.0.2 (네이티브 Go 컴파일러) |
| 매니저·런타임 | pnpm 11 + Node 24 LTS(Krypton) |

### 1. 왜 워크스페이스인가 — 경계가 규율이 아니라 의존성 목록이다

단일 패키지 안의 `src/core/` 디렉터리 분리를 기각한 근거는 "패키지가 여러 개니까"가 아니다. **경계를 무엇이 지키는가**다.

실제 워크스페이스를 만들어 확인했다.

- `packages/core`가 `electron`을 import하면 → `TS2307: Cannot find module 'electron'`
- `apps/desktop`이 `temporal-polyfill`을 자기 `dependencies`에 선언하지 않고 import하면 → 같은 오류
- 선언하면 통과한다

단일 패키지에서는 `src/core/accrual.ts`가 `electron`을 import해도 **아무 일도 일어나지 않는다.** 그 대가는 v1이 아니라 v2에서 치른다. 확정 전제("코어는 브라우저·Node·웹뷰 어디서든 동작해야 한다")를 지키는 것이 사람의 기억이 아니라 pnpm의 엄격한 `node_modules`가 된다.

[05번](05-shell-framework-adr.md)이 남긴 "main·preload·renderer가 같은 타입을 공유해야 한다"는 압력은 **이것과 다른 문제다.** 셋은 전부 `apps/desktop` 한 패키지 안의 `src/main` / `src/preload` / `src/renderer`이고, 그건 워크스페이스가 아니라 `electron-vite`가 푼다.

### 2. 코어를 빌드하지 않는다 (Just-in-Time)

`packages/core/package.json`의 `exports`가 `./src/index.ts`를 직접 가리킨다. 빌드 스크립트도 `dist`도 없다. 소비자(Vite / Next.js)가 컴파일한다. Turborepo 문서의 세 가지 packaging strategy 중 **Just-in-Time Package**이고, 문서가 제시한 적용 조건 셋에 전부 해당한다 — 앱이 현대 번들러(Vite)로 빌드되고, 설정을 피하고 싶고, 그 패키지를 캐시 못 해도 빌드 시간에 만족한다.

`"@yeoncha/core": "workspace:*"`는 이 선택과 **무관하게** 소비자에 들어간다. 그 줄은 "어느 패키지를 연결하는가"(pnpm의 몫)이고, `exports`는 "그 패키지의 어느 파일을 읽는가"(번들러·tsc의 몫)다. Turborepo 문서도 같은 순서다 — 먼저 `workspace:*`를 넣고, 그 다음 packaging strategy를 고른다.

**`apps/web`이 추가되는 것은 이 결정을 흔들지 않는다. 더 세게 만든다.**

1. Next.js 16.3.3에 `transpilePackages`가 있다(확인함). `apps/web/next.config.ts`에 한 줄이면 된다.
2. 빌드 산출물을 두면 "코어를 고쳤는데 다시 빌드하지 않아 앱이 옛 코드를 본다"는 함정이 생긴다. **오류가 나지 않고 숫자만 틀린다.** 이 앱에서 그건 곧 **잔여**가 틀린다는 뜻이고, 제품 전체가 그 숫자 하나다. 앱이 둘이면 함정이 두 곳이 된다.
3. 컴파일 대상이 앱마다 다르다. `apps/desktop`은 Chromium 152 + Node 24, `apps/web`은 여러 브라우저다. Just-in-Time에서는 각 앱이 자기 대상에 맞춰 컴파일한다. 빌드 산출물을 두면 코어가 대상 하나를 미리 골라야 하고, 그 하나는 어느 쪽에도 딱 맞지 않는다.

빌드 산출물이 필요해지는 경우는 **코어가 이 저장소 밖으로 나갈 때(npm 퍼블리시)** 하나뿐인데, 같은 저장소로 정했으므로 그 경우가 없다. **되돌리기도 싸다** — `packages/core`에 빌드 스크립트를 넣고 `exports`를 `dist`로 바꾸는 두 군데다. 구조를 바꾸지 않는다.

Turborepo 문서가 밝힌 Just-in-Time의 대가 셋과 우리 경우:

| 대가 | 우리에게 |
|---|---|
| `compilerOptions.paths`를 못 쓴다 (Node subpath imports를 쓰라) | 무해. 코어에 경로 별칭을 쓸 이유가 없다 |
| turbo가 그 패키지의 `build`를 캐시 못 한다 | 캐시할 `build`가 없다. turbo는 `lint`·`typecheck`·`test`를 캐시한다 |
| 코어의 타입 오류가 앱 빌드에서 보고된다 | 패키지 2개짜리에선 오히려 편하다 |

### 3. 날짜는 Temporal이다

**환경 사실** (MDN browser-compat-data 기준):

| 런타임 | `Temporal` 네이티브 |
|---|---|
| Chrome / Edge **144+** (플래그 없음, standard-track) | 있음 |
| Firefox 139+ / Deno 2.7+ | 있음 |
| **Electron 44 = Chromium 152** | **있음** (렌더러) |
| **Electron 44의 Node 24.18.1** | **없음** (메인 프로세스) |
| Node **26.0.0+** | 있음. 단 Node 26은 아직 LTS가 아니다 |
| Node 24 LTS (Vitest가 도는 곳) | **없음** |

그래서 **`temporal-polyfill`을 코어의 정식 `dependencies`로 두고, 네이티브가 있는 렌더러에서도 폴리필을 쓴다.** 명명 import(`import { Temporal } from 'temporal-polyfill'`)면 Node 24·Chromium 152·미래의 v2 브라우저에서 **동작이 완전히 같고 환경 분기가 0**이다. 실측 크기는 **56KB min / 19.8KB gzip**이고, DMG 120.8MB짜리 앱에서 반올림 오차다.

**date-fns·dayjs를 기각한 이유는 크기가 아니라 타입이다.** 둘 다 `Date` 위에서 도는데 `Date`는 시각과 시간대를 반드시 끌고 들어온다 — `new Date('2026-01-01')`은 UTC 자정이고 음수 오프셋 지역에서 `getDate()`가 전날을 준다. 우리 도메인엔 시각이 하나도 없다. [`CONTEXT.md`](../../../CONTEXT.md)의 날짜 용어(**발생일**, **소멸일**)가 전부 "날"이고, [08번](08-storage-format.md)이 저장 형식을 `YYYY-MM-DD` 문자열로 정했으므로 `PlainDate.from(문자열)` / `.toString()`이 **저장 포맷과 1:1**이다.

`Temporal.PlainDate`를 [04번](04-accrual-rule-spec.md) 사양에 직접 돌려 확인했다. **예외 코드 0줄이다.**

| 04번이 요구한 것 | Temporal 표현 | 결과 |
|---|---|---|
| 월말 클램프 (케이스 M, 2024-01-31 입사) | `hireDate.add({ months: n })` | `2024-02-29 → 03-31 → 04-30 → 05-31` ✓ |
| 같은 케이스의 월차 소멸일 | `.add({years:1}).subtract({days:1})` | `2025-01-30` ✓ |
| 같은 케이스의 연차 발생일 | `.add({ years: 1 })` | `2025-01-31` ✓ |
| `+1년 −1일`이 윤년에서 어긋나지 않을 것 | 같은 식 | 2024년 366일 / 2023년 365일 ✓ |
| 완성 개월 수 (2024-07-15 → 12-31 = 5) | `.until(d, { largestUnit: 'month' }).months` | `5` ✓ |
| [07번](07-popover-ui-spec.md) 달력 격자 | `.dayOfWeek` / `.daysInMonth` / `.add({months:1})` | `6` / `31` ✓ |

**07번의 달력 격자는 코어의 seam이 아니다.** `PlainDate`가 직접 주므로 코어에 함수를 만들 이유가 없다.

### 4. "오늘"은 고정 `Asia/Seoul`이다

[06번](06-tray-display-spec.md)이 "코어는 오늘을 인자로 받는다"까지 정했지만 **셸이 그 값을 무엇으로 만드는지**는 열려 있었다. 시스템 로컬 시간대를 기각하고 **고정 KST**로 정했다.

- 연차는 회사의 날짜 개념이고 회사는 KST에 산다. 소멸일이 지났는지는 사용자가 어디에 있든 KST로 판정되어야 한다.
- 더 센 이유는 **v1과 v2가 같은 파일에서 같은 숫자를 내야 한다**는 것이다. 로컬 시간대를 쓰면 해외에 있는 폰의 PWA와 집의 데스크톱이 하루 다른 **잔여**를 띄우고, 그게 하필 07번이 정한 소멸 인지 경로 두 개 중 하나(발생분 행의 D-day)에서 갈린다.
- 셸 코드로는 `Temporal.Now.plainDateISO('Asia/Seoul')` 한 줄이다. 06번의 자정 재계산 타이머도 KST 자정에 건다.
- **설정값으로 빼지 않는다.** 확정 전제("진짜 단순한 앱")를 통과하지 못한다.

되돌리기 쉬운 결정이다 — 셸의 한 줄이다.

### 5. 셸 빌드는 `electron-vite` 5 + Vite 7

버전 지형이 갈랐다.

- Vite 8이 `latest`인데 **`electron-vite` stable 5.0.0은 Vite 5~7까지**다. Vite 8은 **6.0.0-beta.1**에만 있다.
- `@vitejs/plugin-react`는 6.x가 Vite 8 전용이고, **5.2.0이 Vite 4~8 전부**를 받는다.

Vite 8이 우리에게 주는 것이 없다 — 프로토타입의 `vite.config.mjs`는 6줄이었고 Vite 8 전용 기능을 하나도 쓰지 않는다. 그 0의 대가로 베타 위에 구현 에이전트를 올릴 이유가 없다.

`electron-vite`를 아예 빼고 Vite(렌더러) + esbuild(main·preload)를 직접 엮는 안도 검토했다. esbuild가 main을 10ms에 번들하는 것은 확인했지만, 진짜 비용은 빌드가 아니라 **개발 루프**다 — dev 서버 + main watch + 변경 시 electron 재기동, 그리고 렌더러가 dev에서는 `http://localhost`·프로덕션에서는 `file://` + `base: './'`인 분기를 손으로 짜야 한다. `electron-vite`는 정확히 그 셋을 위해 존재한다.

**반드시 스펙에 박아야 하는 함정**: `electron-vite`의 `externalizeDepsPlugin`은 `dependencies`를 전부 external로 빼는데, `@yeoncha/core`는 2절에 따라 **TypeScript 소스**라 런타임에 `require`할 수 없다. `externalizeDepsPlugin({ exclude: ['@yeoncha/core'] })`로 번들에 포함시켜야 한다. **개발 중에는 보이지 않고 패키징된 앱만 실행 시점에 깨진다.**

### 6. 테스트: Vitest 4, 코어만, seam 셋

지도의 "테스트 전략" 안개가 여기서 걷힌다. seam은 셋이다.

| seam | 출처 | 테스트가 고정하는 것 |
|---|---|---|
| **계산** `(hireDate, grantBasis, entries, adjustments, today) → 발생 목록 + 잔여` | [04번](04-accrual-rule-spec.md) | 검증 케이스 14건이 이 경계에 그대로 앉는다. `today`가 인자라 날짜 경계가 전부 표로 표현된다 |
| **표시** `formatTrayLabel(balance, { maxGlyphs })` | [06번](06-tray-display-spec.md) | `Math.floor` 대 `Math.trunc`가 `-0.25`에서 갈리는 것 |
| **직렬화** `parse` / `serialize` | [08번](08-storage-format.md) | 미래 `schemaVersion` 거부 |

**셸(`apps/desktop`)은 v1에서 자동 테스트하지 않는다.** 트레이·IPC·파일 I/O는 05번 프로토타입이 실측으로 확인했고, Electron 통합 테스트 하네스는 사용자 1명짜리 도구에서 값을 못 한다.

실제로 돌려 확인했다 — 06번 사양 3건 + 04번 케이스 M 1건, **4 tests passed (2ms)**.

### 7. `turbo.json`과 검증 명령어

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "lint": { "dependsOn": [] },
    "typecheck": { "dependsOn": ["^typecheck"] },
    "test": { "dependsOn": [] },
    "build": { "dependsOn": ["lint", "typecheck", "^test"], "outputs": ["out/**"] }
  }
}
```

```json
"scripts": {
  "verify":    "turbo run lint typecheck test",
  "build":     "turbo run build",
  "format":    "biome check --write .",
  "lint":      "turbo run lint",
  "typecheck": "turbo run typecheck",
  "test":      "turbo run test"
}
```

**`lint`를 turbo 태스크로 둔 근거는 실측이다.** 처음에는 "Biome이 12파일을 2ms에 보므로 루트에서 한 번 돌리고 turbo로 감싸지 말자"고 판단했는데, 재보니 반대였다.

| | 콜드 | 웜 |
|---|---|---|
| `biome check . && turbo run typecheck test` | 1.21s | 0.09s |
| `turbo run lint typecheck test` | 1.19s | **0.04s** |

콜드는 같고 **웜은 후자가 빠르다.** 루트 Biome은 매번 전체를 다시 훑지만 패키지 태스크가 되면 turbo가 lint 결과도 캐시해 안 바뀐 패키지를 아예 건너뛴다. 패키지별 `biome check .`가 루트 `biome.json`을 제대로 찾는 것도 확인했다.

**`build`가 `lint`·`typecheck`·`^test`에 의존한다.** 린트가 깨진 코드로 바이너리가 나가지 않는다. 실제로 코어에 `let x = 1`을 심으니 `@yeoncha/core#lint`가 실패하고 `@yeoncha/desktop#build`는 실행되지 않았으며 `out/main.js`도 생기지 않았다. `^test`를 넣은 이유는 lint로 막기로 한 이상 **테스트로 막지 않을 이유가 없기** 때문이다 — 04번의 검증 케이스가 깨진 채 나가는 것이 `let`을 `const`로 못 쓴 것보다 훨씬 나쁘고, 이 앱은 **잔여**라는 숫자 하나가 제품 전부다. 코어 테스트는 94ms라 비용도 없다.

`^typecheck`는 `build`의 `dependsOn`에서 뺐다. `build`가 자기 패키지의 `typecheck`에 의존하고 그 `typecheck`가 이미 `^typecheck`에 의존하므로 중복이다.

`format`만 Biome을 직접 부른다. 파일을 고치는 명령이라 캐시가 의미 없고, 캐시하면 오히려 해롭다.

**대가 하나**: 이제 쉼표 하나 때문에 `pnpm build`가 멈춘다. 대응은 `pnpm format`이고, Biome의 지적은 거의 다 `FIXABLE`이라 `--write`가 자동으로 고친다.

**실측**

| 상황 | 결과 |
|---|---|
| `pnpm verify` 콜드 | 1.19s |
| `pnpm verify` 웜 | **0.49s** — `Cached: 3 cached, 3 total >>> FULL TURBO` |
| **셸만** 고쳤을 때 | 코어 태스크 캐시 히트, 셸만 재실행 — 518ms |
| **코어를** 고쳤을 때 | 셸까지 전부 무효화 — 1.09s |
| `turbo run build` (전부 통과) | 6태스크 1.98s, `out/main.js` 181KB |

마지막 두 줄이 이 저장소에서 Turborepo가 하는 일 전부다.

### 8. 스캐폴딩이 만들 트리

```
├── package.json            ← verify/build/format/lint/typecheck/test, packageManager, engines
├── pnpm-workspace.yaml     ← packages/* apps/*, allowBuilds(electron·esbuild)
├── turbo.json
├── biome.json              ← vcs.useIgnoreFile: true
├── tsconfig.base.json
├── .gitignore              ← node_modules/ out/ dist/ .turbo/ release/
├── packages/core/          ← @yeoncha/core   (dependencies: temporal-polyfill 만)
│   ├── package.json        ← exports: { ".": "./src/index.ts" }, 빌드 스크립트 없음
│   └── src/
└── apps/desktop/           ← @yeoncha/desktop (@yeoncha/core, electron, react, electron-vite)
    └── src/{main,preload,renderer}/
```

`tsconfig.base.json`의 검증된 설정:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`noUncheckedIndexedAccess`를 켠 이유가 있다 — 04번의 **배정** 알고리즘이 **발생** 배열을 소멸 임박 순으로 훑으며 인덱싱하는 코드이고, 07번의 달력 격자도 배열 인덱싱이다. 이 앱에서 배열 접근이 곧 도메인 로직이다.

`@yeoncha` 스코프는 퍼블리시하지 않으므로 등록이 필요 없다.

**코어가 내보내는 이름.** [`CONTEXT.md`](../../../CONTEXT.md)의 용어를 그대로 쓴다.

| 내보내기 | 출처 | 하는 일 |
|---|---|---|
| `computeGrants` | 04번 | 입사일·기준방식·조정 → **발생** 레코드 목록 |
| `allocate` | 04번 | **휴가 기록**을 발생분에 **배정**, **초과**를 남김 |
| `computeBalance` | 04번 | 오늘 기준 **잔여** |
| `formatTrayLabel` | 06번 | 잔여 + 글리프 예산 → 트레이 문자열 |
| `parse` / `serialize` | 08번 | 저장 파일 구조 판정과 직렬화 |

함수의 **정확한 시그니처는 여기서 정하지 않는다.** 그건 구현의 몫이고, 04번이 정한 규칙과 어긋나면 04번을 다시 여는 신호다. 여기서 정하는 건 어떤 이름이 코어 밖으로 나가는가까지다.

**`CONTEXT.md`는 고치지 않는다.** 이 티켓이 만든 이름(`@yeoncha/core`, `computeGrants`, `parse`)은 전부 구현 용어이지 도메인 용어가 아니다. 08번이 같은 판단을 이미 내렸다.

### 9. 스캐폴딩에서 반드시 밟게 되는 함정 일곱

전부 실제로 밟고 고쳤다. 구현 에이전트는 이것을 미리 알아야 한다.

1. **turbo 캐시는 git 저장소가 있어야 동작한다.** `git init` 전에는 동일 재실행에도 `Cached: 0`이 나온다. init 후 `4ms FULL TURBO`. 빈 저장소에 스캐폴딩할 때 `git init`이 `turbo` 설치보다 먼저다.
2. **`allowImportingTsExtensions: true`가 필요하다.** `exports`가 `./src/index.ts`인 이상 `TS5097`이 난다. `noEmit`과 짝으로 켠다.
3. **Biome은 기본적으로 `.gitignore`를 보지 않는다.** 그냥 돌리면 `.turbo/cache/`까지 긁어 44파일에 오류 34개가 난다. `vcs: { enabled: true, clientKind: "git", useIgnoreFile: true }`를 켜면 12파일로 줄고 깨끗해진다.
4. **Biome 2.5의 제외 패턴은 `!**/out`이다.** `!**/out/**`로 쓰면 `lint/suspicious/useBiomeIgnoreFolder`가 뜬다.
5. **Biome 2.5에서 `linter.rules.recommended: true`는 deprecated다.** `"rules": { "preset": "recommended" }`로 쓴다.
6. **pnpm `allowBuilds`에 `esbuild`도 넣어야 한다.** 프로토타입은 `electron`만 있었다. 빠지면 `ERR_PNPM_IGNORED_BUILDS`로 설치가 실패한다.
7. **이 환경의 pnpm에는 `minimumReleaseAge` 공급망 정책이 걸려 있다.** 갓 릴리스된 버전은 거부된다(turbo 2.10.12가 막혀 2.10.11로 내려야 했다). 필요하면 `pnpm-workspace.yaml`의 `minimumReleaseAgeExclude`에 명시한다 — 프로토타입이 `electron@44.0.0`에 이미 쓴 장치다. 거부된 항목이 lockfile에 남으면 `pnpm clean --lockfile` 후 재설치해야 한다.

### 10. 남긴 구멍

- **`electron-vite` 통합을 실제로 돌려보지 않았다.** 실험 워크스페이스는 esbuild로 main을 번들해 세 타깃 빌드와 개발 루프를 대신 확인했다. 5절의 `externalizeDepsPlugin` 함정은 문서와 추론에서 나온 것이지 실측이 아니다. 구현 에이전트가 처음 패키징할 때 확인해야 한다.
- **`apps/web`을 만들어보지 않았다.** Next.js의 `transpilePackages`가 존재하는 것은 타입 정의로 확인했지만(16.3.3), 워크스페이스 TS 소스를 실제로 삼키는 것은 확인하지 않았다. v2는 이 지도의 범위 밖이다.
- **Windows에서 아무것도 실행하지 못했다.** 06번·07번·12번이 함께 남긴 구멍과 같다. TS 7의 플랫폼별 바이너리(`@typescript/typescript-win32-x64`)와 `esbuild`·`electron`의 Windows 빌드가 lockfile에 들어가는지는 10번이 CI에서 확인해야 한다.
- **Temporal 폴리필을 나중에 네이티브로 갈아탈 시점은 정하지 않았다.** 지금은 환경 분기 0을 택했다. Node LTS와 주요 브라우저에 전부 들어온 뒤에 다시 볼 일이고, 그때 바꾸는 것은 import 한 줄이다.
- **날짜 라이브러리 선택은 ADR감이지만 만들지 않았다.** 되돌리기 어렵고, 근거 없이는 놀랍고, 실제 트레이드오프의 결과라 세 조건을 다 만족한다. 다만 이 지도의 목적지는 ADR을 하나(셸 프레임워크)로 명시했으므로 범위를 늘리지 않는다. [11번](11-write-spec.md)이 스펙을 쓸 때 두 번째 ADR이 필요하다고 판단하면 그때 만든다.

### 11. 라운드 기록

**라운드 1** — 프론티어를 넓게 펼쳤다.

| | 질문 | 답변 |
|---|---|---|
| Q1 | v2 PWA가 코어를 가져가는 경로 | *"a"* (같은 저장소, 나중에 `apps/web`) |
| Q2 | 저장소 구조 | *"a"* (워크스페이스) + **Turborepo 추가** |
| Q3 | 날짜 라이브러리 | 동의 (Temporal + `temporal-polyfill`) |
| Q4 | "오늘"의 시간대 | *"b"* (고정 `Asia/Seoul`) |
| Q5 | 테스트 러너와 seam | 동의 (Vitest 4, 코어만, seam 셋) |
| Q6 | 매니저와 Node 바닥 | *"a"* (pnpm + Node 24 LTS) |

Q1과 Q2는 원래 하나로 물으려던 것을 나눴다. Q1(전달 경로)이 Q2의 판단 기준이기 때문이다. 사용자가 양쪽에 Turborepo를 얹어 3라운드의 태스크 그래프 질문이 생겼다.

**라운드 2**

| | 질문 | 답변 |
|---|---|---|
| Q7 | 코어를 소스로 소비하는가 빌드 결과로 소비하는가 | *"a"* (소스, Just-in-Time) |
| Q8 | 셸 빌드 도구와 Vite 라인 | *"a"* (`electron-vite` 5 + Vite 7) |
| Q9 | 린트·포맷 | *"a"* (Biome) |
| Q10 | 타입체크와 tsconfig 엄격도 | *"a"* (TS 7.0.2) |

**라운드 2.5 — `/wait-what`**

사용자가 Q7에 *"나중에는 `apps/web`이 추가될텐데?"*로 되물었다. 확인 결과 **`apps/web`은 (a)를 흔들지 않고 더 세게 만든다.** 소비자가 늘수록 "다시 빌드하는 것을 잊는" 함정이 늘기 때문이다(2절).

이어 *"turborepo에서는 `"@yeoncha/core": "workspace:*"` 이렇게 추가하지 않아?"*를 물었다. **맞고, 이미 그렇게 했으며, 그건 Q7의 답이 아니라 전제다.** 두 줄이 다른 층이다 — `workspace:*`는 소비자에 쓰고 pnpm이 읽으며 "어느 패키지"를 정한다. `exports`는 제공자에 쓰고 번들러가 읽으며 "어느 파일"을 정한다. `workspace:*`는 (a)와 (b) 양쪽에 똑같이 들어간다. Turborepo 문서도 같은 순서로 씌어 있다.

**라운드 3**

| | 질문 | 답변 |
|---|---|---|
| Q11 | `turbo.json`의 태스크 그래프 | **반려 → 수정 후 승인** |
| Q12 | 검증 명령어 셋 | 동의 (Q11 수정에 맞춰 갱신) |
| Q13 | 디렉터리·패키지 이름과 코어의 내보내기 표면 | 동의 |

Q11에서 *"lint를 왜 없애? build 할 때 lint 후 진행되어야 하지 않을까?"*로 반려됐고, **사용자가 옳았다.** 내가 "turbo로 감싸면 오버헤드가 일보다 크다"를 재보지 않고 말했는데, 실측은 웜 0.09s 대 **0.04s**로 반대였다. 루트 Biome은 매번 전체를 훑지만 패키지 태스크는 캐시된다. build 게이트도 실제로 작동하는 것을 확인했다(7절). 같은 논리로 `^test`를 덧붙여 승인받았다.

