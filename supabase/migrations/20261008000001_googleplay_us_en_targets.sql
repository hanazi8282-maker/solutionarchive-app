-- ============================================================
-- 20261008000001_googleplay_us_en_targets
--
-- 구글 플레이 영어(us:en) 타깃 추가(남헌 v43·v44 §2-c, 2026-10-08). 해외 영어권 앱은 한국어 리뷰가 0건이라
-- 같은 패키지를 us:en 으로 한 번 더 건다. 용도: 칼럼·고객 리포트의 영어 리뷰 근거.
-- 램프 50% 에서 시작, 우선순위 낮음. 이 마이그는 소스 레벨 램프를 건드리지 않는다.
--
-- 정방향: 기존 kr:ko 타깃 각각에 대응하는 새 review_targets 행을 **같은 project_id** 로 INSERT.
--   source_key='googleplay', product_ref='us:en:'||패키지명(parseProductRef 가 받는 <gl>:<hl>:<pkg>, gl 2자·hl 2~3자),
--   status='active', last_run_at=now(), label='us-en|'||기존 label, cursor·last_review_at=NULL,
--   consecutive_empty=0·total_collected=0(컬럼 기본값), created_at=기본값.
--   기존 kr:ko 행은 읽기만 한다(자연 종료까지 그대로 둔다).
--
-- 🟢 우선순위 "낮음" = last_run_at=now() (NULL 로 넣지 않는다):
--   store.ts googlePlayDue 가 last_run_at ASC NULLS FIRST 로 읽고, runner.ts orderGooglePlayTargets 가
--   미방문(last_run_at NULL)을 등급 0·1 로 앞세운다(#460). NULL 로 넣으면 오히려 맨 앞이 된다.
--   now() 로 넣으면 등급 3(방문 완료)이고 그 안에서도 가장 최근이라 기존 80개가 한 바퀴 돈 뒤에 온다.
--   GP_PRIORITY_REPEAT 는 false 기본이라 등급 2 경로도 타지 않는다.
-- 🟢 한 번에 끄기: label 접두 'us-en|' — 롤백 파일 A(UPDATE ... SET status='exhausted' WHERE label LIKE 'us-en|%').
-- 🟢 소스 레벨 램프·cap_base·daily_request_cap·review_source_ramp 행은 변경 없음(INSERT 대상은 review_targets 하나).
--
-- 후보 17개 중 기본 적용은 16개(meeting-os 제외 — 남헌 17 vs 16 불일치 보고 대기). 아래 토글 INSERT 주석을 풀면 17개.
--
-- 멱등: UNIQUE(project_id, source_key, product_ref)(review_targets_project_source_product_key, 초기 마이그 20260829000003)
--   위에 ON CONFLICT DO NOTHING. 재실행하면 0행 추가. 끝의 DO 블록은 ①후보 패키지마다 kr:ko 행이 있는지(없으면 조용히 빠지므로
--   총수로 잡는다) ②us:en 행 총수=기대값 ③이번에 새로 들어간 행이 전부 active·last_run_at not null ④kr:ko 행 불변 ⑤product_ref 가
--   어댑터 규칙에 맞는지 를 확인하고 어긋나면 RAISE → 트랜잭션 롤백.
-- 선행: 없음(review_targets 는 20260829000003). 같은 PR 의 코드 변경 0.
-- 롤백: 20261008000001_googleplay_us_en_targets_rollback.sql (A 한 번에 비활성 · B 완전 삭제 · 되살리기)
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 CEO-STAFF(Opus 사전검토 뒤). 절차:
--   1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 아래 '적용 전' 쿼리 3) 실행 4) 하단 확인 쿼리 5) docs/migration-exceptions.md 기입
-- ============================================================

-- ── 적용 전 확인(information_schema·직접 SELECT, PostgREST head:true 금지 — §7.1) ──
--   SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_targets'
--      AND column_name IN ('project_id','source_key','product_ref','label','cursor','last_review_at','status','consecutive_empty','last_run_at','total_collected','created_at');
--                                                                       -- 기대: 11
--   SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';      -- 기대: 80(2026-10-08 실측)
--   SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%';  -- 기대: 0
--   SELECT product_ref, status, label, project_id FROM public.review_targets
--    WHERE source_key='googleplay' AND product_ref IN (
--      'kr:ko:com.tldv.tldvlite','kr:ko:ai.krisp.krispMobile','kr:ko:com.read.ai','kr:ko:ai.granola','kr:ko:com.avoma.android',
--      'kr:ko:co.fellow.app','kr:ko:com.meetgeek.assistant','kr:ko:com.semblyai.android','kr:ko:ai.meetjamie.expoapp',
--      'kr:ko:ai.circleback.app','kr:ko:com.rev.revcorder','kr:ko:com.aimeetingos.meetingos','kr:ko:com.shipstation.app',
--      'kr:ko:mobile.linnworks.net','kr:ko:com.helium10.app','kr:ko:com.triplewhale.android.v2','kr:ko:io.gong.mobileapp');
--                                                                       -- 기대: 17행(meeting-os 포함), 전부 active. 다르면 멈춘다.

BEGIN;

CREATE TEMP TABLE _gp_us_en_pkg (pkg text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _gp_us_en_pkg (pkg) VALUES
  -- 01-meeting-notes
  ('com.tldv.tldvlite'),
  ('ai.krisp.krispMobile'),
  ('com.read.ai'),
  ('ai.granola'),
  ('com.avoma.android'),
  ('co.fellow.app'),
  ('com.meetgeek.assistant'),
  ('com.semblyai.android'),
  ('ai.meetjamie.expoapp'),
  ('ai.circleback.app'),
  ('com.rev.revcorder'),
  -- 07-ecommerce-ops
  ('com.shipstation.app'),
  ('mobile.linnworks.net'),
  ('com.helium10.app'),
  ('com.triplewhale.android.v2'),
  -- 2:gong
  ('io.gong.mobileapp');

-- ▼ 토글: meeting-os(앱스토어 타깃 없음). 남헌이 17개로 확정하면 아래 한 줄의 주석(--)을 푼다. 기본은 16개.
-- INSERT INTO _gp_us_en_pkg (pkg) VALUES ('com.aimeetingos.meetingos');

-- kr:ko 행 불변 확인용 스냅샷(DO 블록이 EXCEPT 로 비교한다).
CREATE TEMP TABLE _gp_kr_before ON COMMIT DROP AS
SELECT k.id, k.project_id, k.product_ref, k.label, k.cursor, k.last_review_at, k.status, k.consecutive_empty, k.last_run_at, k.total_collected, k.created_at
  FROM public.review_targets k
  JOIN _gp_us_en_pkg c ON k.product_ref = 'kr:ko:' || c.pkg
 WHERE k.source_key = 'googleplay';

CREATE TEMP TABLE _gp_us_en_new (id uuid) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, last_run_at)
  SELECT k.project_id, 'googleplay', 'us:en:' || c.pkg, 'us-en|' || COALESCE(k.label, ''), 'active', now()
    FROM public.review_targets k
    JOIN _gp_us_en_pkg c ON k.product_ref = 'kr:ko:' || c.pkg
   WHERE k.source_key = 'googleplay'
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id
)
INSERT INTO _gp_us_en_new SELECT id FROM ins;

DO $$
DECLARE
  expected int; kr_n int; total_n int; new_n int; bad_new int; bad_ref int; kr_changed int;
BEGIN
  SELECT count(*) INTO expected FROM _gp_us_en_pkg;

  -- ① 후보 패키지마다 kr:ko 원본 행이 정확히 1개(없으면 INSERT 가 조용히 빠진다)
  SELECT count(*) INTO kr_n FROM _gp_kr_before;
  IF kr_n <> expected THEN
    RAISE EXCEPTION 'kr:ko 원본 행 %개(기대 %) — 후보 패키지 중 원본이 없거나 둘 이상의 프로젝트에 걸려 있다', kr_n, expected;
  END IF;

  -- ② us:en 행 총수(재실행이면 이미 있던 행 포함)
  SELECT count(*) INTO total_n FROM public.review_targets t JOIN _gp_us_en_pkg c ON t.product_ref = 'us:en:' || c.pkg
   WHERE t.source_key = 'googleplay' AND t.label LIKE 'us-en|%';
  IF total_n <> expected THEN
    RAISE EXCEPTION 'us:en 타깃 %개(기대 %)', total_n, expected;
  END IF;

  -- ③ 이번 실행에서 새로 들어간 행은 전부 active·last_run_at not null·카운터 0·cursor NULL
  SELECT count(*) INTO new_n FROM _gp_us_en_new;
  SELECT count(*) INTO bad_new FROM public.review_targets t JOIN _gp_us_en_new n ON n.id = t.id
   WHERE t.status <> 'active' OR t.last_run_at IS NULL OR t.consecutive_empty <> 0 OR t.total_collected <> 0 OR t.cursor IS NOT NULL OR t.last_review_at IS NOT NULL;
  IF bad_new <> 0 THEN RAISE EXCEPTION '새 행 중 % 개가 기대 상태(active·last_run_at 채움·카운터 0)가 아니다', bad_new; END IF;

  -- ④ kr:ko 행 불변
  SELECT count(*) INTO kr_changed FROM (
    SELECT * FROM _gp_kr_before
    EXCEPT
    SELECT k.id, k.project_id, k.product_ref, k.label, k.cursor, k.last_review_at, k.status, k.consecutive_empty, k.last_run_at, k.total_collected, k.created_at
      FROM public.review_targets k WHERE k.source_key = 'googleplay'
  ) d;
  IF kr_changed <> 0 THEN RAISE EXCEPTION 'kr:ko 행 %개가 바뀌었다', kr_changed; END IF;

  -- ⑤ product_ref 가 어댑터 parseProductRef 규칙(gl 2자·hl 2~3자·패키지 점 구분)에 맞는다
  SELECT count(*) INTO bad_ref FROM public.review_targets t JOIN _gp_us_en_pkg c ON t.product_ref = 'us:en:' || c.pkg
   WHERE t.source_key = 'googleplay' AND t.product_ref !~ '^us:en:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$';
  IF bad_ref <> 0 THEN RAISE EXCEPTION 'product_ref % 개가 parseProductRef 형식에 안 맞는다', bad_ref; END IF;

  RAISE NOTICE 'googleplay us:en 타깃: 후보 % · 이번에 추가 % · 총 %', expected, new_n, total_n;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- SELECT count(*) AS n, count(*) FILTER (WHERE status='active') AS active, count(*) FILTER (WHERE last_run_at IS NOT NULL) AS with_last_run
--   FROM public.review_targets WHERE source_key='googleplay' AND label LIKE 'us-en|%';          -- 기대: 16(17) · 16(17) · 16(17)
-- SELECT t.product_ref, t.label, t.status, t.last_run_at, t.project_id = k.project_id AS same_project
--   FROM public.review_targets t
--   JOIN public.review_targets k ON k.source_key='googleplay' AND k.product_ref = 'kr:ko:' || substr(t.product_ref, 7)
--  WHERE t.source_key='googleplay' AND t.label LIKE 'us-en|%' ORDER BY t.label;                  -- 기대: 전부 same_project=true
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';  -- 기대: 96(17 이면 97)
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'kr:ko:%';  -- 기대: 적용 전과 같음(kr:ko 불변)
-- SELECT cap_base, daily_request_target, pct_step FROM public.review_source_ramp WHERE source_key='googleplay'; -- 기대: 적용 전과 같음(램프 불변)
-- 음성(롤백되는 형태 — 중복 INSERT 가 막히는지):
-- BEGIN; INSERT INTO public.review_targets (project_id, source_key, product_ref, status)
--        SELECT project_id, source_key, product_ref, 'active' FROM public.review_targets
--         WHERE source_key='googleplay' AND label LIKE 'us-en|%' LIMIT 1; ROLLBACK;              -- 기대: 23505 review_targets_project_source_product_key
-- BEGIN; UPDATE public.review_targets SET status='nope' WHERE source_key='googleplay' AND label LIKE 'us-en|%'; ROLLBACK;  -- 기대: 23514 review_targets_status_check
