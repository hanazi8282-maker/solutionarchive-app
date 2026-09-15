-- Hacker News 파일럿 타깃 2행 — 무선이어폰 프로젝트(BOSE QC 이어버드2 / 젠하이저 MTW3)
--
-- 🟢 비파괴. review_targets 에 행 2개. 스키마 변경 없음.
--
-- 왜 이 두 프로젝트인가: 지금 `analysis_inputs` 가 0건이다. 수집 계층이
-- 붙어 있는데 입력이 없는 상태라, 소스 확장의 효과를 가장 먼저 볼 수 있다.
-- 탈모샴푸·유산균 프로젝트는 넣지 않는다 — HN 은 개발자·창업자 게시판이라
-- 생활소비재 VOC 가 구조적으로 없다(0건이 나오고, 그 0건은 소스 문제가
-- 아니라 질의 문제로도 안 보인다).
--
-- ⚠️ **질의는 1~2토큰이어야 한다.**
--    `lib/review/adapters/hackernews.ts` 의 `isRelevant` 가 질의를 공백으로
--    쪼개 **토큰 전부(AND)** 가 제목+본문에 있어야 통과시킨다. 그래서
--    `bluetooth earbuds noise cancelling` 같은 4토큰은 사실상 0건이 되고,
--    그 0건은 `filtered` 로 잡혀 `parseFailures` 에 안 들어간다 —
--    **health 는 계속 `ok` 로 뜬다. 조용한 실패다**(CLAUDE.md §7.1).
--    아래 질의를 늘리고 싶으면 토큰 수를 먼저 보라.
--
-- ⚠️ 이 파일은 hackernews 소스가 **켜져 있어야** 의미가 있다.
--    확인:  select key, enabled from public.review_sources where key = 'hackernews';
--
-- 적용(사람이 한다, CLAUDE.md §10.1):
--   supabase db query --linked -f supabase/migrations/20260916000004_hackernews_pilot_targets.sql

-- ⚠️ 생성된 UUID 를 하드코딩하지 않는다. 프로젝트는 이름/접두로 찾아 넣는다.
INSERT INTO public.review_targets (project_id, source_key, product_ref, label)
SELECT p.id, 'hackernews', v.product_ref, v.label
  FROM public.analysis_projects p
  CROSS JOIN LATERAL (VALUES
    ('q:AirPods', 'HN 파일럿 — AirPods (1토큰)'),
    ('q:earbuds', 'HN 파일럿 — earbuds (1토큰)')
  ) AS v(product_ref, label)
 WHERE p.id::text LIKE '94085129%'      -- BOSE QC 이어버드2
 ON CONFLICT DO NOTHING;

INSERT INTO public.review_targets (project_id, source_key, product_ref, label)
SELECT p.id, 'hackernews', v.product_ref, v.label
  FROM public.analysis_projects p
  CROSS JOIN LATERAL (VALUES
    ('q:Sennheiser', 'HN 파일럿 — Sennheiser (1토큰)'),
    ('q:earbuds', 'HN 파일럿 — earbuds (1토큰)')
  ) AS v(product_ref, label)
 WHERE p.id = '9f12cebe-137d-4c4b-a23c-ff9f30df9181'  -- 젠하이저 MTW3
 ON CONFLICT DO NOTHING;

-- 확인용 (실행 후 눈으로 볼 것):
--   select t.product_ref, t.label, t.status, p.id
--     from public.review_targets t
--     join public.analysis_projects p on p.id = t.project_id
--    where t.source_key = 'hackernews'
--    order by p.id, t.product_ref;
--
-- 기대: 프로젝트 2개 × 질의 2개 = 4행. 0행이면 WHERE 가 프로젝트를 못 찾은 것이다
--       (그때는 "타깃이 안 걸렸다"이지 "수집이 0건"이 아니다 — 구분해서 보라).
