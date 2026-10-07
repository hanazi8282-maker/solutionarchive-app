-- ============================================================
-- 20261008000001_googleplay_us_en_targets — ROLLBACK
--
-- 실행은 사람 판단. 같은 내용의 사본이 reports/2026-10-08/20261008000001_googleplay_us_en_targets_rollback.sql
-- (남헌 지시 'reports/ 하위·커밋 금지' 용 — git 에 올리지 않는다). 둘의 내용은 같다.
-- 식별자: label LIKE 'us-en|%' ∧ source_key='googleplay'. kr:ko 행은 어느 절도 건드리지 않는다.
--
-- A  한 번에 전체 비활성화(되돌릴 수 있음) — 아래 BEGIN~COMMIT 이 기본으로 실행된다.
-- A' 되살리기(비활성한 것을 다시 켬)         — 주석. 필요할 때만.
-- B  완전 삭제                                 — 주석. A 로 충분한지 먼저 본다.
--
-- ⚠️ A 는 exhausted 로 닫는다(남헌 지시). 알아둘 것: target-supply 의 되살리기(planRevive)는 exhausted ∧ consecutive_empty=0 인 행을
--    gap·게이트 여유가 있을 때만 되살린다. googleplay 활성이 80 아래로 내려가면(kr:ko 가 자연 종료) 여유가 생겨 us:en 이
--    되살아날 수 있다. 완전히 끄려면 A 대신 A-failed(status='failed' — 되살리기 대상 아님)를 쓴다.
-- ⚠️ A' 는 us-en| 행 중 exhausted·failed 를 전부 켠다 — 수집이 끝나서 자연 exhausted 된 행과 A 로 닫은 행을 구분하지 못한다.
--    구분이 필요하면 A 직전에 대상 id 를 따로 저장해 둔다.
-- ⚠️ B: 수집된 리뷰(analysis_inputs)는 남는다 — analysis_inputs 에는 target id 칸이 없고(project_id·source_key·raw_text·collected_at),
--    review_targets 를 가리키는 FK 는 재활성화 스냅샷 표 2개(ON DELETE CASCADE)뿐이다. review_fingerprints.product_ref 도
--    FK 없는 text 라 'us:en:<pkg>' 가 남고, 그래서 나중에 같은 타깃을 다시 만들어도 이미 본 리뷰는 다시 적재되지 않는다.
-- ============================================================

-- ── A. 한 번에 전체 비활성화 ─────────────────────────────────
BEGIN;

UPDATE public.review_targets SET status = 'exhausted'
 WHERE source_key = 'googleplay' AND label LIKE 'us-en|%';

DO $$
DECLARE still_active int; kr_hit int;
BEGIN
  SELECT count(*) INTO still_active FROM public.review_targets
   WHERE source_key = 'googleplay' AND label LIKE 'us-en|%' AND status = 'active';
  IF still_active <> 0 THEN RAISE EXCEPTION 'us-en 타깃 % 개가 아직 active', still_active; END IF;
  SELECT count(*) INTO kr_hit FROM public.review_targets
   WHERE source_key = 'googleplay' AND label LIKE 'us-en|%' AND product_ref NOT LIKE 'us:en:%';
  IF kr_hit <> 0 THEN RAISE EXCEPTION 'label 접두가 us-en| 인데 us:en 이 아닌 행 % 개 — 식별자 오염, 멈춘다', kr_hit; END IF;
END $$;

COMMIT;

-- ── A-failed (되살리기 대상에서도 빼려면 A 대신 이것) ───────────
-- UPDATE public.review_targets SET status = 'failed' WHERE source_key = 'googleplay' AND label LIKE 'us-en|%';

-- ── A'. 되살리기 ─────────────────────────────────────────────
-- UPDATE public.review_targets SET status = 'active'
--  WHERE source_key = 'googleplay' AND label LIKE 'us-en|%' AND status IN ('exhausted', 'failed');

-- ── B. 완전 삭제(수집된 입력은 analysis_inputs 에 남는다 — 위 ⚠️) ──
-- BEGIN;
-- DELETE FROM public.review_targets
--  WHERE source_key = 'googleplay' AND label LIKE 'us-en|%' AND product_ref LIKE 'us:en:%';
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM public.review_targets WHERE source_key='googleplay' AND label LIKE 'us-en|%') THEN
--     RAISE EXCEPTION 'us-en 타깃이 남았다'; END IF;
-- END $$;
-- COMMIT;

-- 확인:
-- SELECT status, count(*) FROM public.review_targets WHERE source_key='googleplay' AND label LIKE 'us-en|%' GROUP BY status;  -- A 후: exhausted 16(17) · B 후: 0행
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'kr:ko:%';                      -- 적용 전과 같음
