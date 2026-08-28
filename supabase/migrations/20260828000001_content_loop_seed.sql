-- ============================================================
-- 콘텐츠 루프 시드 — channels / hypotheses / content_items
--
-- 배경: 20260827000001 베이스라인이 테이블을 레포에 기록했지만 데이터는 없다.
--   2026-08-28 운영 DB 실측 결과 7개 테이블이 전부 0행이었다(api_tokens 만 1행).
--   그 전까지 "content_items 21행 / hypotheses 7행 / channels 2행이 이미 있다"고
--   알려져 있었으나 근거가 과거 세션의 기억이었고 사실이 아니었다.
--   이 파일이 그 세 가지를 처음으로 넣는다.
--
--   이게 없으면 STEP 2(생성)가 성립하지 않는다. posts.content_code 와
--   posts.hypothesis_code 가 각각 content_items.code / hypotheses.code 를
--   참조하는 FK 라서, 참조 대상이 없으면 초안에 소재와 가설을 달 수 없다.
--   가설이 안 붙으면 post_performance 의 실험 차원이 전부 비고
--   scripts/threads-report.mjs 가 영구히 빈 표를 낸다.
--
-- 재실행 안전: content_items / hypotheses 는 code 가 UNIQUE 라 ON CONFLICT 로
--   막는다. channels 는 UNIQUE 제약이 없어서(베이스라인 DDL 참조) ON CONFLICT
--   를 쓸 대상이 없다 — 그래서 WHERE NOT EXISTS 로 거른다. 이걸 빼먹으면
--   두 번 실행했을 때 채널이 조용히 두 행이 되고, 이후 발행 글이 서로 다른
--   channel_id 로 갈려 벤치마크가 두 벌로 쪼개진다.
--
-- 선행: 20260827000001_content_loop_baseline.sql
--       20260827000002_posts_draft_status.sql
-- 가역: 20260828000001_content_loop_seed_rollback.sql
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) channels — 자사 Threads 계정 1행
--
--    handle / external_id 는 2026-08-28 Threads GET /me 실측값이다.
--    (id=28112642395087795, username=solution_arch_)
--    추측이 아니라 API 응답이므로 그대로 쓴다. external_id 를 채워두면
--    나중에 계정이 늘었을 때 handle 변경과 무관하게 채널을 특정할 수 있다.
--
--    ⛔ client 채널(역전비결 등)은 여기 넣지 않는다. 그건 Dothegy OS 소속
--       데이터이고 사업 분리 원칙을 어긴다. client 채널은 실제 셀러가
--       생기는 시점에 별도 마이그레이션으로 추가한다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.channels (platform, handle, external_id, owner_type)
SELECT 'threads', 'solution_arch_', '28112642395087795', 'self'
WHERE NOT EXISTS (
  SELECT 1 FROM public.channels
   WHERE platform = 'threads'
     AND external_id = '28112642395087795'
);


-- ────────────────────────────────────────────────────────────
-- 2) hypotheses — H1~H7
--
--    출처: 2026-08-19 세션(AngleOS Phase 1 검증 준비)에서 확정된 원문.
--    statement / variable / controls 를 그대로 옮긴다. 문장을 다듬지 않는다 —
--    가설문은 나중에 결과를 판정할 때의 기준이라, 표현이 바뀌면 "무엇을
--    검증하기로 했었나"가 흔들린다.
--
--    variable 은 scripts/threads-report.mjs 의 차원 key 와 같은 이름을 쓴다.
--    (hook_type / pattern / self_reply / chain_position / closing_type /
--     published_at / chain) 이름이 어긋나면 리포트가 그 가설을 못 찾는다.
--
--    status 는 전부 DEFAULT 'testing'. support_count / reject_count 도
--    DEFAULT 0 이라 명시하지 않는다 — 여기서 값을 박으면 나중에 DEFAULT 를
--    바꿔도 이 시드만 따라오지 않는다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.hypotheses (code, statement, variable, controls) VALUES
  ('H1', '반전형 훅이 선언형 훅보다 답글률이 높다',
         'hook_type',      '소재 티어·발행시각 고정'),
  ('H2', '자기 결함 공개(패턴2)가 반전 데이터(패턴1)보다 프로필 클릭이 높다',
         'pattern',        '훅 유형 고정'),
  ('H3', '발행 후 1시간 내 자답글이 확산 배수를 올린다',
         'self_reply',     '같은 티어 소재'),
  ('H4', '시리즈 회차 표기가 팔로우 전환을 올린다',
         'chain_position', NULL),
  ('H5', '미해결 예고형 마무리가 선언형보다 답글률이 높다',
         'closing_type',   NULL),
  ('H6', '최적 발행 시간대',
         'published_at',   '없음 — 변수가 많아 마지막에 검증한다'),
  ('H7', '체인(2편 이상)이 단일 글보다 총 도달이 높다',
         'chain',          NULL)
ON CONFLICT (code) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3) content_items — 소재은행 21행 (T1-1 ~ T3-6)
--
--    출처: content-bank.md (AngleOS 빌드인퍼블릭 소재 은행),
--          Phase 1 수동검증 21케이스. 레포 루트 content_items_seed.sql 의
--          내용을 그대로 옮기고 ON CONFLICT 만 더했다.
--
--    suggested_pattern 은 일부러 비워 둔다. 소재별 추천 패턴은 사람이
--    직접 채운다 — 추측으로 넣으면 그 값이 생성 단계의 기본 선택이 되어,
--    검증되지 않은 짝짓기가 조용히 굳는다.
--
--    status 는 DEFAULT 'available' 이라 명시하지 않는다.
--    tier 는 NOT NULL 이라 반드시 넣는다(1=반전 강도 최상 … 3=과정·메타).
-- ────────────────────────────────────────────────────────────
INSERT INTO public.content_items (code, tier, title, twist_line, source_case) VALUES
  -- Tier 1 — 반전이 가장 강한 소재
  ('T1-1', 1, '저자극의 배신', '리뷰에서 제일 많이 칭찬받는 항목이 계산에선 탈락', '라보에이치'),
  ('T1-2', 1, '곱셈 붕괴', '내 수식이 저감정 업종을 통째로 삭제하고 있었다', '자동차보험'),
  ('T1-3', 1, '아기는 리뷰를 못 쓴다', '페인을 겪는 사람과 쓰는 사람이 다르면 점수가 부풀려진다', '기저귀'),
  ('T1-4', 1, '목적을 바꾸면 답이 뒤집힌다', '같은 데이터, 목적만 바꿨더니 3위가 1위로', '라보에이치 동일 데이터'),
  ('T1-5', 1, '존재 이유가 데이터에 없다', '블랙박스를 사는 이유가 리뷰엔 안 나온다', '블랙박스'),
  ('T1-6', 1, '평균 5점짜리 소비자는 없다', '극찬과 혐오의 평균은 아무도 대표하지 않는다', '커피 산미'),
  ('T1-7', 1, '저관여 무출력', '임계값 하나 때문에 저가 카테고리가 빈 화면을 봤다', '물티슈·주방세제'),
  ('T1-8', 1, '고객을 비난하는 카피', '최고점 소구점을 그대로 쓰면 고객 욕하는 문장이 된다', 'AI 영어앱'),

  -- Tier 2 — 방법론·개념 소재
  ('T2-1', 2, '떡볶이집 간판 비유', '소구점이 뭔지 30초에 설명', NULL),
  ('T2-2', 2, '중요도×만족도 사분면', '4칸 중 어디를 봐야 하나', NULL),
  ('T2-3', 2, '기본기 vs 차별화', '차별화만 외치면 안 믿기는 제품이 된다', NULL),
  ('T2-4', 2, '"고객 목소리를 들어라"의 함정', '통념 저격', NULL),
  ('T2-5', 2, '371개의 벽', '통계적으로 믿으려면 리뷰 371개, 손으론 20개가 한계', NULL),
  ('T2-6', 2, '실증 없는 카피의 법적 리스크', '논리적으로 맞는 카피가 위법일 수 있다', '주방세제'),
  ('T2-7', 2, '시간을 안 보는 로직', '"3년 뒤에도 안 꺼집니다"가 최강 카피인 이유', '매트리스'),

  -- Tier 3 — 과정·메타 소재
  ('T3-1', 3, '왜 코드 짜기 전에 손으로 14번 돌렸나', '방법론 자체를 공개', NULL),
  ('T3-2', 3, '결함 14개가 전부 주변부에서 나왔다', '뼈대는 안 틀렸다는 안도', NULL),
  ('T3-3', 3, '검증을 멈추기로 한 이유', '한계 수익 체감 판단', NULL),
  ('T3-4', 3, '낯선 카테고리를 일부러 고른 이유', '편향 방지 실험 설계', NULL),
  ('T3-5', 3, '리서치 환각 사건', 'AI가 없는 회사를 만들어냈다', '리뷰인사이트'),
  ('T3-6', 3, '지금 막힌 지점', '실시간 진행형', '수집 인프라')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 적용 후 확인용
--
--   SELECT 'channels' t, count(*) FROM public.channels
--   UNION ALL SELECT 'hypotheses', count(*) FROM public.hypotheses
--   UNION ALL SELECT 'content_items', count(*) FROM public.content_items;
--   -- 기대: channels 1 / hypotheses 7 / content_items 21
--
--   -- 리포트 차원과 가설 variable 이 맞는지(7건 전부 나와야 한다):
--   SELECT code, variable FROM public.hypotheses ORDER BY code;
--
--   -- 두 번 실행해도 숫자가 안 늘어나는지 확인할 것(재실행 안전성 검증).
-- ============================================================
