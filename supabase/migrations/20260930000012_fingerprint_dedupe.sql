-- 지문 키 이행 정리 — 같은 글이 두 타깃 경로로 들어와 생긴 중복을 소프트 처리한다
--
-- 배경: `review_fingerprints.identity_key` 가 2026-09-24 까지
--   `sha256(source_key | product_ref | external_id)` 였다. 그래서 **같은 글·댓글이
--   `url:` 타깃과 `board:` 타깃 두 경로로 들어오면 서로 다른 키가 되어
--   `analysis_inputs` 에 두 행**이 됐다(SP-031 과 같은 형태). 코드는 이 브랜치에서
--   `sha256(source_key | external_id)` 로 바꿨다(lib/review/fingerprint.ts).
--   이 파일은 **그 전에 이미 생긴 중복 행**을 치운다.
--
-- ⛔ (a) 옛 키 → 새 키 백필은 **불가능하다.** 판단을 그대로 적는다:
--      새 키를 계산하려면 `external_id` 가 필요한데 `review_fingerprints` 는
--      그것을 저장하지 않는다(해시만 남긴다). 역산도 안 된다(sha256).
--      원문(`analysis_inputs.raw_text`)에도 글 id 는 없다.
--      ⇒ 그래서 이행은 SQL 백필이 아니라 **코드의 조회 폴백 + 히트 시 승격**이다
--        (lib/review/store.ts `recordFingerprint` — 옛 키로 찾히면 그 행의
--         identity_key 를 새 키로 UPDATE 한다). 수집이 돌면서 조금씩 옮겨진다.
--      ⇒ 폴백이 **못 찾는 경우**가 남는다: 옛 행이 다른 타깃(productRef)으로
--        저장된 경우다. 그건 이 파일의 (b) 와 러너의 2차 방어(content_hash)가 맡는다.
--
-- (b) 이미 중복된 `analysis_inputs` 정리 — **DELETE 하지 않는다.** `purged_at = now()`
--     소프트 처리만 한다. extract(`lib/analysis/extract-run.ts`)와 적합성 판정
--     (`scripts/relevance-judge-auto.mjs`)이 둘 다 `purged_at is null` 로 거르므로,
--     이 한 컬럼만으로 분석에서 빠진다. `raw_text` 는 **남긴다** — 근거 감사가 되고,
--     30일 폐기 배치가 나중에 어차피 비운다.
--
-- 🔴 **적용은 사람이 한다**(CLAUDE.md §10.2 사람 판단 예외 2 — 기존 행을 건드리는
--    대량 UPDATE). 서브에이전트가 만든 파일이고 **미적용**이다.
--    되돌릴 수 있게 만들어 뒀다: 어떤 행을 찍었는지 `review_dedupe_soft_purges` 에
--    남기고, `_rollback.sql` 이 그 목록으로 정확히 되돌린다(now() 시각 추측이 아니다).
--
-- ⚠️ 중복 판정은 `source_key + content_hash` 다. `external_id` 가 없으니 이게
--    쓸 수 있는 유일한 축이다. 그래서 **긴 본문만** 본다(정규화 길이 ≥ 120자 —
--    lib/review/fingerprint.ts 의 `CROSS_TARGET_MIN_TEXT_LEN` 과 같은 값).
--    짧고 흔한 글("감사합니다")은 서로 다른 사람의 글이 같은 해시가 되고, 그걸
--    중복으로 버리면 조용히 데이터를 잃는다.
--
-- ⚠️ **원문이 이미 폐기된(raw_text is null) 중복 후보는 손대지 않는다.** 길이를 잴 수
--    없어 위 안전선을 적용할 수 없다 = 확인 불가다. 확인 불가를 양성으로 접지 않는다
--    (§7.1). 아래 0-2 SELECT 가 그 건수를 따로 세므로 사람이 보고 판단한다.
--
-- 참조 이관: `analysis_inputs(id)` 를 참조하는 테이블은 **둘뿐**이다(마이그레이션 전수 확인):
--     · review_fingerprints.analysis_input_id (ON DELETE SET NULL) — 그대로 둔다.
--       남겨진 쪽 지문이 소프트 처리된 원문을 계속 가리켜도 "이미 본 리뷰" 판정은 맞다.
--     · review_relevance_verdicts.input_id (PK) — 남기는 쪽에 판정이 없으면 옮긴다(2단계).
--   `analysis_aspects` 는 원문을 참조하지 않는다(속성은 프로젝트 단위다) — 옮길 것이 없다.
--
-- 롤백: supabase/migrations/20260930000012_fingerprint_dedupe_rollback.sql

-- ════════════════════════════════════════════════════════════════════
-- 0) 먼저 세어 본다 (적용 전에 이 SELECT 들을 눈으로 확인한다)
-- ════════════════════════════════════════════════════════════════════
--
-- 0-1) 소프트 처리 대상 — 긴 본문·원문 살아 있는 중복
--
--   with base as (
--     select distinct fp.source_key, fp.content_hash, ai.id as input_id, ai.created_at
--       from public.review_fingerprints fp
--       join public.analysis_inputs ai on ai.id = fp.analysis_input_id
--      where ai.purged_at is null
--        and ai.raw_text is not null
--        and length(btrim(regexp_replace(ai.raw_text, '\s+', ' ', 'g'))) >= 120
--   ), grp as (
--     select b.*,
--            count(*)     over (partition by b.source_key, b.content_hash) as n,
--            row_number() over (partition by b.source_key, b.content_hash
--                               order by b.created_at asc, b.input_id asc)  as rn
--       from base b
--   )
--   select source_key,
--          count(*) filter (where rn > 1) as 지울_행,
--          count(distinct content_hash) filter (where n > 1) as 중복_그룹
--     from grp where n > 1 group by source_key order by 2 desc;
--
-- 0-2) 확인 불가 — 원문이 이미 폐기돼 길이를 못 재는 중복 후보(손대지 않는다)
--
--   select fp.source_key, count(*) as 행
--     from public.review_fingerprints fp
--     join public.analysis_inputs ai on ai.id = fp.analysis_input_id
--    where ai.raw_text is null
--      and exists (select 1 from public.review_fingerprints f2
--                   where f2.source_key = fp.source_key
--                     and f2.content_hash = fp.content_hash
--                     and f2.id <> fp.id)
--    group by 1 order by 2 desc;
--
-- 0-3) 짧은 본문 중복 — 오탐 위험이 커서 손대지 않는다(참고용)
--
--   select count(*) from (
--     select fp.source_key, fp.content_hash
--       from public.review_fingerprints fp
--       join public.analysis_inputs ai on ai.id = fp.analysis_input_id
--      where ai.raw_text is not null
--        and length(btrim(regexp_replace(ai.raw_text, '\s+', ' ', 'g'))) < 120
--      group by 1, 2 having count(distinct fp.analysis_input_id) > 1) s;

-- ════════════════════════════════════════════════════════════════════
-- 1) 러너의 2차 방어가 쓰는 조회 축 (비파괴)
-- ════════════════════════════════════════════════════════════════════
-- store.ts 가 적재 직전 `source_key + content_hash + analysis_input_id is not null`
-- 을 한 번 본다. 없어도 동작하지만(seq scan) 인덱스가 있으면 싸다.
CREATE INDEX IF NOT EXISTS review_fingerprints_source_content_idx
  ON public.review_fingerprints (source_key, content_hash);

COMMENT ON INDEX public.review_fingerprints_source_content_idx IS
  '같은 소스에 같은 본문이 이미 적재됐는지 보는 축(교차 타깃 중복 2차 방어, lib/review/store.ts).';

-- ════════════════════════════════════════════════════════════════════
-- 2) 무엇을 찍었는지 남기는 감사 테이블 (신규 · 비파괴)
-- ════════════════════════════════════════════════════════════════════
-- 이게 없으면 롤백이 "now() 근처 시각"을 추측해야 하고, 30일 폐기 배치가 찍은
-- purged_at 과 섞여 구분이 안 된다. 되돌릴 수 있게 만드는 것이 이 테이블의 목적이다.
CREATE TABLE IF NOT EXISTS public.review_dedupe_soft_purges (
  input_id       uuid PRIMARY KEY
                 REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  kept_input_id  uuid NOT NULL
                 REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  source_key     text NOT NULL,
  content_hash   text NOT NULL,
  -- 이 행의 적합성 판정을 남기는 쪽으로 옮겼는가. 롤백이 되돌릴 대상을 가린다.
  verdict_moved  boolean NOT NULL DEFAULT false,
  applied_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_dedupe_soft_purges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_dedupe_soft_purges FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_dedupe_soft_purges IS
  '지문 키 이행(2026-09-24)으로 소프트 처리한 중복 원문 목록. 롤백의 유일한 근거다 — 지우면 되돌릴 수 없다. 정책 0개 = service_role 전용.';

-- ════════════════════════════════════════════════════════════════════
-- 3) 대상 확정 — 그룹마다 **가장 오래된 1행만 남긴다**
-- ════════════════════════════════════════════════════════════════════
-- 데이터를 바꾸지 않는다. 목록만 적립한다(재실행 안전 — ON CONFLICT DO NOTHING).
WITH base AS (
  SELECT DISTINCT fp.source_key, fp.content_hash, ai.id AS input_id, ai.created_at
    FROM public.review_fingerprints fp
    JOIN public.analysis_inputs ai ON ai.id = fp.analysis_input_id
   WHERE ai.purged_at IS NULL
     AND ai.raw_text IS NOT NULL
     AND length(btrim(regexp_replace(ai.raw_text, '\s+', ' ', 'g'))) >= 120
), grp AS (
  SELECT b.*,
         count(*)     OVER (PARTITION BY b.source_key, b.content_hash) AS n,
         row_number() OVER (PARTITION BY b.source_key, b.content_hash
                            ORDER BY b.created_at ASC, b.input_id ASC)  AS rn
    FROM base b
), keeper AS (
  SELECT source_key, content_hash, input_id FROM grp WHERE n > 1 AND rn = 1
), loser AS (
  SELECT g.source_key, g.content_hash, g.input_id, k.input_id AS kept_input_id
    FROM grp g
    JOIN keeper k ON k.source_key = g.source_key AND k.content_hash = g.content_hash
   WHERE g.n > 1 AND g.rn > 1
)
INSERT INTO public.review_dedupe_soft_purges (input_id, kept_input_id, source_key, content_hash)
SELECT input_id, kept_input_id, source_key, content_hash FROM loser
ON CONFLICT (input_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 4) 적합성 판정 이관 — 남기는 쪽에 판정이 없을 때만
-- ════════════════════════════════════════════════════════════════════
-- `review_relevance_verdicts.input_id` 는 PK 라, 남기는 쪽으로 옮길 수 있는 것은
-- 그룹당 1행이다. `DISTINCT ON` 이 그것을 보장한다(PK 충돌 방지).
-- 남기는 쪽에 이미 판정이 있으면 옮기지 않는다 — 사람 채점(human_verdict)이
-- 덮이는 것이 더 비싸다. 그때 중복 쪽 판정 행은 그대로 남는다(원문만 소프트 처리).
WITH movable AS (
  SELECT DISTINCT ON (g.kept_input_id) g.input_id AS from_id, g.kept_input_id AS to_id
    FROM public.review_dedupe_soft_purges g
    JOIN public.review_relevance_verdicts v ON v.input_id = g.input_id
   WHERE g.verdict_moved = false
     AND NOT EXISTS (SELECT 1 FROM public.review_relevance_verdicts k
                      WHERE k.input_id = g.kept_input_id)
   ORDER BY g.kept_input_id, g.applied_at ASC
), moved AS (
  UPDATE public.review_relevance_verdicts v
     SET input_id = m.to_id
    FROM movable m
   WHERE v.input_id = m.from_id
  RETURNING m.from_id
)
UPDATE public.review_dedupe_soft_purges g
   SET verdict_moved = true
  FROM moved m
 WHERE g.input_id = m.from_id;

-- ════════════════════════════════════════════════════════════════════
-- 5) 소프트 처리 — purged_at 만 찍는다 (DELETE 아님 · raw_text 유지)
-- ════════════════════════════════════════════════════════════════════
-- CHECK `raw_text IS NOT NULL OR purged_at IS NOT NULL` 은 만족한다(둘 다 값이 있다).
UPDATE public.analysis_inputs ai
   SET purged_at = now()
  FROM public.review_dedupe_soft_purges g
 WHERE ai.id = g.input_id
   AND ai.purged_at IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 확인 쿼리 (적용 후 — 눈으로 본다. 도구가 준 success 로 보고하지 않는다)
-- ════════════════════════════════════════════════════════════════════
-- ── 양성 ────────────────────────────────────────────────────
--   select count(*) as 소프트처리, count(*) filter (where verdict_moved) as 판정이관
--     from public.review_dedupe_soft_purges;                        -- 0-1 의 "지울_행" 과 같아야 한다
--   select count(*) from public.review_dedupe_soft_purges g
--     join public.analysis_inputs ai on ai.id = g.input_id
--    where ai.purged_at is null;                                    -- 0 (전부 찍혔다)
--   select count(*) from public.review_dedupe_soft_purges g
--     join public.analysis_inputs ai on ai.id = g.input_id
--    where ai.raw_text is null;                                     -- 0 (원문은 지우지 않았다)
--   select count(*) from pg_indexes
--    where indexname = 'review_fingerprints_source_content_idx';     -- 1
--   select count(*) from pg_policies
--    where tablename = 'review_dedupe_soft_purges';                  -- 0 (service_role 전용)
--   -- 남기는 쪽은 살아 있다(그룹마다 1행).
--   select count(*) from public.review_dedupe_soft_purges g
--     join public.analysis_inputs ai on ai.id = g.kept_input_id
--    where ai.purged_at is not null;                                 -- 0
-- ── 음성 (롤백되는 형태로 — 데이터를 남기지 않는다) ─────────
--   begin;
--     -- 없는 원문을 가리키는 감사 행은 거부돼야 한다 → 23503(FK 위반)
--     insert into public.review_dedupe_soft_purges (input_id, kept_input_id, source_key, content_hash)
--     values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','x','y');
--   rollback;
--   -- 재실행이 두 번 찍지 않는다: 3~5 단계를 한 번 더 돌려도 위 카운트가 그대로여야 한다.
