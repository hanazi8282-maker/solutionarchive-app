-- ============================================================
-- 20261009000010_tos_owner_override — 약관 금지 소스 6곳에 남헌 owner override 공식 기록
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1·§10.2). 적용은 오케스트레이터가 독립 점검 뒤에 한다.
-- 근거: 남헌 v38 원문 "남헌이 10-08 첫 회신에서 devto·disquiet·indiehackers·tumblbug·youtube·producthunt 6곳을 모두
--   override 기록으로 공식화하라고 이미 결정함. 새로 묻지 말고 review_sources 에 owner override 로 기록.
--   quote_allowed=false · short_only 확인 후 보고. producthunt 는 enabled=false 유지, 기존 입력 1,128건 삭제 금지."
--   → 결정일 2026-10-08 → override='owner_2026-10-08'(형식 <주체>_<YYYY-MM-DD>, 20261005000001 COMMENT ·
--     같은 날 결정한 shopify_apps 와 같은 값, 20261008000040).
-- 영향 조사·선택지·권고: reports/2026-10-09/tos-override-notes.md
--
-- 바꾸는 것: review_sources.override 한 컬럼, 6행, NULL → 'owner_2026-10-08'. 그 밖의 컬럼·행은 안 바꾼다.
--   - enabled 안 건드림(producthunt=false 그대로 — 아래 가드가 확인). DELETE 없음(producthunt 입력 1,128건 그대로).
--   - quote_allowed 안 건드림(disquiet·tumblbug=true 그대로). 맞추는 것은 다음 마이그
--     20261009000011_tos_quote_allowed_align.sql(이 파일 선행 필수, 노트 §3).
--
-- ⚠️ 이 override 는 **약관 예외 기록**이다. 러너 OWNER_ROBOTS_OVERRIDES(lib/review/runner.ts:83 = 10-05·10-06 두 값)에
--    'owner_2026-10-08' 은 없다 — 6곳 모두 robots 가 allowed/not_applicable 이라 robots 예외가 필요 없고,
--    robots 가 나중에 금지로 바뀌면 멈춰야 한다(shopify_apps 와 같은 구조).
--    override 가 실제로 읽히는 곳과 동작 변화(노트 §2):
--      ① target-supply tos_flag true→false(표시만) ② request-cap 'fixed' — 야간 상한 자동 상향 대상에서 빠짐
--        (램프 cap_base 가 있으면 실제 요청량 변화 0, 노트 §2-2) ③ review_collection_runs.override_value 스냅샷 NULL→값.
--
-- 🟡 비파괴 UPDATE 6행(대량 아님). DDL·DELETE 없음. 멱등(재실행 = 0행 갱신 + 최종 상태 대조). 롤백 파일 있음.
--    §10.2 사람 판단 예외: 4번(새 법적 리스크)은 남헌 결정(10-08, v38 재확인)으로 해소. 신규 소스 추가가 아니다(이미 enabled 5곳 +
--    꺼진 1곳에 예외 기록만 남긴다). 6번(명시 지시 충돌) — 지시 그대로 수행. 나머지 해당 없음.
-- 롤백: 20261009000010_tos_owner_override_rollback.sql (6행 override 를 이전 값 NULL 로)
--
-- ── 적용 전 상태(오케스트레이터 실측 2026-10-09, 롤백의 기준값) ──
--   key           enabled robots_status   tos_status          override quote_allowed quote_policy
--   devto         true    allowed         prohibited          NULL     false         short_only
--   disquiet      true    allowed         forbids_automation  NULL     true          short_only
--   indiehackers  true    allowed         prohibited          NULL     false         short_only
--   tumblbug      true    allowed         forbids_automation  NULL     true          short_only
--   youtube       true    not_applicable  prohibited          NULL     false         short_only
--   producthunt   false   not_applicable  prohibited          NULL     false         short_only
--
-- ── 적용 전 확인(직접 SELECT — PostgREST head:true 금지, §7.1) ──
--   SELECT key, enabled, robots_status, tos_status, override, quote_allowed, quote_policy FROM public.review_sources
--    WHERE key IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt') ORDER BY key;   -- 기대: 위 표 6행
--   SELECT key, override FROM public.review_sources WHERE override IS NOT NULL ORDER BY key;              -- 결과를 적어 둔다(사후 음성 대조용).
--     리포 마이그 기준 예상(실측 아님): appstore owner_2026-10-05 · googleplay/kakao_blog/kakao_cafe owner_2026-10-06 · shopify_apps owner_2026-10-08
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  k6     CONSTANT text[] := ARRAY['devto', 'disquiet', 'indiehackers', 'tumblbug', 'youtube', 'producthunt'];
  v      CONSTANT text   := 'owner_2026-10-08';
  n_pre  int;
  n_upd  int;
  n_done int;
  others_before text; others_after text;  -- 6곳 밖 행 전체
  six_before    text; six_after    text;  -- 6곳의 override 밖 컬럼 전체
BEGIN
  -- 1) 사전 가드 — 6행 전부 있고, robots 가 예외 불필요 상태이고, 약관 금지가 기록돼 있고, short_only 이고,
  --    override 가 비었거나(첫 적용) 이미 이 값(재실행)일 것. 다른 override 값이 들어 있으면 덮어쓰지 않고 멈춘다.
  SELECT count(*) INTO n_pre
    FROM public.review_sources
   WHERE key = ANY (k6)
     AND robots_status IN ('allowed', 'not_applicable')
     AND tos_status IN ('prohibited', 'forbids_automation')
     AND quote_policy = 'short_only'
     AND (override IS NULL OR override = v);
  IF n_pre <> 6 THEN
    RAISE EXCEPTION '사전 가드 실패: 조건에 맞는 행 %/6 — 행 없음·robots 금지·약관 미기록·인용 정책·다른 override 값 중 하나. 적용하지 않는다', n_pre;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'producthunt' AND enabled = false) THEN
    RAISE EXCEPTION 'producthunt 가 enabled=false 가 아니다 — 남헌 지시(enabled=false 유지)와 다른 상태라 멈춘다';
  END IF;

  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_before
    FROM public.review_sources s WHERE NOT (s.key = ANY (k6));
  SELECT md5(string_agg((to_jsonb(s) - 'override')::text, '|' ORDER BY s.key)) INTO six_before
    FROM public.review_sources s WHERE s.key = ANY (k6);

  -- 2) 기록
  UPDATE public.review_sources
     SET override = v
   WHERE key = ANY (k6)
     AND override IS NULL;
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  -- 3) 영향 행 수 가드 — 첫 적용이면 정확히 6, 재실행이면 0. 그 사이(부분 적용 흔적)는 멈춘다.
  IF n_upd NOT IN (0, 6) THEN
    RAISE EXCEPTION '갱신 행 % — 6(첫 적용) 도 0(재실행) 도 아니다. 부분 적용 흔적이라 전체 롤백', n_upd;
  END IF;

  SELECT count(*) INTO n_done FROM public.review_sources WHERE key = ANY (k6) AND override = v;
  IF n_done <> 6 THEN
    RAISE EXCEPTION '사후 대조 실패: override=% 인 행 %/6', v, n_done;
  END IF;

  -- 4) 다른 것은 안 바뀌었다 — 6곳 밖 행 전체, 6곳의 override 밖 컬럼(enabled·quote_allowed 등) 전체.
  SELECT md5(coalesce(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key), '')) INTO others_after
    FROM public.review_sources s WHERE NOT (s.key = ANY (k6));
  SELECT md5(string_agg((to_jsonb(s) - 'override')::text, '|' ORDER BY s.key)) INTO six_after
    FROM public.review_sources s WHERE s.key = ANY (k6);
  IF others_before <> others_after OR six_before <> six_after THEN
    RAISE EXCEPTION 'override 밖 값이 바뀌었다(others % → %, six % → %) — 전체 롤백', others_before, others_after, six_before, six_after;
  END IF;

  RAISE NOTICE 'tos_owner_override: 갱신 %행(0 = 이미 적용) · 6곳 override=% · 다른 행 md5 %', n_upd, v, others_after;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 6행이 이 값이다
--   SELECT key, enabled, robots_status, tos_status, override, quote_allowed, quote_policy FROM public.review_sources
--    WHERE key IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt') ORDER BY key;
--   기대: 6행 override='owner_2026-10-08' · producthunt enabled=false · 나머지 칸은 위 "적용 전 상태" 표 그대로
--   (disquiet·tumblbug quote_allowed=true 그대로 — 20261009000011 적용 전).
-- 양성: owner_2026-10-08 은 shopify_apps + 6곳뿐
--   SELECT count(*) FROM public.review_sources WHERE override = 'owner_2026-10-08';                        -- 기대: 7
--   SELECT count(*) FROM public.review_sources WHERE override = 'owner_2026-10-08'
--      AND key NOT IN ('shopify_apps','devto','disquiet','indiehackers','tumblbug','youtube','producthunt'); -- 기대: 0
-- 음성: 다른 owner 값은 안 바뀌었다(적용 전 기록과 같은 목록)
--   SELECT key, override FROM public.review_sources WHERE override IS NOT NULL AND override <> 'owner_2026-10-08' ORDER BY key;
--   기대: 적용 전에 적어 둔 목록에서 owner_2026-10-08 행만 뺀 것과 같다
-- 음성: 6곳 밖 행 md5 — 적용 전·후에 같은 쿼리를 돌려 값이 같아야 한다
--   SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY s.key)) FROM public.review_sources s
--    WHERE s.key NOT IN ('devto','disquiet','indiehackers','tumblbug','youtube','producthunt');
-- 음성: producthunt 입력 삭제 없음 — 적용 전·후 같은 수(남헌 v38 기준 1,128)
--   SELECT count(*) FROM public.analysis_inputs WHERE source_key = 'producthunt';
-- 음성: robots 예외로 읽히지 않는다(코드 대조) — lib/review/runner.ts:83 OWNER_ROBOTS_OVERRIDES 에 'owner_2026-10-08' 없음,
--   isOwnerRobotsOverride 는 robots_status='disallowed' 행만 연다(6곳은 allowed·not_applicable).
-- 첫 야간 실행 뒤(§7.2): review_collection_runs 의 5개 켜진 소스 새 행 override_value='owner_2026-10-08' · robots_owner_override=0.
--   review-request-cap 로그 "소유자 예외 소스 N곳 제외(상한 고정)" 목록에 6곳 중 켜진 5곳이 더해진다.
