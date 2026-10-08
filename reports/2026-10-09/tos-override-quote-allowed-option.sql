-- ============================================================
-- 선택안 Q — disquiet · tumblbug 의 quote_allowed true → false (6곳 모두 "quote_allowed=false · short_only" 로 맞춤)
--
-- ⛔ 미적용 · 마이그 폴더 밖에 둔 선택안. 노트 reports/2026-10-09/tos-override-notes.md §3 참고.
--   제외 안 = 20261009000010 만 적용(이 파일 안 돌림). 포함 안 = 20261009000010 적용 뒤 이 파일을 돌린다.
--   포함으로 정하면 이 파일을 supabase/migrations/20261009000011_tos_quote_allowed_align.sql 로 옮겨 이력에 남긴다.
-- 영향: quote_allowed 는 deprecated 다 — lib·app·scripts 어디서도 읽지 않는다(노트 §3-2, 주석 3곳뿐). 인용 게이트는
--   quote_policy(이미 short_only, 안 바뀜)만 본다. 그래서 이미 쌓인 입력의 인용 가능 여부 변화 = 0.
-- CHECK: false 는 tos_prohibited_no_quote · quote_needs_citation 어느 쪽도 위반할 수 없다(둘 다 NOT quote_allowed 쪽이 항상 통과).
-- 이전 값(오케스트레이터 실측 2026-10-09): disquiet true · tumblbug true. 되돌림은 아래 주석 블록.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  k2 CONSTANT text[] := ARRAY['disquiet', 'tumblbug'];
  n_pre int; n_upd int;
  others_before text; others_after text;
  two_before text; two_after text;
BEGIN
  SELECT count(*) INTO n_pre FROM public.review_sources
   WHERE key = ANY (k2) AND tos_status = 'forbids_automation' AND quote_policy = 'short_only';
  IF n_pre <> 2 THEN
    RAISE EXCEPTION '사전 가드 실패: forbids_automation·short_only 인 행 %/2', n_pre;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_before
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_before
    FROM public.review_sources s WHERE s.key = ANY (k2);

  UPDATE public.review_sources SET quote_allowed = false WHERE key = ANY (k2) AND quote_allowed;
  GET DIAGNOSTICS n_upd = ROW_COUNT;
  IF n_upd NOT IN (0, 2) THEN
    RAISE EXCEPTION '갱신 행 % — 2(첫 적용) 도 0(재실행) 도 아니다', n_upd;
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = ANY (k2) AND quote_allowed) THEN
    RAISE EXCEPTION '사후 대조 실패: quote_allowed=true 가 남았다';
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_after
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_after
    FROM public.review_sources s WHERE s.key = ANY (k2);
  IF others_before <> others_after OR two_before <> two_after THEN
    RAISE EXCEPTION 'quote_allowed 밖 값이 바뀌었다 — 전체 롤백';
  END IF;

  RAISE NOTICE 'quote_allowed 맞춤: 갱신 %행(0 = 이미 적용)', n_upd;
END $$;

COMMIT;

-- 확인: SELECT key, quote_allowed, quote_policy FROM public.review_sources
--        WHERE key IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt') ORDER BY key;
--   기대: 6행 모두 quote_allowed=false · quote_policy='short_only'
--
-- ── 되돌림(이전 값 true) ──
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- DO $$
-- DECLARE n int;
-- BEGIN
--   UPDATE public.review_sources SET quote_allowed = true
--    WHERE key IN ('disquiet', 'tumblbug') AND NOT quote_allowed AND tos_status = 'forbids_automation';
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF n NOT IN (0, 2) THEN RAISE EXCEPTION '되돌림 갱신 행 % — 2 도 0 도 아니다', n; END IF;
-- END $$;
-- COMMIT;
-- (tos_status 가 그 사이 'prohibited' 로 바뀌었으면 CHECK review_sources_tos_prohibited_no_quote 가 true 를 막는다 — 맞는 동작.)
