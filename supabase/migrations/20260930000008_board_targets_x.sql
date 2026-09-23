-- ============================================================
-- 게시판 순회 타깃 등록 — clien · 82cook · bobaedream 각 2개
--
-- 🟠 **미적용. 서브에이전트는 마이그레이션을 돌리지 않는다**(CLAUDE.md §10.2).
--    파일만 만들었다. 적용은 사람 또는 대화형/역할 세션이 한다.
--
-- 🟢 비파괴다. `review_targets` 에 INSERT 6행뿐이고 ON CONFLICT DO NOTHING 이라
--    재실행해도 늘지 않는다. 기존 행을 UPDATE·DELETE 하지 않는다.
--    `review_sources` 는 **건드리지 않는다** — 새 소스가 아니라 이미 등록·허용된
--    소스 3곳에 타깃 형식 하나를 추가하는 것이다(robots·ToS 판단이 새로 필요 없다).
--
-- 🔁 롤백: 20260930000008_board_targets_x_rollback.sql (이 6개 product_ref 만 지운다)
--
-- ── 무엇인가 ──────────────────────────────────────────────────
--
-- 지금 커뮤니티 타깃은 전부 `url:<글 경로>` 다 = **글 1개 = 타깃 1개**.
-- 그래서 새 글이 안 잡히고, 사람이 글 주소를 하나씩 등록해야 했다
-- (reports/2026-09-23/voc-expansion-investigation.md §3).
--
-- `product_ref = 'board:<게시판 slug>'` 은 타깃 하나가 **목록 1페이지 → 새 글 →
-- 그 글의 댓글**까지 돈다. 규약은 lib/review/types.ts 의 `board:` 블록,
-- 어댑터는 lib/review/adapters/{clien,82cook,bobaedream}.ts,
-- 검증은 scripts/review-board-selftest.mjs(119건)다.
--
-- ⚠️ **코드가 먼저 머지돼야 한다.** 코드 없이 이 행만 넣으면 어댑터가
--    `board:` 를 못 읽어 nextRequest 가 null 을 내고, 러너가 그 타깃을
--    첫 실행에 `exhausted` 로 닫는다(요청은 0건이라 남의 서버에는 무해하다).
--
-- ── 어느 게시판을 왜 골랐나 ───────────────────────────────────
--
-- 기준: **리뷰·구매·사용기 성격**만. 잡담·정치 게시판은 고르지 않았다 —
-- 관련성 판정(Gemini)이 건당 비용이라 노이즈를 넣으면 예산이 그쪽으로 샌다
-- (82cook 자유게시판 bn=15 실측 1페이지가 정치·연예 글로 절반이었다).
--
--  clien      use     사용기        — 제품 사용 후기 전용 게시판. **목록 마크업 실측**(2026-09-24)
--             jirum   알뜰구매      — 특가·구매 정보. 댓글에 구매 후기가 붙는다
--  82cook     31      쇼핑정보      — 구매 정보·후기
--             7       뭘사다먹지?   — 구매 상담. 82cook 은 살림·식품 VOC 축이다
--  bobaedream battle  시승기·배틀   — 시승기 = 자동차 사용기
--             national 국산차게시판 — 차량 사용·불만 VOC 가 모이는 곳
--
-- ⚠️ **실측 범위를 정직하게 적는다**(§7.1). 2026-09-24 에 각 호스트당 2요청만
--    보냈다(robots.txt + 목록 1페이지). 목록 HTML 을 실제로 받아 본 것은
--    `clien/use` · `82cook/bn=15` · `bobaedream/freeb` **3개**다. 나머지 5개
--    게시판의 slug 는 그 페이지의 네비게이션 링크에서 확인했고(존재는 확실),
--    목록 마크업은 **같은 스크립트가 낸다는 추론**이다(82cook 은 전부
--    `/entiz/enti.php?bn=N`, 보배드림은 전부 `/list?code=X`).
--    추론이 틀리면 조용한 0건이 아니라 **parseFailures 로 드러난다** — 목록에서
--    행 앵커를 하나도 못 찾으면 어댑터가 실패로 센다. 첫 밤 수집 뒤
--    `review_sources.health` 와 야간 보고의 파싱 실패 수를 보면 알 수 있다.
--
-- ⚠️ 요청 예산. 게시판 타깃 1개는 실행당 최대 20요청이다(목록 1 + 글 19).
--    새 글이 없으면 1요청으로 끝난다(커서의 last 가 증분을 막는다).
--    적용 전에 아래 확인 쿼리로 소스별 `daily_request_cap` 여유를 보라.
--    모자라면 게시판을 1개씩 줄이거나 cap 을 올린다(그건 별건이다).
--
-- ── project_id 를 어떻게 정하나 ───────────────────────────────
--
-- `review_targets.project_id` 는 NOT NULL 이고 `analysis_projects` 를 가리킨다.
-- 게시판 순회는 특정 상품이 아니라 게시판 전체를 훑으므로 "그 상품의 프로젝트"가
-- 없다. 그래서 **그 소스의 기존 타깃이 가장 많이 매달려 있는 프로젝트**에 붙인다.
-- uuid 를 하드코딩하지 않는 이유는 이 파일이 환경을 모르기 때문이다 —
-- 없으면 0행 INSERT 로 조용히 끝난다(에러가 아니다. 아래 확인 쿼리로 본다).
--
-- 🟠 **이 선택은 사람이 한 번 봐 주면 좋다.** 수집된 글이 그 프로젝트의
--    `analysis_inputs` 로 들어간다. 다른 프로젝트에 붙이고 싶으면 아래
--    `pick_project` 서브쿼리 대신 uuid 를 직접 써라.
-- ============================================================

BEGIN;

WITH wanted(source_key, product_ref, label) AS (
  VALUES
    ('clien',      'board:use',      '클리앙 사용기 게시판 순회'),
    ('clien',      'board:jirum',    '클리앙 알뜰구매 게시판 순회'),
    ('82cook',     'board:31',       '82cook 쇼핑정보 게시판 순회'),
    ('82cook',     'board:7',        '82cook 뭘사다먹지 게시판 순회'),
    ('bobaedream', 'board:battle',   '보배드림 시승기·배틀 게시판 순회'),
    ('bobaedream', 'board:national', '보배드림 국산차 게시판 순회')
),
-- 소스별로 기존 타깃이 가장 많은 프로젝트. 동수면 uuid 순으로 고정한다(재실행 결과가 흔들리지 않게).
pick_project AS (
  SELECT DISTINCT ON (source_key) source_key, project_id
    FROM public.review_targets
   GROUP BY source_key, project_id
   ORDER BY source_key, count(*) DESC, project_id
)
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status)
SELECT p.project_id, w.source_key, w.product_ref, w.label, 'active'
  FROM wanted w
  JOIN pick_project p ON p.source_key = w.source_key
ON CONFLICT (project_id, source_key, product_ref) DO NOTHING;

COMMIT;

-- ── 적용 전에 먼저 돌려 볼 것 ──────────────────────────────────
--
-- 1) 어느 프로젝트에 붙게 되는지 (INSERT 전에 눈으로 확인)
-- SELECT DISTINCT ON (t.source_key) t.source_key, t.project_id, a.name, count(*) AS existing_targets
--   FROM public.review_targets t JOIN public.analysis_projects a ON a.id = t.project_id
--  WHERE t.source_key IN ('clien','82cook','bobaedream')
--  GROUP BY t.source_key, t.project_id, a.name
--  ORDER BY t.source_key, count(*) DESC, t.project_id;
--
-- 2) 요청 예산 여유 (게시판 타깃 1개 = 실행당 최대 20요청)
-- SELECT s.key, s.enabled, s.min_interval_ms, s.daily_request_cap,
--        count(t.id) FILTER (WHERE t.status='active') AS active_targets
--   FROM public.review_sources s LEFT JOIN public.review_targets t ON t.source_key = s.key
--  WHERE s.key IN ('clien','82cook','bobaedream')
--  GROUP BY s.key, s.enabled, s.min_interval_ms, s.daily_request_cap;
--
-- ── 적용 후 확인 ──────────────────────────────────────────────
--
-- 양성: 6행이 active 로 들어갔고 커서는 비어 있다(첫 실행이 목록부터 읽는다).
-- SELECT source_key, product_ref, label, status, cursor, consecutive_empty
--   FROM public.review_targets
--  WHERE product_ref LIKE 'board:%'
--  ORDER BY source_key, product_ref;          -- 기대: 6행 · status=active · cursor IS NULL
--
-- 음성: 기존 url: 타깃은 하나도 바뀌지 않았다.
-- SELECT count(*) FROM public.review_targets
--  WHERE source_key IN ('clien','82cook','bobaedream') AND product_ref LIKE 'url:%';
--   -- 기대: 2026-09-23 실측(clien 19 · 82cook 7 · bobaedream 3) 합계 29 그대로
--
-- 음성: review_sources 는 손대지 않았다.
-- SELECT key, enabled, health, disabled_reason FROM public.review_sources
--  WHERE key IN ('clien','82cook','bobaedream');   -- 기대: 적용 전과 동일
--
-- 첫 밤 수집 뒤(§7.1 — 조용한 0건과 구조 변경을 가른다):
-- SELECT source_key, product_ref, status, cursor, total_collected, consecutive_empty, last_run_at
--   FROM public.review_targets WHERE product_ref LIKE 'board:%' ORDER BY source_key;
--   -- 기대: cursor 가 {"q":[],"last":"<글번호>"} 형태 · total_collected > 0
--   -- ⚠️ cursor 가 계속 NULL 이면 어댑터가 board: 를 못 읽은 것이다(코드 미머지).
--   -- ⚠️ total_collected 가 0 인데 status 가 active 면 목록은 읽었고 새 글이 없었다는 뜻이다.
--   --    연속 3회 그러면 러너가 exhausted 로 닫는다(runner.ts 의 연속 0건 안전장치).
--   --    그때는 "게시판이 조용한가"와 "선택자가 깨졌나"를 파싱 실패 수로 갈라 봐라.
