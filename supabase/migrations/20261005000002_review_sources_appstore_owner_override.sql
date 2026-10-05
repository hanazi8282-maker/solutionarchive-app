-- ============================================================
-- 20261005000002_review_sources_appstore_owner_override — appstore 소스 재활성화(남헌 명시 예외)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 판단(§10.2).
-- 선행: 20261005000001(정책 컬럼). 없으면 컬럼 부재로 실패한다 — 그게 맞다.
--
-- 근거: 남헌 명시 예외 2026-10-05(v18). appstore 는 20260910000002 에서 robots 위반(itunes.apple.com
--   `Disallow: /*/rss/*`, SP-019/SP-021)으로 꺼졌다. robots 는 여전히 금지다 — 사실을 바꾸지 않고
--   "금지인 줄 알고 소유자가 예외로 열었다"를 행에 남긴다: robots_status='disallowed', override='owner_2026-10-05',
--   quote_allowed=false(원문 직접 인용 금지 — 고객 화면에는 요약만).
--
-- ⚠️ 이 파일만으로는 한 건도 안 모인다(§7.2 — 켜진 것을 도는 것으로 읽지 마라).
--   러너(lib/review/runner.ts RobotsCache)는 robots `disallowed` 를 어떤 표식으로도 통과시키지 않는다
--   (types.ts proceedWhenRobotsUnverified 주석: "disallowed 는 어떤 경우에도 뚫지 않는다").
--   실제로 돌리려면 러너에 소유자 예외 경로 + CLAUDE.md §7.1 예외 한 줄(PH 선례처럼)이 필요하다 — 이 PR 범위 밖이다.
--   켠 뒤 첫 실행의 robotsSkips 가 타깃 수와 같으면 이 상태 그대로인 것이다.
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
         quote_allowed = false,
         last_test_result = '2026-10-05 미실행 — 소유자 예외로 enabled 만 켬. 러너 robots-disallow 경로는 그대로라 수집 0건 예상.'
   WHERE key = 'appstore';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'appstore override: expected exactly 1 row, got %', n;
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, robots_status, override, quote_allowed, citation_allowed FROM public.review_sources WHERE key = 'appstore';
--   기대: true · disallowed · owner_2026-10-05 · false · true
-- 음성: 다른 소스는 그대로(적용 전 값과 비교)
--   SELECT count(*) FILTER (WHERE enabled) AS enabled_n, count(*) FILTER (WHERE override IS NOT NULL) AS overrides FROM public.review_sources WHERE key <> 'appstore';
--   기대: overrides = 0
