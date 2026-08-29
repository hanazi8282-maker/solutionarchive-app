-- ============================================================
-- 20260829000002_insight_patterns.sql 되돌리기
--
-- ⚠️ insight_patterns 를 지우면 "어떤 패턴이 어떤 커밋으로 가이드에
--   들어갔는지"의 기록이 사라진다. content/guides/learned-patterns.md 는
--   그대로 남으므로, 되돌린 뒤에는 그 파일의 내용을 되짚을 방법이 없다.
--   되돌리기 전에 반영 이력을 확보할 것:
--     SELECT pattern_key, status, strength, reflected_at, reflected_commit_sha
--       FROM public.insight_patterns ORDER BY reflected_at;
--
-- ⚠️ 자동 생성된 hypotheses 행은 지우지 않는다. insight_patterns 가
--   hypotheses 를 참조하는 방향이라 이 테이블만 지워도 FK 는 깨지지 않는다.
--
-- 코드보다 먼저 되돌리면 나이틀리 루프가 42P01 로 실패한다. 루프는
-- 실패해도 발행에 영향을 주지 않지만(읽기+가이드 커밋만 한다), 크론을
-- 먼저 내리는 편이 조용하다:
--   vercel.json 의 /api/cron/nightly-insight-loop 항목 제거 후 배포.
-- ============================================================

DROP TABLE IF EXISTS public.insight_loop_runs;
DROP TABLE IF EXISTS public.insight_patterns;
