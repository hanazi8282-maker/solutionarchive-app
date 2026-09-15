-- 롤백: 20260916000001_content_columns.sql
-- 데이터 보존 확인 없이 지운다 — 정본은 drafts/columns/*.md 파일이라 손실이 아니다.
DROP TABLE IF EXISTS public.content_columns;
