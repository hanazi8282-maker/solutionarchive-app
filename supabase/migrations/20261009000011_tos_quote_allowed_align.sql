-- ============================================================
-- 20261009000011_tos_quote_allowed_align — disquiet · tumblbug 의 quote_allowed true → false
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1·§10.2). 적용은 오케스트레이터가 독립 점검 뒤에 한다.
-- 선행: 20261009000010_tos_owner_override(6곳 override='owner_2026-10-08'). 선행이 안 됐으면 사전 검사에서 RAISE.
-- 근거: 남헌 v38 목표 상태 "quote_allowed=false · short_only"(6곳 모두). 오케스트레이터 포함 결정 2026-10-09.
--   영향 조사 reports/2026-10-09/tos-override-notes.md §3 — quote_allowed 는 deprecated(20261005000004:16-17),
--   lib·app·scripts 실행 코드 0, pg_proc·views 참조 0(오케스트레이터 실측 2026-10-09). 인용 게이트는 quote_policy
--   (short_only, 안 바뀜)만 본다 → 이미 쌓인 입력의 인용 가능 여부 변화 0.
-- CHECK: false 는 review_sources_tos_prohibited_no_quote · review_sources_quote_needs_citation 어느 쪽도 위반할 수 없다.
--
-- 바꾸는 것: review_sources.quote_allowed 한 컬럼, 2행. 나머지 4곳(devto·indiehackers·youtube·producthunt)은 이미 false.
-- 🟢 비파괴 UPDATE 2행. DDL·DELETE 없음. 멱등(재실행 = 0행 + 사후 대조). 롤백 파일 있음.
--    §10.2 사람 판단 예외 해당 없음(남헌 지시 그대로 · 동작 영향 0 · 되돌림 UPDATE 2행).
-- 롤백: 20261009000011_tos_quote_allowed_align_rollback.sql (이전 값 true 로)
--
-- ── 적용 전 상태(오케스트레이터 실측 2026-10-09) ──
--   disquiet  allowed  forbids_automation  quote_allowed=true  short_only  (override: 000010 뒤 owner_2026-10-08)
--   tumblbug  allowed  forbids_automation  quote_allowed=true  short_only  (override: 000010 뒤 owner_2026-10-08)
-- ── 적용 전 확인 ──
--   SELECT key, tos_status, quote_policy, override, quote_allowed FROM public.review_sources
--    WHERE key IN ('disquiet','tumblbug') ORDER BY key;   -- 기대: 2행 forbids_automation · short_only · owner_2026-10-08 · true
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  k2 CONSTANT text[] := ARRAY['disquiet', 'tumblbug'];
  n_pre int; n_upd int;
  others_before text; others_after text;  -- 2곳 밖 행 전체
  two_before    text; two_after    text;  -- 2곳의 quote_allowed 밖 컬럼 전체
BEGIN
  -- 1) 사전 검사 — 2행 다 있고, 약관 forbids_automation · short_only · 000010 선행(override='owner_2026-10-08').
  SELECT count(*) INTO n_pre FROM public.review_sources
   WHERE key = ANY (k2)
     AND tos_status = 'forbids_automation'
     AND quote_policy = 'short_only'
     AND override = 'owner_2026-10-08';
  IF n_pre <> 2 THEN
    RAISE EXCEPTION '사전 검사 실패: forbids_automation·short_only·override=owner_2026-10-08 인 행 %/2 — 20261009000010 선행 적용을 먼저 확인한다', n_pre;
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_before
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_before
    FROM public.review_sources s WHERE s.key = ANY (k2);

  -- 2) 맞춤
  UPDATE public.review_sources SET quote_allowed = false WHERE key = ANY (k2) AND quote_allowed;
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  -- 3) 영향 행 수 가드 — 첫 적용 2, 재실행 0. 그 사이는 멈춘다.
  IF n_upd NOT IN (0, 2) THEN
    RAISE EXCEPTION '갱신 행 % — 2(첫 적용) 도 0(재실행) 도 아니다. 부분 적용 흔적이라 전체 롤백', n_upd;
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = ANY (k2) AND quote_allowed) THEN
    RAISE EXCEPTION '사후 대조 실패: quote_allowed=true 가 남았다';
  END IF;

  -- 4) 다른 것은 안 바뀌었다
  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_after
    FROM public.review_sources s WHERE NOT (s.key = ANY (k2));
  SELECT md5(string_agg((to_jsonb(s) - 'quote_allowed')::text, '|' ORDER BY s.key)) INTO two_after
    FROM public.review_sources s WHERE s.key = ANY (k2);
  IF others_before <> others_after OR two_before <> two_after THEN
    RAISE EXCEPTION 'quote_allowed 밖 값이 바뀌었다(others % → %, two % → %) — 전체 롤백', others_before, others_after, two_before, two_after;
  END IF;

  RAISE NOTICE 'tos_quote_allowed_align: 갱신 %행(0 = 이미 적용) · 다른 행 md5 %', n_upd, others_after;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 6곳 모두 목표 상태
--   SELECT key, override, quote_allowed, quote_policy FROM public.review_sources
--    WHERE key IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt') ORDER BY key;
--   기대: 6행 owner_2026-10-08 · false · short_only
-- 음성: 2곳 밖 행 md5 — 적용 전·후 같은 쿼리, 값이 같아야 한다
--   SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key)) FROM public.review_sources s WHERE s.key NOT IN ('disquiet','tumblbug');
-- 음성: quote_policy 는 안 바뀌었다(인용 게이트가 읽는 칸)
--   SELECT count(*) FROM public.review_sources WHERE key IN ('disquiet','tumblbug') AND quote_policy <> 'short_only';   -- 기대: 0
-- 음성(롤백 형태): 약관 prohibited 행에는 여전히 true 를 못 넣는다(제약 살아 있음)
--   BEGIN; UPDATE public.review_sources SET quote_allowed = true WHERE key = 'devto'; ROLLBACK;   -- 기대: 23514 review_sources_tos_prohibited_no_quote
