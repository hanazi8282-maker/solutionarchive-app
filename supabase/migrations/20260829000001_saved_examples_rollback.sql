-- ============================================================
-- 20260829000001_saved_examples.sql 되돌리기
--
-- ⚠️ saved_examples 를 지우면 Notion 인박스에서 동기화된 원문·분석 결과가
--   전부 사라진다. Notion 쪽 원본은 남아 있지만 '동기화 상태'가 이미
--   synced 로 바뀌어 있어, 되돌린 뒤 크론을 다시 돌려도 그 행들은
--   다시 들어오지 않는다. 되돌리기 전에 Notion 에서 해당 행들을
--   pending 으로 되돌려 놓을 것.
--
-- ⚠️ 자동 추출된 가설(source='auto_extracted_from_saved_examples')은
--   이 스크립트가 지우지 않는다. 지우면 그 가설로 이미 발행된 posts 의
--   hypothesis_code FK 가 끊긴다. 근거였던 saved_examples 행만 사라지고
--   가설은 source_example_id=null 인 채 남는다(FK 가 ON DELETE SET NULL).
--   가설까지 정리하려면 아래 주석 처리된 문장을 사람이 판단해 실행할 것.
--
-- 순서 주의: hypotheses 의 FK 를 먼저 떼야 saved_examples 를 지울 수 있다.
-- ============================================================

-- 1) 가설 승격 가드 제거
DROP TRIGGER IF EXISTS trg_guard_hypothesis_promotion ON public.hypotheses;
DROP FUNCTION IF EXISTS public.guard_hypothesis_promotion();

-- 2) hypotheses 출처 컬럼 제거 (FK 가 여기 걸려 있다)
ALTER TABLE public.hypotheses
  DROP CONSTRAINT IF EXISTS hypotheses_source_example_id_fkey;
ALTER TABLE public.hypotheses
  DROP COLUMN IF EXISTS source_example_id,
  DROP COLUMN IF EXISTS source;

-- 3) saved_examples 제거
DROP TABLE IF EXISTS public.saved_examples;

-- 4) (선택) 자동 추출 가설까지 정리하려면 — 사람이 판단해 실행할 것.
--    이 가설로 발행된 글이 있으면 posts.hypothesis_code FK 때문에 실패한다.
--    그 경우 해당 posts 의 hypothesis_code 를 먼저 null 로 비워야 하는데,
--    그러면 그 글의 실험 이력이 사라진다. 대개는 지우지 않는 편이 낫다.
--
-- DELETE FROM public.hypotheses
--  WHERE source = 'auto_extracted_from_saved_examples';
