-- v71cu S5b: robots 금지에 가까운 4곳 중 기술적으로 켤 수 있는 2곳(디시인사이드·루리웹) 켜기. 남헌 2026-11-19 결정(override='owner_2026-11-19', quote_policy='none').
-- 끄는 짝: 20261119000015_disable_robots4_20261119.sql · 롤백: 20261119000014_enable_robots4_20261119_rollback.sql
-- 못 켠 2곳(2026-11-19 실측): Squarespace 포럼 = Cloudflare 관리형 챌린지('Just a moment…' 403) · 크롬 웹 스토어 = 리뷰가 스크립트 렌더링(HTML 에 리뷰 데이터 없음)이라 GET 어댑터로 못 읽음.
--   → 두 곳은 소스 행을 만들지 않고 source_candidates 라벨만 '기술적으로 불가능' 으로 바꾼다. 우회하지 않는다.
-- 약관: 디시·루리웹 모두 자동 수집 금지 계열로 라벨(seed 와 같다) — 읽은 근거는 S9 설계서·seed. robots: 디시는 `*` 허용(갤러리별 Disallow, AI 봇은 이름으로 차단 — 우리 UA 는 `*`),
--   루리웹은 정렬·분류·검색 쿼리 금지(쿼리 없는 주소만 부른다) → robots_status 'disallowed'(소유자 예외 대상).
-- 비파괴·멱등: INSERT(ON CONFLICT DO NOTHING) + 라벨 UPDATE 만. onboard_batch='onboard_robots4_20261119'.
BEGIN;
INSERT INTO public.review_sources (key, display_name, enabled, health, min_interval_ms, daily_request_cap, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result) VALUES
 ('dcinside','디시인사이드 공개 갤러리',true,'ok',8000,40,'allowed','forbids_automation','owner_2026-11-19','none',false,true,'중간 — 익명 갤러리. 닉네임·IP·갤로그 미저장, @멘션·이메일 치환, 댓글 미수집(본문만).','2026-11-19 robots 200(AI 봇 이름 차단, * 허용) · 목록·글 HTML 200. 약관 자동 접근 금지 계열.'),
 ('ruliweb','루리웹 공개 게시판',true,'ok',8000,40,'disallowed','forbids_automation','owner_2026-11-19','none',false,true,'중간 — 공개 게시판. 닉네임·회원번호 미저장, @멘션·이메일 치환, 댓글 미수집(스크립트 렌더링).','2026-11-19 robots 200(쿼리 주소 금지) · 쿼리 없는 목록·글 HTML 200. 약관 자동 접근 금지 계열.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
SELECT k, 0, 1, 'v71cu S5b — robots4 소스 50% 출발(owner_2026-11-19 남헌 결정)', 50, 40, 20
  FROM unnest(ARRAY['dcinside','ruliweb']) k
ON CONFLICT (source_key) DO NOTHING;

CREATE TEMP TABLE _f (src text, ref text, label text, pitch text, url text) ON COMMIT DROP;
INSERT INTO _f VALUES
 ('dcinside','board:programming','디시인사이드 · 프로그래밍 갤러리','디시인사이드 프로그래밍 갤러리 — 공개 게시판 반응','https://gall.dcinside.com/board/lists/?id=programming'),
 ('ruliweb','board:humor','루리웹 · 유머 게시판','루리웹 유머 게시판 — 공개 게시판 반응','https://bbs.ruliweb.com/community/board/300143');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, status, mode, business_model)
SELECT DISTINCT ON (pitch) url, pitch, 'product_fit', 'collecting', 'forward', 'OTHER' FROM _f
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = _f.pitch) ORDER BY pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status, onboard_batch, layer)
SELECT pj.id, f.src, f.ref, f.label, NULL, 'active', 'onboard_robots4_20261119', 'board' FROM _f f
 JOIN LATERAL (SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch ORDER BY p.created_at NULLS LAST, p.id LIMIT 1) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = f.src AND t.product_ref = f.ref);

-- source_candidates 라벨(행은 20261119000008 이 만들었다).
UPDATE public.source_candidates SET onboarded_source_key = 'dcinside', onboard_batch = 'onboard_robots4_20261119', note = 'v71cu-seed 켬(S5b, 갤러리 programming)' WHERE domain = 'gall.dcinside.com';
UPDATE public.source_candidates SET onboarded_source_key = 'ruliweb', onboard_batch = 'onboard_robots4_20261119', note = 'v71cu-seed 켬(S5b, 게시판 300143 유머)' WHERE domain = 'bbs.ruliweb.com';
UPDATE public.source_candidates SET tech_feasible = false, tech_block_reason = '기술적으로 불가능: Cloudflare 관리형 챌린지(403 Just a moment) — 우회 안 함', note = 'v71cu-seed 못 켬(S5b)' WHERE domain = 'squarespace.com';
UPDATE public.source_candidates SET tech_feasible = false, tech_block_reason = '기술적으로 불가능: 리뷰가 스크립트 렌더링(HTML 에 리뷰 데이터 없음, 내부 RPC POST) + /reviews robots 금지', note = 'v71cu-seed 못 켬(S5b)' WHERE domain = 'chromewebstore.google.com';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.review_sources WHERE key IN ('dcinside','ruliweb') AND override = 'owner_2026-11-19' AND enabled AND quote_policy = 'none';
  IF n < 2 THEN RAISE EXCEPTION 'sources % (expected 2)', n; END IF;
  SELECT count(*) INTO n FROM public.review_targets WHERE onboard_batch = 'onboard_robots4_20261119';
  IF n < 2 THEN RAISE EXCEPTION 'targets % (expected 2)', n; END IF;
END $$;
COMMIT;
