-- ============================================================
-- 20260827000001_content_loop_baseline.sql 되돌리기
--
-- ⛔ 운영 DB 에서 이 파일을 실행하지 말 것.
--
--   베이스라인은 "이미 존재하는 객체를 레포에 기록"하는 마이그레이션이라
--   운영 DB 에서는 no-op 이었다. 반대로 이 롤백은 no-op 이 아니라
--   **실제로 존재하는 테이블과 데이터를 전부 파괴한다.**
--   적용이 no-op 이었다고 해서 롤백도 안전한 게 아니다.
--
--   지워지는 것:
--     - content_items 21행 (소재은행 T1-1~T3-6)
--     - hypotheses 7행 (H1~H7)
--     - channels 2행 (solutionarchive / 역전비결)
--     - posts 전체 + CASCADE 로 metric_snapshots 전체
--     - benchmarks / learnings 전체
--   전부 재생성 비용이 큰 수작업 산출물이다. 시드 SQL 은
--   레포의 content_items_seed.sql 에 일부만 남아 있고, hypotheses·channels 는
--   레포에 시드 파일이 없다.
--
--   이 파일의 실제 용도는 로컬·프리뷰 브랜치를 깨끗이 리셋하는 것뿐이다.
--
-- 실행 전 반드시 백업:
--   SELECT * FROM public.content_items;
--   SELECT * FROM public.hypotheses;
--   SELECT * FROM public.channels;
--   SELECT * FROM public.posts;
--   SELECT * FROM public.metric_snapshots;
--
-- 삭제 순서는 FK 역순이다. CASCADE 없이 순서만으로 떨어지도록 배열했다
-- (DROP ... CASCADE 를 쓰면 이 목록 밖의 객체까지 조용히 딸려간다).
--
-- ⚠️ 20260827000002_posts_draft_status.sql 을 먼저 적용했다면 그 롤백을
--    먼저 실행할 것. posts 를 통째로 지우므로 순서를 지키지 않아도
--    에러는 안 나지만, 마이그레이션 이력이 어긋난다.
-- ============================================================

DROP VIEW  IF EXISTS public.post_performance;

DROP TRIGGER  IF EXISTS trg_guard_learning ON public.learnings;
DROP FUNCTION IF EXISTS public.guard_learning_promotion();

DROP TABLE IF EXISTS public.learnings;
DROP TABLE IF EXISTS public.benchmarks;
DROP TABLE IF EXISTS public.metric_snapshots;
DROP TABLE IF EXISTS public.posts;
DROP TABLE IF EXISTS public.hypotheses;
DROP TABLE IF EXISTS public.content_items;
DROP TABLE IF EXISTS public.channels;
