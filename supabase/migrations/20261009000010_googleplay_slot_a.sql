-- ============================================================
-- 20261009000010_googleplay_slot_a
--
-- v37/v38 작업 5 · 남헌 승인 '슬롯 A' — 구글 플레이 ⑦ 이커머스 운영(지도 out) 보류 라벨의 active 14행을 **일시 정지**하고,
-- 그중 동결선 안 11자리(kr:ko 11)를 영어(us:en) 타깃 11개와 **1:1 맞바꾼다.** #464 일회성 예외 3행(us:en)은 자리를 반납한다.
-- 한도 예외 없음(남헌 v38 결정 1) — 구글 플레이 활성 88 → 85, 예외 제외 활성 80 → 80.
-- 드라이런·근거: reports/2026-10-09/slot-a-dryrun.md (정지 14행 수치 · 신규 11쌍 스토어 실사 · 활성 수 전후 · 적용 전 체크리스트).
-- 이 항목은 v33 '보류도 수집 유지' 문구보다 우선한다(남헌 v37/v38 승인). 정지 대상 중 itemscout·sellerbox·sello·shopmoa 는
-- 각각 80건을 모은 타깃이다 — 남헌이 이를 알고 승인했다.
--
-- 무엇을(INSERT 와 status 한 열 UPDATE 뿐 — DELETE·DROP·타입 변경 없음, label 은 안 바꾼다):
--   1) 기록 테이블 review_targets_paused_20261009 생성(IF NOT EXISTS) + 정지 14행의 이전 status·label·수집 수·사유·시각 INSERT.
--      선례: 20261007000011 의 review_targets_reactivated_20261007(스냅샷 테이블 → 롤백이 읽는다). review_targets 에 열을 추가하지 않는다
--      (ALTER 의 ACCESS EXCLUSIVE 를 수집 핫 테이블에 걸지 않는 가장 작은 변경).
--   2) 정지 14행 status 'active' → 'failed'. 정지 값으로 failed 를 쓰는 근거(자동 부활 경로 전수):
--      - planRevive 는 `status='exhausted' ∧ consecutive_empty=0` 만 되살린다(lib/review/target-supply.ts:419).
--        정지 14행은 전부 consecutive_empty=0 이다 → exhausted 로 두면 14행 모두 되살리기 후보가 된다(googleplay 활성이 동결선 80 아래로
--        내려가는 순간 gateHeadroom(target-supply.ts:152-155) 여유만큼 실제로 살아난다). failed 는 후보가 아니다.
--      - 러너는 active 만 집는다(lib/review/store.ts:64·83). status 를 쓰는 곳은 그 집은 타깃의 saveTargetProgress(store.ts:163-179)뿐이다.
--      - 무인 루프에 되살리기 배선 없음(scripts/target-revive.mjs:4 — 사람·역할 세션 전용, .github 에 호출 0). 발굴 화면도 자동 복원 없음(app/discovery/actions.ts:96-97).
--      - 사전 투입기는 (source, ref) 가 어느 상태로든 있으면 exists 로 건너뛴다(scripts/dictionary-targets.mjs:26-28·182) + 지도 out 은 area_excluded(:150-152).
--      → PR #464 롤백 A 의 "failed 는 자동 부활 안 됨" 은 맞다. 같은 선례: v37 롤백(새 타깃 → failed).
--   3) review_targets 11행 INSERT — googleplay us:en, status='active', last_run_at=NULL(미방문 = 다음 실행 앞순위, runner orderGooglePlayTargets),
--      프로젝트 = 같은 패키지의 기존 kr:ko 타깃 프로젝트(앵커). 라벨은 처음부터 `N:us-en|<slug>`(N = data/area-map-v26.json 값).
--      v44 2차 중 6개(krisp·fellow·meetgeek·circleback·rev·triple-whale) + ④ 인사 운영 5개(rippling·gusto·bamboohr·hibob·personio).
--      v44 2차 나머지 3개(avoma·jamie·sembly-ai — 미국 평가 표시 없음·45)는 보류 후보(자리 3칸 생기면 우선 복귀, 드라이런 §2).
--
-- 선행(필수): T0 라벨 정규화 20261008000010(PR #473, 적용됨). 사전 검사 DO 가 T0 적용을 다시 확인한다 —
--   label_original 열 존재 · 옛 형식 `^0[1-7]-` 라벨이 정확히 보류(out) 26행뿐 · v44 2차 앵커 6행 label 이 새 형식(`1:<slug>`·`3:triple-whale`).
--   T0 미적용이면 RAISE(2차의 영역 번호가 옛 형식 앵커와 어긋난다). 선행 v37 20261008000020(적용됨 2026-10-09).
--
-- 가드레일(남헌 v37·v38 — 한도 예외 금지): 요청 예산·ramp·cap 불변(review_sources·review_source_ramp 를 읽지도 쓰지도 않는다 — enabled 확인만).
--   구글 플레이 활성: 적용 전 88(= 동결선 80 + PR #464 일회성 예외 8) → 적용 후 85(14 정지 − 11 신규).
--   #464 고정 8 ref 중 3행(helium-10·linnworks·shipstation us:en)이 정지돼 예외 active 8 → 5 — 그 3자리는 반납(신규가 이어받지 않는다).
--   단언: 예외 제외 활성(전체 − #464 고정 ref active) ≤ 80 ∧ 전체 ≤ 85(처음 적용) · 적용 전보다 늘지 않음.
--
-- 상태 기계(멱등): A = 처음(기록 0 · 신규 쌍 0) → 쓰기. B = 이미 적용(기록 14 미복원 · 신규 쌍 11) → 쓰기 0, 검사만.
--   그 밖(일부만 있음 · 롤백 뒤 재적용 · 누가 신규 쌍을 먼저 넣음)은 RAISE → 드라이런 재생성.
--   INSERT 는 ON CONFLICT (project_id, source_key, product_ref) DO NOTHING + (source, ref) NOT EXISTS, UPDATE 는 status='active' 인 행만.
-- 롤백: 20261009000010_googleplay_slot_a_rollback.sql (정지 14행만 기록의 이전 status 로 · 신규 11쌍 → failed).
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 적용은 오케스트레이터(Opus 사전검토 뒤).
--   §10.2 예외 2번(대량 UPDATE) — 14행 status 한 열 · 롤백 동반 · 4조건(드라이런·롤백·무중단·Notion) 기록.
--   절차: 1) solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 2) 드라이런 문서의 체크리스트 S1~S9 3) 실행 4) 하단 확인 쿼리 5) docs/migration-exceptions.md 기입.
--   야간 수집 슬롯(UTC 01:43·05:37·09:29·13:19·17:37·20:47) 사이에 적용한다 — 정지 후보가 그 사이 수집되면 사전 검사가 RAISE 한다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 0. 입력 ───────────────────────────────────────────────────
-- 정지 14행(드라이런 §1). expect_collected = 드라이런 시점 total_collected — 그 사이 수집됐으면 사전 검사가 멈춘다.
CREATE TEMP TABLE _sa_pause (id uuid PRIMARY KEY, product_ref text NOT NULL, label text NOT NULL, expect_collected int NOT NULL) ON COMMIT DROP;
INSERT INTO _sa_pause (id, product_ref, label, expect_collected) VALUES
  ('d0e3c16a-cf10-46b1-af23-05e3a6de942a', 'kr:ko:com.aftership.AfterShip', '07-ecommerce-ops:aftership', 40),
  ('26c4b4e5-eb08-4d52-af3f-dc05f464aed4', 'kr:ko:kr.co.ezadmin.ezapps.ezsmarty.v3', '07-ecommerce-ops:ezadmin', 6),
  ('a6862741-952c-4659-802a-09ab8a2a4aa5', 'kr:ko:io.itemscout.app', '07-ecommerce-ops:itemscout', 80),
  ('867e5296-0365-4de7-8c21-975985477763', 'kr:ko:mobile.linnworks.net', '07-ecommerce-ops:linnworks', 0),
  ('8d626003-b88a-4b40-a6d0-6b379ea75e4e', 'kr:ko:net.pandarank.webview', '07-ecommerce-ops:pandarank', 7),
  ('206a0e84-3523-4f12-aa96-710cd8601871', 'kr:ko:com.gmpmobile', '07-ecommerce-ops:playauto', 20),
  ('7f887e8a-8905-4968-8ff2-8b33c2171f5c', 'kr:ko:com.circleplatform.sellerbox', '07-ecommerce-ops:sellerbox', 80),
  ('ffc2c726-be43-437b-b440-b941f8449112', 'kr:ko:kr.co.sellmate.mobile.x', '07-ecommerce-ops:sellmate', 1),
  ('0f14a5a6-761b-40dd-baf5-d01333bc0de8', 'kr:ko:kr.co.sello.app', '07-ecommerce-ops:sello', 80),
  ('28d7ebbd-b03f-4ff2-8494-66693652a702', 'kr:ko:com.shipstation.app', '07-ecommerce-ops:shipstation', 0),
  ('8b65bc9e-e7d2-4a49-baa7-402a860656b0', 'kr:ko:kr.shopmoa.sell', '07-ecommerce-ops:shopmoa', 80),
  ('1f0cbbdb-96c2-4cf7-8179-4ff8fa2d214d', 'us:en:com.helium10.app', '07-ecommerce-ops:us-en|helium-10', 0),
  ('0454be9c-029b-488d-872d-6d75368860ae', 'us:en:mobile.linnworks.net', '07-ecommerce-ops:us-en|linnworks', 0),
  ('1b465428-95b1-41c7-89ca-1fea40fb50b8', 'us:en:com.shipstation.app', '07-ecommerce-ops:us-en|shipstation', 0);

-- 신규 11쌍(드라이런 §2). anchor_label = T0 적용 뒤 앵커(kr:ko) label — T0 확인에 쓴다.
CREATE TEMP TABLE _sa_new (
  area text NOT NULL, slug text NOT NULL, pkg text PRIMARY KEY, anchor_label text NOT NULL, project_id uuid
) ON COMMIT DROP;
INSERT INTO _sa_new (area, slug, pkg, anchor_label) VALUES
  -- v44 2차 6(① 회의록 5 · ③ 마케팅 1). avoma·jamie·sembly-ai 는 보류 후보.
  ('1', 'krisp', 'ai.krisp.krispMobile', '1:krisp'),
  ('1', 'fellow', 'co.fellow.app', '1:fellow'),
  ('1', 'meetgeek', 'com.meetgeek.assistant', '1:meetgeek'),
  ('1', 'circleback', 'ai.circleback.app', '1:circleback'),
  ('1', 'rev', 'com.rev.revcorder', '1:rev'),
  ('3', 'triple-whale', 'com.triplewhale.android.v2', '3:triple-whale'),
  -- ④ 인사 운영 5
  ('4', 'rippling', 'com.people.rippling', '4:rippling'),
  ('4', 'gusto', 'com.gusto.money', '4:gusto'),
  ('4', 'bamboohr', 'com.mokinetworks.bamboohr', '4:bamboohr'),
  ('4', 'hibob', 'com.hibob', '4:hibob'),
  ('4', 'personio', 'com.personio', '4:personio');

-- PR #464 1차 고정 8 ref(동결선 일회성 예외). 3개가 정지 대상과 겹친다.
CREATE TEMP TABLE _sa_pr464 (product_ref text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _sa_pr464 (product_ref) VALUES
  ('us:en:com.tldv.tldvlite'), ('us:en:com.read.ai'), ('us:en:ai.granola'), ('us:en:com.aimeetingos.meetingos'),
  ('us:en:mobile.linnworks.net'), ('us:en:com.shipstation.app'), ('us:en:com.helium10.app'), ('us:en:io.gong.mobileapp');

-- ── 1. 기록 테이블(되돌리기용) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.review_targets_paused_20261009 (
  target_id                uuid        PRIMARY KEY REFERENCES public.review_targets(id) ON DELETE CASCADE,
  prev_status              text        NOT NULL CHECK (prev_status IN ('active', 'exhausted', 'failed')),
  prev_label               text,
  total_collected_at_pause integer     NOT NULL,
  reason                   text        NOT NULL,
  paused_at                timestamptz NOT NULL DEFAULT now(),
  resumed_at               timestamptz
);
-- 앱은 service_role 로만 읽는다(CLAUDE.md §5-1). 정책 0개 = anon 직접 접근 불가.
ALTER TABLE public.review_targets_paused_20261009 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.review_targets_paused_20261009 IS
  '20261009000010 슬롯 A 가 일시 정지(active→failed)한 구글 플레이 ⑦ 보류 타깃과 이전 상태. 롤백이 읽고 resumed_at 을 채운다. 삭제하지 않는다.';

CREATE TEMP TABLE _sa_gp_before ON COMMIT DROP AS
SELECT count(*)::int AS n FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';

-- 불변 확인용: 구글 플레이 기존 행 중 정지 14행을 뺀 전부.
CREATE TEMP TABLE _sa_before ON COMMIT DROP AS
SELECT t.id, t.project_id, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
  FROM public.review_targets t
 WHERE t.source_key = 'googleplay' AND t.id NOT IN (SELECT id FROM _sa_pause);

-- 앵커 → project_id (정확히 1행이어야 한다. 2행 이상이면 서브쿼리가 21000 으로 던진다)
UPDATE _sa_new n SET project_id = (
  SELECT k.project_id FROM public.review_targets k WHERE k.source_key = 'googleplay' AND k.product_ref = 'kr:ko:' || n.pkg);

-- ── 2. 사전 검사(쓰기 전) ──────────────────────────────────────
CREATE TEMP TABLE _sa_state (state text) ON COMMIT DROP;
DO $$
DECLARE
  has_t0 int; legacy int; legacy_bad int; anchor_bad int; no_proj int;
  logged int; logged_open int; new_exist int; new_foreign int;
  gp_before int; pr464 int; pause_ok int; drift text; cond_extra int; cond_missing int; src_off int;
  st text;
BEGIN
  -- (T0) 라벨 정규화가 먼저 들어가 있어야 한다
  SELECT count(*) INTO has_t0 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'review_targets' AND column_name = 'label_original';
  IF has_t0 <> 1 THEN RAISE EXCEPTION 'T0 미적용 — review_targets.label_original 없음. 20261008000010 을 먼저 적용하라'; END IF;
  SELECT count(*), count(*) FILTER (WHERE label !~ '^07-ecommerce-ops:(us-en\|)?(aftership|ezadmin|helium-10|itemscout|linnworks|pandarank|playauto|sellerbox|sellmate|sello|shipstation|shopmoa)$')
    INTO legacy, legacy_bad FROM public.review_targets WHERE label ~ '^0[1-7]-';
  IF legacy <> 26 OR legacy_bad <> 0 THEN
    RAISE EXCEPTION 'T0 미적용 또는 드리프트 — 옛 형식(^0[1-7]-) 라벨 %행 중 보류 26 밖 %행(기대 26 · 0)', legacy, legacy_bad;
  END IF;
  SELECT count(*) INTO anchor_bad FROM _sa_new n
   WHERE NOT EXISTS (SELECT 1 FROM public.review_targets k
                      WHERE k.source_key = 'googleplay' AND k.product_ref = 'kr:ko:' || n.pkg AND k.label = n.anchor_label);
  IF anchor_bad <> 0 THEN RAISE EXCEPTION '앵커 kr:ko %행의 label 이 T0 뒤 새 형식(N:<slug>)이 아니거나 앵커가 없다', anchor_bad; END IF;
  SELECT count(*) INTO no_proj FROM _sa_new WHERE project_id IS NULL;
  IF no_proj <> 0 THEN RAISE EXCEPTION '앵커 project_id 를 못 정한 신규 %행', no_proj; END IF;

  -- 소스 켜짐(행이 없어도 멈춘다). 예산·램프는 읽지도 쓰지도 않는다.
  SELECT count(*) INTO src_off FROM (VALUES ('googleplay')) v(k)
   WHERE NOT EXISTS (SELECT 1 FROM public.review_sources s WHERE s.key = v.k AND s.enabled);
  IF src_off <> 0 THEN RAISE EXCEPTION 'googleplay 소스가 꺼져 있거나 없다'; END IF;

  -- 상태 판정
  SELECT count(*), count(*) FILTER (WHERE resumed_at IS NULL) INTO logged, logged_open
    FROM public.review_targets_paused_20261009 WHERE target_id IN (SELECT id FROM _sa_pause);
  SELECT count(*) INTO new_exist FROM _sa_new n
   WHERE EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'googleplay' AND t.product_ref = 'us:en:' || n.pkg);
  IF logged = 0 AND new_exist = 0 THEN st := 'A';
  ELSIF logged = 14 AND logged_open = 14 AND new_exist = 11 THEN st := 'B';
  ELSE
    RAISE EXCEPTION '상태가 처음(A)도 적용됨(B)도 아니다 — 기록 %(미복원 %) · 신규 쌍 존재 %. 롤백 뒤 재적용이거나 누가 신규 쌍을 먼저 넣었다. 드라이런 재생성', logged, logged_open, new_exist;
  END IF;

  IF st = 'A' THEN
    -- 활성 수 = 88(드라이런 기준). 다르면 멈춘다(한도 예외 금지 — 넘어 있으면 맞바꾸기 기준이 달라진다).
    SELECT n INTO gp_before FROM _sa_gp_before;
    IF gp_before <> 88 THEN RAISE EXCEPTION '구글 플레이 활성 %(기대 88) — 드라이런 이후 상태가 바뀌었다. 드라이런 재생성', gp_before; END IF;
    SELECT count(*) INTO pr464 FROM public.review_targets t JOIN _sa_pr464 p USING (product_ref)
     WHERE t.source_key = 'googleplay' AND t.status = 'active';
    -- 예외 제외 활성(전체 − #464 고정 ref active)이 이미 동결선 80 을 넘었으면 멈춘다(한도 예외 금지)
    IF gp_before - pr464 > 80 THEN RAISE EXCEPTION '예외 제외 활성 %(> 80) — 동결선 초과 상태. 드라이런 재생성', gp_before - pr464; END IF;
    IF pr464 <> 8 THEN RAISE EXCEPTION '#464 고정 8 ref active %행(기대 8)', pr464; END IF;
    -- 정지 14행이 드라이런 그대로(googleplay · active · ref · label · 수집 수). 그 사이 수집됐으면 멈춘다.
    SELECT count(*) INTO pause_ok FROM public.review_targets t JOIN _sa_pause p ON p.id = t.id
     WHERE t.source_key = 'googleplay' AND t.status = 'active' AND t.product_ref = p.product_ref AND t.label = p.label
       AND t.total_collected = p.expect_collected;
    IF pause_ok <> 14 THEN
      SELECT string_agg(p.label || ' ' || coalesce(t.status, '없음') || ' ' || coalesce(t.total_collected::text, '-') || '(기대 ' || p.expect_collected || ')', ', ')
        INTO drift FROM _sa_pause p LEFT JOIN public.review_targets t ON t.id = p.id
       WHERE t.id IS NULL OR t.status <> 'active' OR t.total_collected <> p.expect_collected OR t.label <> p.label OR t.product_ref <> p.product_ref;
      RAISE EXCEPTION '정지 대상 %/14행만 드라이런 그대로다(그 사이 수집·변경): % — 드라이런 재생성', pause_ok, drift;
    END IF;
    -- 조건 재현: googleplay ∧ active ∧ label ^07-ecommerce-ops: 인 행 = 정확히 이 14 id
    SELECT count(*) INTO cond_extra FROM public.review_targets t
     WHERE t.source_key = 'googleplay' AND t.status = 'active' AND t.label LIKE '07-ecommerce-ops:%' AND t.id NOT IN (SELECT id FROM _sa_pause);
    SELECT count(*) INTO cond_missing FROM _sa_pause p WHERE NOT EXISTS (
      SELECT 1 FROM public.review_targets t WHERE t.id = p.id AND t.source_key = 'googleplay' AND t.status = 'active' AND t.label LIKE '07-ecommerce-ops:%');
    IF cond_extra <> 0 OR cond_missing <> 0 THEN
      RAISE EXCEPTION '조건(googleplay·active·07-ecommerce-ops:) 과 정지 목록이 다르다 — 목록 밖 % · 목록 중 조건 밖 %', cond_extra, cond_missing;
    END IF;
  ELSE
    -- B: 신규 쌍이 우리가 넣은 그 프로젝트·라벨인지(남이 넣은 같은 쌍을 '적용됨'으로 접지 않는다)
    SELECT count(*) INTO new_foreign FROM _sa_new n JOIN public.review_targets t ON t.source_key = 'googleplay' AND t.product_ref = 'us:en:' || n.pkg
     WHERE t.project_id <> n.project_id OR t.label IS DISTINCT FROM n.area || ':us-en|' || n.slug;
    IF new_foreign <> 0 THEN RAISE EXCEPTION '신규 쌍 %행이 이 마이그의 프로젝트·라벨이 아니다', new_foreign; END IF;
  END IF;
  INSERT INTO _sa_state VALUES (st);
END $$;

-- ── 3. 기록 → 정지 → 신규 ─────────────────────────────────────
INSERT INTO public.review_targets_paused_20261009 (target_id, prev_status, prev_label, total_collected_at_pause, reason)
SELECT t.id, t.status, t.label, t.total_collected,
       CASE WHEN t.product_ref LIKE 'us:en:%'
            THEN 'v37/v38 작업 5 슬롯 A(남헌 승인): ⑦ 이커머스 운영 지도 out 보류 — 일시 정지, #464 예외 자리 반납(신규 없음)'
            ELSE 'v37/v38 작업 5 슬롯 A(남헌 승인): ⑦ 이커머스 운영 지도 out 보류 — 일시 정지, 자리는 영어 타깃 1:1 맞바꾸기' END
  FROM public.review_targets t JOIN _sa_pause p ON p.id = t.id
 WHERE t.status = 'active' AND (SELECT state FROM _sa_state) = 'A'
ON CONFLICT (target_id) DO NOTHING;

CREATE TEMP TABLE _sa_paused_now (id uuid) ON COMMIT DROP;
WITH up AS (
  UPDATE public.review_targets t SET status = 'failed'
    FROM public.review_targets_paused_20261009 l
   WHERE t.id = l.target_id AND l.resumed_at IS NULL AND t.id IN (SELECT id FROM _sa_pause)
     AND t.source_key = 'googleplay' AND t.status = 'active'
  RETURNING t.id
)
INSERT INTO _sa_paused_now SELECT id FROM up;

CREATE TEMP TABLE _sa_ins (id uuid) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status, cursor, last_run_at)
  SELECT n.project_id, 'googleplay', 'us:en:' || n.pkg, n.area || ':us-en|' || n.slug, 'active', NULL, NULL
    FROM _sa_new n
   WHERE (SELECT state FROM _sa_state) = 'A'
     AND NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'googleplay' AND t.product_ref = 'us:en:' || n.pkg)
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING
  RETURNING id
)
INSERT INTO _sa_ins SELECT id FROM ins;

-- ── 4. 사후 검사 — 하나라도 어긋나면 RAISE → 전체 롤백 ─────────
DO $$
DECLARE
  st text; n_pause int; n_new int; paused_now int; ins_now int;
  logged int; down int; bad_new int; have_new int; bad_ref int; bad_label int;
  gp_before int; gp_after int; pr464 int; changed int; legacy int;
BEGIN
  SELECT state INTO st FROM _sa_state;
  SELECT count(*) INTO n_pause FROM _sa_pause;
  SELECT count(*) INTO n_new FROM _sa_new;
  IF n_pause <> 14 OR n_new <> 11 THEN RAISE EXCEPTION '입력 정지 % · 신규 %(기대 14 · 11)', n_pause, n_new; END IF;

  -- ① 정지 14행: 기록 14(이전 status = active) · 전부 failed
  SELECT count(*) INTO logged FROM public.review_targets_paused_20261009 l JOIN _sa_pause p ON p.id = l.target_id
   WHERE l.prev_status = 'active' AND l.resumed_at IS NULL AND l.prev_label = p.label;
  IF logged <> 14 THEN RAISE EXCEPTION '정지 기록 %행(기대 14)', logged; END IF;
  SELECT count(*) INTO down FROM public.review_targets t JOIN _sa_pause p ON p.id = t.id WHERE t.status = 'failed' AND t.label = p.label;
  IF down <> 14 THEN RAISE EXCEPTION '정지(failed) %행(기대 14) — label 은 바뀌면 안 된다', down; END IF;

  -- ② 신규 11쌍: 정해진 프로젝트·라벨로 존재. 이번에 들어간 행은 active · 미방문 · 카운터 0 · cursor NULL
  SELECT count(*) INTO have_new FROM _sa_new n JOIN public.review_targets t
      ON t.source_key = 'googleplay' AND t.product_ref = 'us:en:' || n.pkg AND t.project_id = n.project_id AND t.label = n.area || ':us-en|' || n.slug;
  IF have_new <> 11 THEN RAISE EXCEPTION '신규 쌍 %행(기대 11)', have_new; END IF;
  SELECT count(*) INTO bad_new FROM public.review_targets t JOIN _sa_ins i ON i.id = t.id
   WHERE t.status <> 'active' OR t.last_run_at IS NOT NULL OR t.consecutive_empty <> 0 OR t.total_collected <> 0
      OR t.cursor IS NOT NULL OR t.last_review_at IS NOT NULL;
  IF bad_new <> 0 THEN RAISE EXCEPTION '새 행 %개가 active·미방문·카운터 0 이 아니다', bad_new; END IF;

  -- ③ 형식: ref = 어댑터 parseProductRef(<gl>:<hl>:<패키지>), label = '<지도 영역>:us-en|<slug>' 이고 영역 판독(^[1-5]:)에 걸린다
  SELECT count(*) INTO bad_ref FROM _sa_new WHERE ('us:en:' || pkg) !~ '^us:en:[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$';
  SELECT count(*) INTO bad_label FROM _sa_new WHERE (area || ':us-en|' || slug) !~ '^[1-5]:us-en\|[a-z0-9-]+$' OR split_part(anchor_label, ':', 1) <> area;
  IF bad_ref <> 0 OR bad_label <> 0 THEN RAISE EXCEPTION 'ref 형식 % · label 형식/영역 불일치 %', bad_ref, bad_label; END IF;

  -- ④ 활성 수(한도 예외 금지, 남헌 v38): 동결선 안 정지(kr:ko 11) = 신규 11 (1:1), 예외 3자리는 반납.
  --    적용 후 예외 제외 활성 ≤ 80 ∧ 전체 ≤ 85 ∧ ≤ 적용 전.
  SELECT count(*) INTO paused_now FROM _sa_paused_now;
  SELECT count(*) INTO ins_now FROM _sa_ins;
  IF st = 'A' AND (paused_now <> 14 OR ins_now <> 11) THEN RAISE EXCEPTION '처음 적용인데 정지 % · 신규 %(기대 14 · 11)', paused_now, ins_now; END IF;
  IF st = 'B' AND (paused_now <> 0 OR ins_now <> 0) THEN RAISE EXCEPTION '재실행인데 쓰기 정지 % · 신규 %(기대 0)', paused_now, ins_now; END IF;
  SELECT n INTO gp_before FROM _sa_gp_before;
  SELECT count(*) INTO gp_after FROM public.review_targets WHERE source_key = 'googleplay' AND status = 'active';
  SELECT count(*) INTO pr464 FROM public.review_targets t JOIN _sa_pr464 p USING (product_ref)
   WHERE t.source_key = 'googleplay' AND t.status = 'active';
  IF gp_after - pr464 > 80 THEN RAISE EXCEPTION '예외 제외 활성 %(> 80 동결선)', gp_after - pr464; END IF;
  IF gp_after > 85 OR gp_after > gp_before THEN RAISE EXCEPTION '구글 플레이 활성 % → %(85 이하·늘면 안 됨)', gp_before, gp_after; END IF;
  IF st = 'A' AND gp_after <> gp_before - 3 THEN RAISE EXCEPTION '구글 플레이 활성 % → %(기대 −3: 정지 14 − 신규 11)', gp_before, gp_after; END IF;
  -- #464 예외분: 고정 8 중 정지된 3을 뺀 5가 active(3자리는 반납)
  IF st = 'A' AND pr464 <> 5 THEN RAISE EXCEPTION '#464 예외 active %행(기대 5 = 8 − 정지 3)', pr464; END IF;

  -- ⑤ 정지 14행 밖의 구글 플레이 기존 행 불변
  SELECT count(*) INTO changed FROM (
    SELECT * FROM _sa_before
    EXCEPT
    SELECT t.id, t.project_id, t.product_ref, t.label, t.cursor, t.last_review_at, t.status, t.consecutive_empty, t.last_run_at, t.total_collected
      FROM public.review_targets t WHERE t.source_key = 'googleplay'
  ) d;
  IF changed <> 0 THEN RAISE EXCEPTION '정지 대상 밖 기존 행 %개가 바뀌었다', changed; END IF;

  -- ⑥ label 은 안 바꿨다 — 옛 형식은 여전히 보류 26
  SELECT count(*) INTO legacy FROM public.review_targets WHERE label ~ '^0[1-7]-';
  IF legacy <> 26 THEN RAISE EXCEPTION '옛 형식 라벨 %행(기대 26 — label 불변)', legacy; END IF;

  RAISE NOTICE '슬롯 A[%]: 이번 정지 % · 이번 신규 % · googleplay 활성 %→% · #464 예외 active % · 예외 제외 % · 정지 기록 %',
    st, paused_now, ins_now, gp_before, gp_after, pr464, gp_after - pr464, logged;
END $$;

COMMIT;

-- ── 적용 후 확인 ──────────────────────────────────────────────
-- 양성:
-- SELECT count(*) AS all_active,
--        count(*) FILTER (WHERE product_ref IN ('us:en:com.tldv.tldvlite','us:en:com.read.ai','us:en:ai.granola','us:en:com.aimeetingos.meetingos',
--          'us:en:mobile.linnworks.net','us:en:com.shipstation.app','us:en:com.helium10.app','us:en:io.gong.mobileapp')) AS pr464_active
--   FROM public.review_targets WHERE source_key='googleplay' AND status='active';                                   -- 기대 85 · 5 (예외 제외 80)
-- SELECT t.status, count(*), sum(t.total_collected) FROM public.review_targets t
--   JOIN public.review_targets_paused_20261009 l ON l.target_id = t.id WHERE l.resumed_at IS NULL GROUP BY 1;       -- 기대 failed 14 · 394
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active' AND label LIKE '07-ecommerce-ops:%';  -- 기대 0
-- SELECT split_part(label, ':', 1) AS area, count(*), count(*) FILTER (WHERE status='active' AND last_run_at IS NULL) AS fresh
--   FROM public.review_targets WHERE source_key='googleplay' AND product_ref IN (
--   'us:en:ai.krisp.krispMobile','us:en:co.fellow.app','us:en:com.meetgeek.assistant',
--   'us:en:ai.circleback.app','us:en:com.rev.revcorder','us:en:com.triplewhale.android.v2',
--   'us:en:com.people.rippling','us:en:com.gusto.money','us:en:com.mokinetworks.bamboohr','us:en:com.hibob','us:en:com.personio')
--  GROUP BY 1 ORDER BY 1;                                                                                             -- 기대 1=5 · 3=1 · 4=5 (적용 직후 fresh 도 같음)
-- SELECT count(*) FROM public.review_targets WHERE source_key='googleplay'
--    AND product_ref IN ('us:en:com.avoma.android','us:en:ai.meetjamie.expoapp','us:en:com.semblyai.android');     -- 기대 0(보류 후보 — 안 넣음)
-- SELECT cap_base, daily_request_target, pct_step FROM public.review_source_ramp WHERE source_key='googleplay';     -- 기대 적용 전(S7)과 같음
-- SELECT daily_request_cap FROM public.review_sources WHERE key='googleplay';                                        -- 기대 적용 전(S7)과 같음
-- 음성(롤백되는 형태 — 데이터 남기지 않음):
-- BEGIN; UPDATE public.review_targets SET status='paused' WHERE id='a6862741-952c-4659-802a-09ab8a2a4aa5'; ROLLBACK; -- 기대 23514 review_targets_status_check
-- BEGIN; INSERT INTO public.review_targets (project_id, source_key, product_ref, status)
--        SELECT project_id, source_key, product_ref, 'active' FROM public.review_targets WHERE label='1:us-en|krisp'; ROLLBACK;  -- 기대 23505
-- 재실행 멱등: 파일 전체를 한 번 더 실행 → NOTICE '슬롯 A[B]: 이번 정지 0 · 이번 신규 0' 이고 검사 통과면 정상(쓰기 0행).
-- 운영 확인: 다음 `node scripts/target-supply.mjs` 의 googleplay inactive.failed 가 14 늘고, `node scripts/target-revive.mjs`(--dry) 후보에 정지 14 id 가 없다.
