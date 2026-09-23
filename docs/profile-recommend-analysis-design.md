# 프로필 → 케이스 추천 → 경쟁사 리뷰 분석 (통합 설계)

작성: architect 서브에이전트, 2026-09-23 (KST). 저장·보정: CEO-STAFF 세션. **설계만. 코드·마이그레이션·DB 쓰기 0.**
합치는 두 요구: 9/30 기능 1 "프로필 기반 케이스 추천"(reports/2026-09-23/saas-pivot-mvp-assessment.md §3-1·§4-C)
+ 트랙 4 #11 "내 아이디어 넣기 → 매칭 리포트"(reports/2026-09-23/competitor-feature-analysis.md F-11).
등급 표시·액션플랜 규약은 reports/2026-09-23/pmf-grade-axis-design.md §6·§9 를 따른다.

> 세션 보정(2026-09-23 저녁): 아래 본문의 "`/library` 는 리포에 존재하지 않는다"는 작성 시점 기준이다. 같은 날 PR #227 로 `/library` 접두사가 공개 경로로 열렸고(남헌 확정), 상세는 `/library/<slug>` 로 트랙 2 가 만든다. 본문 중 `/cases/[slug]` 는 `/library/[slug]` 로 읽는다.

## 기획 요약

한 사람이 한 번에 지나가는 흐름 3단계를, **새 화면을 만들지 않고 기존 세 화면을 이어서** 만든다.

1. **프로필 입력** — 내가 만드는 것·내 독자의 문제·지금 막힌 곳을 한 번 적는다 → `/settings/profile`(기존)
2. **추천 케이스 + 내일 할 행동** — 그 프로필로 좁힌 선례·실패사례를 보고, 각 무브의 `transfer_note`(= 내일 할 행동)를 읽는다 → `/cases/search`(기존)
3. **내 경쟁사 리뷰 분석 연결** — 남의 사례로 방향을 잡았으면, 내 경쟁사 리뷰로 수요를 직접 확인한다 → `/analyze/new`(기존)

설계의 중심 판단은 **"새로 만들 것을 고르는 일이 아니라 이미 만들어 둔 것을 잇는 일"** 이라는 것이다.
`searchMoves()` 가 이미 (a) 문제유형·병목 하드필터 (b) 자유 텍스트 낱말 매칭 (c) 제품 종류 정렬 가산점 (d) 3상태 판정을 다 한다.
`/settings/profile` 과 `/analyze/new` 사이에도 프리필 배선이 이미 있다(`/api/profile` GET → 빈 칸만 채움).
빠진 것은 **프로필 → 검색 화면 사이의 프리필 한 구간**과, **무브의 "옮길 행동" 필드가 SELECT에 없어 화면에 도달하지 못하는 구멍** 둘뿐이다.

새 라우트는 0개다. 케이스 상세(`/library/[slug]`)는 이 기능이 없어도 성립하므로 트랙 2로 넘긴다.

## 사용자 여정 3단계 — 화면·라우트

### 1단계 · 프로필 입력 — `/settings/profile` (기존 확장, 신규 0)

기존 화면이 이미 `pitch`·`market`·패싯 5개를 `seller_profiles`(이메일당 1행)에 저장하고, 그 값이 `/analyze/new` 1단계를 프리필한다.
여기에 **두 칸만** 더한다.

| 칸 | 저장 위치 | 어디에 쓰이나 |
|---|---|---|
| 지금 겪는 문제 유형 `reader_problem` (신규) | `seller_profiles.reader_problem` | 추천의 **유일한 케이스 하드필터**. `searchMoves` 의 `s.reader_problem === query.problem` |
| 경쟁사·비교 대상 URL `competitor_url` (신규, 선택) | `seller_profiles.competitor_url` | 3단계에서 `/analyze/new` 1단계 프리필 |

기존 칸의 취급도 화면에 정직하게 적는다(§4-C "물어본 것이 전부 매칭에 쓰이게"):
- 추천에 **쓰이는 것**: `reader_problem`(하드필터) · `bottleneck`(하드필터) · `pitch`+`market`(자유텍스트 낱말) · `business_model`(정렬 가산점)
- 추천에 **지금 안 쓰이는 것**: `price_band` · `buyer_type` · `purchase_frequency` — 접힘 안으로 내리고 "지금 추천 순서를 바꾸지 않는다. 진단(matchMoves)에서만 쓴다"를 한 줄로 적는다. 숨기지 않는다.

저장 성공 후 다음 걸음 버튼을 **둘로** 늘린다(현재는 "새 분석 시작" 하나뿐):
- `이 프로필로 케이스 추천 보기` → `/cases/search`
- `새 분석 시작` → `/analyze/new`

### 2단계 · 추천 케이스 + 내일 할 행동 — `/cases/search` (기존 확장, 신규 0)

**프리필 규칙(핵심)**: URL 에 검색 파라미터가 **하나도 없을 때만** `seller_profiles` 를 읽어 기본값을 만든다.
파라미터가 하나라도 있으면 프로필로 덮지 않는다 — 사람이 칩을 눌러 좁힌 결과를 프로필이 되돌리면 화면이 자기 마음대로 움직이는 것으로 읽힌다.

| 프로필 값 | 채우는 파라미터 | 왜 |
|---|---|---|
| `reader_problem` | `?problem=` | 케이스 단위 하드필터. 추천을 "내 문제"로 만드는 유일한 축 |
| `pitch` + `market` | `?q=` (합쳐 200자 상한, `QUERY_MAX`) | 낱말 매칭 재료. `toTerms` 가 불용어·순수숫자를 걸러 준다 |
| `bottleneck` | **채우지 않는다** | 하드필터 2겹(problem+bottleneck) + `kind=saas` 숨김이 겹치면 0건이 급증한다. 사람이 필요할 때 select 로 직접 좁힌다 (→ 질문 Q2) |
| `business_model` | 파라미터 없음 | `searchMoves(query, corpora, { kind })` 의 세 번째 인자로 넘긴다. `productKindOf()` → `KIND_MATCH_BONUS=100` 정렬 가산점 |

화면 상단 한 줄: `내 프로필에서 문제 유형·검색어를 가져왔다` + `프로필 무시하고 전체 보기` 링크(= `?problem=` 빈 값을 명시한 URL).
프리필이 실제로 값을 넣었을 때만 적는다(`/analyze/new` 의 `prefilled` 플래그와 같은 규약 — 안 채웠는데 적으면 사람이 자기가 친 값을 프로필 값으로 착각한다).

**선례 카드 확장** — `CaseMoveCards`(advisor-cards.tsx) 한 벌만 고친다. 이 컴포넌트를 `/cases/search` 와 어드바이저 패널이 같이 쓰므로 두 화면이 한 번에 바뀐다.
- `내일 할 행동` — `case_moves.transfer_note` **원문 그대로**. LLM 이 다시 쓰지 않는다(§10.1, pmf-grade §6: 41개 중 33개가 이미 "내일…"로 시작한다).
- `전제` — `preconditions` 접힘. 미기재는 "전제 미기재 — 전제가 없다는 뜻이 아니다".
- 미기재 표시 — `transfer_note` 가 없으면 `행동 미기재` 배지. "옮길 행동이 이 무브에 안 적혀 있다"이고, 빈 줄로 두지 않는다.
- 등급 배지 — **`displayGrade(move)` 한 함수로 뽑는다**(pmf-grade §9). 지금은 `evidence_grade` 를 돌려주고, `pmf_grade` 가 승인되면 `pmf_grade ?? evidence_grade` 한 줄만 바뀐다. 사실확인 등급은 지금처럼 병기(`MoveGradeBadges`).
- **다단계 액션플랜** — 카드 안 `<details>` "이 케이스에 기록된 무브 N개(시간순)". `observed_period_start` 순, NULL 이면 `created_at` 으로 대신하고 그 항목에 `시점 미확인` 표시. **번호만 쓰고 화살표(→)를 쓰지 않는다** — 시간순이 곧 인과가 아니다(pmf-grade §6). 무브가 1개면 접힘을 아예 그리지 않는다.

**3단계로 가는 CTA** — 화면 맨 아래 Card 1개: "여기까지 봤으면 다음은 내 경쟁사 리뷰로 확인한다" → `/analyze/new`.

### 3단계 · 내 경쟁사 리뷰 분석 — `/analyze/new` (기존, 배선 1줄)

`/analyze/new` 의 기존 프리필 `useEffect` 가 이미 `/api/profile` 을 읽어 빈 칸만 채운다. 거기에 `competitor_url` 한 줄을 더한다.
**URL 을 쿼리스트링으로 넘기지 않는다** — 사용자 입력 URL 이 리퍼러·액세스 로그에 남는다. 프로필에서 서버 경유로만 온다.
프로젝트 생성 시 `reader_problem` 도 함께 실어(= `parseFacets` 확장) `analysis_projects.reader_problem` 에 남긴다. 그래야 그 프로젝트 화면에서 다시 추천을 부를 때 같은 축으로 좁힌다.

### 관계도

```
/settings/profile ──저장──> seller_profiles (이메일당 1행)
        │                        │
        │ "케이스 추천 보기"      │ (서버 읽기, 파라미터 없을 때만)
        ▼                        ▼
   /cases/search  <── 프리필 problem·q ──┘
        │  선례 카드: 내일 할 행동(transfer_note) · 전제 · 등급(displayGrade) · 무브 시간순
        │
        │ CTA "내 경쟁사 리뷰로 확인"
        ▼
   /analyze/new ──프리필 competitor_url·pitch·market·패싯──> POST /api/analyze/projects
        │                                                      (owner_email = 세션에서만)
        ▼
   /analyze/[id]/review → result (기존 2축 진단·어드바이저)
```

신규 라우트: **0개**. 손대는 화면 3개 + API 2개 + 순수 로직 3개.

## 영향 파일

**마이그레이션(신규 2파일)**
- `supabase/migrations/20260924000001_profile_reader_problem.sql` (본문 SQL은 아래 §데이터 변경)
- `supabase/migrations/20260924000001_profile_reader_problem_rollback.sql`

**순수 로직**
- `lib/analysis/facets.ts` — `FACET_KEYS` 에 `reader_problem` 추가, `FACET_FIELDS` 에 select 정의(라벨은 `config/reader-problems.json` 어휘, `READER_PROBLEM_LABEL` 재사용), `VOCAB.reader_problem = READER_PROBLEMS`. 어휘 배열을 여기서 다시 적지 않는다(이 파일 헤더 규약).
- `lib/cases/corpus-db.ts` — `MOVE_COLS` 에 `transfer_note, preconditions, transferability, observed_period_start` 추가. **이 한 줄이 "내일 할 행동"의 병목이다.**
- `lib/cases/match.ts` — `MoveRow` 에 위 4필드(optional). `?` 로 둔다 — 조회에서 빼면 `undefined` 고 그건 "없음"이 아니다(기존 `fact_check_grade` 와 같은 규약).
- `lib/cases/advisor.ts` — `CaseMoveCard` 에 `transfer_note`·`preconditions`·`observed_period_start`·`case_study_id` 실어 보내기(매칭 점수는 **건드리지 않는다**). `displayGrade()` 는 `lib/cases/grade-display.ts` 1파일(트랙 2 가 만든다).
- `lib/cases/search.ts` — 변경 없음(프리필은 화면이 URL 로 한다). 프로필 → 쿼리 변환 헬퍼가 필요하면 `profileToQuery(profile)` 순수 함수 하나만 이 파일에.

**API**
- `app/api/profile/route.ts` — PUT 에 `competitor_url` 분기 추가(`pitch` 와 같은 모양, 검증은 `parseCompetitorUrl(value, 'forward')` 재사용). `reader_problem` 은 `parseFacets` 가 자동 처리.
- `app/api/analyze/projects/route.ts` — 변경 없음(`...facets.values` 로 `reader_problem` 이 자동으로 실린다). ⚠️ 그래서 **마이그레이션이 배포보다 먼저** 가야 한다(없으면 PGRST204).

**화면**
- `app/settings/profile/page.tsx` — 문제유형 select + 경쟁사 URL 칸 + 다음 걸음 버튼 2개 + "지금 추천에 안 쓰이는 3칸" 접힘.
- `app/cases/search/page.tsx` — 프로필 프리필(파라미터 없을 때만) + 출처 한 줄 + 3상태 처리 + 0건 회복 링크 + 하단 CTA Card.
- `app/analyze/[id]/advisor-cards.tsx` — `CaseMoveCards` 에 내일 할 행동·전제·무브 타임라인·`displayGrade`.
- `app/analyze/new/page.tsx` — 프리필 `useEffect` 에 `competitor_url` 한 줄.

**검증**
- `scripts/analyze-projects-facets-selftest.mjs` — `reader_problem` 어휘 밖 값 거절 케이스 추가(음성 검사).
- `scripts/cases-search-selftest.mjs` — `profileToQuery()` 양성/음성 1쌍.
- `scripts/case-pipeline-verify.mjs` — `reader_problem` 드리프트 체크의 대상 테이블은 늘리지 않는다(프로필은 사용자 입력이고 코퍼스가 아니다).

**손대지 않는 것(명시)**: `lib/cases/match.ts::matchMoves` 점수·`KIND_MATCH_BONUS`·`GRADE_RANK`·`lib/auth/*`·`PUBLIC_PREFIXES`·`review_sources`·발행 경로.

## 데이터 변경

### 🟢 비파괴 / 🟡 신규 — 컬럼 3개, 새 테이블 0

새 테이블은 필요 없다. 이유: `seller_profiles` 가 이미 "로그인 이메일당 1행 재사용 객체"로 존재하고(20260923000001), `/analyze/new` 프리필 경로도 이미 그 테이블을 본다. 프로필용 테이블을 또 만들면 같은 사람의 프로필이 두 곳에 생긴다.

```sql
-- 20260924000001_profile_reader_problem.sql
-- 🟢 비파괴: 전부 ADD COLUMN IF NOT EXISTS · 전부 nullable · 기존 행을 건드리지 않는다.
-- 적용 주체: CLAUDE.md §10.2 — 대화형·역할 세션 자체 판단 가능(예외 5개 해당 없음).
-- ⚠️ 순서 제약: 이 마이그레이션이 앱 배포보다 **먼저** 가야 한다(FACET_KEYS 에 reader_problem 이 들어가면
--   POST /api/analyze/projects 가 그 키를 INSERT 에 실어 PGRST204 로 죽는다).

ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS reader_problem text,
  ADD COLUMN IF NOT EXISTS competitor_url text;

ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS reader_problem text;

-- CHECK 은 **형식만** 본다 — case_studies 와 같은 규약(20260915000001). 어휘를 CHECK 에 박지 않는 이유:
-- config/reader-problems.json 이 "잠정, 자료가 오면 통째로 갈아끼운다"라고 적고 있다. enum CHECK 은 그 교체를 파괴적 마이그레이션으로 만든다.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_profiles_reader_problem_format') THEN
    ALTER TABLE public.seller_profiles
      ADD CONSTRAINT seller_profiles_reader_problem_format
      CHECK (reader_problem IS NULL OR reader_problem ~ '^[A-Z][A-Z_]*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analysis_projects_reader_problem_format') THEN
    ALTER TABLE public.analysis_projects
      ADD CONSTRAINT analysis_projects_reader_problem_format
      CHECK (reader_problem IS NULL OR reader_problem ~ '^[A-Z][A-Z_]*$');
  END IF;
END $$;

COMMENT ON COLUMN public.seller_profiles.reader_problem IS
  '독자 문제(config/reader-problems.json 어휘). 케이스 추천의 유일한 하드필터 축. CHECK 은 형식만 본다.';
COMMENT ON COLUMN public.seller_profiles.competitor_url IS
  '경쟁사·비교 대상 URL(선택). /analyze/new 1단계 프리필 전용. 검증은 parseCompetitorUrl(mode=forward).';
COMMENT ON COLUMN public.analysis_projects.reader_problem IS
  '프로젝트 생성 시점의 독자 문제 스냅샷. 백필하지 않는다(기존 행은 NULL).';

-- 확인 쿼리(적용 후 사람이 돌린다)
-- 양성: SELECT table_name, column_name FROM information_schema.columns
--        WHERE (table_name='seller_profiles' AND column_name IN ('reader_problem','competitor_url'))
--           OR (table_name='analysis_projects' AND column_name='reader_problem');   -- 3행
-- 음성(롤백): BEGIN; INSERT INTO public.seller_profiles (owner_email, reader_problem) VALUES ('selftest@example.com','lowercase bad'); ROLLBACK;  -- 23514 여야 정상
```

**🔴 파괴적 — 롤백 파일에만 있고, 실행은 사람만 한다**

```sql
-- 20260924000001_profile_reader_problem_rollback.sql  (DROP COLUMN = §10.2 사람 판단 예외 1)
ALTER TABLE public.seller_profiles
  DROP CONSTRAINT IF EXISTS seller_profiles_reader_problem_format,
  DROP COLUMN IF EXISTS reader_problem,
  DROP COLUMN IF EXISTS competitor_url;
ALTER TABLE public.analysis_projects
  DROP CONSTRAINT IF EXISTS analysis_projects_reader_problem_format,
  DROP COLUMN IF EXISTS reader_problem;
```

**만들지 않는 컬럼과 이유**
- `product_kind` — `productKindOf(business_model)` 이 이미 그 축이다. 컬럼으로 또 두면 두 값이 갈라진다.
- `stage`(단계) — 어휘를 새로 만들면 그 값을 소비할 매칭 코드가 없다. `bottleneck` 7코드가 이미 "지금 어디서 막혔나"다. (→ Q1)
- `skills`/`time_budget` — `preconditions` 와 대조하려면 전제 텍스트 파싱이 필요하고 그건 별개 작업이다.
- `price_band`·`buyer_type`·`purchase_frequency` — 이미 있다. 지우지 않고 화면에서 접는다.

**RLS**: `seller_profiles` 는 20260927000001 에서 이미 정책이 있다. 앱 조회는 전부 `service_role` 이라 RLS 를 우회하고, 신원은 `getAuthVerdict()` 세션에서만 온다. **이 기능은 그 경계를 넓히지 않는다.**

## UX 노트

**1단계 `/settings/profile`**
- 칸 순서 = 추천에 미치는 영향이 큰 순. 문제 유형 → 병목 → 한 줄 소개 → 시장 → 경쟁사 URL → (접힘) 가격대·구매자·결제주기.
- 문제 유형 select 옆에 "이 값이 추천을 좁히는 유일한 조건이다. 비워 두면 전체에서 고른다"를 한 줄.
- 접힌 3칸 라벨: "지금 추천 순서를 바꾸지 않는 항목 — 나중에 2축 진단에서 쓴다".
- 상태 3가지는 기존 구현 그대로: `loading` / `프로필 없음` / **`조회 실패 → 폼을 안 그린다`**.
- 저장 성공 → 버튼 2개(케이스 추천 보기 / 새 분석 시작).

**2단계 `/cases/search`**
- 프로필 프리필은 **파라미터가 완전히 없을 때만**. 상단 한 줄 + `프로필 무시하고 전체 보기` 링크.
- 프로필 없음 → 배너 없이 기존 둘러보기 그대로 + 작은 안내 "내 프로필을 채우면 내 문제로 좁혀 보여준다 →".
- **프로필 조회 실패 → 프리필하지 않고 경고 한 줄** "프로필을 못 읽었다 — 프로필이 없다는 뜻이 아니다". 검색은 그대로 돈다(§7.1).
- 0건 회복 경로 2개: `문제 유형 조건 떼고 다시` / `소비재 포함해서 보기`. 기존 `empty_state` 문구 그대로.
- 선례 카드(위→아래): 브랜드·레버·등급 배지 → `claim` → **`내일 할 행동`(강조)** → `전제`(접힘) → `매칭 근거` → `이 케이스에 기록된 무브 N개(시간순)`(접힘, 2개 이상일 때만).
- 하단 3단계 CTA Card 1개. 문구는 권고형 — "다음은 내 경쟁사 리뷰로 직접 확인한다".

**3단계 `/analyze/new`**
- 기존 프리필 안내 문장을 그대로 쓰고, 경쟁사 URL 칸도 그 안내가 가리키게 한다. 이미 사람이 친 값은 덮지 않는다.

**정렬·등급 표시**
- 카드 순서는 기존 점수 그대로. 프로필 프리필이 점수식을 바꾸지 않는다.
- 등급 배지는 `displayGrade(move)` 한 함수로만 뽑는다.

## 수용기준 (AC)

1. `/settings/profile` 에서 문제 유형 `NO_FIRST_CUSTOMER` 를 고르고 저장 → 새로고침해도 같은 값, "마지막 저장 …KST" 갱신.
2. 저장 후 "이 프로필로 케이스 추천 보기" → `/cases/search` 로 이동, `첫 고객을 못 만든다` 칩 active, 검색어 칸에 한 줄 소개+시장 문자열, 상단에 "내 프로필에서 …가져왔다".
3. `/cases/search?problem=PRICE_TOO_LOW` 직접 진입 → **프로필 값이 덮지 않는다.**
4. 프로필 없는 계정 → 배너 없이 둘러보기 결과(전체 승인 무브 상위 20)가 기존과 동일.
5. 프로필 조회 실패 조건 → 경고 한 줄이 보이고 검색 결과 건수가 **0건으로 바뀌지 않는다.**
6. `transfer_note` 있는 무브는 "내일 할 행동" 줄, 없는 무브는 `행동 미기재` 배지. 두 화면 문구가 다르다.
7. 무브 2개 이상 케이스 카드에 "기록된 무브 N개(시간순)" 접힘, 항목은 `1.`…`N.` 번호만·화살표 없음, NULL 시점은 `시점 미확인`. 무브 1개면 접힘 **없음**.
8. 프로필에 경쟁사 URL 저장 후 `/analyze/new` → 칸이 채워지고 출처 안내. 먼저 타 둔 값은 **덮이지 않는다.**
9. `/cases/search` 하단 CTA → `/analyze/new`, 주소창에 경쟁사 URL **없음**.
10. 프리필 결과 0건일 때 "문제 유형 조건 떼고 다시" 링크 → `problem` 없는 URL, 결과 건수가 줄지 않는다.
11. `/api/profile` PUT `reader_problem: "소문자값"` → **400** + 어휘 목록. `competitor_url` 빈 문자열 → 200, 저장값 null.
12. (§10.1) 변경 파일 전체에서 `review_status` approved/rejected 쓰기·`evidence_grade`/`fact_check_grade` UPDATE 0건.

## 리스크등급 — 🟡 (중간)

올리는 요인: 하드필터 겹침으로 0건 급증(완화: bottleneck 미프리필·회복 링크 2개·숨긴 건수 표시) / "내일 할 행동" 빈 카드(완화: 미기재 배지, 정렬은 건드리지 않음) / 배포 순서 결합(마이그 선행 명시).
내리는 요인: nullable 3컬럼 ADD ONLY + 롤백 파일 → §10.2 예외 없음 / 인증 경계 무변경 / 신규 라우트 0 / 발행·등급·승인 경로 무변경.

## 소요 추정 — 9/30 범위 판단

| 항목 | 시간 |
|---|---|
| 마이그레이션 2파일 + `facets.ts` 확장 + 셀프테스트 음성 케이스 | 1.5h |
| `/settings/profile` 칸 2개 + 접힘 3칸 + 버튼 2개 | 1.5h |
| `/api/profile` PUT `competitor_url` 분기 | 0.5h |
| `/cases/search` 프리필 + 출처 + 3상태 + 회복 링크 | 2h |
| `MOVE_COLS`/`MoveRow`/`CaseMoveCard` 4필드 배선 + `displayGrade()` + 카드 확장 | 2h |
| 다단계(무브 시간순 접힘) | 2h |
| `/analyze/new` 프리필 1줄 + 하단 CTA | 1h |
| 버퍼·QA(AC 12개 실클릭) | 1.5h |
| **합계** | **≈12h (10~14h)** |

**9/30 범위 — 부분만 들어간다.** 데모선 계획의 CTO 31h 에 이미 "케이스 검색 7h + 프로필 라벨 1h"가 잡혀 있어 이 설계가 그 8h 를 흡수한다. 9/30 증분은 **1·2단계 + 3단계 배선 ≈ 7h**. 다단계 타임라인(2h)은 트랙 2 상세 페이지의 무브 타임라인 블록과 같은 데이터 계약이므로 그쪽에서 먼저 구현되면 여기서는 재사용한다.

## 질문·선택지 — 남헌만 결정할 것

**Q1. "단계(stage)"를 새 어휘로 만드나?** A. 만들지 않고 `bottleneck` 7코드를 그 자리로 쓴다 — 권고 / B. `IDEA / BUILDING / LAUNCHED / REVENUE` 신설. (B 는 소비할 매칭 코드가 없다.)
**Q2. 프리필을 어디까지 거나?** A. 문제 유형 + 자유텍스트만 — 권고 / B. 병목까지(하드필터 2겹 → 0건 양산).
**Q3. 경쟁사 URL 을 프로필에 저장해도 되나?** A. 저장한다(선택, 언제든 비움, 세션 이메일 귀속) — 권고 / B. 저장 안 함(3단계가 실질적으로 끊긴다).
**Q4. 등급 배지를 언제 `pmf_grade` 로 바꾸나?** A. `displayGrade()` 껍데기만, 값은 `evidence_grade` 유지 — 권고 / B. 이 기능과 함께 전환(사업 방향 결정에 해당).
**Q5. 추천 0건일 때 소비재를 자동으로 섞나?** A. 섞지 않는다, 사람이 "소비재 포함" 칩 — 권고 / B. 자동 `kind=all`(SaaS 선례가 있다고 읽힌다).

## 아키텍트가 확인 불가로 남긴 것 — 세션이 DB 에서 채움 (2026-09-23, `qmgrfqjfxqhxuufrnkwf`)

1. **승인 SaaS 케이스의 `reader_problem`**: 6건 중 5건 채워짐 — ConvertKit·Slack `MAKE_BUT_NO_MONEY`, Figma·Zapier `NO_CHANNEL`, Notion `NO_FIRST_CUSTOMER`, Zenefits NULL. 7코드 중 SaaS 가 덮는 것은 3코드뿐 → `PRICE_TOO_LOW`·`ONE_OFF_ONLY`·`SOLO_CEILING`·`NOBODY_TRUSTS_ME` 를 고른 SaaS 프로필은 기본화면(kind=saas)에서 0건이다. Q2·Q5 의 무게가 여기 걸린다.
2. **`transfer_note` 채워진 승인 무브**: 41 / 41 (전부). AC-6 양성 케이스는 승인 코퍼스에서 만들 수 있고, 음성(미기재)은 draft 무브에서 온다.
3. **`observed_period_start`**: 41개 중 32개 채워짐(NULL 9). **무브 2개 이상인 승인 케이스 15 / 22** — AC-7 양성 케이스 충분.

설계 밖 제약: `/cases/*` 는 허용목록 로그인 벽 안이고 이 기능은 그 전제다. 공개 라이브러리(`/library`)에서 프로필 프리필을 쓰려면 익명 프로필(localStorage) 설계가 따로 필요하다 — 이번 범위 밖.
