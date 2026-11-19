-- 롤백(v71cu F5): 새로 고침 함수만 지운다. 사본·기존 뷰는 그대로.
BEGIN;
DROP FUNCTION IF EXISTS public.refresh_story_flow_cards_mat();
COMMIT;
