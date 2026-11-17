-- [꼬리표] 읽는 쪽용 뷰: move 마다 가장 나중에 쓴 꼬리표 줄(재판정 run 이 있으면 그것). 표는 추가 전용 그대로.
BEGIN;
CREATE OR REPLACE VIEW public.ss_move_tags_current WITH (security_invoker = true) AS
SELECT DISTINCT ON (move_id) * FROM public.ss_move_tags ORDER BY move_id, created_at DESC;
REVOKE ALL ON public.ss_move_tags_current FROM anon, authenticated;
COMMIT;
