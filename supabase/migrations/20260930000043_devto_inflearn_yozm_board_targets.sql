-- ============================================================
-- 20260930000043_devto_inflearn_yozm_board_targets — 게시판 순회 타깃 3개(devto board:saas ·
--   inflearn board:questions · yozm board:magazine) + 피드 전용 프로젝트 3행
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트가 만든 파일이다(CLAUDE.md §10.2).
-- ⛔ 법적 조항 인지, 남헌 승인 하 강행(2026-09-30). 소스별 조항 인용은 20260930000042 머리말에 있다:
--    devto 약관 §2 "… for personal, non-commercial transitory viewing only … you may not: modify or copy
--    the materials; use the materials for any commercial purpose" · inflearn 약관 평문 못 읽음(CSR 54자) ·
--    yozm 약관 조항 인용 못 함(큐 사유는 robots 확인 불가였고 09-30 재실측 200).
--
-- ── ⛔ 적용 전 조건 ───────────────────────────────────────────────
--   1) 20260930000042 가 먼저 적용돼 세 소스가 enabled=true 여야 한다. 아니면 아래 DO 블록이 예외로 멈춘다
--      (review_targets 자율 INSERT 는 enabled 소스 한정 — §10.1).
--   2) 같은 PR 의 코드(어댑터 3개 · ADAPTERS 맵 · 워크플로 선택지)가 main 에 있어야 한다. 없으면 이 타깃들은
--      매일 밤 "어댑터 없음"으로 건너뛴다(조용히).
--
-- 🟢 비파괴. `analysis_projects` 3행 + `review_targets` 3행 INSERT, 전부 NOT EXISTS 로 재실행 안전.
--    UPDATE·DELETE·DDL 없음. 롤백 파일 있음.
--
-- ── project_id ─────────────────────────────────────────────────
--   20260930000041(velog 태그) 과 같은 방식 — 피드마다 전용 프로젝트 1행(competitor_url 자연키),
--   business_model='SAAS'(독자 = SaaS 1인~소수팀 창업가 축). T1~T4 게이트를 그대로 거친다.
--
-- ── 비용 ───────────────────────────────────────────────────────
--   게시판 1개 = 실행당 목록 1 + 새 글 ≤19(devto 는 본문 + 댓글 있는 글의 댓글 요청 합산 ≤19).
--   daily_request_cap 60/40/40(000042) 안.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key IN ('devto', 'inflearn', 'yozm') AND enabled) <> 3 THEN
    RAISE EXCEPTION 'devto·inflearn·yozm 중 없거나 enabled=false 인 소스가 있다 — 20260930000042 를 먼저 적용하라(CLAUDE.md §10.1)';
  END IF;
END $$;

INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, business_model)
SELECT v.url, v.pitch, 'product_fit', NULL, 'collecting', 'SAAS'
  FROM (VALUES
    ('https://dev.to/t/saas',
     'dev.to `saas` 태그 — 영어권 1인·소수팀 빌더의 SaaS 제작·런칭·가격·첫 사용자 회고와 댓글. 2026-09-30 실측 하루 수십 건.'),
    ('https://www.inflearn.com/community/questions',
     '인프런 커뮤니티 질문&답변 — 개발 도구·강의 수강 중 막힌 지점 질문(최근 AI 코딩 도구 질문 다수). 독자 겹침은 낮다 — T2 가 거른다.'),
    ('https://yozm.wishket.com/magazine/',
     '요즘IT 매거진 첫 화면 — IT 서비스·스타트업·프로덕트 에디토리얼 기사. VOC 가 아니라 기사라 가치는 낮다 — T2 가 거른다.')
  ) AS v(url, pitch)
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.competitor_url = v.url);

INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT p.id, v.src, v.ref, v.label, NULL, 'active'
  FROM (VALUES
    ('https://dev.to/t/saas',                         'devto',    'board:saas',      'dev.to 태그 순회 · saas(글·댓글)'),
    ('https://www.inflearn.com/community/questions',  'inflearn', 'board:questions', '인프런 질문&답변 순회'),
    ('https://yozm.wishket.com/magazine/',            'yozm',     'board:magazine',  '요즘IT 매거진 첫 화면 순회')
  ) AS v(url, src, ref, label)
  JOIN public.analysis_projects p ON p.competitor_url = v.url
 WHERE NOT EXISTS (
   SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref
 );

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: 3행 · active · cursor NULL · business_model SAAS
-- SELECT t.source_key, t.product_ref, t.status, t.cursor IS NULL AS fresh, p.business_model
--   FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
--  WHERE t.source_key IN ('devto', 'inflearn', 'yozm') ORDER BY 1;
-- 음성: 다른 소스 타깃은 그대로 — 적용 전후 같은 결과여야 한다(세 소스 행만 늘어야 한다).
-- SELECT source_key, status, count(*) FROM public.review_targets GROUP BY 1, 2 ORDER BY 1, 2;
-- 첫 실행 뒤(§7.2): cursor 에 {"q":[...],"last":"<숫자>"} 가 남고 active 여야 한다. exhausted 면 이상이다.
