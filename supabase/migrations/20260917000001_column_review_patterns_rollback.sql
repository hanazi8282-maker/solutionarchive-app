-- 롤백: 20260917000001_column_review_patterns.sql
--
-- ⚠️ 이 롤백은 데이터를 잃는다. column_review_patterns 의 제안·결정 기록은 파일 정본이 없다
--    (칼럼 본문과 달리 drafts/ 에 원본이 없는, 이 테이블에서 처음 생기는 데이터다).
--    되돌리기 전에 남길 것이 있는지 먼저 본다:
--
--      SELECT pattern_key, status, evidence_count, source_slugs, advice, decision_note
--        FROM public.column_review_patterns ORDER BY status, evidence_count DESC;
--
--    feedback_at 을 떨어뜨리면 "이미 추출에 쓴 칼럼" 표시가 사라져서, 다시 적용한 뒤
--    column-feedback.mjs 를 돌리면 예전 review_note 를 전부 다시 먹는다(중복 제안).

BEGIN;

ALTER TABLE public.content_columns DROP COLUMN IF EXISTS feedback_at;

DROP TABLE IF EXISTS public.column_review_patterns;

COMMIT;
