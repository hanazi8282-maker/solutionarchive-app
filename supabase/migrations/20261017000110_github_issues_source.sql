-- ============================================================
-- 20261017000110_github_issues_source — v71ad §5(d): GitHub 공개 이슈(무토큰 REST Search) 소스 등록 + 램프 50% 출발 + 영역 ①~⑤ 타깃 16개
--
-- ⛔ 미적용 상태로 PR 에 올린다. 적용은 코드 PR(#563, lib/review/adapters/github.ts)이 main 에 머지된 뒤 오케스트레이터(대화형·CEO-staff 세션)가 한다.
--    코드가 main 에 없으면 수집기에 github_issues 어댑터가 없어 이 소스는 조용히 안 돈다 — 코드 머지 뒤에 적용한다.
-- 근거: 남헌 v71ad §5(d) 승인(2026-10-17, "약관은 남헌이 확인 완료·진행").
-- 선행: 20261005000001/3(정책 컬럼·quote_policy) · 20260930000034 + 20261006000002(review_source_ramp·퍼센트 칸) · 20261009000020(area_code) · 20260923000001(business_model).
--
-- ── 소스 근거(2026-10-17 실측, 우리 UA solutionarchive-review-collector, 무토큰) ──
--   API: GET https://api.github.com/search/issues?q=repo:<r>+is:issue&sort=created&order=desc&per_page=50 → 200 · PR 0 · 본문 포함.
--     한도: X-RateLimit-Resource: search · Limit 10(분당). min_interval_ms 7000 → 분당 ≤ 8.6회.
--   robots: api.github.com/robots.txt → 404 JSON(규칙 없음) → robots_status='not_applicable'(공식 API). 러너는 어댑터 표식(proceedWhenRobotsUnverified)으로만 통과.
--   약관: GitHub Acceptable Use Policies §7 "Information Usage Restrictions" — 허용 용도로 연구(결과물 오픈 액세스)·아카이브만 명시,
--     스팸·개인정보 판매 금지, "Scraping does not refer to the collection of information through our API". 상업적 분석 용도는 명시 허용이 아니다
--     → tos_status='unverified'(허용으로 접지 않는다, §7.1). 남헌이 약관 확인 뒤 진행 지시(v71ad) — 기록만 하고 막지 않는다.
--   인용: quote_policy='none', quote_allowed=false(공개 화면·결론서 원문 인용 금지), citation_allowed=true(내부 판정·통계 근거).
--   작성자: 로그인명·아바타 저장 안 함(어댑터가 user.type·author_association 을 거르는 데만 읽고 버린다). 본문 @멘션은 @user.
--   override=NULL — robots 금지 예외·차단 자동 정지(owner_2026-10-14) 대상이 아니다. 403/429/HTML 은 어댑터·러너가 요청 1건 뒤 멈춘다.
--   시드: daily_request_cap 120 · 램프 cap_base 120 → 50% = 하루 60요청 · 회당 타깃 6.
-- ── 타깃(16) — 영역 ①~⑤ 의 사용자가 직접 쓰는 오픈소스 도구 공개 이슈 트래커. 라이브러리·SDK 제외 ──
--   실측 사용자 이슈/일(2026-10-17, 최근 50건 기준, 메인테이너·봇 제외): twenty 4.37 · mautic 8.35(5일 폭주 가능) · affine 1.66 · appflowy 1.44 ·
--   vexa 0.94 · postiz 0.93 · frappe-hrms 0.84 · listmonk 0.69 · jitsi 0.54 · espocrm 0.53 · frappe-crm 0.52 · meetily 0.48 · krayin 0.38 ·
--   kimai 0.36 · suitecrm 0.33 · languagetool 0.24 → 합 약 22.6건/일 [추정, 관련성 판정 전]. 버그 리포트 비중이 높아 T2 관련 비율은 낮을 수 있다.
--   제외: fastrepl/hyprnote(→ anarlog, 이슈 꺼짐) · orangehrm(0.06/일) · 상용 도구(Otter·Fireflies·HubSpot 등)는 공개 트래커가 없다.
--   프로젝트: 같은 pitch 가 있으면 재사용, 없으면 collecting 으로 새로(§10.1 신규 INSERT 한정). area_code 는 라벨 접두로 부여(basis 'label', rule 'v71ad').
--
-- 🟢 비파괴·멱등. INSERT 만: review_sources 1 · review_source_ramp 1 · analysis_projects ≤16 · review_targets ≤16(같은 source_key+product_ref 있으면 건너뜀).
--    UPDATE·DELETE·DDL 없음. 끝의 DO 블록이 값을 대조하고 어긋나면 RAISE → 전체 롤백.
--    §10.2 사람 판단 예외: 4번(새 법적 리스크 — tos unverified)에 해당하나 남헌 v71ad §5 명시 승인으로 해소. 나머지 해당 없음.
-- 롤백: 20261017000110_github_issues_source_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT key FROM public.review_sources WHERE key = 'github_issues';                      -- 기대: 0행
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'github_issues';           -- 기대: 0
--   (코드) git log origin/main --oneline -- lib/review/adapters/github.ts                    -- 기대: 1줄 이상

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result
) VALUES (
  'github_issues',
  'GitHub 공개 이슈(REST Search, 무토큰)',
  true, NULL, 'ok', 7000, 120,
  'not_applicable', 'unverified', NULL, 'none', false, true,
  '낮음 — 공개 이슈. 로그인명·아바타는 저장하지 않고(authorMasked=null), 본문 @멘션은 @user 로 치환. 메인테이너·봇 이슈는 거른다.',
  '2026-10-17 무토큰 Search 17회(전부 200, PR 0, 본문 포함). 약관 AUP §7: 상업 분석 명시 허용 아님(unverified) — 남헌 v71ad 승인으로 수집+라벨.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)
VALUES ('github_issues', 0, 6, 'v71ad §5(d) — 새 소스 50% 출발(남헌 승인)', 50, 120, 60)
ON CONFLICT (source_key) DO NOTHING;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'github_issues' AND enabled) <> 1 THEN
    RAISE EXCEPTION 'github_issues 가 없거나 enabled=false — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _gh (ref text NOT NULL, area text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _gh (ref, area, label, pitch, url) VALUES
  ('board:meetily',      '1', '1:gh|meetily',      'Meetily — 오픈소스 로컬 AI 회의록·전사 앱',               'https://github.com/Zackriya-Solutions/meetily'),
  ('board:vexa',         '1', '1:gh|vexa',         'Vexa — 오픈소스 회의 봇·실시간 전사 API',                 'https://github.com/Vexa-ai/vexa'),
  ('board:jitsi-meet',   '1', '1:gh|jitsi-meet',   'Jitsi Meet — 오픈소스 화상회의',                          'https://jitsi.org/'),
  ('board:twenty',       '2', '2:gh|twenty',       'Twenty — 오픈소스 CRM(Salesforce 대안)',                  'https://twenty.com/'),
  ('board:frappe-crm',   '2', '2:gh|frappe-crm',   'Frappe CRM — 오픈소스 영업 CRM',                          'https://frappe.io/crm'),
  ('board:espocrm',      '2', '2:gh|espocrm',      'EspoCRM — 오픈소스 CRM',                                  'https://www.espocrm.com/'),
  ('board:krayin-crm',   '2', '2:gh|krayin-crm',   'Krayin — 오픈소스 Laravel CRM',                           'https://krayincrm.com/'),
  ('board:suitecrm',     '2', '2:gh|suitecrm',     'SuiteCRM — 오픈소스 CRM',                                 'https://suitecrm.com/'),
  ('board:postiz',       '3', '3:gh|postiz',       'Postiz — 오픈소스 소셜 미디어 예약 발행 도구',            'https://postiz.com/'),
  ('board:mautic',       '3', '3:gh|mautic',       'Mautic — 오픈소스 마케팅 자동화',                         'https://www.mautic.org/'),
  ('board:listmonk',     '3', '3:gh|listmonk',     'listmonk — 오픈소스 뉴스레터·메일링 리스트 관리',         'https://listmonk.app/'),
  ('board:kimai',        '4', '4:gh|kimai',        'Kimai — 오픈소스 근태·작업 시간 기록',                    'https://www.kimai.org/'),
  ('board:frappe-hrms',  '4', '4:gh|frappe-hrms',  'Frappe HR — 오픈소스 인사·급여·근태',                     'https://frappe.io/hr'),
  ('board:languagetool', '5', '5:gh|languagetool', 'LanguageTool — 문법·맞춤법 검사기(Grammarly 대안)',       'https://languagetool.org/'),
  ('board:appflowy',     '5', '5:gh|appflowy',     'AppFlowy — 오픈소스 문서·노트(Notion 대안)',              'https://appflowy.com/'),
  ('board:affine',       '5', '5:gh|affine',       'AFFiNE — 오픈소스 문서·화이트보드(Notion 대안)',          'https://affine.pro/');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model,
                                      area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS',
       g.area, 'label', 'label:' || g.label, 'v71ad', now()
  FROM _gh g
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch)
 ORDER BY g.pitch;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'github_issues', g.ref, g.label, NULL, 'active'
  FROM _gh g
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'github_issues' AND t.product_ref = g.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_sources
   WHERE key = 'github_issues' AND enabled AND robots_status = 'not_applicable' AND tos_status = 'unverified' AND override IS NULL
     AND quote_policy = 'none' AND NOT quote_allowed AND citation_allowed AND min_interval_ms = 7000 AND daily_request_cap = 120;
  IF n <> 1 THEN RAISE EXCEPTION 'review_sources 값 불일치 — 기대 1행, 일치 %행(기존 행이 있었는지 확인)', n; END IF;

  SELECT count(*) INTO n FROM public.review_source_ramp
   WHERE source_key = 'github_issues' AND cap_base = 120 AND pct_step = 50 AND daily_request_target = 60 AND targets_per_run = 6;
  IF n <> 1 THEN RAISE EXCEPTION 'review_source_ramp 50%% 출발 행 불일치 — 기대 1, 일치 %', n; END IF;

  SELECT count(*) INTO n FROM public.review_targets t JOIN _gh g ON t.source_key = 'github_issues' AND t.product_ref = g.ref
   WHERE t.status = 'active' AND t.cursor IS NULL;
  IF n <> 16 THEN RAISE EXCEPTION '타깃 % 개(기대 16)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT key, enabled, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, min_interval_ms, daily_request_cap
--     FROM public.review_sources WHERE key = 'github_issues';
--   -- 기대: github_issues · t · not_applicable · unverified · NULL · none · f · t · 7000 · 120
--   SELECT source_key, pct_step, cap_base, daily_request_target, targets_per_run FROM public.review_source_ramp WHERE source_key = 'github_issues';  -- 50·120·60·6
--   SELECT p.area_code, count(*) FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
--    WHERE t.source_key = 'github_issues' GROUP BY 1 ORDER BY 1;   -- 1:3 · 2:5 · 3:3 · 4:2 · 5:3 (기존 pitch 재사용 프로젝트는 area 가 다를 수 있다)
-- 음성(롤백되는 형태): BEGIN; UPDATE public.review_sources SET quote_allowed = true, citation_allowed = false WHERE key = 'github_issues'; ROLLBACK;  -- 기대: 23514
-- 첫 실행 뒤(§7.2): review_collection_runs 의 github_issues 행 — robots_bypassed(표식 통과) 1호스트 · blocked_responses 0 · 타깃당 첫 실행 요청 ≤5(백필).
