# `app/_pub` — 공개 화면 디자인 시스템 (A1)

남헌 2026-09-23 확정(B안): 공개 화면 8개를 **두더지웍스(`app/_ds`) 흔적이 없는 새 DS** 로 옮긴다.
레퍼런스 실측은 `reports/2026-09-23/ui-overhaul-reference-plan.md §2` — 다크 랜딩 = Foreplay,
라이트 앱 = Trend Seeker.

- **A1**: DS 기반 + 랜딩 `/` + `/login`
- **A2**(완료): `/library` · `/library/[slug]` · `/library/saved` · `/library/methodology`
- **A3**: `/onboarding/quiz` · `/columns/read` · `/columns/read/[slug]`

## 규칙 (넘어오는 에이전트가 먼저 읽을 것)

1. **`_pub` 는 `_ds` 를 import 하지 않는다.** 토큰 이름·값도 재사용하지 않는다.
   예외 하나: 폰트 변수 `--font-pretendard`(app/layout.tsx 의 next/font/local 소유).
2. **`app/layout.tsx` 는 폰트 로더 자리만 만진다.** `_pub` CSS 는 `PubShell` 이
   `import '../pub.css'` 로 끌어온다 — 페이지가 CSS 를 따로 import 할 필요가 없다.
   2026-09-24 에 `next/font/google` Inter 로더 한 곳이 추가됐다(토큰 v2 서체). 그 밖의
   줄은 건드리지 않는다.
3. **인라인 스타일 금지.** `pub.css` 의 클래스만 쓴다. 새 모양이 필요하면 `pub.css` 에 클래스를
   추가하고 이 문서에 적는다.
4. 색·크기는 리터럴로 적지 않는다. `tokens.css` 의 변수(`--pub-*`)만 쓴다.
5. **테마 분기를 컴포넌트에 넣지 않는다.** 두 테마가 같은 변수 이름을 쓰고, `Panel` 안에서는
   변수가 라이트로 뒤집힌다. 그래서 다크 캔버스 위 흰 카드 안의 버튼이 자동으로 검은 알약이 된다.

## 컴포넌트 API

| 컴포넌트 | 파일 | props | 비고 |
|---|---|---|---|
| `PubShell` | `components/PubShell.tsx` | `theme: 'dark'\|'light'` · `children` · `footerNote?: string` | **async 서버 컴포넌트.** 테마 스코프 + `PubNav` + `<main>` + `Footer`. `getAuthVerdict()` 를 여기서 한 번만 부른다. 섹션 사이 간격(gap 56)을 이 컴포넌트가 정한다 |
| `PubNav` | `components/PubNav.tsx` | `email: string \| null` | 목적지 3개(라이브러리·칼럼·로그인\|대시보드). 판정은 받아 쓴다(자체 조회 금지). 표시용 이메일이고 접근 차단은 `proxy.ts` 몫 |
| `Hero` | `components/Hero.tsx` | `title: string` · `eyebrow?` · `lead?` · `actions?: ReactNode` · `note?: string` · `media?: ReactNode` · `meta?: ReactNode` · `variant?: 'page'\|'detail'` | **h1 을 만드는 유일한 컴포넌트** — 한 페이지에 하나. 100vh 안 쓴다. `media` 는 제목 왼쪽 썸네일(없으면 감싸는 div 도 안 생긴다), `meta` 는 제목 아래 칩 줄, `detail` 은 제목 한 단 작게(긴 케이스 제목용) |
| `Section` | `components/Section.tsx` | `title?` · `eyebrow?` · `lead?` · `children?` · `id?` | 제목은 h2 고정. 바깥 여백을 스스로 주지 않는다 |
| `Panel` | `components/Panel.tsx` | `title?` · `eyebrow?` · `tone?: 'card'\|'banner'\|'alert'` · `titleAs?: 'h2'\|'h3'` · `children?` · `id?` | 흰 섬. `card` radius 16 / `banner` radius 32 + 가운데 정렬 / `alert` 좌측 굵은 선. 제목 기본 h3(배너는 h2) |
| `PubButtonLink` | `components/Button.tsx` | `href` · `children` · `variant?: 'primary'\|'ghost'` · `size?: 'sm'\|'md'\|'lg'` · `external?: boolean` | 내부는 `next/link`, `external` 이면 새 탭 `<a>` |
| `PubButton` | `components/Button.tsx` | `children` · `variant?` · `size?` · `type?: 'submit'\|'button'` · `name?` · `value?` | 폼 제출용. **onClick 을 받지 않는다**(받으면 클라이언트 컴포넌트가 되어 서버 컴포넌트에서 못 쓴다) |
| `Chip` | `components/Chip.tsx` | `children` · `tone?: 'quiet'\|'solid'` · `title?` | 뜻은 글자로 적는다. 색으로만 상태를 말하지 않는다 |
| `Stat` / `StatRow` | `components/Stat.tsx` | `Stat`: `label` · `value: string` · `caption?` / `StatRow`: `children` | `value` 가 문자열인 이유: 집계 실패를 `0` 으로 접지 않는다(§7.1, "집계 불가"를 그대로 넘긴다) |
| `Footer` | `components/Footer.tsx` | `note?: string` | 링크 4개 + 상태 한 줄 |
| `PubProgress` | `components/PubProgress.tsx` | `value: number` · `max: number` · `label: string` | **A3.** 네이티브 `<progress>` — 채운 폭을 인라인 스타일로 주지 않으려고(규칙 3). `label` 을 막대 위에 글자로도 적는다 |
| `PubChoice` | `components/PubChoice.tsx` | `children` · `onClick: () => void` · `eyebrow?` · `disabled?` | **A3. `'use client'`** — 퀴즈 선택지 흰 카드. 진짜 `<button>` 이라 키보드·포커스가 공짜다. onClick 을 받으므로 서버 컴포넌트에서는 못 쓴다(`PubButton` 과 나뉜 이유) |
| `PubArticle` | `components/PubArticle.tsx` | `html: string` | **A3.** `renderMarkdown()` 결과를 받는 긴 글 타이포(h2/h3·인용·목록·표·코드, 폭 `--pub-measure`). 무해화는 `lib/columns/markdown.ts` 가 한다 — 여기서 또 하지 않는다 |
| `PubColumnCard` | `components/PubColumnCard.tsx` | `href` · `title` · `summary` · `readerType` · `date` | **A3 → M1.** 칼럼 목록 카드(제목 h3). M1 부터 케이스 카드와 같은 `.pub-card` 클래스를 쓴다(듀오톤 띠만 없다 — 칼럼엔 로고가 없다) |

### A2 에서 추가된 것 (라이브러리 4화면)

| 컴포넌트 | 파일 | props | 비고 |
|---|---|---|---|
| `PubCaseCard` | `components/PubCaseCard.tsx` | `study` · `move` · `moveCount: number` · `reason?: string` | §4 카드 스펙: 문제유형·병목 칩 → 제목("문제 → 수") → `transfer_note` 60자 → 메타 줄(브랜드·등급 2축·무브 N·승인일) · 우측 듀오톤 로고. props 는 **행 조각**만 받는다(상세 로더 타입에 묶이지 않게) |
| `PubBrandLogo` / `PubBrandLogoNotice` | `components/PubBrandLogo.tsx` | `study: LogoInput` · `bottleneck?` · `size?: 'md'\|'lg'` | 판정은 `lib/cases/logo.ts logoFor` 재사용(새로 쓰지 않는다). 고지 문구는 같은 파일의 `LOGO_NOTICE`. **인라인 스타일 금지의 유일한 예외** — 듀오톤 hue 두 개를 CSS 변수로 내린다(데이터값) |
| `PubGradeBadge` / `PubGradeLegend` | `components/PubGradeBadge.tsx` | `move` | 등급 2축(인사이트 = `displayGradeLabel` · 사실확인 = `factCheckLabel`)을 **항상 같이** 낸다. 방향 아이콘은 `grade-display.ts` 에 헬퍼가 들어오면 여기 한 곳에 더한다(없는 것을 지어내지 않는다) |
| `PubFacetBar` / `PubFacet` / `PubFacetSep` | `components/PubFacetBar.tsx` | `label` / `href` · `active` · `count?` / — | 필터 칩 **한 벌**. <1024px 상단 가로 스크롤, ≥1024px 좌측 sticky 세로 — 모양은 CSS 가 정한다(두 벌 렌더 금지). 선택은 `aria-current="page"` 로도 말한다 |
| `PubEmpty` | `components/PubEmpty.tsx` | `title` · `description?` · `action?` · `compact?` | **"0건" 전용**이다. 조회 실패는 `Panel tone="alert"` 로 따로 낸다(§7.1) — 둘을 이 컴포넌트로 합치지 마라 |
| `PubTOC` | `components/PubTOC.tsx` | `items: readonly [id, label][]` | 상세 사이드 목차. 부모가 `.pub-detail` 이어야 sticky 규칙이 먹는다. JS 0 |

클래스는 `pub.css` 하단 "A2" 블록에 있다(`.pub-liblayout` · `.pub-cardgrid` · `.pub-card` ·
`.pub-facets` · `.pub-detail` · `.pub-toc` · `.pub-row` · `.pub-tile` · `.pub-field` · `.pub-empty` …).
클라이언트 컴포넌트(저장·피드백·링크복사)는 `PubButton` 을 못 쓴다(onClick) — `.pub-btn` 클래스를
직접 붙인다.

### 신호 화면에서 추가된 것 (2026-09-25, 남헌 위임 B항)

| 컴포넌트 | 파일 | props | 비고 |
|---|---|---|---|
| `PubSignalCard` | `components/PubSignalCard.tsx` | `item: SignalItem` · `showSignal?` | 리뷰 1건 카드(피드·3열 공용). 카드 전체가 `/signals/card?id=` 링크 — 외부 출처 링크는 상세에만(링크 안 링크 금지). 라벨 NULL 은 칩을 안 만들고 "라벨 없음" 을 글자로 적는다 |

전역 `app/error.tsx`·`app/loading.tsx`(2026-09-25 결정 4번)도 `_pub` 톤이다 — 공개·내부 공용 파일. 오류는 `.pub-solo`+`Hero`+`Panel tone="alert"` 재사용, 로딩만 `.pub-loading`·`.pub-skel`(`--tall`)을 새로 썼다.

클래스: `.pub-signal-excerpt`(발췌 줄바꿈) · `.pub-signalcols`/`.pub-signalcol`(3열, ≥1024px 세 칼럼).
내부 네비(`_ds/AppNav`)는 `/signals*` 에서 스스로 null 을 돌려준다(2026-09-25). #264 가 넣었던 `pub.css` 임시
블록(`body:has(.pub-root) .sa-*`)은 지웠다. 새 공개 화면을 만들면 AppNav 숨김 목록에 한 줄 넣는다 — CSS 로 가리지 않는다.

## 토큰 (`tokens.css`) — v2, 레퍼런스 실측 재도출 (남헌 2026-09-24 확정)

v1 은 컴포넌트만 새로 짜고 **값은 `_ds` 를 승계**했다(Pretendard 단일 서체 · Tailwind slate
뉴트럴 · 4px 리듬 · 임의 그림자 → 40개 중 23개 값 일치). v2 는 색·반경·그림자·모션·서체를
레퍼런스 CSS 실측값에서 다시 도출했다. 출처: **[F]** Foreplay(다크) · **[A]** Atria(라이트·카드) ·
**[T]** Trend Seeker(본문·코랄).

### 서체

| 변수 | 값 | 출처 |
|---|---|---|
| `--pub-type` | `var(--font-inter), var(--font-pretendard), sans-serif` | 레퍼런스 4곳 본문이 전부 Inter. Inter 에 한글이 없어 **글리프 단위로** Pretendard 로 떨어진다 |
| `--pub-type-mono` | `ui-monospace, "SF Mono", monospace` | `_ds` 의 JetBrains Mono 스택을 쓰지 않는다(CDN 의존도 같이 끊긴다) |

Inter 는 `app/layout.tsx` 의 `next/font/google`(빌드 때 받아 셀프호스팅, 런타임 CDN 0),
Pretendard 는 `next/font/local`. **`app/layout.tsx` 에서 허용된 수정은 이 로더 한 곳뿐이다.**

### 타입 스케일 — 크기 / 굵기 / 자간 / 행간

| 단 | px | 굵기 | 자간 | 행간 | 출처 |
|---|---|---|---|---|---|
| display | 48 | 500 | -0.02em | 1.08 | [F] 디스플레이 40~50 · 굵기 300~500 |
| display-sm | 40 | 500 | -0.018em | 1.12 | [F] |
| head | 28 | 600 | -0.015em | 1.25 | [A] 헤드 22~28 · 자간 -1.2~-2.8px |
| head-sm | 22 | 600 | -0.01em | 1.3 | [A] |
| text | 16 | 400 | 0 | 1.6 | [T] 본문 행간 1.6 |
| text-sm | 15 | 400 | 0 | 1.55 | [T] |
| caption | 13 | 500 | +0.01em | 1.5 | [T] 자간 +0.01~0.02em |
| label(칩·버튼·눈썹) | 13 | 500 | +0.02em | 1 | [T] |

### 색

| 묶음 | 변수 · 값 | 출처 |
|---|---|---|
| 라이트 | `--pub-canvas #FBFBFD` · `--pub-surface #FFFFFF` · `--pub-surface-2 #F0F1F9` · `--pub-edge #E6E6E6` · `--pub-ink #000000` · `--pub-ink-muted #909094` · `--pub-ink-faint #B3B3B8` | [A] 실측 |
| 다크 | `--pub-canvas #020308` · `--pub-surface #030407` · `--pub-ink #FAFAFA` · `--pub-ink-muted rgba(250,250,250,.62)` · `--pub-edge rgba(250,250,250,.14)` | [F] 실측 |
| 액센트 | `--pub-accent`/`--pub-cta` **#1D4ED8**(확정·변경 금지) · `--pub-accent-ink`/`--pub-cta-ink #FFFFFF` · `--pub-focus` 라이트 #1D4ED8 / 다크 **#5DBCE5** | 다크 포커스는 [F] 스카이 |
| 판정 | `--pub-verdict-pos #396C00` / `-bg #E9FFD2` · `--pub-verdict-neg #E58B73` / `-bg #FFF1EC` · `--pub-verdict-mix #E2B866` / `-bg #FFF7E0` | 긍정 [A] 라임 · 부정 [T] 코랄 · 혼합 앰버. **두더지웍스의 emerald/red 금지** |
| 흰 섬 | `--pub-island #FFFFFF` · `--pub-island-ink #000000` · `--pub-island-ink-muted #909094` · `--pub-island-edge #E6E6E6` · `--pub-island-wash #F0F1F9` | 두 테마 공통([A] 값) |

⚠️ `--pub-ink-faint`(#B3B3B8)는 **장식용만**이다 — 구분선·점선·비활성 표시. 본문·캡션에 쓰면
`#FBFBFD` 위에서 대비가 안 난다. 캡션은 `--pub-ink-muted`(#909094)를 쓴다.
⚠️ 코랄·앰버는 제 바탕 위에서 글자 대비가 안 나온다. 그래서 **테두리로만** 쓰고 글자는
잉크색이다(`.pub-chip--neg` / `--mix`). 라임(#396C00)만 제 바탕 위에서 글자로 읽힌다.
⚠️ 판정 색은 **결과 방향**(됐다/안 됐다/갈렸다)에만 붙인다. 등급 A~D 는 분류이지 방향이
아니라서 색을 입히지 않는다 — D 는 "아직 안 적혔다"이지 실패가 아니다.

### 반경 · 그림자 · 모션 · 간격

| 묶음 | 변수 · 값 | 출처 |
|---|---|---|
| 반경 | 카드 20 · 컨트롤 10 · 배너 24 · 알약 **100px**(999 아님) · 썸네일 12 | [A] · 알약은 [F]. `_ds` 의 8·16·32 를 쓰지 않는다 |
| 그림자 | 기본 **없음** · `--pub-lift-rest 0 2px 8px rgba(0,0,0,.04)` · `--pub-lift-hover 0 1px 6px rgba(0,0,0,.18)` · `--pub-lift-float 0 4px 20px rgba(0,0,0,.03)` | 기본 없음 [F] · 카드 [A] |
| 모션 | `--pub-ease cubic-bezier(.19,1,.22,1)` · 색 `--pub-motion-color 150ms` · 위치·그림자 `--pub-motion-move 220ms` · 등장 `--pub-motion-enter 400ms` | 곡선 [F] · 색 150ms [T]. `prefers-reduced-motion: reduce` 면 셋 다 0ms |
| 포커스 | `outline: 2px solid var(--pub-focus)` — **box-shadow 링 금지**(`_ds` 의 `--shadow-focus` 를 끈다) | |
| 간격 | `--pub-gap-1…10`(4·8·12·16·20·24·32·40) · 카드 패딩 `--pub-pad-card` 20→24 · 그리드 `--pub-gap-grid` 16→20 · 섹션 `--pub-gap-section` 40→64 | 레퍼런스도 8의 배수라 `_ds` 와 값이 겹칠 수 있다 — **겹침 검사에서 제외**한다 |
| 컨트롤 높이 | `--pub-h-sm 32` · `--pub-h-md 40` · `--pub-h-lg 44`(터치 최소치) | |

### 아이콘 (`icons.tsx`)

외부 라이브러리를 쓰지 않는다. 8종(`arrow-right` · `bookmark` · `share` · `search` ·
`filter` · `check` · `external` · `chevron-down`), 20px 그리드 · stroke 1.5 · round cap/join ·
`currentColor` · 크기 `1em`(옆 글자를 따라간다). 색·크기 prop 이 없는 이유는 파일 주석에.
**아이콘만 있는 버튼을 만들지 않는다** — 뜻은 옆 글자가 말한다.

### 겹침 0 을 기계가 지킨다

`scripts/pub-tokens-overlap-selftest.mjs` 가 `app/_pub/**/*.{css,tsx}` 와
`app/_ds/{styles.css,tokens/*.css}` 에서 색·반경·그림자·easing·서체 스택을 뽑아 교집합을
센다. CI(`build-check.yml`)에서 두 번 돈다 — 정상(설명되지 않은 겹침 0) + `--mutate`
(일부러 `_ds` 색을 넣어 **실패해야** 통과).

불가피한 겹침 3건은 스크립트의 `UNAVOIDABLE` 표에 이유와 함께 적혀 있다:
`#ffffff`(원색) · `#1d4ed8`(액센트 확정값, `_ds` 는 같은 값을 `--blue-700` 램프로 들고 있다) ·
`radius 12px`(썸네일, `_ds` 의 `--radius-xl` 과 값 동일). **간격 px 은 세지 않는다**(위 표 참고).

**액센트 색이 생겼다.** v1 에는 없었다(잉크 단색 CTA). #1D4ED8 은 남헌 확정값이라 에이전트가
바꾸지 않는다 — 바뀌면 `--pub-accent` / `--pub-cta` 두 줄이 입구다.

## A2 가 어떻게 결정했나 (A3 는 1번을 그대로 따라가면 된다)

1. **헤더 두 개 → (a) 로 풀었다.** `_ds/AppNav` 의 숨김 조건에 `/library` 접두사를 더했다
   (`app/_ds/components/AppNav.tsx` 첫 판정, 한 줄). `PubShell` 에 헤더를 빼는 prop 을 만드는
   (b) 는 **버렸다** — 그렇게 하면 익명 방문자가 라이브러리에서 내부 도구 네비(케이스 검수·
   발행 연결 수리…)만 보게 된다. 대가: 로그인한 내부 검수자가 `/library/*` 에서 사이드바를
   잃는다(대시보드로 돌아가는 링크는 `PubNav` 에 있다). `app/layout.tsx` 는 건드리지 않았다.
2. **`.sa-main` 좌측 여백** — 1번을 (a)로 풀어 같이 없어졌다(사이드바가 렌더되지 않으므로
   `body:has(.sa-sidebar)` 가 안 맞는다).
3. **카드** — `.pub-case`(랜딩 한 줄)를 `.pub-card` 로 키웠고 `PubCaseCard` 가 그 스펙이다.
   로고는 `lib/cases/logo.ts` 판정을 그대로 쓴다. `logo_url` 컬럼이 **없는 환경**(마이그
   20260930000001 미적용)에서는 `logo_columns === 'missing'` 안내 한 줄을 화면에 남긴다 —
   "로고 미기재"가 아니라 "컬럼 없음"이라고 적는 자리다.
4. **데이터 로더는 이미 있다.** `lib/cases/library.ts`(그리드) · `lib/cases/detail.ts`(상세) ·
   `lib/cases/saves.ts`(저장함) · `lib/cases/grade-display.ts`(등급 라벨) · `lib/methodology/content.ts`
   (방법론 본문). A2 는 화면만 갈았고 이 다섯 파일을 손대지 않았다.
5. **`/library/saved` 는 스스로 로그인 판정을 한다**(정책 접두사가 proxy 를 통과시킨다).
   이관 후에도 `getAuthVerdict()` → `/login` redirect 가 파일 첫 줄에 그대로 있다.
6. **`_ds` 쪽은 아무것도 지우지 않았다.** `_ds/CaseCard` · `_ds/BrandLogo` · `styles.css` 의
   `.sa-lib*` 는 남아 있다(다른 화면 회귀 격리). 참조만 끊었다 — `grep -rn "_ds/" app/library`
   가 0줄이다.

## A3 가 정한 것 (2026-09-23)

1. **헤더 중복은 (a) 로 풀었다** — `app/_ds/components/AppNav.tsx` 에
   `if (path.startsWith('/columns/read')) return null` 한 줄을 더했다(`app/layout.tsx` 는 그대로).
   (b)(`PubShell` 에 헤더 빼는 prop)를 안 고른 이유: 그래도 `AppNav` 가 렌더되어
   `.sa-main` 좌측 여백이 남고 본문 폭이 사이드바만큼 줄어든다(위 주의 2번).
   접두사를 `/columns/read` 로 좁혀 검수 화면 `/columns` 는 네비를 그대로 쓴다.
   **A2 가 `/library` 에 같은 해법을 쓰면 이 파일에서 만난다** — 두 줄은 서로 독립이니
   충돌하면 양쪽을 남기면 된다.
2. **온보딩만 다크다.** 다크 랜딩의 "내 문제로 시작"에서 이어지는 첫 화면이라
   `PubShell theme="dark"` 이고, 읽고 누르는 부분(선택지·결과·공유 이미지)은 흰 섬으로
   뒤집었다. 칼럼 목록·본문은 `theme="light"`.
3. **`pub.css` 는 파일 끝 A3 블록으로만 덧붙였다**(기존 규칙 0줄 수정):
   `.pub-progress` · `.pub-choice` · `.pub-column-list` · `.pub-column-card` · `.pub-article` ·
   `.pub-quiz`(폭 760 — `.pub-solo` 480 은 선택지 두 장이 안 들어간다) · `.pub-share-img` ·
   `.pub-column-foot`. `app/columns/read/column-read.css`(`.sa-column`)는 지웠다.
4. **클라이언트 화면을 옮기는 법.** `PubShell` 이 async 서버 컴포넌트라 `'use client'` 페이지가
   직접 감쌀 수 없다. 온보딩 퀴즈는 `page.tsx`(서버, 껍데기) + `quiz-client.tsx`(상태·fetch)로
   갈랐다 — 같은 상황이 또 오면 이 모양을 쓴다.
5. **A2 와 만난 자리 3곳** — `AppNav`(숨김 두 줄이 나란히 있다) · `pub.css`(A3 블록 뒤에 A2
   블록) · 이 문서(표 두 개). 세 곳 모두 양쪽을 다 살렸고, 서로 덮는 선택자는 없다
   (`.pub-hero-title` 만 겹치는데 각자 `.pub-quiz` · `.pub-hero--detail` 스코프다).

## 토큰 v2 (2026-09-24) — 다음 에이전트가 알아야 할 것

토큰을 전부 갈고 **`/library` 그리드·상세 두 화면에만** 새 감각을 입혔다. 나머지 6개 화면
(`/` · `/login` · `/onboarding/quiz` · `/columns/read` · `/columns/read/[slug]` ·
`/library/saved` · `/library/methodology`)은 같은 토큰을 읽어 **깨지지 않고** 돌아가지만,
레이아웃·리듬은 아직 v1 그대로다. 다시 입히는 것이 다음 몫이다.

바뀐 것 중 화면에 영향이 있는 것:

1. **없어진 토큰** — `--pub-canvas-raised`(→ `--pub-surface`) · `--pub-edge-strong`
   (→ 강한 선이 필요하면 `--pub-ink-faint`) · `--pub-lift-1`/`-2`(→ `--pub-lift-rest`/`-hover`/`-float`) ·
   `--pub-motion-quick`/`-base`/`-ease`(→ `--pub-motion-color`/`-move` · `--pub-ease`) ·
   `--pub-tracking-eyebrow`(→ `--pub-tracking-label`) · `--pub-gap-14`/`-20`(→ `--pub-gap-section`).
   **`pub.css` 밖에서 이 이름을 쓰는 곳은 없다**(컴포넌트는 클래스만 붙인다) — 새 화면에서
   쓰지 마라.
2. **`.pub-facets` 마크업이 두 겹이 됐다** — `PubFacetBar` 가 `.pub-facets-head`(필터
   아이콘 + 라벨)와 `.pub-facets-list`(칩 줄)를 만든다. sticky 는 바깥, 가로↔세로 전환은
   안쪽이다. 라벨을 화면에도 적은 이유: `aria-label` 만 있으면 눈으로 보는 사람에게 이 칩
   줄이 무엇을 거르는지 말하지 못한다.
3. **`.pub-card` 가 세로가 됐다**(Atria) — 듀오톤 썸네일(`PubBrandLogo size="cover"`, 16:7 띠)
   → 라벨 칩 → 제목(head-sm) → 2줄 `transfer_note` → 메타. v1 은 썸네일이 오른쪽이라
   제목이 56px 만큼 좁았다.
4. **`Chip` 에 판정 3색이 붙었다** — `tone="positive" | "negative" | "mixed"`.
   결과 방향에만 쓴다(등급에는 쓰지 않는다 — 위 색 표의 ⚠️).
5. **`.pub-field-wrap`** — 칸 안에 검색 아이콘을 앉히는 껍데기. 포커스 링이 껍데기로 옮겨간다
   (`:focus-within`), 안쪽 `input` 의 링은 끈다.

## M1 (2026-09-24) — 나머지 공개 7화면 재입힘 완료

위 절의 7화면(`/` · `/login` · `/onboarding/quiz` · `/columns/read` · `/columns/read/[slug]` ·
`/library/saved` · `/library/methodology`)을 v2 리듬으로 다시 입혔다. 이제 v1 리듬으로 남은 공개 화면은 없다.

- **카드는 한 모양이다.** 랜딩 "최신 케이스"는 `PubCaseCard` 그리드, 칼럼 목록은 `PubColumnCard` 가
  같은 `.pub-card` 를 쓴다. 그래서 **지운 클래스**: `.pub-case` · `.pub-caselist` · `.pub-case-title` ·
  `.pub-case-meta` · `.pub-column-list` · `.pub-column-card*`. 새 화면에서 쓰지 마라.
- **추가한 클래스**: `.pub-card-go`(메타 줄 끝 "읽기 →") · `.pub-choice-cta`(퀴즈 선택지 하단 행동 줄) ·
  `.pub-solo .pub-form .pub-btn`(한 장 카드 버튼 전폭) · `.pub-quiz .pub-panel .pub-stat*`(패널 안 점수).
- **`.pub-panel--alert` 가 바뀌었다** — 반경 10 + 굵은 선을 테두리가 아니라 `inset` 그림자로. 테두리는
  흰 섬 바깥에 그려져 다크 캔버스에서 검은 선이 사라졌고, 반경 20 에서는 괄호처럼 휘었다.
  `/library` 두 화면의 알림도 같이 바뀐다(모양만).
- 방법론은 목차 패널 대신 `.pub-detail` + `PubTOC`(케이스 상세와 같은 sticky 목차), 표는 `.mth-scroll` 이 카드 틀.
- 3상태는 라이브러리 규칙을 따른다: 조회 실패 = `Panel tone="alert"`, 0건 = `PubEmpty`(조회는 정상).
- 전후 스크린샷: `reports/2026-09-24/m1-screenshots/`(DB 없이 찍어 숫자 칸은 "집계 불가" 상태,
  퀴즈 선택지·결과는 API route-mock, 저장함은 로그인 벽이라 확인 불가).
