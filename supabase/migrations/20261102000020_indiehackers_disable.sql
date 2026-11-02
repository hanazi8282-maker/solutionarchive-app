-- ============================================================
-- 20261102000020_indiehackers_disable — v71bv C: Indie Hackers 소스 끄기(enabled=false)
--
-- ⛔ 미적용 상태로 PR 에 올린다. 파일만 작성(v71bv 지시 "해결 불가면 on/off 는 마이그레이션 파일로만 끈다").
-- ⚠️ 적용 전 판단: Indie Hackers 는 남헌이 켠 소스다(2026-09-30 편집 인터뷰 승인 · 2026-10-08 owner override).
--    끄는 것은 CLAUDE.md §10.2 예외 6(명시 지시 축소)에 걸릴 수 있다 — 적용은 CEO-STAFF 확인 뒤에.
--    러너는 403 챌린지를 차단으로 보고 이미 0건으로 멈추므로, 이 파일을 안 적용해도 상대 서버를 더 때리지는 않는다.
--
-- 재확인(2026-11-02, 우리 UA, 요청 6회 · 간격 ≥3초):
--   GET /robots.txt   → 200. `*`: /sign-in · /sign-up · /api/ · /*/history · /*?commentId= 금지(09-30 은 전체 허용이었다 — 규칙이 늘었다).
--                        anthropic-ai · ClaudeBot · GPTBot 등 AI 봇 21종은 `Disallow: /`.
--   GET /stories      → 403 · Cloudflare "Just a moment..." 챌린지(목록 페이지, 09-30 은 200 · 915건).
--   GET /post/<id>    → 403 · 같은 챌린지(09-30 픽스처 글).
--   GET /rss          → 403 챌린지 · GET /feed.xml → 404. 공개 RSS 없음.
--   GET /sitemap.xml  → 200(sitemap index 3개) — 주소 목록일 뿐 본문은 위 403 뒤에 있다.
--   API: robots 가 /api/ 를 막는다. 공개 API 문서 없음.
--   약관: 09-30 인용 그대로("you won't use, copy, reproduce … any Content not owned by you … without the prior consent").
--   → 챌린지 풀이·UA 위장은 금지(§10.1)라 기술 해결 수단이 없다.
-- 🟢 비파괴·멱등. UPDATE 1행(review_sources — enabled/disabled_reason/disabled_at 만). 타깃·수집분은 건드리지 않는다.
-- 롤백: 20261102000020_indiehackers_disable_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT key, enabled, override, health, disabled_reason FROM public.review_sources WHERE key = 'indiehackers';  -- 기대: enabled t
--   SELECT max(started_at), sum(blocked_responses) FROM public.review_collection_runs
--    WHERE source_key = 'indiehackers' AND started_at > now() - interval '14 days';                             -- 차단 응답 있으면 근거 보강

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261102000020 v71bv — Cloudflare 챌린지(/stories·/post 403, 2026-11-02 재확인), RSS 없음, robots /api/ 금지. 우회 금지라 해결 불가',
       disabled_at = now()
 WHERE key = 'indiehackers' AND enabled;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'indiehackers') <> 1 THEN
    RAISE EXCEPTION 'indiehackers 행이 없다 — 끌 대상이 없음';
  END IF;
  IF EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'indiehackers' AND enabled) THEN
    RAISE EXCEPTION 'indiehackers 가 아직 켜져 있다';
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
-- 양성: SELECT enabled, disabled_reason IS NOT NULL FROM public.review_sources WHERE key = 'indiehackers';   -- 기대: f, t
-- 음성: SELECT count(*) FROM public.review_sources WHERE disabled_reason LIKE '20261102000020%' AND key <> 'indiehackers';  -- 기대: 0
