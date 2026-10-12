-- 롤백: 20261015000010_consumer_material_tags
-- 신규 테이블 하나를 지운다(DROP TABLE — 롤백 전용, 실행은 사람 판단). 다른 표는 이 표를 참조하지 않는다.
-- 지워도 원문(analysis_inputs)·판정(review_relevance_verdicts)은 그대로다. 코드는 표가 없으면(42P01·PGRST205)
-- 태그 없이 원래대로 돈다. 태그는 scripts/consumer-material-tag.mjs --apply 로 다시 만든다.
-- 데이터를 남기고 끄기만 하려면 이 파일 대신 env RELEVANCE_SKIP_CONSUMER=off 를 쓴다.

BEGIN;

DROP TABLE IF EXISTS public.consumer_material_tags;

COMMIT;

-- 확인: SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='consumer_material_tags';  -- 기대 0
