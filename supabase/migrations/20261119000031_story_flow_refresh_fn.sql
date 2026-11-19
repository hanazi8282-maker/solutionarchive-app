-- v71cu F5: story_flow_cards_mat 새로 고침 함수(추가 전용). scripts/story-flow-refresh.mjs 가 service_role 로 rpc('refresh_story_flow_cards_mat') 를 부른다.
-- 꼬리표 회차 적재(scripts/story-label.mjs) 뒤마다 1회. 함수가 없으면 스크립트가 --print 로 SQL 한 줄을 내 주고 SQL Editor/`supabase db query --linked` 로 돌린다.
-- SECURITY DEFINER: REFRESH 는 사본 소유자 권한이 필요하다. search_path 고정, 실행 권한은 service_role 에만.
BEGIN;
CREATE OR REPLACE FUNCTION public.refresh_story_flow_cards_mat()
RETURNS TABLE (row_count bigint, refreshed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '600s'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;
  RETURN QUERY SELECT (SELECT count(*) FROM public.story_flow_cards_mat), now();
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_story_flow_cards_mat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_story_flow_cards_mat() TO service_role;
COMMIT;
-- 확인(양성): SELECT * FROM public.refresh_story_flow_cards_mat();  -- row_count = (SELECT count(*) FROM public.story_flow_cards)
-- 음성:      SELECT has_function_privilege('anon', 'public.refresh_story_flow_cards_mat()', 'EXECUTE') = false;
