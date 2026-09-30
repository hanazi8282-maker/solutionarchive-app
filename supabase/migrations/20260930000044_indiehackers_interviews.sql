-- ============================================================
-- 20260930000044_indiehackers_interviews — VOC 소스 1행(indiehackers, 활성) + 피드 전용 프로젝트 1행 +
--   게시판 순회 타깃 1행(board:stories)
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트가 만든 파일이다(CLAUDE.md §10.2 — 판단 주체가 아니다).
--
-- ⛔ 법적 조항 인지, 남헌 승인 하 강행(2026-09-30).
--    docs/risk-log.md 2026-09-30 · ops/state/source-review-queue.md 의 Indie Hackers 줄. 승인 범위는 약관·법적
--    조항까지다. 봇 방어 우회·UA 위장·robots Disallow 돌파·로그인/가입 벽 통과는 범위 밖이다.
--
-- ── 범위: **편집팀 인터뷰만**(남헌 결정 2026-09-30) ────────────────────
--   직전 점검에서 사용자 글 `/post/<slug>` 2건이 정적 요청에 404, 편집 인터뷰 1건만 200(댓글 45)이었다.
--   그래서 목록은 편집 인터뷰 데이터베이스(`/stories`, "Case Studies Database")만 쓰고, 어댑터가 페이지의
--   `firestore-post--success-story-interview` 표식을 확인해 아닌 글은 적재하지 않는다(filtered).
--   사용자 글 피드(/newest 등)는 어댑터 BOARDS 에 없다 — 등록 경로(target-ref)도 거부한다.
--
-- ── 약관 조항 인용(원문 그대로, 큐 파일에서 옮김) ─────────────────────
--   "you won't use, copy, reproduce … or otherwise exploit for any purpose any Content not owned by you,
--    (i) without the prior consent of the owner of that Content"
--   (이 세션은 /terms 를 다시 요청하지 않았다 — 요청 예산을 인터뷰 경로 확인에 썼다. 인용은 큐 파일의 것.)
--
-- ── 기술 점검(2026-09-30, 러너와 같은 UA, 요청 7회 · 간격 ≥6.5초) — robots 는 lib/review/robots.ts robotsVerdict ──
--   robots 200 · 221B · `User-agent: *` / `Disallow:`(빈 값) → /stories · /post/<id> 둘 다 allowed.
--            GPTBot · Google-Extended 만 `Disallow: /`(우리 UA 아님).
--   /interviews → 301 /stories · /stories 200 서버 렌더 인터뷰 915건(최신이 위) · 로그인 불필요.
--   /post/<id> → 301 /post/tech/<slug>-<id> → 200 · JSON-LD Article · 본문·댓글 서버 렌더(JS 불필요).
--   ⚠️ 오래된 인터뷰는 `post-page--paywalled` — 본문 앞부분만 공개, 나머지는 무료 가입 벽. 가입하지 않는다.
--      새 인터뷰(게시 직후)는 본문 전부 공개. 어댑터는 새 인터뷰만 읽으므로 대개 전문을 받는다.
--
-- ⚠️ 보수적 설정. min_interval_ms 6000 · daily_request_cap 40(게시판 1개 = 실행당 ≤20요청 × 하루 2회).
--    인터뷰는 주 몇 건이라 평소 실행당 목록 1 + 새 글 0~2 요청이다.
--    403/429 가 오면 러너가 그 실행을 멈추고 고장으로 보고한다. 우회하지 않는다.
--
-- ── ⛔ 적용 전 조건 ───────────────────────────────────────────────
--   같은 PR 의 코드(어댑터 · ADAPTERS 맵 · REF_BUILDERS · 워크플로 선택지)가 main 에 있어야 한다.
--   없으면 타깃이 매일 밤 "어댑터 없음"으로 건너뛴다(조용히).
--
-- 어댑터: lib/review/adapters/indiehackers.ts · 셀프테스트: scripts/review-indiehackers-selftest.mjs
-- 🟢 비파괴. INSERT 3개(ON CONFLICT / NOT EXISTS 로 재실행 안전). UPDATE·DELETE·DDL 없음. 롤백 파일 있음.
-- ============================================================

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'indiehackers',
    'Indie Hackers 편집 인터뷰',
    true,
    NULL,
    'ok', 6000, 40
  )
ON CONFLICT (key) DO NOTHING;

-- 타깃 INSERT 는 enabled 소스 한정(§10.1). 이미 있던 행이 꺼져 있으면(ON CONFLICT 로 위 INSERT 가 무시됨) 여기서 멈춘다.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'indiehackers' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'indiehackers 소스가 없거나 enabled=false 다 — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
  IF (SELECT count(*) FROM public.review_targets WHERE source_key = 'indiehackers') > 1 THEN
    RAISE EXCEPTION 'indiehackers 타깃이 이미 2개 이상이다 — 예상(0 또는 1)과 다르다. 먼저 확인하라';
  END IF;
END $$;

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, business_model)
SELECT v.url, v.pitch, 'product_fit', NULL, 'collecting', 'SAAS'
  FROM (VALUES
    ('https://www.indiehackers.com/stories',
     'Indie Hackers 편집팀 인터뷰(Case Studies Database) — 1인·소수팀 창업가의 매출·획득 채널·가격 회고와 그 아래 댓글. 2026-09-30 실측 915건, 주 몇 건 추가.')
  ) AS v(url, pitch)
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.competitor_url = v.url);

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT p.id, 'indiehackers', 'board:stories', 'Indie Hackers 편집 인터뷰 순회(본문·댓글)', NULL, 'active'
  FROM public.analysis_projects p
 WHERE p.competitor_url = 'https://www.indiehackers.com/stories'
   AND NOT EXISTS (
     SELECT 1 FROM public.review_targets t WHERE t.source_key = 'indiehackers' AND t.product_ref = 'board:stories'
   );

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 소스 1행 enabled · 6000 · 40 / 타깃 1행 active · cursor NULL · business_model SAAS
--   SELECT key, enabled, min_interval_ms, daily_request_cap FROM public.review_sources WHERE key = 'indiehackers';
--   SELECT t.product_ref, t.status, t.cursor IS NULL AS fresh, p.business_model
--     FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
--    WHERE t.source_key = 'indiehackers';
-- 음성: 다른 소스·타깃은 그대로 — 적용 전후 같은 결과여야 한다(indiehackers 행만 늘어야 한다).
--   SELECT count(*), count(*) FILTER (WHERE enabled) FROM public.review_sources WHERE key <> 'indiehackers';
--   SELECT source_key, status, count(*) FROM public.review_targets GROUP BY 1, 2 ORDER BY 1, 2;
-- 첫 실행 뒤(§7.2): cursor 에 {"q":[...],"last":"<20자 id>"} 가 남고 active 여야 한다. last 는 목록 맨 위 id 다.
