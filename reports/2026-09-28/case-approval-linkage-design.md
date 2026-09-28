# 케이스 ↔ 관련성 판정 연결 — 스키마 설계 (설계만, 코드·DB 변경 없음)

작성 2026-09-28 · 남헌 지시(09-28): "지금 켜지는 않지만 케이스 최종 승인 자동화 방향으로 간다 — 사전 준비를 하라."

- 선행: `reports/2026-09-28/approval-automation-design.md` §0·§7 결정 1(케이스와 리뷰를 잇는 신호가 데이터에 없다), CLAUDE.md §10.1 조건 5(범위 = `review_relevance_verdicts.auto_approved_at` 뿐).
- 이 문서의 범위: **연결 구조의 선택과 마이그레이션 초안**. 언제 켜는가는 `docs/case-approval-automation-roadmap.md` 가 정한다.
- 상태: 코드 변경 0 · 마이그레이션 파일 0(초안은 이 문서 §5 에만 있다) · DB 쓰기 0.

## 0. 결론 먼저

- **케이스 1건은 리뷰에서 나오지 않는다. 지금은 0건이 연결돼 있고, 연결할 수 있는 컬럼도 없다.** 케이스는 WebSearch 조사에서 나오고 근거는 전부 웹 URL(블로그·공시·기사)이다(§1).
- 관계를 만든다면 **무브 1 : 입력 N** 이다. 근거 1줄 = 출처 1개이고 승인 단위가 무브이기 때문이다. 리뷰가 아닌 근거(기사·공시)는 사라지지 않는다 — 오늘 기준 근거의 100% 다.
- 권고: **연결 테이블 `case_move_inputs(case_move_id, input_id)`** 를 새로 둔다(§3 안 B). `case_evidence` 에 `input_id` 를 얹는 안(A)은 등급 산식과 `url NOT NULL` 에 걸리고, 케이스에 `project_id` 를 다는 안(C)은 판정 단위와 어긋난다.
- 케이스 단위 자동 승인 조건은 **"연결된 입력 전부 승인 + 수치 없는 긍정 무브만"** 이다(§4). 과반은 채택하지 않는다. 리뷰 아닌 근거가 섞여도 되지만 관련성 신호가 그 근거를 검증해 주지는 않는다 — 그래서 수치 주장은 영구 사람 몫이다.
- **백필 불가. 신규 케이스부터다**(§6). `analysis_inputs` 에 URL 이 없고, 근거 URL 은 리뷰가 아니며, 리뷰 원문은 30일 뒤 purge 된다.
- 실제 적용 전에 **CLAUDE.md §10.1 개정이 다시 필요하다**(§7 초안). 조건 5 가 이 범위를 명시적으로 막고 있고, CLAUDE.md 편집은 분류기가 막아 남헌 또는 역할 세션 몫이다.

## 1. 실측 — 케이스는 어디서 오나

코드로 확인한 경로(추정 아님):

- `scripts/cmo-daily.mjs` S2 research: `research-queue.mjs --plan/--claim` 이 큐 행(`brand_name`·`target_bottleneck`·`reason`)을 만들고, `sa-cmo-researcher` 서브에이전트가 `WebSearch,WebFetch` 로 조사해 `drafts/cases/<slug>.json` 을 쓴다(허용 도구: `cmo-daily.mjs:133`). 큐 행에 `project_id`·`input_id` 는 없다(`20260908000002_research_queue.sql`).
- `.claude/agents/sa-cmo-researcher.md` 에 `analysis_inputs`·`review_relevance`·리뷰 언급 0건. 리서처는 수집 리뷰를 읽지 않는다.
- `scripts/case-review.mjs commit` 이 초안을 `case_studies` → `case_moves` → `case_evidence` 로 INSERT 한다(전부 `draft`). `lib/cases/draft.ts toRows()` 가 행을 만들며, 근거는 `Evidence{url, source_tier, is_self_reported, observation_key, supports_metric, move}` 다. `input_id` 자리는 없다.
- `case_evidence.url` 은 `NOT NULL` 이다(`20260906000001:195`). 실물 예 `drafts/cases/plausible-analytics-usage-based-pricing-margin.json`: 근거 5건 전부 `plausible.io/blog/*`·홈페이지 — 리뷰 0건.
- `analysis_inputs` 컬럼: `id, project_id, source_type(review|ad|detail_page), raw_text, created_at, source_key, collected_at, purged_at, purge_reason`. **URL 컬럼이 없다**(`20260816000001`, `20260829000003:325`, `20260930000015`).
- `lib/cases/*`·`scripts/case-*.mjs`·`app/cases/**` 에서 `analysis_inputs`/`input_id` 를 읽는 곳: `lib/cases/library.ts:352` 의 소스별 건수 집계 1곳뿐. 케이스 행과 조인하지 않는다.
- 판정 테이블: `review_relevance_verdicts` PK = `input_id`, `project_id` 동반(`20260929000002`). 자동 승인 표시는 `auto_approved_at`·`auto_approval_rule`(000027, 미적용).
- 설계 문서가 이미 거부한 것: `case_studies` ↔ `analysis_aspects` FK — "케이스는 특정 분석 프로젝트에 속하지 않는다"(`20260906000001` 거부 대안 E).

정리하면:

| 물음 | 답 | 근거 |
|---|---|---|
| 케이스 1건 : 리뷰 N건인가 | 구조상 무브 1 : 입력 N. 오늘은 0 | 근거 1줄=출처 1개, 승인 단위=무브 |
| 리뷰 아닌 출처가 있나 | 있다 — 지금은 100% | 초안 JSON 전수(`drafts/cases/*.json` 60건이 전부 URL 근거) |
| 판정 단위와 맞는 키 | `analysis_inputs.id` 뿐 | 판정 PK 가 input_id |

## 2. 연결이 채워지려면 — 전제 P1 (범위 밖, 이름만 못박는다)

연결 컬럼을 만들어도 리서처가 리뷰를 안 읽으면 영원히 비어 있다. 자동 승인의 "재료"는 다음이 있어야 생긴다.

- **P1. VOC 근거 조사 경로**: 큐 행에 `project_id` 를 싣고, 리서처(또는 별도 `sa-cmo-voc-researcher`)가 그 프로젝트의 `verdict='relevant'` 입력을 재료로 받아 초안에 `moves[i].voc_inputs: [<input_id>…]` 를 적는다. `validateDraft` 가 uuid 형식·중복을 검사하고 `commit` 이 `case_move_inputs` 에 INSERT 한다.
- 이 경로가 없으면 §3 이하는 전부 빈 테이블 설계다. 로드맵 2단계 진입 조건에 "연결된 무브 ≥ 20건"을 넣은 이유다.

## 3. 연결 구조 — 선택지 3개

### A. `case_evidence.input_id uuid NULL REFERENCES analysis_inputs(id)`

- 장점: 컬럼 1개. "근거 1줄 = 출처 1개" 에 리뷰도 출처로 들어간다. 검수 화면이 근거 목록에서 그대로 보여 준다.
- 대가 1 — **`url NOT NULL`**: 리뷰는 URL 이 없다. `url` 을 nullable 로 풀고 `CHECK (url IS NOT NULL OR input_id IS NOT NULL)` 를 걸어야 한다. 제약 완화는 비파괴지만 URL 을 전제로 한 코드(`domainOf`, `validateDraft` 의 `url 필수`, `/cases` 근거 링크)가 전부 분기해야 한다.
- 대가 2 — **등급 오염**: `factCheckGrade` 는 `source_tier='primary' ∧ !is_self_reported ∧ supports_metric !== false` 행을 "비자기보고 1차" 로 세어 A 를 준다(`draft.ts:283`). 리뷰 행을 primary 로 적으면 **수치 주장이 리뷰 1건으로 A** 가 된다. 막으려면 `CHECK (input_id IS NULL OR supports_metric IS FALSE)` 와 산식 분기가 더 필요하다. 두 축(사실확인·관련성)이 한 행에 섞인다.
- 대가 3 — 30일 purge 뒤 `raw_text` 가 NULL 인 입력을 근거로 보여 주게 된다(행은 남지만 내용이 없다).

### B. 연결 테이블 `case_move_inputs(case_move_id, input_id)` — **권고**

- 장점: `case_evidence`·등급 산식·URL 전제를 **하나도 건드리지 않는다**. 관련성 신호는 "이 무브의 주장을 뒷받침하는 사용자 목소리" 라는 별도 축으로 남는다. 승인 단위(무브)와 판정 단위(입력)를 직접 잇는다. N:M 이 자연스럽다(같은 리뷰가 두 무브를 받칠 수 있다).
- 대가 1: 테이블 1개 추가. 검수 화면이 근거 목록과 별도로 "연결 VOC n건" 을 읽어야 한다(SELECT 1개).
- 대가 2: 케이스 단위 근거(`case_move_id IS NULL`)는 못 잇는다 — 의도적이다. 승인 단위가 무브라 케이스 단위 VOC 는 승인 판정에 쓸 곳이 없다. 필요하면 나중에 `case_study_inputs` 를 따로 두면 된다(YAGNI).
- 대가 3: 표시·승인 컬럼은 결국 `case_moves`/`case_studies` 에 nullable 로 더해야 한다(§5-2). 이건 A 도 같다.

### C. `case_studies.project_id uuid NULL REFERENCES analysis_projects(id)`

- 장점: 컬럼 1개, 리서처가 input_id 를 고를 필요가 없다.
- 대가: **판정 단위가 안 맞는다.** 프로젝트 하나에 입력이 수백~수천 건이고 그중 relevant 는 일부다. "연결된 입력 전부 승인" 을 프로젝트 단위로 물으면 항상 거짓이고, 과반으로 물으면 케이스 주장과 무관한 리뷰가 승인 근거가 된다. 거부 대안 E 와도 충돌한다.
- 보조 축으로는 쓸모가 있다(케이스가 어느 브랜드 조사에서 나왔는지). 하지만 B 의 `input_id → verdict.project_id` 로 유도되므로 **지금은 넣지 않는다.**

### 선택: B

한 줄 이유 — 관련성 판정은 "사용자 목소리가 맞나" 를 말하지 "이 수치가 맞나" 를 말하지 않는다. 두 축을 한 행에 섞는 A 는 등급 산식을 거짓으로 만들고, C 는 물음 자체를 못 만든다.

## 4. 케이스 단위 "자동 승인 가능" 판정 규칙 — `ca-v1`

승인 단위는 무브다(`20260906000001:149` — 전부-아니면-전무가 병목의 원인). 케이스는 무브가 다 정리된 뒤에 따라간다.

### 4-1. 무브가 자동 승인 후보가 되는 조건 (전부 만족)

1. **연결 입력 ≥ 3건.** 리뷰 1~2건은 패턴이 아니라 일화다. 사실확인 A 가 "서로 다른 원 관측 2개" 를 요구하는데(`draft.ts:214`), VOC 에는 관측 키가 없어 한 단계 더 보수적으로 3 으로 둔다. 같은 `project_id` 여야 한다(다른 브랜드 리뷰가 섞이면 무브 주장과 대응하지 않는다).
2. **연결 입력 전부가 승인 상태.** 각 입력의 판정 행이 `auto_approved_at IS NOT NULL` 이거나 `human_verdict='relevant'`. 하나라도 `human_verdict IN ('irrelevant','unknown')` 이거나 판정 행이 없거나 미승인이면 후보가 아니다.
   - **과반을 쓰지 않는 이유**: 관련성은 이 경로가 가진 **유일한** 기계 신호다. 과반이면 무관 VOC 가 승인된 주장 안에 남는다. §10.1 조건 1 "완전 동의만" 의 정신과 같다.
3. **수치 없는 무브만.** `metric_after IS NULL`(사실확인 D). 수치가 있으면 사람이 본다 — 관련성 판정은 숫자를 검증하지 않고, 수치 주장의 근거는 웹 출처라 이 신호 밖이다. `fact_check_grade='A'` 여도 예외로 넣지 않는다(A 산식은 공시·대시보드 판정이라 사람이 한 번은 봐야 한다는 기존 규칙 유지).
4. **`outcome_direction <> 'negative'`.** 부정 사례는 사실확인 A 없이는 발행 불가라는 기존 규칙(`review.ts:72`)이 있고, 명예훼손 위험은 자동 승인으로 넘기지 않는다.
5. **`transfer_note`·`preconditions` 둘 다 기재**(evidence_grade 가 A 또는 B). D·C 는 독자가 할 행동이 없거나 일반론이라 승인해도 쓸 데가 없다.
6. **`review_status='draft'` ∧ `reviewed_by IS NULL`.** 사람이 이미 손댄 무브는 대상이 아니다.

리뷰 아닌 근거(기사·공시)가 섞인 무브: **후보가 될 수 있다.** 조건 3·4 가 그 근거가 떠받치는 위험(수치·부정 주장)을 이미 배제하기 때문이다. 관련성 신호가 웹 근거를 검증해 주는 것은 아니며, 그럴 필요도 없다 — 남는 주장은 "사용자들이 이런 페인·요구를 말한다" 뿐이고 그 부분은 VOC 가 받친다.

연결 입력이 0건인 무브: **영구 사람 몫.** 이 규칙의 대상이 아니다.

### 4-2. 케이스가 따라가는 조건

- 케이스의 무브 **전부**가 `approved`(자동·사람 어느 쪽이든)이고, 매칭 축 `bottleneck`·`reader_problem` 이 NULL 이 아닐 때만 `case_studies.review_status='approved'`. 하나라도 `draft`·`rejected` 면 케이스는 `draft` 로 남는다(기존 경고 "케이스 승인 = 무브 전부 승인이 아니다" 의 역방향을 지킨다 — 승인 안 된 무브가 있는 케이스를 기계가 열지 않는다).
- 케이스에는 `reviewed_by` 를 쓰지 않는다. `auto_approved_at`·`auto_approval_rule` 만 찍는다. **`reviewed_by IS NULL` 이 "사람이 안 봤다" 의 판별자**이고, 되돌리기 SQL 이 그걸 쓴다(로드맵 §4).

### 4-3. 2단계(후보 표시만)와 3단계(승인)의 차이

- 2단계: 야간 배치가 조건 1~6 을 계산해 `case_moves.auto_candidate_at` 만 찍는다. `review_status` 는 건드리지 않는다. `/cases/grade` 카드가 "자동 승인 후보 — 연결 VOC n건 전부 관련 확정" 배지를 띄우고, 사람은 기존 버튼을 누른다. 사람 결정과 후보 표시의 일치율이 3단계 진입 근거다.
- 3단계: 같은 조건에 `review_status='approved'` + `auto_approved_at` + `auto_approval_rule='ca-v1'` 을 쓴다. 감사·킬스위치는 로드맵 §3.

## 5. 마이그레이션 초안 — 비파괴, 파일은 아직 만들지 않았다

파일 이름 예정: `supabase/migrations/2026XXXX_case_move_inputs.sql` + `_rollback.sql`. 2단계 착수 PR 에서 만든다. 여기 두는 이유는 폴더에 넣으면 누군가 적용 대상으로 읽기 때문이다.

### 5-1. 연결 테이블 (2단계 전에 필요)

```sql
-- 케이스 무브 ↔ 수집 입력(리뷰) 연결. 관련성 판정(review_relevance_verdicts, PK input_id)과 무브를 잇는 유일한 축.
-- 🟢 비파괴: 신규 테이블 1개. 기존 테이블·컬럼·행 변경 없음. §10.2 사람 판단 예외 5개 해당 없음.
CREATE TABLE IF NOT EXISTS public.case_move_inputs (
  case_move_id uuid NOT NULL REFERENCES public.case_moves(id) ON DELETE CASCADE,
  input_id     uuid NOT NULL REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  -- 누가 이었나: 'sa-cmo-researcher' 같은 에이전트 이름 또는 사람 이메일. NULL 금지 — 출처 없는 연결은 연결이 아니다.
  linked_by    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_move_id, input_id)
);
-- 판정 조인 방향(입력 → 무브)용.
CREATE INDEX IF NOT EXISTS case_move_inputs_input_idx ON public.case_move_inputs (input_id);
ALTER TABLE public.case_move_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_move_inputs FORCE  ROW LEVEL SECURITY;  -- 정책 0개 = service_role 전용 (리포 관례)
COMMENT ON TABLE public.case_move_inputs IS
  '무브의 주장을 받치는 사용자 목소리(analysis_inputs). 근거 등급(case_evidence)과 별개 축 — 관련성 판정을 케이스 승인으로 잇는 유일한 연결. 설계: reports/2026-09-28/case-approval-linkage-design.md';
```

롤백:

```sql
DROP TABLE IF EXISTS public.case_move_inputs;  -- 연결은 초안 JSON(voc_inputs)에서 다시 commit 하면 복원된다
```

확인 쿼리(적용 후): 양성 — `information_schema.tables` 에 1행, `pg_policies` 0건, `relforcerowsecurity=true`. 음성(롤백 블록 안에서) — 없는 `case_move_id` INSERT → 23503, 같은 쌍 두 번 INSERT → 23505.

### 5-2. 표시·승인 컬럼 (2단계: `auto_candidate_at` / 3단계: 나머지)

```sql
-- 🟢 비파괴: nullable 컬럼 5개 ADD COLUMN IF NOT EXISTS. 기존 CHECK(review_status) 변경 없음.
ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS auto_candidate_at  timestamptz,   -- 2단계: 후보 표시 시각(표시만, 상태 아님)
  ADD COLUMN IF NOT EXISTS auto_approved_at   timestamptz,   -- 3단계: 기계가 approved 로 바꾼 시각
  ADD COLUMN IF NOT EXISTS auto_approval_rule text;          -- 조건 버전 태그('ca-v1'). 완화 시 새 태그.
ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS auto_approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_rule text;
-- 되돌리기·감사 조회용 부분 인덱스(대부분 NULL).
CREATE INDEX IF NOT EXISTS case_moves_auto_approved_idx
  ON public.case_moves (auto_approved_at DESC) WHERE auto_approved_at IS NOT NULL;
COMMENT ON COLUMN public.case_moves.auto_approved_at IS
  'ca-v1 자동 승인 시각. reviewed_by IS NULL 이면 사람이 안 본 승인 — 킬스위치 되돌리기 대상.';
```

롤백: 위 컬럼 5개 `DROP COLUMN IF EXISTS` + 인덱스 DROP. **주의** — DROP COLUMN 은 §10.2 사람 판단 예외다. 되돌릴 일이 생기면 컬럼을 지우지 말고 값을 NULL 로 두는 쪽을 먼저 쓴다.

### 5-3. 후보 판정 뷰 (선택 — 배치와 화면이 같은 SQL 을 쓰게)

```sql
CREATE OR REPLACE VIEW public.case_move_auto_candidates
WITH (security_invoker = true) AS   -- 어드바이저 규칙: 뷰는 INVOKER
SELECT m.id AS case_move_id, count(*) AS linked, s.id AS case_study_id
FROM public.case_moves m
JOIN public.case_studies s ON s.id = m.case_study_id
JOIN public.case_move_inputs l ON l.case_move_id = m.id
JOIN public.review_relevance_verdicts v ON v.input_id = l.input_id
WHERE m.review_status = 'draft' AND m.reviewed_by IS NULL
  AND m.metric_after IS NULL
  AND m.outcome_direction <> 'negative'
  AND coalesce(m.transfer_note,'') <> '' AND coalesce(m.preconditions,'') <> ''
GROUP BY m.id, s.id
HAVING count(*) >= 3
   AND count(DISTINCT v.project_id) = 1
   AND bool_and(v.auto_approved_at IS NOT NULL OR v.human_verdict = 'relevant')
   AND bool_and(v.human_verdict IS DISTINCT FROM 'irrelevant' AND v.human_verdict IS DISTINCT FROM 'unknown');
```

`case_moves.reviewed_by` 는 이미 있다(`20260914000001_case_review_note.sql`, 화면 `writeMove` 가 로그인 이메일을, CLI 가 `--by` 이름을 쓴다). 그래서 무브 단위 "사람이 봤다" 판별자는 새로 만들 필요가 없다 — 위 뷰와 되돌리기 SQL 이 그대로 쓴다. 단 CLI `approve` 경로(`case-review.mjs:322`)는 `review_status` 만 쓰고 `reviewed_by` 를 안 채운다. 2단계 PR 에서 그 한 줄을 맞춰야 CLI 승인이 기계 승인으로 오인되지 않는다.

## 6. 백필 — 불가, 신규 케이스부터

- 매칭 키가 없다: `analysis_inputs` 에 URL 이 없고 `case_evidence` 에 텍스트 원문이 없다(스니펫 ≤300자, 그것도 블로그 인용).
- 내용이 없다: 리뷰 `raw_text` 는 수집 30일 뒤 purge(`purged_at`)돼 사후 텍스트 매칭도 못 한다.
- 출처가 다르다: 현재 케이스 60건의 근거는 전부 웹 문서다. 맞춰 볼 리뷰가 애초에 없다.
- 그러므로 **기존 케이스는 연결 0건인 채로 남고, 영구 사람 몫이다.** 자동 승인의 모집단은 P1(§2) 이후 만들어지는 신규 케이스뿐이다. "백필로 몇 건 살릴 수 있나" 를 다시 묻지 않도록 여기 못박는다.

## 7. CLAUDE.md §10.1 개정 필요 — 문구 초안

지금 문단은 이 범위를 두 번 막는다: "이 예외는 `case_studies`/`case_moves` 의 `review_status` 에는 적용되지 않는다" 와 조건 5 "범위는 관련성 자동 승인 하나뿐이다". 2단계(표시 컬럼 UPDATE)부터 이미 §10.1 밖이다 — 허용 목록은 케이스 테이블 **INSERT** 뿐이다. 개정 없이는 배치가 `auto_candidate_at` 도 못 쓴다.

개정은 **실제 적용 직전**에, 남헌 또는 역할 세션이 한다(분류기가 CLAUDE.md 2차 편집을 막는다). 아래는 붙일 문구 초안이다.

> **예외 2(남헌 20XX-XX-XX 개정) — 케이스 무브 자동 승인 `ca-v1`.** 위 T2 자동 승인이 로드맵(`docs/case-approval-automation-roadmap.md`) 3단계 진입 조건을 채운 뒤에 한해, 무인 루프가 `case_moves.review_status` 를 `draft`→`approved` 로, 그리고 그 케이스의 무브가 전부 approved 일 때 `case_studies.review_status` 를 `approved` 로 쓸 수 있다. 조건은 설계 문서 `reports/2026-09-28/case-approval-linkage-design.md` §4 의 여섯 가지(연결 VOC ≥3건 전부 승인 · 수치 없음 · 부정 사례 아님 · 행동·전제 기재 · 사람 미개입)이고, 하나라도 못 지키면 §10.1 위반이다.
> 1. **쓸 수 있는 컬럼은 이것뿐이다**: `case_moves.review_status`·`auto_candidate_at`·`auto_approved_at`·`auto_approval_rule`, `case_studies.review_status`·`auto_approved_at`·`auto_approval_rule`. `reviewed_by`·`review_note`·`transferability`·등급 컬럼은 여전히 사람만 쓴다.
> 2. **2단계(후보 표시)** 에서는 `auto_candidate_at` 만 쓴다. 상태는 사람이 바꾼다.
> 3. **감사·킬스위치**는 T2 와 같은 구조로 따로 돈다(로드맵 §3). 킬스위치가 걸리면 신규 승인 0건이고, **`auto_approval_rule='ca-v1' ∧ reviewed_by IS NULL ∧ review_status='approved'` 인 행을 `draft` 로 되돌린다** — 조건 4 의 "스스로 끄고 draft 로 되돌아간다" 의 케이스 버전이다. 사람이 이미 본 행(`reviewed_by` 있음)은 건드리지 않는다.
> 4. **단계를 올리는 것은 사람·역할 세션만 한다**(리포 변수 `CASE_AUTO_APPROVAL_STAGE`). 기계는 내리기만 한다.
> 5. 조건 5 의 "범위는 관련성 자동 승인 하나뿐" 은 이 예외 2 를 더한 것으로 읽는다. `evidence_grade`·발행·이식성 판정에는 여전히 미치지 않는다.

같이 고칠 문장: "이 예외는 `case_studies`/`case_moves` 의 `review_status` 에는 적용되지 않는다 — …범위를 판정 행 하나로 좁혔다" → "…좁혔다. 케이스까지 넓히는 조건은 예외 2 다." 그리고 **금지** 절의 "유일한 예외는 위 T2 완전 동의 자동 승인" → "예외는 T2 완전 동의 자동 승인과 예외 2(케이스 무브 `ca-v1`) 둘이다".

## 8. 여기서 정하지 않은 것 (남헌·역할 세션 판단)

- **P1 의 형태**: 기존 리서처에 VOC 재료를 얹을지, VOC 전용 조사 경로를 따로 둘지. 후자면 케이스 유형(`researched_by`)으로 구분된다.
- **연결 최소 3건**: 실측 없이 정한 보수적 값이다. 2단계에서 "사람이 승인한 후보의 연결 건수 분포" 를 보고 조정한다.
- **CLI 승인의 `reviewed_by` 누락**: `scripts/case-review.mjs approve --move` 는 `reviewed_by` 를 안 쓴다(`--by` 는 케이스 UPDATE 에만 들어간다). 되돌리기 SQL 의 판별자가 `reviewed_by IS NULL` 이라, 2단계 전에 이 경로가 `reviewed_by`·`reviewed_at` 을 채우도록 맞춰야 한다. 그 전에 CLI 로 승인된 옛 무브는 `auto_approval_rule IS NULL` 이라 되돌리기 대상에 안 걸린다(조건이 AND 다) — 그래도 맞춘다.
