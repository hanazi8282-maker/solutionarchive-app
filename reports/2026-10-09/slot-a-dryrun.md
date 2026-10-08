# v37/v38 작업 5 — 구글 플레이 슬롯 A 드라이런 (2026-10-09)

> 준비물만이다. DB 접근 0 · 마이그 미적용. 적용은 오케스트레이터가 독립 점검 뒤에 한다.
> 짝 파일: `supabase/migrations/20261009000010_googleplay_slot_a.sql`(+`_rollback.sql`).
> 입력: 오케스트레이터 실측 `review-targets-stores.json`(164행, 2026-10-08) · v37 000020 적용 기록(docs/migration-exceptions.md) ·
> T0 `20261008000010`(PR #473 머지 f13cbac · 오케스트레이터 적용·검증 완료) · v44 2차 9개(feat/v44-googleplay-us-en-targets 하단 주석) · 제품 사전 `reports/2026-10-05/product-dictionary/` · `data/area-map-v26.json`.
> 개정(같은 날): 남헌 v38 결정 1 반영 — 신규 14 → **11**(#464 예외 3자리 반납), 결정 2 — ④ 정의 '인사 운영(근태·급여·평가 포함, 채용 제외)'.

## 결론 3줄

1. **⑦ 보류 라벨(`07-ecommerce-ops:*`) 구글 플레이 active 14행을 `failed` 로 일시 정지**한다(status 한 열, label·데이터 그대로, 삭제 0). 이전 상태·사유·시각·수집 수는 새 기록 테이블 `review_targets_paused_20261009` 에 남고, 롤백이 그 14행만 되돌린다.
2. **동결선 안 11자리(kr:ko 11)에만 영어(us:en) 타깃 11개를 1:1로 넣는다** — v44 2차 6개(① 5 · ③ 1) + ④ 인사 운영 5개. #464 일회성 예외 3행(us:en)은 자리를 반납한다. 구글 플레이 활성 **88 → 85**, 예외 제외 **80 → 80**. 요청 예산·ramp·cap 은 건드리지 않는다.
3. **T0 라벨 정규화가 먼저 적용돼 있어야 한다**(적용됨 — 마이그가 다시 확인, 안 돼 있으면 RAISE). PGlite 셀프테스트 32/32 통과 — §5.

## 적용 전 체크리스트 (S1~S9 — 전부 읽기 전용, 전부 기대값일 때만 적용)

마이그 사전 검사 DO 가 S1·S2·S3·S4·S5·S6 을 트랜잭션 안에서 다시 확인한다. S7·S8 은 적용하는 쪽이 직접 본다.

```sql
-- S1 구글 플레이 활성 = 88 (동결선 80 + #464 예외 8). 다르면 멈추고 드라이런 재생성
SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active';                    -- 기대 88

-- S2 #464 고정 8 ref 가 정확히 8행 active → 예외 제외 활성 = 88 − 8 = 80
SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active' AND product_ref IN (
  'us:en:com.tldv.tldvlite','us:en:com.read.ai','us:en:ai.granola','us:en:com.aimeetingos.meetingos',
  'us:en:mobile.linnworks.net','us:en:com.shipstation.app','us:en:com.helium10.app','us:en:io.gong.mobileapp');  -- 기대 8

-- S3 T0 적용 확인: 열 있음 · 옛 형식은 보류 26 뿐 · 그중 out 목록 밖 0
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_targets' AND column_name='label_original') AS t0_col,
       count(*) AS legacy,
       count(*) FILTER (WHERE label !~ '^07-ecommerce-ops:(us-en\|)?(aftership|ezadmin|helium-10|itemscout|linnworks|pandarank|playauto|sellerbox|sellmate|sello|shipstation|shopmoa)$') AS legacy_outside
  FROM public.review_targets WHERE label ~ '^0[1-7]-';                                                         -- 기대 1 · 26 · 0

-- S4 정지 14행이 드라이런 그대로인가(그 사이 수집되면 ok=false — 그 행의 expect_collected 를 실측으로 고치고 이 문서 §1 도 고친다)
SELECT v.label, t.status, t.total_collected, v.expect, (t.status='active' AND t.total_collected=v.expect AND t.label=v.label) AS ok
  FROM (VALUES
  ('d0e3c16a-cf10-46b1-af23-05e3a6de942a'::uuid,'07-ecommerce-ops:aftership',40),('26c4b4e5-eb08-4d52-af3f-dc05f464aed4'::uuid,'07-ecommerce-ops:ezadmin',6),
  ('a6862741-952c-4659-802a-09ab8a2a4aa5'::uuid,'07-ecommerce-ops:itemscout',80),('867e5296-0365-4de7-8c21-975985477763'::uuid,'07-ecommerce-ops:linnworks',0),
  ('8d626003-b88a-4b40-a6d0-6b379ea75e4e'::uuid,'07-ecommerce-ops:pandarank',7),('206a0e84-3523-4f12-aa96-710cd8601871'::uuid,'07-ecommerce-ops:playauto',20),
  ('7f887e8a-8905-4968-8ff2-8b33c2171f5c'::uuid,'07-ecommerce-ops:sellerbox',80),('ffc2c726-be43-437b-b440-b941f8449112'::uuid,'07-ecommerce-ops:sellmate',1),
  ('0f14a5a6-761b-40dd-baf5-d01333bc0de8'::uuid,'07-ecommerce-ops:sello',80),('28d7ebbd-b03f-4ff2-8494-66693652a702'::uuid,'07-ecommerce-ops:shipstation',0),
  ('8b65bc9e-e7d2-4a49-baa7-402a860656b0'::uuid,'07-ecommerce-ops:shopmoa',80),('1f0cbbdb-96c2-4cf7-8179-4ff8fa2d214d'::uuid,'07-ecommerce-ops:us-en|helium-10',0),
  ('0454be9c-029b-488d-872d-6d75368860ae'::uuid,'07-ecommerce-ops:us-en|linnworks',0),('1b465428-95b1-41c7-89ca-1fea40fb50b8'::uuid,'07-ecommerce-ops:us-en|shipstation',0)
  ) v(id, label, expect) LEFT JOIN public.review_targets t ON t.id = v.id ORDER BY 1;                          -- 기대 14행 전부 ok=true

-- S5 조건 재현: googleplay ∧ active ∧ label ^07-ecommerce-ops: = 정확히 위 14 id
SELECT count(*) FROM public.review_targets WHERE source_key='googleplay' AND status='active' AND label LIKE '07-ecommerce-ops:%';  -- 기대 14

-- S6 신규 11쌍이 아직 없고, 앵커(kr:ko)는 각각 정확히 1행 · T0 뒤 새 형식 label
SELECT v.pkg,
       (SELECT count(*) FROM public.review_targets t WHERE t.source_key='googleplay' AND t.product_ref='us:en:'||v.pkg) AS us_en_exists,
       (SELECT count(*) FROM public.review_targets k WHERE k.source_key='googleplay' AND k.product_ref='kr:ko:'||v.pkg AND k.label=v.anchor) AS anchor_ok
  FROM (VALUES ('ai.krisp.krispMobile','1:krisp'),('co.fellow.app','1:fellow'),('com.meetgeek.assistant','1:meetgeek'),
               ('ai.circleback.app','1:circleback'),('com.rev.revcorder','1:rev'),
               ('com.triplewhale.android.v2','3:triple-whale'),('com.people.rippling','4:rippling'),('com.gusto.money','4:gusto'),
               ('com.mokinetworks.bamboohr','4:bamboohr'),('com.hibob','4:hibob'),('com.personio','4:personio')) v(pkg, anchor)
 WHERE (SELECT count(*) FROM public.review_targets t WHERE t.source_key='googleplay' AND t.product_ref='us:en:'||v.pkg) <> 0
    OR (SELECT count(*) FROM public.review_targets k WHERE k.source_key='googleplay' AND k.product_ref='kr:ko:'||v.pkg AND k.label=v.anchor) <> 1;  -- 기대 0행

-- S7 예산 값 기록(적용 뒤 같은 쿼리 → 값이 그대로여야 한다)
SELECT s.key, s.enabled, s.daily_request_cap, r.cap_base, r.pct_step, r.daily_request_target
  FROM public.review_sources s LEFT JOIN public.review_source_ramp r ON r.source_key = s.key WHERE s.key='googleplay';  -- 기대 enabled=true · 나머지 기록

-- S8 지금 도는 구글 플레이 수집 0
SELECT started_at FROM public.review_collection_runs
 WHERE status='running' AND started_at > now() - interval '6 hours' AND source_key='googleplay';             -- 기대 0행

-- S9 기록 테이블 아직 없음(처음 적용)
SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='review_targets_paused_20261009';  -- 기대 0
```

## 1. 정지 14행 (`active → failed`, label 그대로)

선정 조건(SQL 로 재현 가능, S5): `source_key='googleplay' ∧ status='active' ∧ label LIKE '07-ecommerce-ops:%'`.
T0 뒤에도 옛 라벨인 이유: 지도 값 `out`(⑦ 신규 수집 중단) — T0 가 의도적으로 안 바꾼 보류 26행 중 구글 플레이 active 전부다.
v37(000020)이 이미 내린 helium-10 kr(`325be79c…`)·triple-whale kr(`7460dec5…`, T0 가 `3:` 로 바꿈)은 active 가 아니라 조건 밖이다.
수집 수는 2026-10-08 실측(`total_collected`), 합 **394건**.

- kr:ko · aftership · `d0e3c16a-cf10-46b1-af23-05e3a6de942a` · 40건
- kr:ko · ezadmin · `26c4b4e5-eb08-4d52-af3f-dc05f464aed4` · 6건
- kr:ko · **itemscout** · `a6862741-952c-4659-802a-09ab8a2a4aa5` · **80건**
- kr:ko · linnworks · `867e5296-0365-4de7-8c21-975985477763` · 0건
- kr:ko · pandarank · `8d626003-b88a-4b40-a6d0-6b379ea75e4e` · 7건
- kr:ko · playauto · `206a0e84-3523-4f12-aa96-710cd8601871` · 20건
- kr:ko · **sellerbox** · `7f887e8a-8905-4968-8ff2-8b33c2171f5c` · **80건**
- kr:ko · sellmate · `ffc2c726-be43-437b-b440-b941f8449112` · 1건
- kr:ko · **sello** · `0f14a5a6-761b-40dd-baf5-d01333bc0de8` · **80건**
- kr:ko · shipstation · `28d7ebbd-b03f-4ff2-8494-66693652a702` · 0건
- kr:ko · **shopmoa** · `8b65bc9e-e7d2-4a49-baa7-402a860656b0` · **80건**
- us:en · helium-10 · `1f0cbbdb-96c2-4cf7-8179-4ff8fa2d214d` · 0건 (#464 예외분)
- us:en · linnworks · `0454be9c-029b-488d-872d-6d75368860ae` · 0건 (#464 예외분)
- us:en · shipstation · `1b465428-95b1-41c7-89ca-1fea40fb50b8` · 0건 (#464 예외분)

사유 수치: 80건 모은 곳 4개(itemscout·sellerbox·sello·shopmoa = 320건) — 남헌이 알고 승인했다. 0건 5개(linnworks·shipstation kr, us:en 3 — us:en 3행의 last_run_at 은 #464 가 넣은 now() 라 실제 방문 0).
14행 전부 `consecutive_empty=0`. us:en 3행(#464 예외분)은 정지 후 **자리를 반납**한다 — 그 자리에 신규를 넣지 않는다(남헌 v38 결정 1). 기록 테이블 reason 에도 "예외 자리 반납(신규 없음)" 으로 갈라 적는다.

## 2. 신규 11쌍 (googleplay us:en · active · last_run_at NULL · 앵커 프로젝트)

스토어 실사: `https://play.google.com/store/apps/details?id=<pkg>&hl=en&gl=us` 1회씩(2초 간격, 우리 UA, 2026-10-09). 판정 = HTTP 200 **그리고** 본문에 패키지 id 표지(§7.1). 18개 확인해 18개 통과, 그중 11개 채택. 평가 수는 페이지 `ratingCount`(별점 수 ≠ 글 리뷰 수).
프로젝트 = 같은 패키지 kr:ko 타깃의 project_id(앵커, S6). 라벨 = `<지도 값>:us-en|<slug>`.

v44 2차 중 6개(T0 뒤 영역 번호):
- `1:us-en|krisp` · `us:en:ai.krisp.krispMobile` · "Krisp AI Meeting Note Taker" · 평가 382 · 앵커 `c66f3f63…`
- `1:us-en|fellow` · `us:en:co.fellow.app` · "Fellow - AI Meeting Assistant" · 평가 69 · 앵커 `b56092b8…`
- `1:us-en|meetgeek` · `us:en:com.meetgeek.assistant` · 제목 "AI Transcribe. Speech to Text"(본문 앱명 "MeetGeek: AI Note Taker…", meetgeek.ai) · 평가 1,325 · 앵커 `be04065f…`
- `1:us-en|circleback` · `us:en:ai.circleback.app` · "Circleback - AI Meeting Notes" · 평가 108 · 앵커 `bea4dea8…`
- `1:us-en|rev` · `us:en:com.rev.revcorder` · "Rev: Transcription & Analysis" · 평가 3,158 · 앵커 `07a34412…`
- `3:us-en|triple-whale` · `us:en:com.triplewhale.android.v2` · "Triple Whale" · 평가 30 · 앵커 `7460dec5…`

④ 인사 운영 5개(영어 구글 플레이 2개로 가장 적은 영역):
- `4:us-en|rippling` · `us:en:com.people.rippling` · "Rippling - HR, IT & Finance" · 평가 4,766 · 앵커 `34031838…`(kr 0건, v37 이 exhausted 로 내림)
- `4:us-en|gusto` · `us:en:com.gusto.money` · "Gusto Mobile" · 평가 19,325 · 앵커 `9e2ca9a0…`(kr 0건, 내림)
- `4:us-en|bamboohr` · `us:en:com.mokinetworks.bamboohr` · "BambooHR" · 평가 15,450 · 앵커 `e8ed0c83…`(kr 1건)
- `4:us-en|hibob` · `us:en:com.hibob` · "Bob HR" · 평가 6,717 · 앵커 `8953630a…`(kr 0건, 내림)
- `4:us-en|personio` · `us:en:com.personio` · "Personio: HR Tasks on the Go" · 평가 2,254 · 앵커 `b392c930…`(kr 0건, 내림)

**보류 후보 3 — 자리 3칸이 생기면 우선 복귀**(v44 2차 중 미국 평가가 없거나 가장 작은 것, 스토어 실사는 통과):
- `1:us-en|avoma` · `us:en:com.avoma.android` · "Avoma" · 평가 표시 없음 · 앵커 `2f8e8631…`
- `1:us-en|jamie` · `us:en:ai.meetjamie.expoapp` · "Jamie - AI Meeting Note Taker" · 평가 표시 없음 · 앵커 `f397e8f6…`
- `1:us-en|sembly-ai` · `us:en:com.semblyai.android` · "Sembly: AI Meeting Notes" · 평가 45 · 앵커 `ea464383…`
- 복귀 경로: 같은 꼴의 1:1 맞바꾸기 마이그(동결선 안 kr:ko 정지 1 ↔ 신규 1)로만. 이 마이그는 넣지 않는다(적용 후 확인 쿼리가 0행을 확인).

고른 근거:
- ② 영업: 사전에서 구글 플레이 `확인` 인 영어 제품 8개(gong + v37 7개)가 이미 전부 us:en 타깃이다 — 남은 후보 0.
- ③ 마케팅: 남은 영어 후보는 canva(평가 2,730만)·hootsuite(10만) 둘뿐이고, 설계 v31 이 "리뷰가 제품 전체 이야기라 AI 소재 기능 노이즈 큼"으로 낮춰 둔 것이다. triple-whale(2차)로 ③ 은 4 → 5.
- ④ 인사 운영: 남헌 정본 정의 **'④ 인사 운영(근태·급여·평가 포함, 채용 제외)'** 에 맞춰 골랐다 — rippling·gusto(급여)·bamboohr·hibob·personio(인사정보·근태·휴가)는 모두 급여·근태·인사정보가 핵심인 HR 운영 도구이고 채용 전용 도구가 아니다. 사전 ④ 9개 중 lattice·15five(평가)만 들어가 있었고, rippling·gusto·hibob·personio 는 kr:ko 0건이라 v37 이 내린 자리 — 영어로만 데이터가 나온다. bamboohr 는 kr 1건.
- 제외(확인했지만 안 넣음): deel(평가 13,785 — 해외 계약자·급여 플랫폼이라 리뷰 작성자가 주로 급여 받는 계약자 쪽), workday(26만 — 대기업 직원 셀프서비스 포털 리뷰 위주), canva·hootsuite(위 노이즈). 둘 다 채용 전용 도구는 아니다 — 리뷰 작성자가 HR 운영 담당자가 아니라서 뺐다.
- 확인 못 한 패키지는 없다(18/18 통과). 사전 `미발견` 제품(culture-amp·jasper·copy-ai 등)은 후보에서 뺐다.

## 3. 활성 수 전후 (구글 플레이)

- 전체 active: **88 → 85** (정지 14 · 신규 11). 마이그 DO 단언: 처음 적용이면 "= 적용 전 − 3", 항상 "≤ 85 ∧ ≤ 적용 전".
- #464 예외분(고정 8 ref) active: 8 → **5** (helium-10·linnworks·shipstation us:en 정지 — 자리 반납).
- 예외 제외 active: **80 → 80** (kr:ko 11 정지 ↔ 신규 11). DO 단언: 사전 "예외 제외 ≤ 80"(넘었으면 RAISE), 사후 "예외 제외 ≤ 80".
- `07-ecommerce-ops:` active: 14 → 0 (영역 판독상 unmapped 14 감소).
- 영어(us:en) 구글 플레이 active 영역별: ① 4 → 9 · ② 8 → 8 · ③ 4 → 5 · ④ 2 → 7 · ⑤ 7 → 7 · 옛 라벨 us:en 3 → 0.
- 롤백하면 85 → 88(정지 14 복귀 · 신규 11 failed) = 적용 전과 같다. 롤백 DO 도 "전체 ≤ 88 ∧ 예외 제외 ≤ 80" 을 단언.
- 요청 예산: review_sources·review_source_ramp 를 읽지도 쓰지도 않는다(S7 로 전후 대조). 활성 타깃이 3 줄어 한 바퀴가 약간 짧아진다.

## 4. 정지 상태값 = `failed` (코드 근거)

`review_targets.status` CHECK 는 active·exhausted·failed 셋뿐이다(`20260829000003_review_collection.sql:122-123`). 자동으로 status 를 바꾸는 경로 전수:

- `planRevive` 는 `status === 'exhausted' && consecutive_empty === 0` 만 후보로 본다(`lib/review/target-supply.ts:419`). 정지 14행은 전부 consecutive_empty=0 이라 exhausted 로 두면 **14행 모두** 되살리기 후보다 — 지금은 googleplay `gateHeadroom`(`:152-155`, 80 − active)이 0 이라 막혀 있을 뿐, 활성이 80 아래로 내려가는 순간 살아난다. `failed` 는 후보가 아니다. 셀프테스트에서 실제 `planRevive` 로 확인했다(failed → 0행, exhausted 였다면 14행).
- 러너는 active 만 집는다(`lib/review/store.ts:64`·`:83`) — failed·exhausted 를 다시 여는 코드가 러너에 없다. status 를 쓰는 곳은 집은 타깃의 `saveTargetProgress`(`store.ts:163-179`)뿐이다.
- 되살리기 스크립트는 사람·역할 세션 전용이고 워크플로 배선 0(`scripts/target-revive.mjs:4`, `.github/` 에 호출 없음). 발굴 화면도 자동 복원 없음(`app/discovery/actions.ts:96-97`).
- 사전 투입기는 (source, ref) 가 어느 상태로든 있으면 `exists`(`scripts/dictionary-targets.mjs:26-28`·`:182`)이고 지도 `out` 은 `area_excluded`(`:150-152`) — 다시 넣지 않는다.
- 결론: #464 롤백 A 의 "failed 는 자동 부활 안 됨" 은 맞다. 대가: `failed` 의 원뜻은 "수집이 깨짐"이라(`app/discovery/actions.ts:72-73`) target-supply 출력의 `inactive.failed` 가 14 늘어 보인다 — 정지인지는 기록 테이블로 구분한다.

기록 방법: 새 테이블 `review_targets_paused_20261009`(target_id PK·FK CASCADE · prev_status · prev_label · total_collected_at_pause · reason · paused_at · resumed_at, RLS on·정책 0). 선례 `20261007000011` 의 스냅샷 테이블과 같은 꼴. review_targets 에 열을 더하지 않은 이유: 수집 핫 테이블에 ALTER(ACCESS EXCLUSIVE)를 걸지 않는 가장 작은 변경이고, 롤백이 읽을 자리는 이 테이블 하나로 충분하다.

## 5. 셀프테스트 (PGlite, 리포 밖 일회성)

픽스처 = 2026-10-08 실측 164행 → v37 000020 상태(맞바꾼 22행 exhausted + 구글 플레이 us:en 22행) → **main 의 T0 마이그 파일**(PR #473, 브랜치판과 바이트 동일 확인) 적용. 그 위에서 이 마이그·롤백을 그대로 실행. `planRevive` 는 리포의 실제 TS 를 import.

```
PASS 픽스처: v37 뒤 구글 플레이 활성 88
PASS 픽스처: T0 전 옛 라벨 84
PASS 음성: T0 미적용 → RAISE — T0 미적용 — review_targets.label_original 없음. 20261008000010 을 먼저 적용하라
PASS 음성: T0 미적용 → 쓰기 0(해시 동일·기록 테이블 없음)
PASS T0 적용 뒤 옛 라벨 26
PASS 정방향: 실행 성공
PASS 정방향: 구글 플레이 활성 88 → 85
PASS 정방향: 예외 제외 활성 80 → 80
PASS 정방향: 보류 후보 3(avoma·jamie·sembly-ai) us:en 0행
PASS 정방향: 정지 14 = failed · 기록 14(prev active)
PASS 정방향: 정지 14 수집 합 394
PASS 정방향: ^07-ecommerce-ops: active 0
PASS 정방향: 신규 11 미방문 active · 영역 1=5 3=1 4=5
PASS 정방향: 신규는 앵커와 같은 project_id
PASS 정방향: #464 예외 active 8 → 5
PASS 정방향: label 불변(옛 형식 26)
PASS planRevive: failed 정지 14행 중 되살림 0
PASS planRevive 대조: exhausted 였다면 14행 전부 후보(consecutive_empty=0) — 14
PASS 재실행: 쓰기 0(타깃·기록 해시 동일)
PASS 롤백: 활성 85 → 88(적용 전과 같음)
PASS 롤백: 정지 14 → active 복원
PASS 롤백: 신규 11 → failed
PASS 롤백: 신규 11 을 뺀 전체가 정방향 전과 바이트 단위로 같음
PASS 롤백: 14행 status·label·수집 수가 정지 전 그대로
PASS 롤백 재실행: 쓰기 0
PASS 롤백 뒤 정방향 재적용 → RAISE(드라이런 재생성)
PASS 음성: 구글 플레이 활성 89 → RAISE · 쓰기 0
PASS 음성: 예외 제외 활성 81(> 80) → RAISE · 쓰기 0 — 예외 제외 활성 81(> 80) — 동결선 초과 상태. 드라이런 재생성
PASS 음성: 정지 후보(sellerbox) 그 사이 수집 → RAISE · 쓰기 0 — 07-ecommerce-ops:sellerbox active 120(기대 80)
PASS 음성: 신규 후보(hibob us:en)가 이미 있고 수집됨 → RAISE · 쓰기 0
PASS 음성: 조건이 목록보다 넓음(되살아난 07 행) → RAISE
PASS 음성: 정방향 전 롤백 → RAISE
전부 통과 (32/32)
```

PGlite 는 슈퍼유저로 돈다 — RLS·권한·lock_timeout 대기는 실DB 에서만 확인된다.

## 6. 확인 불가 · 남은 것

- **DB 실측 없음.** 정지 14행 수치는 10-08 스냅샷이다. 그 뒤 야간 수집이 정지 후보를 건드렸으면 S4 가 false — 그 행 `expect_collected` 를 실측으로 고치고(마이그 `_sa_pause` 와 이 문서 §1 둘 다) 다시 점검한다.
- T0 는 오케스트레이터가 적용·검증했다고 전달받았다(PR #473 f13cbac · 옛 형식 26 · 구글 플레이 활성 88). 이 세션은 DB 로 다시 확인하지 않았다 — S1·S3 이 그 확인이다.
- 보류 후보 3(avoma·jamie·sembly-ai)은 자리가 생기면 별도 1:1 맞바꾸기로 복귀한다(이 마이그 범위 밖).
