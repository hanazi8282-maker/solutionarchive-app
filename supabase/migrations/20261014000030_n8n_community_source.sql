-- ============================================================
-- 20261014000030_n8n_community_source — v70 E2E 1소스: n8n 커뮤니티(Discourse) 등록 + 램프 50% 출발 + 타깃 2개
--
-- ⛔ 미적용 상태로 PR 에 올린다. 적용은 코드가 main 에 머지된 뒤 오케스트레이터(대화형 세션)가 한다(CLAUDE.md §10.1·§10.2).
-- 근거: 남헌 v70 개정 2(2026-10-14) — "기술적으로 수집 가능한 곳은 약관이 문제여도 일단 수집, 라벨을 붙이고 사후 법적 검토".
-- 코드 짝: lib/review/adapters/discourse.ts(n8nCommunityAdapter) · scripts/review-collect.mjs ADAPTERS · lib/review/target-ref.ts ·
--          scripts/review-discourse-selftest.mjs. 코드가 main 에 없으면 이 소스는 조용히 안 돈다 — 코드 머지 뒤에 적용한다.
-- 선행: 20261005000001(정책 컬럼) · 20261005000003(quote_policy·tos CHECK) · 20260930000034 + 20261006000002(review_source_ramp·퍼센트 칸).
--
-- ── 소스 근거(2026-10-14 실측, 우리 UA solutionarchive-review-collector) ──
--   robots: community.n8n.io/robots.txt `*` Disallow = /admin/ · /auth/ · /email/ · /session · /search · /badges · /my · /g · /t/*/*.rss · /c/*.rss 등.
--     /c/<slug>/<id>.json · /t/<id>.json 은 막지 않는다(robotsVerdict allowed, 셀프테스트 고정) → robots_status='allowed'. robots_disallowed=false.
--   약관: https://community.n8n.io/tos — 원문 일부: "You may not automate access to the forum, or monitor the forum, such as with a web crawler,
--     browser plug-in or add-on, or other computer program that is not a web browser." → tos_status='forbids_automation'(= v70 라벨 legal_status=tos_risk).
--   남헌 결정 기록: v70 개정 2(2026-10-14) — 약관 위험 소스는 수집하되 라벨, quote_allowed=false, 소스 단위 일괄 삭제 가능, 중지 요청 시 즉시 정지.
--     → override='owner_2026-10-14'(약관 예외 기록. robots 가 허용이라 러너의 robots 금지 예외·저속은 열리지 않는다 — 그 소스가 아니다).
--   tos_status='forbids_automation' → CHECK 로 quote_policy<>'full'. 보수적으로 quote_policy='none', quote_allowed=false(결론서·칼럼 원문 인용 금지·공개 노출 금지),
--     citation_allowed=true(내부 판정·통계 근거). 소스 단위 purge 는 source_key 로 가능(analysis_inputs.source_key).
--   작성자: 닉네임·프로필·아바타 저장 안 함(어댑터가 읽지 않고 본문의 @멘션도 @user 로 치환) — v70 §10.
--   로그인·캡차 없음(JSON 200). 403/429/빈 응답은 러너가 즉시 중단·소스 중지.
--   시드: min_interval_ms 6000 · daily_request_cap 40 · 램프 cap_base 40 → 50% = 하루 20요청.
-- ── 타깃 ──
--   기존 n8n 프로젝트(competitor_url=https://n8n.io, 8ce7f2a3-…)에 board 타깃 2개: board:feature-requests(카테고리 5, 2,579토픽 — 기능 요청·요구),
--   board:questions(카테고리 12, 36,761토픽 — 사용 중 겪는 문제). status='active' · cursor NULL.
--
-- 🟢 비파괴·멱등. INSERT 만: review_sources 1행(ON CONFLICT DO NOTHING) · review_source_ramp 1행(ON CONFLICT DO NOTHING) · review_targets 2행(같은 source_key+product_ref 있으면 건너뜀).
--    UPDATE·DELETE·DDL 없음. 끝의 DO 블록이 값을 대조하고 어긋나면 RAISE → 전체 롤백.
--    §10.2 사람 판단 예외: 4번(새 법적 리스크)에 해당하나 남헌 v70 개정 2 명시 결정(2026-10-14)으로 해소. 나머지 해당 없음.
-- 롤백: 20261014000030_n8n_community_source_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT key FROM public.review_sources WHERE key = 'n8n_community';                                         -- 기대: 0행
--   SELECT id FROM public.analysis_projects WHERE id = '8ce7f2a3-df87-49fa-bd65-486ce8a45377';                  -- 기대: 1행
--   SELECT source_key, product_ref FROM public.review_targets WHERE source_key = 'n8n_community';               -- 기대: 0행

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES (
  'n8n_community',
  'n8n 커뮤니티(Discourse)',
  true,
  NULL,
  'ok', 6000, 40,
  'allowed', 'forbids_automation', 'owner_2026-10-14', 'none', false, true,
  '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
  '2026-10-14 구조 확인 JSON 4회(categories·기능 요청 목록·토픽, 전부 200). 약관 ToS: 자동 접근 금지 문구 확인 — 남헌 v70 개정 2 결정으로 수집+라벨(quote_allowed=false).'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
VALUES ('n8n_community', 0, 2, 'v70 E2E — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20)
ON CONFLICT (source_key) DO NOTHING;

-- 타깃은 enabled 소스에만(§10.1).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'n8n_community' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'n8n_community 가 없거나 enabled=false — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
  IF (SELECT count(*) FROM public.analysis_projects WHERE id = '8ce7f2a3-df87-49fa-bd65-486ce8a45377') <> 1 THEN
    RAISE EXCEPTION 'n8n 프로젝트(8ce7f2a3-…)가 없다 — 타깃을 넣지 않는다';
  END IF;
END $$;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT '8ce7f2a3-df87-49fa-bd65-486ce8a45377'::uuid, v.src, v.ref, v.label, NULL, 'active'
  FROM (VALUES
    ('n8n_community', 'board:feature-requests', 'n8n 커뮤니티 · 기능 요청 게시판(토픽·답글)'),
    ('n8n_community', 'board:questions',        'n8n 커뮤니티 · 질문 게시판(토픽·답글)')
  ) AS v(src, ref, label)
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key = 'n8n_community' AND enabled AND robots_status = 'allowed' AND tos_status = 'forbids_automation' AND override = 'owner_2026-10-14'
     AND quote_policy = 'none' AND NOT quote_allowed AND citation_allowed AND min_interval_ms = 6000 AND daily_request_cap = 40;
  IF n <> 1 THEN RAISE EXCEPTION 'review_sources 값 불일치 — 기대 1행, 일치 %행(기존 행이 있었는지 확인)', n; END IF;

  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE source_key = 'n8n_community' AND cap_base = 40 AND pct_step = 50 AND daily_request_target = 20;
  IF n <> 1 THEN RAISE EXCEPTION 'review_source_ramp 50%% 출발 행 불일치 — 기대 1, 일치 %', n; END IF;

  SELECT count(*) INTO n FROM public.review_targets
   WHERE source_key = 'n8n_community' AND project_id = '8ce7f2a3-df87-49fa-bd65-486ce8a45377' AND status = 'active' AND cursor IS NULL
     AND product_ref IN ('board:feature-requests', 'board:questions');
  IF n <> 2 THEN RAISE EXCEPTION '타깃 % 개(기대 2)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT key, enabled, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, min_interval_ms, daily_request_cap
--     FROM public.review_sources WHERE key = 'n8n_community';
--   -- 기대: n8n_community · t · allowed · forbids_automation · owner_2026-10-14 · none · f · t · 6000 · 40
--   SELECT source_key, pct_step, cap_base, daily_request_target, targets_per_run FROM public.review_source_ramp WHERE source_key = 'n8n_community';  -- 50·40·20·2
--   SELECT product_ref, status, cursor FROM public.review_targets WHERE source_key = 'n8n_community' ORDER BY 1;  -- 2행 active, cursor NULL
-- 음성(롤백되는 형태):
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'n8n_community'; ROLLBACK;   -- 기대: 23514 review_sources_tos_restricts_quote_policy
--   BEGIN; UPDATE public.review_sources SET quote_allowed = true WHERE key = 'n8n_community'; ROLLBACK;    -- 기대: 23514 (quote_allowed 는 citation 필요 + tos 제약)
-- 첫 실행 뒤(§7.2): review_collection_runs 의 n8n_community 행 override_value='owner_2026-10-14' · robots_owner_override=0.
