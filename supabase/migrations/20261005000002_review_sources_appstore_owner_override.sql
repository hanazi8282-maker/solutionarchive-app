-- ============================================================
-- 20261005000002_review_sources_appstore_owner_override — appstore 소스 재활성화(남헌 명시 예외)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
-- 선행: 20261005000001(정책 컬럼) **그리고 20261005000003(quote_policy)**. 번호는 앞이지만 000003 뒤에 적용한다 —
--   quote_policy 컬럼이 없으면 42703 으로 실패한다(그게 맞다. 부분 적용이 남지 않는다).
--
-- 근거: 남헌 명시 예외 2026-10-05(v18, v19 C). appstore 는 20260910000002 에서 robots 위반(itunes.apple.com
--   `Disallow: /*/rss/*`, SP-019/SP-021)으로 꺼졌다. robots 는 여전히 금지다 — 사실을 바꾸지 않고
--   "금지인 줄 알고 소유자가 예외로 열었다"를 행에 남긴다: robots_status='disallowed', override='owner_2026-10-05',
--   quote_policy='short_only'(v19: quote_allowed=false 대신 — 한 문장·140자·출처 비표시. quote_allowed 는 deprecated 라 건드리지 않는다).
--
-- 러너: lib/review/runner.ts 가 review_sources.override='owner_2026-10-05' ∧ robots_status='disallowed' 인 소스에 한해
--   robots **금지** 판정만 통과시킨다(store.ts loadSource 가 DB 에서 읽는다 — 못 읽으면 소스 조회 실패로 멈춘다).
--   확인 불가(5xx·네트워크)는 그대로 막힌다. 403·429·빈 응답·캡차면 즉시 중단(isStrictBlock). CLAUDE.md §7.1 예외 줄 필요.
--
-- 🟢 되돌릴 수 있다. 한 행의 플래그만 바꾼다. disabled_reason·disabled_at 은 건드리지 않는다(롤백이 원문 그대로 돌아가게).
-- 가드: 영향 행이 정확히 1이 아니면 예외 → 전체 롤백.
-- ============================================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources
     SET enabled = true,
         robots_status = 'disallowed',
         override = 'owner_2026-10-05',
         quote_policy = 'short_only',
         last_test_result = '2026-10-05 미실행 — 소유자 예외로 켬. 러너 소유자 robots 예외 경로(runner.ts OWNER_ROBOTS_OVERRIDE)로 진행.'
   WHERE key = 'appstore';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'appstore override: expected exactly 1 row, got %', n;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, robots_status, override, quote_policy, citation_allowed FROM public.review_sources WHERE key = 'appstore';
--   기대: true · disallowed · owner_2026-10-05 · short_only · true
-- 음성: 다른 소스는 그대로(적용 전 값과 비교)
--   SELECT count(*) FILTER (WHERE override IS NOT NULL) AS overrides FROM public.review_sources WHERE key NOT IN ('appstore', 'googleplay');
--   기대: overrides = 0
-- 실수집 확인: 다음 실행 요약에서 appstore robotsSkips 가 0 이고 RunResult.robotsOwnerOverride 가 요청 수와 같아야 한다.
