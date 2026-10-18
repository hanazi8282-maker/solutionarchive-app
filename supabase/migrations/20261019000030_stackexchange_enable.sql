-- ============================================================
-- 20261019000030_stackexchange_enable — v71au ⑪: Stack Exchange 소스 켜기(enabled=true) + 영역 ①③⑤ 질문 태그 8곳 타깃 등재
--
-- ⛔ 미적용 상태로 PR 에 올린다. 코드(lib/review/adapters/stackexchange.ts BOARDS 5곳·SITE_WEB workplace 추가)가 main 에 머지된 **뒤** 적용한다.
-- ⚠️ 정직한 기대치: 2026-10-19 무키 API 로 40개 (사이트, 태그) 조합의 최근 90일 질문 수를 쟀다 — 21건/90일(= 하루 0.2건). 아래 8곳 합 19건/90일 [직접 실행 확인].
--   Stack Exchange 는 영역 ①~⑤ 사용자 질문이 사실상 없다(softwarerecs·webapps 대부분 0). 이 소스는 ×3 에 기여하지 않는다 — 켜는 이유는 지시(v71au ⑪)와 비용 0(요청 하루 ≈8)이다.
--   더 늘리려면 태그가 아니라 전문 검색(/search/advanced?q=)이 필요하나 어댑터에 없고, 총량이 같은 천장(하루 0.2건대)이라 하지 않았다.
-- 약관: API 이용 약관(stackoverflow.com/legal/api-terms-of-use, 2026-10-19 원문 확인) — 출처 표시 의무(화면 노출 앱) · 위반 시 접근 종료. 상업 이용 금지 문구 없음.
--   콘텐츠는 CC BY-SA(Network 약관). 우리는 내부 분석에만 쓰고(quote_policy none) 원문을 화면에 노출하지 않는다. Network ToS 본문은 이 세션이 읽지 않았다 → tos_status 'unverified' 유지(§7.1).
-- 🟢 비파괴·멱등. UPDATE 1(review_sources 켜기 — enabled/disabled_reason/disabled_at 만) · INSERT: analysis_projects ≤8 · review_targets ≤8. DDL 없음.
-- 롤백: 20261019000030_stackexchange_enable_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT enabled FROM public.review_sources WHERE key = 'stackexchange';                           -- 기대: f
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'stackexchange';                   -- 기대: 0

BEGIN;

UPDATE public.review_sources
   SET enabled = true, disabled_reason = NULL, disabled_at = NULL
 WHERE key = 'stackexchange' AND NOT enabled;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'stackexchange' AND enabled AND robots_status = 'not_applicable') <> 1 THEN
    RAISE EXCEPTION 'stackexchange 가 없거나 켜지지 않았다 — 타깃을 넣지 않는다(CLAUDE.md §10.1)';
  END IF;
END $$;

CREATE TEMP TABLE _se (ref text NOT NULL, area text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _se (ref, area, label, pitch, url) VALUES
  ('board:su-teams', '1', '1:se|su-teams', 'Stack Exchange — Microsoft Teams 사용자 질문(Super User)', 'https://superuser.com/questions/tagged/microsoft-teams'),
  ('board:su-zoom', '1', '1:se|su-zoom', 'Stack Exchange — Zoom 사용자 질문(Super User)', 'https://superuser.com/questions/tagged/zoom'),
  ('board:wa-google-meet', '1', '1:se|wa-google-meet', 'Stack Exchange — Google Meet 사용자 질문(Web Apps)', 'https://webapps.stackexchange.com/questions/tagged/google-meet'),
  ('board:wk-meetings', '1', '1:se|wk-meetings', 'Stack Exchange — 회의 운영 질문(Workplace)', 'https://workplace.stackexchange.com/questions/tagged/meetings'),
  ('board:su-word', '5', '5:se|su-word', 'Stack Exchange — Microsoft Word 사용자 질문(Super User)', 'https://superuser.com/questions/tagged/microsoft-word'),
  ('board:su-outlook', '5', '5:se|su-outlook', 'Stack Exchange — Microsoft Outlook 사용자 질문(Super User)', 'https://superuser.com/questions/tagged/microsoft-outlook'),
  ('board:su-onenote', '5', '5:se|su-onenote', 'Stack Exchange — Microsoft OneNote 사용자 질문(Super User)', 'https://superuser.com/questions/tagged/microsoft-onenote'),
  ('board:wa-linkedin', '3', '3:se|wa-linkedin', 'Stack Exchange — LinkedIn 사용자 질문(Web Apps)', 'https://webapps.stackexchange.com/questions/tagged/linkedin');

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model,
                                      area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS',
       g.area, 'label', 'label:' || g.label, 'v71au', now()
  FROM _se g
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch)
 ORDER BY g.pitch, g.ref;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'stackexchange', g.ref, g.label, NULL, 'active'
  FROM _se g
  JOIN LATERAL (
    SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1
  ) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'stackexchange' AND t.product_ref = g.ref);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.review_targets t JOIN _se g ON t.source_key = 'stackexchange' AND t.product_ref = g.ref WHERE t.status = 'active';
  IF n <> 8 THEN RAISE EXCEPTION '타깃 % 개(기대 8)', n; END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
--   SELECT key, enabled, tos_status FROM public.review_sources WHERE key = 'stackexchange';           -- t · unverified
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'stackexchange' AND status = 'active'; -- 8
