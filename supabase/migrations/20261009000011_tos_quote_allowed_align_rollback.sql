-- ============================================================
-- 20261009000011_tos_quote_allowed_align_rollback — disquiet · tumblbug quote_allowed 를 이전 값 true 로
--
-- 이전 값(오케스트레이터 실측 2026-10-09): disquiet true · tumblbug true.
-- 순서: 000010 도 되돌릴 거면 이 파일을 먼저 돌린다(역순). 이 파일은 override 를 보지 않는다.
-- tos_status 가 그 사이 'prohibited' 로 바뀌었으면 CHECK review_sources_tos_prohibited_no_quote 가 true 를 막는다 — 맞는 동작이라
--   사전 검사에서 먼저 멈춘다. 멱등: 재실행 = 0행. 2곳 밖 행·2곳의 quote_allowed 밖 칸은 md5 로 불변 확인.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  k2 CONSTANT text[] := ARRAY['disquiet', 'tumblbug'];
  n_pre int; n_upd int;
  others_before text; others_after text;
  two_before    text; two_after    text;
BEGIN
  SELECT count(*) INTO n_pre FROM public.review_sources WHERE key = ANY (k2) AND tos_status = 'forbids_automation';
  IF n_pre <> 2 THEN
    RAISE EXCEPTION '롤백 사전 검사: forbids_automation 인 행 %/2 — 약관 상태가 바뀌었다. 사람이 확인한다', n_pre;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_before
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_before
    FROM public.review_sources s WHERE s.key = ANY (k2);

  UPDATE public.review_sources SET quote_allowed = true WHERE key = ANY (k2) AND NOT quote_allowed;
  GET DIAGNOSTICS n_upd = ROW_COUNT;
  IF n_upd NOT IN (0, 2) THEN
    RAISE EXCEPTION '롤백 갱신 행 % — 2 도 0 도 아니다. 전체 롤백', n_upd;
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = ANY (k2) AND NOT quote_allowed) THEN
    RAISE EXCEPTION '롤백 사후 대조 실패: quote_allowed=false 가 남았다';
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_after
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_after
    FROM public.review_sources s WHERE s.key = ANY (k2);
  IF others_before <> others_after OR two_before <> two_after THEN
    RAISE EXCEPTION '롤백이 quote_allowed 밖 값을 바꿨다 — 전체 롤백';
  END IF;

  RAISE NOTICE 'tos_quote_allowed_align 롤백: 갱신 %행(0 = 이미 되돌림) · disquiet·tumblbug quote_allowed=true', n_upd;
END $$;

COMMIT;

-- 확인: SELECT key, quote_allowed FROM public.review_sources WHERE key IN ('disquiet','tumblbug') ORDER BY key;   -- 기대: 2행 true
