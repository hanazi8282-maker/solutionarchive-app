-- ============================================================
-- 20260930000041_velog_board_targets — velog 태그 게시판 4개 등록 + 생산성 태그 재개
--
-- ⛔ 미적용. 서브에이전트가 만든 파일이다(CLAUDE.md §10.2 — 판단 주체가 아니다).
--    적용은 오케스트레이터(대화형·역할 세션)가 아래 "적용 전 조건"을 보고 한다.
--
-- 근거: 남헌 2026-09-30 정책 — 새 게시판·커뮤니티는 세션이 스스로 찾아 등록한다
--       (CLAUDE.md §10.1 "발굴 적재", 절차 docs/review-collection-design.md §1.2).
--       velog 는 이미 enabled 소스라 새 소스 추가가 아니다. `review_targets` INSERT 는
--       §10.1 자율 범위(enabled 소스 한정)이고, 기록을 남기려고 마이그레이션으로 낸다.
--
-- 🟢 비파괴. DDL 0줄. `analysis_projects` 4행 + `review_targets` 4행 INSERT,
--    `review_targets` 1행 UPDATE(생산성 재개). 기존 행 DELETE 없음. 롤백 파일 있음.
--    §10.2 사람 판단 예외 5개 해당 없음(삭제 없음 · 대량 UPDATE 아님(1행) · 키 무관 ·
--    새 소스 아님 · 타깃 독자 정의 불변).
--
-- ── ⛔ 적용 전 조건 ───────────────────────────────────────────────
--   1) velog 행이 enabled=true 여야 한다. 아니면 아래 DO 블록이 예외로 멈춘다(§10.1).
--   2) 같은 PR 의 코드가 **먼저 또는 같은 날 03:00 KST 전에** main 에 있어야 한다.
--      새 slug 4개는 lib/review/adapters/velog.ts BOARDS 표에 있어야 목록을 받는다 —
--      표에 없으면 boardList 가 null → 0요청 → 연속 0건 3회로 닫힌다(조용히).
--   3) 생산성 재개(3번 블록)는 같은 PR 의 러너 변경(게시판 문턱 30,
--      lib/review/health.ts BOARD_MAX_CONSECUTIVE_EMPTY)이 있어야 의미가 있다.
--      그게 없으면 목록이 안 바뀌는 사흘 뒤에 다시 닫힌다 — 09-27 부터 0요청이던 원인이 그것이다.
--
-- ── 법적 점검(§1.2 절차) — velog 는 기존 판정 그대로 ─────────────────
--   robots: 2026-09-24 실측 `User-agent: *` 규칙 0개(57B) = 허용(금지 없음, 초대 아님).
--   약관: velog.io/policy/terms 평문 4,193자, 크롤/로봇/자동/스크래핑/수집/복제 등 금지어 0건
--         (20260930000010 머리말). 로그인·유료벽 없음. 개인정보: 공개 기술 블로그 글·댓글.
--   이번 세션 요청: 태그 목록 GET 11회(생산성 1 + 후보 10), 간격 6초, 러너 UA.
--
-- ── 태그 선정 — 2026-09-30 실측(목록 1페이지, 최신순, 날짜 | 제목 원문) ─────
--   ✅ 사이드프로젝트 (board:side-project) — 15건, 09-16~09-29 에 12건.
--      09-28 Next.js PWA와 Supabase로 Web Push 알림 구현하기 | 오늘치 개발기 ④
--      09-27 애플 제품 실구매가를 14개국 비교하는 사이트를 만들며 — 세금환급·환율 데이터 회고
--      09-24 "수수료 5퍼센트"는 미국 거주자 기준 숫자였습니다 — 정산 계산기를 만들며 확인한 것들
--      09-20 말로 메모하면 AI가 정리해서 커서 자리에 넣어주는 맥 앱을 만들었습니다 — Brefly
--      09-17 1인 개발로 AI 만화 및 비디오 번역기를 운영하며 마주한 아키텍처와 비용 최적화 회고
--   ✅ saas (board:saas) — 10건, 9월 4건.
--      09-27 [Daily PM Drill] B2B 디자인 협업 SaaS
--      09-08 [Building CariCue #7] 기능은 완성됐는데 사용자는 어디서 시작해야 할지 몰랐다
--      07-30 3일 만에 AI 검색 노출 분석 SaaS 'BriefingUp'을 만들고, 배포 후 제대로 삽질한 기록
--   ✅ 스타트업 (board:startup) — 16건, 9월 2건. 런칭 후기와 투자 뉴스가 섞인다 — 뉴스는 T2 가 거른다.
--      09-22 고3의 창업 3년간의 창업 이야기 ep1
--      08-29 고등학생 창업팀이 사업자 내고 만든 … 'LIXcampus' 런칭 후기
--      08-14 생활 서비스 전문가 매칭 플랫폼, '프로마당(PROMADANG)' 서비스 런칭!
--   ✅ 인디해커 (board:indie-hacker) — 20건, 월 1~3건(느리다). 독자와 가장 정확히 겹친다.
--      08-25 AI로 책 2권을 만들어 상품 42개를 올렸습니다. 매출은 0원입니다.
--      06-24 Product Hunt 런칭! 다국어 업무 톤 코치 'ToneBridge'를 혼자 만들었습니다
--      05-04 AI SaaS 보일러플레이트를 6개월간 만들면서 배운 것들
--   ❌ 1인개발 — 18건 중 9건이 한 사람의 게임 개발일지. ❌ 마케팅·PM·그로스해킹·서비스기획 —
--      수강 TIL·부트캠프 일지 위주. ❌ 창업 — 캠프 일지·공모전 공지.
--
-- ── project_id ─────────────────────────────────────────────────
--   20260930000010 과 같은 방식 — 태그 피드마다 전용 프로젝트 1행(competitor_url 자연키).
--   business_model='SAAS' — 이 피드들은 독자(SaaS 1인~소수팀 창업가) 축으로 고른 것이라
--   T2 가 SaaS 기준 묶음(relevance-criteria.ts)으로 판정하고 extract-auto 가 앞 순서로 집는다.
--
-- ── 비용 ───────────────────────────────────────────────────────
--   게시판 1개 = 실행당 목록 1 + 새 글 ≤19. 5개면 최대 100/일, 보통 10~20.
--   velog daily_request_cap 300(20260930000024), min_interval_ms 4000 안.
-- ============================================================

BEGIN;

-- 0. §10.1 — review_targets 자율 INSERT 는 enabled 소스 한정이다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'velog' AND enabled) THEN
    RAISE EXCEPTION 'velog 소스가 없거나 enabled=false — 이 마이그레이션은 enabled 소스 한정이다(CLAUDE.md §10.1)';
  END IF;
END $$;

-- 1. 태그 피드 전용 프로젝트 4행. 재실행 안전(competitor_url 자연키).
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, business_model)
SELECT v.url, v.pitch, 'product_fit', NULL, 'collecting', 'SAAS'
  FROM (VALUES
    ('https://velog.io/tags/사이드프로젝트',
     '벨로그 `사이드프로젝트` 태그 — 1인 빌더가 서비스를 만들고 운영하며 부딪힌 비용·정산·배포 회고가 거의 매일 올라오는 피드. 2026-09-30 실측 2주에 12건.'),
    ('https://velog.io/tags/saas',
     '벨로그 `saas` 태그 — SaaS 제작·첫 사용자·온보딩 회고 피드. 2026-09-30 실측 9월 4건.'),
    ('https://velog.io/tags/스타트업',
     '벨로그 `스타트업` 태그 — 초기 창업팀 런칭 후기(투자 뉴스가 섞인다 — T2 가 거른다). 2026-09-30 실측 9월 2건.'),
    ('https://velog.io/tags/인디해커',
     '벨로그 `인디해커` 태그 — 혼자 만든 제품의 런칭·매출 0원·경쟁사 분석 회고. 느리지만(월 1~3건) 독자와 가장 정확히 겹친다.')
  ) AS v(url, pitch)
 WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.competitor_url = v.url);

-- 2. 게시판 타깃 4행. product_ref slug 은 어댑터 BOARDS 표의 내부 이름이다(태그 원문 아님).
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT p.id, 'velog', v.ref, v.label, NULL, 'active'
  FROM (VALUES
    ('https://velog.io/tags/사이드프로젝트', 'board:side-project',  '벨로그 태그 순회 · 사이드프로젝트'),
    ('https://velog.io/tags/saas',           'board:saas',          '벨로그 태그 순회 · saas'),
    ('https://velog.io/tags/스타트업',       'board:startup',       '벨로그 태그 순회 · 스타트업'),
    ('https://velog.io/tags/인디해커',       'board:indie-hacker',  '벨로그 태그 순회 · 인디해커')
  ) AS v(url, ref, label)
  JOIN public.analysis_projects p ON p.competitor_url = v.url
 WHERE NOT EXISTS (
   SELECT 1 FROM public.review_targets t WHERE t.source_key = 'velog' AND t.product_ref = v.ref
 );

-- 3. 생산성 태그 재개 — 목록이 안 바뀐 사흘(09-22 이후 새 글 0)에 연속 0건 3회로 닫혔다.
--    커서(last)는 남아 있으므로 이어 읽는다. 1행.
UPDATE public.review_targets
   SET status = 'active', consecutive_empty = 0
 WHERE source_key = 'velog'
   AND product_ref = 'board:productivity'
   AND status = 'exhausted';

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: velog 게시판 타깃 5개 전부 active.
-- SELECT t.product_ref, t.status, t.consecutive_empty, t.cursor IS NULL AS fresh, p.business_model
--   FROM public.review_targets t JOIN public.analysis_projects p ON p.id = t.project_id
--  WHERE t.source_key = 'velog' AND t.product_ref LIKE 'board:%' ORDER BY 1;
--   -- 기대: 5행 · status 전부 active · 새 4개는 fresh=true · business_model SAAS(생산성은 기존 값)
--
-- 음성: velog 밖은 건드리지 않았다 — review_targets 에 updated_at 이 없으므로 적용 **전후**로 같은 쿼리를
--       돌려 두 결과가 같은지 본다(velog 행만 달라야 한다).
-- SELECT source_key, status, count(*) FROM public.review_targets GROUP BY 1, 2 ORDER BY 1, 2;
--
-- 코드 쪽(DB 아님): 새 slug 가 어댑터에 되읽히는지
--   node -e "import('./lib/review/adapters/velog.ts').then(m=>['side-project','saas','startup','indie-hacker'].forEach(s=>console.log(s, m.boardList('board:'+s))))"
--   -- 기대: 4줄 모두 /tags/… 경로. null 이 하나라도 있으면 그 타깃은 0요청이다.
