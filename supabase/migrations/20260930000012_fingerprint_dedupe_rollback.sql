-- 롤백: 20260930000012_fingerprint_dedupe.sql
--
-- 되돌릴 근거는 `review_dedupe_soft_purges` 한 테이블이다. 그래서 순서가 중요하다 —
-- **감사 테이블을 마지막에** 지운다. 먼저 지우면 어떤 행을 찍었는지 알 수 없다
-- (30일 폐기 배치가 찍은 purged_at 과 구분이 안 된다).
--
-- ⚠️ 이 파일은 **원문을 되살리지 않는다** — 애초에 지우지 않았다(purged_at 만 찍었다).
--    그래서 되돌림이 완전하다.

-- 1) 적합성 판정을 원래 원문으로 되돌린다(옮긴 것만).
UPDATE public.review_relevance_verdicts v
   SET input_id = g.input_id
  FROM public.review_dedupe_soft_purges g
 WHERE v.input_id = g.kept_input_id
   AND g.verdict_moved = true;

-- 2) 소프트 처리를 해제한다.
--    ⚠️ `raw_text IS NOT NULL OR purged_at IS NOT NULL` CHECK 때문에, 그 사이 30일
--       폐기 배치가 원문까지 비운 행은 purged_at 을 지울 수 없다. 그건 건너뛴다
--       (조건 `ai.raw_text is not null`) — 남겨 두는 편이 CHECK 를 깨는 것보다 낫다.
UPDATE public.analysis_inputs ai
   SET purged_at = NULL
  FROM public.review_dedupe_soft_purges g
 WHERE ai.id = g.input_id
   AND ai.raw_text IS NOT NULL;

-- 3) 감사 테이블과 인덱스를 치운다.
DROP TABLE IF EXISTS public.review_dedupe_soft_purges;
DROP INDEX IF EXISTS public.review_fingerprints_source_content_idx;

-- 확인 (롤백 후)
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='review_dedupe_soft_purges';   -- 0
--   select count(*) from pg_indexes
--    where indexname='review_fingerprints_source_content_idx';                 -- 0
--   -- 원문이 살아 있는 행에 purged_at 이 남아 있지 않은지(이 파일이 찍은 것 한정):
--   select count(*) from public.analysis_inputs
--    where purged_at is not null and raw_text is not null;                     -- 30일 배치는 둘을 같이 쓰므로 0 이 정상
