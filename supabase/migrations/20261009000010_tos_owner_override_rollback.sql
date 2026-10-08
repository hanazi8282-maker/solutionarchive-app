-- ============================================================
-- 20261009000010_tos_owner_override_rollback — 6곳 override 를 이전 값 NULL 로 되돌린다
--
-- 이전 값(오케스트레이터 실측 2026-10-09, 본 마이그 머리말 표): 6행 모두 override = NULL.
--   devto · disquiet · indiehackers · tumblbug · youtube · producthunt
-- 'owner_2026-10-08' 인 행만 되돌린다 — 다른 값(사람이 나중에 바꾼 값)은 건드리지 않고 멈춘다.
-- shopify_apps(같은 값, 20261008000040)는 대상 밖이다.
-- 멱등: 재실행 = 0행 + 최종 상태 대조. 6곳 밖 행·6곳의 override 밖 컬럼은 md5 로 불변 확인.
-- 20261009000011 을 적용했다면 그 롤백(20261009000011_tos_quote_allowed_align_rollback.sql)을 먼저 돌린다(역순).
--   이 파일만 돌려도 깨지지는 않는다 — 000011 롤백은 override 를 보지 않는다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  k6     CONSTANT text[] := ARRAY['devto', 'disquiet', 'indiehackers', 'tumblbug', 'youtube', 'producthunt'];
  v      CONSTANT text   := 'owner_2026-10-08';
  n_pre  int;
  n_upd  int;
  others_before text; others_after text;
  six_before    text; six_after    text;
BEGIN
  SELECT count(*) INTO n_pre FROM public.review_sources WHERE key = ANY (k6) AND (override IS NULL OR override = v);
  IF n_pre <> 6 THEN
    RAISE EXCEPTION '롤백 가드: override 가 NULL·% 인 행 %/6 — 다른 값이 들어 있다. 사람이 확인한다', v, n_pre;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_before
    FROM public.review_sources s WHERE NOT (s.key = ANY (k6));
  SELECT md5(string_agg((to_jsonb(s) - 'override')::text, '|' ORDER BY s.key)) INTO six_before
    FROM public.review_sources s WHERE s.key = ANY (k6);

  UPDATE public.review_sources SET override = NULL WHERE key = ANY (k6) AND override = v;
  GET DIAGNOSTICS n_upd = ROW_COUNT;
  IF n_upd NOT IN (0, 6) THEN
    RAISE EXCEPTION '롤백 갱신 행 % — 6 도 0 도 아니다. 전체 롤백', n_upd;
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = ANY (k6) AND override IS NOT NULL) THEN
    RAISE EXCEPTION '롤백 사후 대조 실패: override 가 남은 행이 있다';
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_after
    FROM public.review_sources s WHERE NOT (s.key = ANY (k6));
  SELECT md5(string_agg((to_jsonb(s) - 'override')::text, '|' ORDER BY s.key)) INTO six_after
    FROM public.review_sources s WHERE s.key = ANY (k6);
  IF others_before <> others_after OR six_before <> six_after THEN
    RAISE EXCEPTION '롤백이 override 밖 값을 바꿨다 — 전체 롤백';
  END IF;

  RAISE NOTICE 'tos_owner_override 롤백: 갱신 %행(0 = 이미 되돌림) · 6곳 override=NULL', n_upd;
END $$;

COMMIT;

-- 확인: SELECT key, override FROM public.review_sources
--        WHERE key IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt') ORDER BY key;  -- 기대: 6행 NULL
--       SELECT key FROM public.review_sources WHERE override = 'owner_2026-10-08';                      -- 기대: shopify_apps 1행
