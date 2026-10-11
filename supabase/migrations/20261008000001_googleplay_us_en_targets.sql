-- ============================================================
-- 20261008000001_googleplay_us_en_targets
--
-- 구글 플레이 영어(us:en) 타깃 추가 — v45 확정안(남헌 v43·v44 §2-c, 2026-10-08).
-- 설계 대상은 17개(meeting-os 포함)지만 **이 마이그가 INSERT 하는 것은 첫 8개뿐**이다. 나머지 9개는 2차용으로
-- 파일 하단 주석 블록에 남겼다(실행 안 됨). 우선순위 낮음. 소스 램프는 바꾸지 않는다 — 저우선순위는 last_run_at=now() 로만 구현했고, 일일 요청 예산은 기존 daily_request_cap·램프 안에서 나눠 쓰므로 요청 총량은 늘지 않는다.
--
-- 1차 8개(kr:ko:<pkg> 기준): 01-meeting-notes: com.tldv.tldvlite · com.read.ai · ai.granola · com.aimeetingos.meetingos /
--   07-ecommerce-ops: mobile.linnworks.net · com.shipstation.app · com.helium10.app / 2:gong: io.gong.mobileapp.
-- 2차 9개(하단 주석): krisp · avoma · fellow · meetgeek · sembly-ai · jamie · circleback · rev · triple-whale.
--
-- 정방향: 기존 kr:ko 타깃 각각에 대응하는 새 review_targets 행을 **같은 project_id** 로 INSERT.
--   source_key='googleplay', product_ref='us:en:'||패키지명(parseProductRef 가 받는 <gl>:<hl>:<pkg>),
--   label='<영역>:us-en|<이름>' (영역 = 기존 label 의 첫 ':' 앞, 이름 = 첫 ':' 뒤. 예 '01-meeting-notes:us-en|granola',
--   '2:us-en|gong' — target-supply areaOf 가 label 앞머리로 영역을 읽어서 미매핑으로 빠지지 않게 한다),
--   status='active', last_run_at=now(), cursor·last_review_at=NULL, consecutive_empty=0·total_collected=0(컬럼 기본값).
--   기존 label 에 ':' 가 없으면 'us-en|'||label 로 만든다(영역 없음).
--   기존 kr:ko 행은 읽기만 한다(자연 종료까지 그대로 둔다).
--
-- 🟢 우선순위 "낮음" = last_run_at=now() (NULL 로 넣지 않는다):
--   store.ts googlePlayDue 가 last_run_at ASC NULLS FIRST 로 읽고, runner.ts orderGooglePlayTargets 가
--   미방문(last_run_at NULL)을 등급 0·1 로 앞세운다(#460). NULL 로 넣으면 오히려 맨 앞이 된다.
--   now() 로 넣으면 등급 3(방문 완료)이고 그 안에서도 가장 최근이라 기존 타깃이 한 바퀴 돈 뒤에 온다.
-- 🟢 소스 레벨 램프·cap_base·daily_request_cap·review_source_ramp 행은 변경 없음(INSERT 대상은 review_targets 하나).
--
-- ⚠️ 동결선 80(lib/review/target-supply.ts GOOGLEPLAY_FROZEN_ACTIVE) **일회성 예외 — 이 17개(1차 8 + 2차 9)에 한한다**(남헌 v45).
--    동결선은 자동 공급·되살리기(gateHeadroom)의 상한일 뿐 DB 제약이 아니라 직접 INSERT 는 막히지 않는다. 1차 적용 후 활성 88,
--    2차까지 가면 97. 그 뒤 자동 공급은 gateHeadroom=0 으로 googleplay 에 0건이다. 이 예외를 17개 밖으로 넓히지 않는다.
--
-- 🔴 비상 정지: 롤백 SQL A — `status='failed'`(planRevive 가 failed 는 되살리지 않으므로 **자동 부활 안 됨**).
--    식별자: source_key='googleplay' ∧ product_ref LIKE 'us:en:%' ∧ label LIKE '%us-en|%'.
--
-- 멱등: UNIQUE(project_id, source_key, product_ref)(review_targets_project_source_product_key, 20260829000003) 위에
--   ON CONFLICT DO NOTHING. 끝의 DO 블록(8행 기준)이 ①후보마다 kr:ko 원본 1행 ②us:en 행 총수=8 ③이번에 새로 들어간 행이
--   active·last_run_at not null·카운터 0 ④kr:ko 행 불변 ⑤product_ref 형식 ⑥label 이 '<영역>:us-en|…' 형식 을 확인하고
--   어긋나면 RAISE → 트랜잭션 롤백.
-- 선행: 없음(review_targets 는 20260829000003). 같은 PR 의 코드 변경 0.
-- 롤백: reports/2026-10-08/20261008000001_googleplay_us_en_targets_rollback.sql (남헌 지시 — reports/ 에만 두고 커밋하지 않는다)
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
--      'kr:ko:com.tldv.tldvlite','kr:ko:com.read.ai','kr:ko:ai.granola','kr:ko:com.aimeetingos.meetingos',
--      'kr:ko:mobile.linnworks.net','kr:ko:com.shipstation.app','kr:ko:com.helium10.app','kr:ko:io.gong.mobileapp');
--                                                                       -- 기대: 8행, 전부 active, label 은 '<영역>:<이름>' 형태. 다르면 멈춘다.

BEGIN;

CREATE TEMP TABLE _gp_us_en_pkg (pkg text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _gp_us_en_pkg (pkg) VALUES
  -- 01-meeting-notes
  ('com.tldv.tldvlite'),
  ('com.read.ai'),
  ('ai.granola'),
  ('com.aimeetingos.meetingos'),
  -- 07-ecommerce-ops
  ('mobile.linnworks.net'),
  ('com.shipstation.app'),
  ('com.helium10.app'),
  -- 2:gong
  ('io.gong.mobileapp');

-- kr:ko 행 불변 확인용 스냅샷(DO 블록이 EXCEPT 로 비교한다).
CREATE TEMP TABLE _gp_kr_before ON COMMIT DROP AS
SELECT k.id, k.project_id, k.product_ref, k.label, k.cursor, k.last_review_at, k.status, k.consecutive_empty, k.last_run_at, k.total_collected, k.created_at
  FROM public.review_targets k
  JOIN _gp_us_en_pkg c ON k.product_ref = 'kr:ko:' || c.pkg
 WHERE k.source_key = 'googleplay';

CREATE TEMP TABLE _gp_us_en_new (id uuid) ON COMMIT DROP;

WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, last_run_at)
  SELECT k.project_id, 'googleplay', 'us:en:' || c.pkg,
         CASE WHEN position(':' IN COALESCE(k.label, '')) > 0
              THEN split_part(k.label, ':', 1) || ':us-en|' || substr(k.label, position(':' IN k.label) + 1)
              ELSE 'us-en|' || COALESCE(k.label, '') END,
         'active', now()
    FROM public.review_targets k
    JOIN _gp_us_en_pkg c ON k.product_ref = 'kr:ko:' || c.pkg
   WHERE k.source_key = 'googleplay'
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id
)
INSERT INTO _gp_us_en_new SELECT id FROM ins;

DO $$
DECLARE
  expected CONSTANT int := 8;
  cand int; kr_n int; total_n int; new_n int; bad_new int; bad_ref int; bad_label int; kr_changed int;
BEGIN
  SELECT count(*) INTO cand FROM _gp_us_en_pkg;
  IF cand <> expected THEN RAISE EXCEPTION '후보 패키지 %개(기대 %)', cand, expected; END IF;

  -- ① 후보 패키지마다 kr:ko 원본 행이 정확히 1개(없으면 INSERT 가 조용히 빠진다)
  SELECT count(*) INTO kr_n FROM _gp_kr_before;
  IF kr_n <> expected THEN
    RAISE EXCEPTION 'kr:ko 원본 행 %개(기대 %) — 후보 패키지 중 원본이 없거나 둘 이상의 프로젝트에 걸려 있다', kr_n, expected;
  END IF;

  -- ② us:en 행 총수(재실행이면 이미 있던 행 포함)
  SELECT count(*) INTO total_n FROM public.review_targets t JOIN _gp_us_en_pkg c ON t.product_ref = 'us:en:' || c.pkg
   WHERE t.source_key = 'googleplay';
  IF total_n <> expected THEN RAISE EXCEPTION 'us:en 타깃 %개(기대 %)', total_n, expected; END IF;

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

  -- ⑤ product_ref 가 어댑터 parseProductRef 규칙에 맞는다
  SELECT count(*) INTO bad_ref FROM public.review_targets t JOIN _gp_us_en_pkg c ON t.product_ref = 'us:en:' || c.pkg
   WHERE t.source_key = 'googleplay' AND t.product_ref !~ '^us:en:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$';
  IF bad_ref <> 0 THEN RAISE EXCEPTION 'product_ref % 개가 parseProductRef 형식에 안 맞는다', bad_ref; END IF;

  -- ⑥ label 이 '<영역>:us-en|<이름>' (영역 없는 폴백이면 'us-en|…')
  SELECT count(*) INTO bad_label FROM public.review_targets t JOIN _gp_us_en_pkg c ON t.product_ref = 'us:en:' || c.pkg
   WHERE t.source_key = 'googleplay' AND t.label !~ '^([^:|]+:)?us-en\|.+$';
  IF bad_label <> 0 THEN RAISE EXCEPTION 'label % 개가 <영역>:us-en|<이름> 형식이 아니다', bad_label; END IF;

  RAISE NOTICE 'googleplay us:en 타깃: 후보 % · 이번에 추가 % · 총 %', cand, new_n, total_n;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- SELECT count(*) AS n, count(*) FILTER (WHERE status='active') AS active, count(*) FILTER (WHERE last_run_at IS NOT NULL) AS with_last_run
--   FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%';       -- 기대: 8 · 8 · 8
-- SELECT t.product_ref, t.label, t.status, t.last_run_at, t.project_id = k.project_id AS same_project
--   FROM public.review_targets t
--   JOIN public.review_targets k ON k.source_key='googleplay' AND k.product_ref = 'kr:ko:' || substr(t.product_ref, 7)
--  WHERE t.source_key='googleplay' AND t.product_ref LIKE 'us:en:%' ORDER BY t.label;            -- 기대: 8행 전부 same_project=true, label '<영역>:us-en|<이름>'
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';  -- 기대: 88(적용 전 80 + 8)
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND product_ref LIKE 'kr:ko:%';  -- 기대: 적용 전과 같음(kr:ko 불변)
-- SELECT cap_base, daily_request_target, pct_step FROM public.review_source_ramp WHERE source_key='googleplay'; -- 기대: 적용 전과 같음(램프 불변)
-- 음성(롤백되는 형태):
-- BEGIN; INSERT INTO public.review_targets (project_id, source_key, product_ref, status)
--        SELECT project_id, source_key, product_ref, 'active' FROM public.review_targets
--         WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%' LIMIT 1; ROLLBACK;        -- 기대: 23505 review_targets_project_source_product_key
-- BEGIN; UPDATE public.review_targets SET status='nope' WHERE source_key='googleplay' AND product_ref LIKE 'us:en:%'; ROLLBACK;  -- 기대: 23514 review_targets_status_check

-- ════════════════════════════════════════════════════════════
-- 2차 9개 — 실행 안 됨(주석). 1차 결과를 본 뒤 별도 승인으로 켠다.
-- 켜는 방법: 위 BEGIN~COMMIT 블록을 복사해 후보 INSERT 를 아래 9개로 바꾸고 DO 블록의 expected 를 9 로 고친다
-- (같은 동결선 일회성 예외 안 — 17개 전체 적용 후 활성 97).
--   krisp         ai.krisp.krispMobile        (01-meeting-notes)
--   avoma         com.avoma.android           (01-meeting-notes)
--   fellow        co.fellow.app               (01-meeting-notes)
--   meetgeek      com.meetgeek.assistant      (01-meeting-notes)
--   sembly-ai     com.semblyai.android        (01-meeting-notes)
--   jamie         ai.meetjamie.expoapp        (01-meeting-notes)
--   circleback    ai.circleback.app           (01-meeting-notes)
--   rev           com.rev.revcorder           (01-meeting-notes)
--   triple-whale  com.triplewhale.android.v2  (07-ecommerce-ops)
-- INSERT INTO _gp_us_en_pkg (pkg) VALUES
--   ('ai.krisp.krispMobile'), ('com.avoma.android'), ('co.fellow.app'), ('com.meetgeek.assistant'), ('com.semblyai.android'),
--   ('ai.meetjamie.expoapp'), ('ai.circleback.app'), ('com.rev.revcorder'), ('com.triplewhale.android.v2');
-- ════════════════════════════════════════════════════════════
