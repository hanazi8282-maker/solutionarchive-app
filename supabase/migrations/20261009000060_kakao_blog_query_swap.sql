-- ============================================================
-- 20261009000060_kakao_blog_query_swap — kakao_blog 검색어 교체 초안 (CEO-staff v44 §5·§6 항목 2)
--
-- ⛔ 미적용 — CTO 서브에이전트가 파일만 만들었다(CLAUDE.md §10.1·§10.2). 적용은 오케스트레이터.
--
-- 왜: kakao_blog 는 7일 요청 45건인데 신규 0건. 지금 검색어는 제품 사전 영역 07 의 음차 4개
--   (scripts/dictionary-targets.mjs KAKAO_FIRST_WAVE → 사전 daum_search: '욧포 후기'·'저지미 후기'·'룩스 후기'·'오켄도 후기').
--   - 해외 쇼피파이 앱의 한글 음차라 한국어 블로그 글이 거의 없다 → 첫 실행에 다 읽고 이후 매번 같은 글(지문 중복)만 돌아온다.
--   - '룩스'는 조명·안경·웨딩홀 상호에 흔한 일반어라 무관한 글(경주 웨딩홀 등)이 섞이는 가장 유력한 후보다(실측 대조 전 — 확인 불가).
-- 무엇을: 영역 ①~⑤(config/areas.json 의 active 영역) 국산 제품 중 이름이 고유한 10개의 사전 검색어를 kakao_blog 타깃으로 넣는다.
--   ⚠️ config/areas.json 에는 '키워드' 칸이 없다(영역 이름·코드뿐 — 실측). 그래서 검색어는 제품 사전
--      reports/2026-10-05/product-dictionary/area-0N-*.json 의 sources.daum_search.query 를 그대로 쓴다(투입기와 같은 출처).
--   프로젝트: 같은 제품의 기존 타깃(label '<영역>:<slug>')이 있는 프로젝트에 붙인다. 앵커가 없으면 그 행은 넣지 않는다(NOTICE 로 남김).
--
-- B. 옛 4개 내리기 — **이 파일은 하지 않는다.** KAKAO_FIRST_WAVE 는 남헌 D5 결정(v32 §5)이라 세션이 줄이면 §10.2 예외 6(명시 지시와
--    충돌)이다. CEO-staff 경유 승인이 오면 아래 주석 블록을 별도 파일로 낸다:
--    -- UPDATE public.review_targets SET status = 'exhausted'
--    --  WHERE source_key = 'kakao_blog' AND status = 'active'
--    --    AND product_ref IN ('q:욧포 후기','q:저지미 후기','q:룩스 후기','q:오켄도 후기');
--    그리고 scripts/dictionary-targets.mjs KAKAO_FIRST_WAVE 도 같이 고친다(안 고치면 다음 투입에서 exists 로 건너뛰므로 되살아나지는 않는다).
--
-- 🟢 비파괴. INSERT 만(ON CONFLICT DO NOTHING). UPDATE·DELETE·DDL 없음. 롤백 파일 있음.
-- 가드: kakao_blog enabled · kakao_blog 활성 비중 ≤ 30%(lib/review/target-supply.ts SHARE_GATE 와 같은 값) — 어긋나면 RAISE → 롤백.
-- 예산: review_sources·review_source_ramp 를 건드리지 않는다. 타깃이 늘어도 하루 요청은 램프 목표(현재 하루 ~6건 실측) 안이다 —
--   늘어난 타깃이 한 바퀴 도는 데 며칠 걸린다(store.ts due(): last_run_at NULLS FIRST 라 새 타깃이 먼저).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _kq (anchor_label text PRIMARY KEY, query text NOT NULL) ON COMMIT DROP;
INSERT INTO _kq (anchor_label, query) VALUES
  ('1:clova-note',        '클로바노트 후기'),
  ('1:daglo',             '다글로 후기'),
  ('2:salesmap',          '세일즈맵 후기'),
  ('2:deepsales',         '딥세일즈 후기'),
  ('3:miricanvas',        '미리캔버스 AI 후기'),
  ('3:mangoboard',        '망고보드 AI 후기'),
  ('4:shiftee',           '시프티 후기'),
  ('4:lemonbase',         '레몬베이스 후기'),
  ('5:wrtn',              '뤼튼 후기'),
  ('5:polaris-office-ai', '폴라리스 오피스 AI 후기');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'kakao_blog' AND enabled) THEN
    RAISE EXCEPTION 'kakao_blog 가 없거나 꺼져 있다';
  END IF;
END $$;

CREATE TEMP TABLE _kq_ins (id uuid, product_ref text) ON COMMIT DROP;
WITH anchor AS (
  SELECT DISTINCT ON (q.anchor_label) q.anchor_label, q.query, t.project_id
    FROM _kq q JOIN public.review_targets t ON t.label = q.anchor_label
   ORDER BY q.anchor_label, t.created_at, t.id
), ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT a.project_id, 'kakao_blog', 'q:' || a.query, a.anchor_label, 'active', NULL, NULL
    FROM anchor a
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets x WHERE x.source_key = 'kakao_blog' AND x.product_ref = 'q:' || a.query)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id, product_ref
)
INSERT INTO _kq_ins SELECT id, product_ref FROM ins;

DO $$
DECLARE n_ins int; no_anchor text; kb int; all_active int;
BEGIN
  SELECT count(*) INTO n_ins FROM _kq_ins;
  SELECT string_agg(anchor_label, ',') INTO no_anchor FROM _kq q
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.label = q.anchor_label);
  SELECT count(*) FILTER (WHERE t.source_key = 'kakao_blog'), count(*) INTO kb, all_active
    FROM public.review_targets t JOIN public.review_sources s ON s.key = t.source_key AND s.enabled
   WHERE t.status = 'active';
  IF kb > 0.3 * all_active THEN RAISE EXCEPTION 'kakao_blog 활성 % / 전체 % > 30%%', kb, all_active; END IF;
  RAISE NOTICE 'kakao_blog 신규 %행 · 앵커 없어 건너뜀: % · kakao_blog 활성 %/%', n_ins, coalesce(no_anchor, '없음'), kb, all_active;
END $$;

COMMIT;

-- ── 적용 후 확인 ───────────────────────────────────────────────
-- 양성: SELECT label, product_ref, status, last_run_at FROM public.review_targets
--        WHERE source_key = 'kakao_blog' AND product_ref IN (SELECT 'q:' || unnest(ARRAY['클로바노트 후기','다글로 후기','세일즈맵 후기',
--          '딥세일즈 후기','미리캔버스 AI 후기','망고보드 AI 후기','시프티 후기','레몬베이스 후기','뤼튼 후기','폴라리스 오피스 AI 후기'])) ORDER BY 1;
--   기대: NOTICE 의 신규 수만큼 · active · last_run_at NULL
-- 음성(롤백 형태): BEGIN; INSERT INTO public.review_targets (project_id, source_key, product_ref, status)
--   SELECT project_id, source_key, product_ref, 'active' FROM public.review_targets WHERE source_key='kakao_blog' AND product_ref='q:뤼튼 후기'; ROLLBACK;
--   기대: 23505
-- 효과 확인(다음 야간 수집 2회 뒤): review_collection_runs 의 kakao_blog new_reviews > 0, 그리고 새 입력 본문이 제품 이름을 담는지 표본 10건 눈으로.
