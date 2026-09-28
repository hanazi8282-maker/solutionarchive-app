-- VOC 수집 소스 — 디스콰이엇(disquiet.io) 게시글·댓글 1행 등록(활성) + 홈 피드 순회 타깃 1개
--
-- 어댑터: lib/review/adapters/disquiet.ts · 셀프테스트: scripts/review-disquiet-selftest.mjs
-- 실측: reports/2026-09-25/voc-probe-disquiet.md · 2026-09-28 픽스처 fixtures/review/disquiet/
--
-- 🟢 비파괴. INSERT + ON CONFLICT DO NOTHING 두 개. 기존 행은 안 건드린다. DDL 없음.
--
-- ⛔ **약관 리스크를 사람이 인수한 소스다.** 디스콰이엇 통합 약관(www.relate.kr/terms) 금지행위:
--    "회사의 사전 허락 없이 자동화된 수단(매크로·스크래퍼 등)으로 … 수집" — robots 는 `Allow: /`.
--    남헌 2026-09-28 결정: 법적 리스크를 알고 활성화한다(docs/review-source-findings-round5-b.md §디스콰이엇).
--    CLAUDE.md §10.2 "새로운 법적 리스크" 예외 = 사람 판단이고, 그 판단이 내려졌으므로 enabled=true 로 넣는다.
--    이 파일의 **적용** 자체는 여전히 §10.2 주체(남헌·대화형/역할 세션)가 한다 — 서브에이전트가 만든 파일이다.
--
-- ⚠️ 보수적 설정: min_interval_ms 5000 · daily_request_cap 50.
--    실행 1회 = 피드 1요청 + 새 글 최대 19요청. 하루 새 글 ~10건(2026-09-26~28 id 6549→6568, 약 45시간에 20건)
--    이라 하루 2회 실행이면 평소 ~13요청이다. 첫 실행만 20요청.
--    차단(403/429)이 오면 러너가 그 실행을 멈추고 소스를 끈다(enabled=false · disabled_reason 자동 기록).
--    우회하지 않는다 — 꺼지면 그대로 둔다(todayhumor 000019 선례).

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'disquiet',
    '디스콰이엇',
    true,
    NULL,
    'ok', 5000, 50
  )
ON CONFLICT (key) DO NOTHING;

-- 홈 피드 순회 타깃. 붙일 프로젝트는 남헌 2026-09-24 지정 SaaS 창업가 페인 VOC 프로젝트(okky board:community 와 같다).
-- 디스콰이엇은 메이커가 쓰는 글이라 "만들기의 고통" 쪽 페인이 모인다 — 그 프로젝트의 목적과 맞다.
-- 프로젝트가 없으면 소스 행만 남기고 타깃은 건너뛴다(NOTICE). 조용히 넘어가지 않게 남긴다(§7.1).
DO $$
DECLARE
  v_project uuid := 'e819f101-77da-4d42-9d50-f5248449052f'::uuid;
  v_inserted integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.analysis_projects WHERE id = v_project) THEN
    RAISE NOTICE 'analysis_projects 에 % 가 없다 — board:feed 타깃을 넣지 않았다. 사람이 프로젝트를 정해 따로 등록해라.', v_project;
    RETURN;
  END IF;

  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status)
  VALUES (v_project, 'disquiet', 'board:feed', '디스콰이엇 홈 피드 순회(목록→글→댓글)', 'active')
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE NOTICE 'disquiet board:feed 타깃이 이미 있다(새로 넣지 않았다).';
  ELSE
    RAISE NOTICE 'disquiet board:feed 타깃 1건 등록.';
  END IF;
END $$;

-- 확인용:
--   select key, display_name, enabled, disabled_reason, min_interval_ms, daily_request_cap
--     from public.review_sources where key = 'disquiet';
--   select id, product_ref, status, cursor, total_collected from public.review_targets where source_key = 'disquiet';
-- 기대: enabled=true · 5000 · 50 / board:feed 1행 · active · cursor NULL(아직 안 돎).
-- 첫 실행 뒤(§7.2): cursor 에 {"q":[],"last":"<숫자>"} 가 남고 active 여야 한다. exhausted 면 이상이다.
