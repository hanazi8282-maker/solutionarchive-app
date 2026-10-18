-- ============================================================
-- 20261018000010_itunes_search_override — v71am §1-D: iTunes Search API(itunes.apple.com/search) 소유자 예외 기록
--
-- ⛔ 미적용 상태로 PR 에 올린다. 적용은 오케스트레이터(대화형·CEO-staff 세션, v71ak 규칙)가 한다.
-- 근거: 남헌 D-44(2026-10-18) — "iTunes Search API 는 robots Disallow /search* 임을 알고도 허용한다. 위험은 남헌 몫이다." D-45: lookup(ID 조회)도 허용.
--   (앞선 정책 A 허용은 v71aj D-43, 2026-10-17, 하루 100 → 이번에 변수 ITUNES_SEARCH_DAILY_MAX 기본 300·실행당 60·간격 6초로 개정. 코드: scripts/anchor-verify.mjs)
-- L-31 방식: 새 컬럼 없이 기존 칸에 기록 — override='owner_2026-10-18', robots_status='disallowed'.
--
-- 이 행은 **정책 기록용**이다. 수집 소스가 아니다(어댑터 없음, review_targets 를 받지 않는다).
--   enabled=false + disabled_reason 으로 러너가 0요청으로 건너뛰게 한다. override 값 owner_2026-10-18 은
--   lib/review/runner.ts OWNER_ROBOTS_OVERRIDES 에 넣지 않는다(켤 일이 없다) — 켜려면 어댑터·약관 점검이 먼저다.
--   Search 호출 한도의 정본은 이 행이 아니라 scripts/anchor-verify.mjs(ITUNES_SEARCH_DAILY_MAX) + reports/<KST>/itunes-search-log.jsonl 이다.
-- 약관: Apple iTunes Search API 는 공식 문서화된 API 이나 robots 는 /search* 금지 — 둘이 어긋난다는 걸 알고 켠 예외(남헌 몫).
--
-- 🟢 비파괴·멱등. INSERT 1행(ON CONFLICT DO NOTHING). UPDATE·DELETE·DDL 없음.
--    §10.2 사람 판단 예외 4번(새 법적 리스크)은 남헌 D-44 명시 승인으로 해소. 나머지 해당 없음.
-- 롤백: 20261018000010_itunes_search_override_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT key FROM public.review_sources WHERE key = 'itunes_search';   -- 기대: 0행

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, disabled_at, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES (
  'itunes_search',
  'iTunes Search API(이름→앱 ID 조회 전용, 수집 소스 아님)',
  false,
  '조회 전용 경로의 정책 기록 행 — 수집 소스가 아니다(어댑터·타깃 없음). 한도 정본은 scripts/anchor-verify.mjs',
  now(), 'ok', 6000, 300,
  'disallowed', 'unverified', 'owner_2026-10-18', 'none', false, true,
  '해당 없음 — 앱 이름·ID·개발사 메타만 읽는다(리뷰·사용자 글 없음).',
  '2026-10-18 D-44 허용. 한도: 하루 300(ITUNES_SEARCH_DAILY_MAX)·실행당 60·간격 6초. 403/429/빈 응답/캡차 1건이면 그 실행 즉시 중단, 연속 2일 차단이면 소스를 끄고 남헌에게 보고.'
)
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key = 'itunes_search' AND override = 'owner_2026-10-18' AND robots_status = 'disallowed' AND NOT enabled;
  IF n <> 1 THEN RAISE EXCEPTION 'itunes_search 행이 기대와 다르다(%행)', n; END IF;
END $$;

COMMIT;

-- 확인:
--   SELECT key, enabled, robots_status, override, daily_request_cap, min_interval_ms FROM public.review_sources WHERE key = 'itunes_search';
