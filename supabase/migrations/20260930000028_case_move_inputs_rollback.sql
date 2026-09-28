-- 20260930000028_case_move_inputs 롤백.
--
-- ⚠️ DROP TABLE 은 CLAUDE.md §10.2 사람 판단 예외("되돌리기 어려운 삭제")다 — 세션이 스스로 돌리지 않는다.
--    잃는 것: 무브 ↔ 입력 연결 행. 초안 JSON(drafts/cases/*.json 의 moves[i].voc_inputs)에서 다시 commit 하면 복원된다.
--    적용 후 만들어진 케이스가 없으면(count 0) 잃는 것도 없다 — 먼저 세고 돌려라.

-- select count(*) from public.case_move_inputs;   -- 0 이면 안전

DROP TABLE IF EXISTS public.case_move_inputs;  -- 인덱스·RLS 설정도 같이 사라진다

-- 확인: select count(*) from information_schema.tables where table_schema='public' and table_name='case_move_inputs';  -- 0
