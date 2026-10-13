-- ============================================================
-- 20261014000040_discourse_sources_batch2 — v70 D3: Discourse 포럼 소스 5개 등록(make·bubble·retool·glide·softr) + 램프 50% 출발 + 타깃 10개
--
-- ⛔ 미적용 상태로 PR 에 올린다. 적용은 코드(PR)가 main 에 머지된 뒤 오케스트레이터(대화형 세션)가 한다(CLAUDE.md §10.1·§10.2).
-- 근거: 남헌 v70 개정 2(2026-10-14) — 약관 위험 소스는 수집하되 라벨(tos_status)·quote_allowed=false·소스 단위 일괄 삭제 가능·중지 요청 시 즉시 정지.
-- 코드 짝: lib/review/adapters/discourse.ts(5개 인스턴스) · scripts/review-collect.mjs · lib/review/target-ref.ts · scripts/review-discourse-selftest.mjs.
-- 선행: 20261014000030_n8n_community_source(같은 구조) · 20261005000001/3 · 20260930000034 · 20261006000002.
--
-- ── 소스 근거(2026-10-14 실측, 우리 UA solutionarchive-review-collector) ──
--   robots: 5곳 모두 robots.txt 200, `*` 에 /admin/·/auth/·/session·/search 등만 Disallow, /latest.json·/c/…json·/t/<id>.json 은 막지 않는다 → robots_status='allowed'.
--     카테고리 id 는 각 /categories.json (make: questions 66·beginner-questions 65 / bubble: idea 7·help 5 / retool: feature-requests 7·app-building 5 /
--     glide: feature-requests 9·help-how-to 27 / softr: feature-requests 8·ask-the-community 6).
--   약관(/tos):
--     make_community · retool_community · softr_community — Discourse 기본 약관: "You may not automate access to the forum, or monitor the forum, such as with a web crawler,
--       browser plug-in or add-on, or other computer program that is not a web browser." → tos_status='forbids_automation'.
--     glide_community — "…'crawls,' 'scrapes,' or 'spiders' any page, data, or portion of or relating to the Services or Content (through use of manual or automated means)" → tos_status='prohibited'.
--     bubble_forum — /tos 본문을 읽지 못했다(페이지가 약관 대신 사이트 스크립트로 응답) → tos_status='unverified'(= v70 라벨 unknown). 확인 불가를 허용으로 접지 않는다(§7.1).
--   남헌 결정 기록: v70 개정 2(2026-10-14) → override='owner_2026-10-14'(약관 예외 기록. robots 허용이라 러너의 robots 금지 예외·저속은 열리지 않는다).
--   tos_status 가 prohibited/forbids_automation 이면 CHECK 로 quote_policy<>'full'. 5곳 모두 보수적으로 quote_policy='none', quote_allowed=false(결론서·칼럼 인용·공개 노출 금지),
--     citation_allowed=true(내부 판정·통계 근거). 소스 단위 purge 는 source_key 로 가능.
--   작성자: 닉네임·프로필·아바타 저장 안 함(어댑터가 읽지 않고 @멘션은 @user 로 치환) — v70 §10.
--   시드: min_interval_ms 6000 · daily_request_cap 40 · 램프 cap_base 40 → 50% = 하루 20요청, 회당 타깃 2.
-- ── 타깃 ──
--   소스마다 board 타깃 2개(기능 요청/아이디어 + 질문/도움). project: Retool 은 기존 프로젝트(pitch 'Retool'), 나머지 4개는 없으면 collecting 으로 새로 만든다(§10.1 신규 INSERT 한정).
--
-- 🟢 비파괴·멱등. INSERT 만: review_sources 5행(ON CONFLICT DO NOTHING) · review_source_ramp 5행 · analysis_projects ≤4행(같은 pitch 있으면 건너뜀) · review_targets 10행(같은 source_key+product_ref 있으면 건너뜀).
--    UPDATE·DELETE·DDL 없음. 끝의 DO 블록이 값을 대조하고 어긋나면 RAISE → 전체 롤백.
--    §10.2 사람 판단 예외: 4번(새 법적 리스크)에 해당하나 남헌 v70 개정 2 명시 결정(2026-10-14)으로 해소. 나머지 해당 없음.
-- 롤백: 20261014000040_discourse_sources_batch2_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT key FROM public.review_sources WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community');   -- 기대: 0행
--   SELECT id FROM public.analysis_projects WHERE product_elevator_pitch = 'Retool';                                                                 -- 기대: ≥1행

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES
  ('make_community',   'Make 커뮤니티(Discourse)',   true, NULL, 'ok', 6000, 40, 'allowed', 'forbids_automation', 'owner_2026-10-14', 'none', false, true,
   '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
   '2026-10-14 JSON 구조 확인(categories·목록 200). 약관: Discourse 기본 자동 접근 금지 문구 — 남헌 v70 개정 2 결정으로 수집+라벨.'),
  ('bubble_forum',     'Bubble 포럼(Discourse)',     true, NULL, 'ok', 6000, 40, 'allowed', 'unverified',        'owner_2026-10-14', 'none', false, true,
   '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
   '2026-10-14 JSON 구조 확인(목록 200). 약관 /tos 본문을 못 읽음(unverified=unknown 라벨) — 남헌 v70 개정 2 결정으로 수집+라벨.'),
  ('retool_community', 'Retool 커뮤니티(Discourse)', true, NULL, 'ok', 6000, 40, 'allowed', 'forbids_automation', 'owner_2026-10-14', 'none', false, true,
   '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
   '2026-10-14 JSON 구조 확인(categories·목록 200). 약관: Discourse 기본 자동 접근 금지 문구 — 남헌 v70 개정 2 결정으로 수집+라벨.'),
  ('glide_community',  'Glide 커뮤니티(Discourse)',  true, NULL, 'ok', 6000, 40, 'allowed', 'prohibited',        'owner_2026-10-14', 'none', false, true,
   '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
   '2026-10-14 JSON 구조 확인(categories·목록 200). 약관: crawls/scrapes/spiders 명시 금지 — 남헌 v70 개정 2 결정으로 수집+라벨.'),
  ('softr_community',  'Softr 커뮤니티(Discourse)',  true, NULL, 'ok', 6000, 40, 'allowed', 'forbids_automation', 'owner_2026-10-14', 'none', false, true,
   '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않고(authorMasked=null), 본문의 @멘션은 @user 로 치환한다.',
   '2026-10-14 JSON 구조 확인(categories·목록 200). 약관: Discourse 기본 자동 접근 금지 문구 — 남헌 v70 개정 2 결정으로 수집+라벨.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
VALUES
  ('make_community',   0, 2, 'v70 D3 — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20),
  ('bubble_forum',     0, 2, 'v70 D3 — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20),
  ('retool_community', 0, 2, 'v70 D3 — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20),
  ('glide_community',  0, 2, 'v70 D3 — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20),
  ('softr_community',  0, 2, 'v70 D3 — 새 소스 50% 출발(owner_2026-10-14 남헌 결정)', 50, 40, 20)
ON CONFLICT (source_key) DO NOTHING;

-- 타깃은 enabled 소스에만(§10.1).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources
       WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community') AND enabled) <> 5 THEN
    RAISE EXCEPTION '5개 소스 중 없거나 enabled=false 인 것이 있다 — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _disc (src text NOT NULL, ref text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _disc (src, ref, label, pitch, url) VALUES
  ('make_community',   'board:questions',          'Make 커뮤니티 · 질문 게시판(토픽·답글)',             'Make (메이크, 구 Integromat) — 노코드 업무 자동화 플랫폼', 'https://www.make.com/'),
  ('make_community',   'board:beginner-questions', 'Make 커뮤니티 · 초보자 질문 게시판(토픽·답글)',      'Make (메이크, 구 Integromat) — 노코드 업무 자동화 플랫폼', 'https://www.make.com/'),
  ('bubble_forum',     'board:idea',               'Bubble 포럼 · 아이디어(기능 요청) 게시판(토픽·답글)', 'Bubble (버블) — 노코드 웹앱 빌더',                          'https://bubble.io/'),
  ('bubble_forum',     'board:help',               'Bubble 포럼 · 도움 게시판(토픽·답글)',                'Bubble (버블) — 노코드 웹앱 빌더',                          'https://bubble.io/'),
  ('retool_community', 'board:feature-requests',   'Retool 커뮤니티 · 기능 요청 게시판(토픽·답글)',       'Retool',                                                    'https://retool.com'),
  ('retool_community', 'board:app-building',       'Retool 커뮤니티 · 앱 빌딩 게시판(토픽·답글)',         'Retool',                                                    'https://retool.com'),
  ('glide_community',  'board:feature-requests',   'Glide 커뮤니티 · 기능 요청 게시판(토픽·답글)',        'Glide (글라이드) — 스프레드시트·DB 기반 노코드 앱 빌더',     'https://www.glideapps.com/'),
  ('glide_community',  'board:help-how-to',        'Glide 커뮤니티 · 도움·사용법 게시판(토픽·답글)',      'Glide (글라이드) — 스프레드시트·DB 기반 노코드 앱 빌더',     'https://www.glideapps.com/'),
  ('softr_community',  'board:feature-requests',   'Softr 커뮤니티 · 기능 요청 게시판(토픽·답글)',        'Softr (소프트르) — 노코드 포털·웹앱 빌더',                  'https://www.softr.io/'),
  ('softr_community',  'board:ask-the-community',  'Softr 커뮤니티 · 커뮤니티 질문 게시판(토픽·답글)',    'Softr (소프트르) — 노코드 포털·웹앱 빌더',                  'https://www.softr.io/');

-- 프로젝트: 같은 pitch 가 이미 있으면 재사용(Retool). 없으면 collecting 으로 새로(§10.1 신규 INSERT).
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model)
SELECT DISTINCT ON (f.pitch) f.url, f.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS'
  FROM _disc f
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch)
 ORDER BY f.pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, f.src, f.ref, f.label, NULL, 'active'
  FROM _disc f
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = f.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = f.src AND t.product_ref = f.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE enabled AND robots_status = 'allowed' AND override = 'owner_2026-10-14' AND quote_policy = 'none' AND NOT quote_allowed AND citation_allowed
     AND min_interval_ms = 6000 AND daily_request_cap = 40
     AND ((key = 'make_community'   AND tos_status = 'forbids_automation')
       OR (key = 'bubble_forum'     AND tos_status = 'unverified')
       OR (key = 'retool_community' AND tos_status = 'forbids_automation')
       OR (key = 'glide_community'  AND tos_status = 'prohibited')
       OR (key = 'softr_community'  AND tos_status = 'forbids_automation'));
  IF n <> 5 THEN RAISE EXCEPTION 'review_sources 값 불일치 — 기대 5행, 일치 %행(기존 행이 있었는지 확인)', n; END IF;

  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE source_key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community')
     AND cap_base = 40 AND pct_step = 50 AND daily_request_target = 20 AND targets_per_run = 2;
  IF n <> 5 THEN RAISE EXCEPTION 'review_source_ramp 50%% 출발 행 불일치 — 기대 5, 일치 %', n; END IF;

  SELECT count(*) INTO n FROM public.review_targets t JOIN _disc f ON f.src = t.source_key AND f.ref = t.product_ref
   WHERE t.status = 'active' AND t.cursor IS NULL;
  IF n <> 10 THEN RAISE EXCEPTION '타깃 % 개(기대 10)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT key, enabled, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, min_interval_ms, daily_request_cap
--     FROM public.review_sources WHERE key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community') ORDER BY key;   -- 5행
--   SELECT t.source_key, count(*), count(*) FILTER (WHERE t.status='active' AND t.cursor IS NULL) FROM public.review_targets t
--    WHERE t.source_key IN ('make_community','bubble_forum','retool_community','glide_community','softr_community') GROUP BY 1 ORDER BY 1;           -- 각 2·2
-- 음성(롤백되는 형태): BEGIN; UPDATE public.review_sources SET quote_policy='full' WHERE key='glide_community'; ROLLBACK;   -- 기대: 23514 review_sources_tos_restricts_quote_policy
-- 첫 실행 뒤(§7.2): review_collection_runs 의 해당 source_key 행 override_value='owner_2026-10-14' · robots_owner_override=0.
