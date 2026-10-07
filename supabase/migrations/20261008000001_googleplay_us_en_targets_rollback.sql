-- ============================================================
-- 20261008000001_googleplay_us_en_targets — ROLLBACK
--
-- 실행은 사람 판단. 같은 내용의 사본이 reports/2026-10-08/20261008000001_googleplay_us_en_targets_rollback.sql
-- (남헌 지시 'reports/ 하위·커밋 금지' 용 — git 에 올리지 않는다). 둘의 내용은 같다.
-- 식별자: source_key='googleplay' ∧ product_ref LIKE 'us:en:%' ∧ label LIKE '%us-en|%'
--   (label 은 '<영역>:us-en|<이름>'). kr:ko 행은 어느 절도 건드리지 않는다.
--
-- A  🔴 비상 정지 — status='failed'. 목적: **자동 부활 방지**. target-supply 의 planRevive 는 exhausted ∧ consecutive_empty=0 만
--    되살리므로 failed 는 되살리지 않는다. 아래 BEGIN~COMMIT 이 기본으로 실행된다(되돌릴 수 있음).
-- A' 되살리기 — 주석. 필요할 때만.
-- B  완전 삭제 — 주석. A 로 충분한지 먼저 본다.
--
-- ⚠️ A' 는 us:en 행 중 failed·exhausted 를 전부 켠다 — 수집이 끝나 자연 exhausted 된 행과 A 로 닫은 행을 구분하지 못한다.
--    구분이 필요하면 A 직전에 대상 id 를 따로 저장해 둔다.
-- ⚠️ B: 수집된 리뷰(analysis_inputs)는 남는다 — analysis_inputs 에는 target id 칸이 없고(project_id·source_type·raw_text·source_key·
--    collected_at), review_targets 를 가리키는 FK 는 재활성화 스냅샷 표 2개(ON DELETE CASCADE)뿐이다. review_fingerprints.product_ref 도
--    FK 없는 text 라 'us:en:<pkg>' 가 남고, 다시 만들어도 이미 본 리뷰는 재적재되지 않는다.
-- ============================================================

-- ── A. 비상 정지(status='failed', 자동 부활 안 됨) ───────────
BEGIN;

UPDATE public.review_targets SET status = 'failed'
 WHERE source_key = 'googleplay' AND product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%';

DO $$
DECLARE still_active int; stray int;
BEGIN
  SELECT count(*) INTO still_active FROM public.review_targets
   WHERE source_key = 'googleplay' AND product_ref LIKE 'us:en:%' AND status = 'active';
  IF still_active <> 0 THEN RAISE EXCEPTION 'us:en 타깃 % 개가 아직 active', still_active; END IF;
  -- 식별자 오염 검사: us:en 인데 label 에 us-en| 가 없는 행(= 이 마이그가 만들지 않은 행)이 있으면 알린다
  SELECT count(*) INTO stray FROM public.review_targets
   WHERE source_key = 'googleplay' AND product_ref LIKE 'us:en:%' AND label NOT LIKE '%us-en|%';
  IF stray <> 0 THEN RAISE NOTICE 'us:en 이지만 label 에 us-en| 가 없는 행 % 개 — A 가 건드리지 않았다', stray; END IF;
END $$;

COMMIT;

-- ── A'. 되살리기 ─────────────────────────────────────────────
-- UPDATE public.review_targets SET status = 'active'
--  WHERE source_key = 'googleplay' AND product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%' AND status IN ('failed', 'exhausted');

-- ── B. 완전 삭제(수집된 입력은 analysis_inputs 에 남는다 — 위 ⚠️) ──
-- BEGIN;
-- DELETE FROM public.review_targets
--  WHERE source_key = 'googleplay' AND product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%';
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%') THEN
--     RAISE EXCEPTION 'us-en 타깃이 남았다'; END IF;
-- END $$;
-- COMMIT;

-- 확인:
-- SELECT status, count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%' GROUP BY status;  -- A 후: failed 8(2차 적용 시 17) · B 후: 0행
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'kr:ko:%';                            -- 적용 전과 같음
