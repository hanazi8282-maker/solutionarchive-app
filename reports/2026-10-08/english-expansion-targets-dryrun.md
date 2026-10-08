# v37 작업 4·5 — 영어 스토어 타깃 확대 + ⑤ 글쓰기 시험 암 드라이런 (2026-10-08)

> 준비물만이다. DB 접근 0·마이그 미적용. 적용은 오케스트레이터가 검토 뒤에 한다.
> 짝 파일: `supabase/migrations/20261008000020_english_targets_v37.sql`(+`_rollback.sql`) · `reports/2026-10-08/english-expansion-monitoring-v37.sql` · `data/area-map-v26.json`(10줄).
> 입력: 오케스트레이터 실측 타깃 전수 164행(구글 플레이·앱스토어, 2026-10-08) · 제품 사전 `reports/2026-10-05/product-dictionary/` · 설계 `english-expansion-design-v31.md`·`area-quota-and-abandon-design-v31.md`.

## 결론 3줄

1. **신규 타깃 52개**(구글 플레이 22 · 앱스토어 30) + **⑤ 글쓰기 프로젝트 10개**. 구글 플레이 22개는 0건 kr:ko 타깃 **22개와 1:1 맞바꾼다**(status 한 열만 `active→exhausted`, 삭제 0).
2. **구글 플레이 활성 88 → 88**(순변화 0), PR #464 일회성 예외 8행을 뺀 활성 **80 → 80**(동결선 80 이하 유지). 하루 요청 예산 30 은 안 건드린다(review_sources·램프 변경 0).
3. 스토어 ID 는 전부 2026-10-08 실측(iTunes lookup us/kr · 구글 플레이 상세 페이지 표지 확인)으로 확인한 것만 넣었다. Jasper·Copy.ai·Writesonic 은 공식 앱이 없어 **제외**(HN `q:` 만 가능 — 이번 범위 밖).

## 0. 근거와 방법

- 맞바꾸기 후보 수치(total_collected·consecutive_empty·last_run_at)는 오케스트레이터가 준 `review-targets-stores.json`(164행) 그대로다. 이 세션은 DB 를 읽지 않았다.
  - 오케스트레이터 분해와 일치: 구글 플레이 활성 88 중 수집 0건 54 = 방문·연속빈값0 **22** · 방문·연속빈값1 **18** · 미방문 **14**.
  - ⚠️ "방문·연속빈값0 22" 안의 **8개는 PR #464 us:en 행**이다. 그 마이그가 `last_run_at=now()` 로 넣었을 뿐 실제로 방문한 적이 없다 → 맞바꾸기 후보에서 뺐다(kr:ko 만 후보). 실제 후보 풀 = 18 + 14 = **32**.
- 앱스토어 ID: `https://itunes.apple.com/lookup?country=us|kr&id=…` 1회씩(HTTP 200, resultCount 25/25). trackName·평가 수·trackViewUrl 로 확인.
- 구글 플레이 패키지: `https://play.google.com/store/apps/details?id=<pkg>&hl=en&gl=us` 1회씩(2초 간격, 우리 UA). 판정 = HTTP 200 **그리고** 본문에 패키지 id 표지 있음(§7.1 — 상태 코드만 보지 않는다). 23개 전부 통과.
- 공식 앱 부재 확인: iTunes search(us) "jasper ai"·"copy.ai"·"writesonic" — 상위 5건 판매자가 전부 제3자(예: "Japer AI" by Bich Van Tran Dang). 사전 칸도 `미발견`.

## 1. 신규 INSERT 목록 (52)

공통: `status='active'`, `last_run_at=NULL`(미방문 → 다음 실행 앞순위), cursor·카운터 기본값. 프로젝트 = 같은 제품의 기존 kr 타깃 프로젝트(②③④), ⑤ 는 pitch 프로젝트(§2-3).
라벨 규칙: kr `N:<slug>` · 구글 플레이 us `N:us-en|<slug>` · 앱스토어 us `N:us|<slug>` (표에서 `|` 는 `\|` 로 적었다).

### ② 영업 — 구글 플레이 us:en 7 + 앱스토어 us 7 (gong 은 구글 플레이 us:en 이 이미 있어 앱스토어만)

| 소스 | product_ref | label | 근거(실측) |
|---|---|---|---|
| googleplay | `us:en:com.clari` | `2:us-en\|clari` | 200·표지·평가 84 |
| googleplay | `us:en:io.outreach.sales` | `2:us-en\|outreach` | 200·표지·평가 14 |
| googleplay | `us:en:com.salesloftmobile` | `2:us-en\|salesloft` | 200·표지·평가 45 |
| googleplay | `us:en:com.zoominfo.enterprise` | `2:us-en\|zoominfo` | 200·표지·평가 433 |
| googleplay | `us:en:com.highspot.Highspot` | `2:us-en\|highspot` | 200·표지·평가 96 |
| googleplay | `us:en:ai.instantly.app` | `2:us-en\|instantly` | 200·표지·평가 184 |
| googleplay | `us:en:com.hubspot.android` | `2:us-en\|hubspot-sales-hub` | 200·표지·평가 13,536 |
| appstore | `us:1289289459` | `2:us\|gong` | 평가 112 |
| appstore | `us:977304452` | `2:us\|clari` | 평가 1,129 |
| appstore | `us:1455032473` | `2:us\|salesloft` | 평가 130 |
| appstore | `us:1493170277` | `2:us\|zoominfo` | 평가 1,040 |
| appstore | `us:1173751523` | `2:us\|highspot` | 평가 115 |
| appstore | `us:6474658497` | `2:us\|instantly` | 평가 36 |
| appstore | `us:1107711722` | `2:us\|hubspot-sales-hub` | 평가 15,700 |

### ③ 마케팅(수집 0건 5개 우선) — 구글 플레이 us:en 4 + 앱스토어 us 5

| 소스 | product_ref | label | 근거(실측) |
|---|---|---|---|
| googleplay | `us:en:ai.adcreative.m` | `3:us-en\|adcreative-ai` | 200·표지·평가 66 |
| googleplay | `us:en:co.foreplay.ForeplayMobile` | `3:us-en\|foreplay` | 200·표지·평가 표시 없음(소량 예상) |
| googleplay | `us:en:co.simplified.main` | `3:us-en\|simplified` | 200·표지·평가 534 |
| googleplay | `us:en:com.predis.app` | `3:us-en\|predis-ai` | 200·표지·평가 3,333 |
| appstore | `us:6740659906` | `3:us\|adcreative-ai` | 평가 2 |
| appstore | `us:6466097243` | `3:us\|foreplay` | 평가 4 |
| appstore | `us:6738098343` | `3:us\|motion-creative` | 평가 2 (구글 플레이 앱 없음 — 사전 `미발견`) |
| appstore | `us:1610971740` | `3:us\|simplified` | 평가 20 |
| appstore | `us:6450264767` | `3:us\|predis-ai` | 평가 369 |

### ④ 인사(평가 도구) — 구글 플레이 us:en 2 + 앱스토어 us 2

| 소스 | product_ref | label | 근거(실측) |
|---|---|---|---|
| googleplay | `us:en:com.fifteenfive.fifteenfiveapp` | `4:us-en\|15five` | 200·표지·평가 348 |
| googleplay | `us:en:com.lattice` | `4:us-en\|lattice` | 200·표지·평가 92 |
| appstore | `us:1020253220` | `4:us\|15five` | 평가 6,604 |
| appstore | `us:1409785530` | `4:us\|lattice` | 평가 103 |

- lemonbase 는 넣지 않았다: 한국 제품이고 미국 스토어 평가 0(앱스토어 us 0 · 구글 플레이 us 평가 표시 없음). 영어 타깃의 뜻이 없다. kr:ko·kr 타깃은 이미 있다.
- culture-amp·clap: 두 스토어 다 사전 `미발견`. 나머지 ④(bamboohr·rippling·gusto·hibob·deel·personio·workday)는 평가 도구가 아니라 HRIS·급여라 이번 범위 밖.

### ⑤ 글쓰기 시험 암 — 10제품 · 구글 플레이 9(us:en 7 + kr:ko 2) · 앱스토어 16(us 8 + kr 8)

| 소스 | product_ref | label | 근거(실측) |
|---|---|---|---|
| googleplay | `us:en:com.grammarly.android.keyboard` | `5:us-en\|grammarly` | 200·표지·평가 263,886 |
| googleplay | `us:en:com.quillbot.mobile` | `5:us-en\|quillbot` | 200·표지·평가 22,441 |
| googleplay | `us:en:notion.id` | `5:us-en\|notion-ai` | 200·표지·평가 397,478 |
| googleplay | `us:en:com.craft.docs` | `5:us-en\|craft-docs` | 200·표지·평가 표시 없음 |
| googleplay | `us:en:com.humanplusplus.sudowrite` | `5:us-en\|sudowrite` | 200·표지·평가 719 |
| googleplay | `us:en:app.gamma.mobile` | `5:us-en\|gamma` | 200·표지·평가 37,546 |
| googleplay | `us:en:com.gingersoftware.android.keyboard` | `5:us-en\|ginger` | 200·표지·평가 182,166 |
| googleplay | `kr:ko:com.wrtn.app` | `5:wrtn` | 패키지 실존(200·표지·평가 16,558) |
| googleplay | `kr:ko:com.infraware.office.link` | `5:polaris-office-ai` | 패키지 실존(200·표지·평가 619,506) |
| appstore | `us:1158877342` | `5:us\|grammarly` | 평가 225,605 |
| appstore | `us:6463116243` | `5:us\|quillbot` | 평가 3,035 |
| appstore | `us:1628773284` | `5:us\|wordtune` | 평가 988 (구글 플레이 앱 없음) |
| appstore | `us:1232780281` | `5:us\|notion-ai` | 평가 90,335 |
| appstore | `us:1487937127` | `5:us\|craft-docs` | 평가 6,625 |
| appstore | `us:6740884542` | `5:us\|sudowrite` | 평가 387 |
| appstore | `us:6768404578` | `5:us\|gamma` | 평가 1,098 |
| appstore | `us:822797943` | `5:us\|ginger` | 평가 3,495 |
| appstore | `kr:1158877342` | `5:grammarly` | 평가 1,275 |
| appstore | `kr:6463116243` | `5:quillbot` | 평가 33 |
| appstore | `kr:1232780281` | `5:notion-ai` | 평가 41,360 |
| appstore | `kr:1487937127` | `5:craft-docs` | 평가 1,102 |
| appstore | `kr:6768404578` | `5:gamma` | 평가 28 |
| appstore | `kr:822797943` | `5:ginger` | 평가 90 |
| appstore | `kr:6448556170` | `5:wrtn` | 평가 3,970 |
| appstore | `kr:698070860` | `5:polaris-office-ai` | 평가 87,705 |

- 한국어 칸 기준: 앱스토어 kr 평가 20 이상만(wordtune kr 4 · sudowrite kr 1 은 뺐다). 구글 플레이 kr:ko 는 한국 제품 2개(wrtn·polaris)만 — 구글 플레이 자리는 맞바꾸기로만 생기니 한국어 리뷰가 있을 법한 쪽에만 썼다.
- ⚠️ notion-ai·polaris-office-ai·gamma 는 리뷰가 앱 전체 이야기라 "AI 글쓰기" 관련 비율이 낮을 수 있다 — 그걸 재는 게 시험 지표 relevant 비율이다(설계 §2-1).

### 2-3. ⑤ 프로젝트 10개 (analysis_projects INSERT, 같은 pitch 가 이미 있으면 재사용)

- pitch = 투입기 `productPitch` 와 같은 문자열(`<name> (<name_ko>) — <summary_ko>`, 사전 area-05) — 나중에 투입기를 돌려도 같은 프로젝트에 붙는다.
- 컬럼값 = 투입기 `apply` 와 같다: `purpose='product_fit'` · `status='collecting'` · `mode='forward'` · `business_model='SAAS'` · `competitor_url` = 사전 official_url.
- ⚠️ 영역 설계 문서의 옛 ⑤ "글쓰기 200/3,121" 은 이미 글쓰기 관련 프로젝트(HN `q:` 등)가 있다는 뜻일 수 있다. pitch 가 다르면 이 마이그는 **새 프로젝트를 만든다**(정확 일치만 재사용, §7.1). 적용 전 확인 쿼리(마이그 머리말 3번째)로 기존 행을 보고, 겹치면 그 프로젝트에 붙일지 판단한다.

## 2. 맞바꾸기 목록 (22) — 내리는 쪽

규칙: googleplay ∧ `kr:ko:` ∧ active ∧ total_collected=0 ∧ last_run_at NOT NULL(방문함). 정렬 consecutive_empty DESC → last_run_at ASC → id. 미방문 14개는 제외. 변경은 `status='exhausted'` 한 열.

| # | id | product_ref | label | total_collected | consecutive_empty | last_run_at(UTC) |
|---|---|---|---|---|---|---|
| 1 | `325be79c-21c3-46eb-abbf-333052878d66` | `kr:ko:com.helium10.app` | 07-ecommerce-ops:helium-10 | 0 | 1 | 2026-10-07 12:42:24 |
| 2 | `7460dec5-43a3-4858-8378-0ed61bb41b90` | `kr:ko:com.triplewhale.android.v2` | 07-ecommerce-ops:triple-whale | 0 | 1 | 2026-10-07 12:42:33 |
| 3 | `a1381ea4-ed54-4a0c-b077-501abeb51e33` | `kr:ko:io.gong.mobileapp` | 2:gong | 0 | 1 | 2026-10-07 12:48:59 |
| 4 | `3b8f357e-fbb9-4248-8d36-0af3ff3c7e1b` | `kr:ko:com.clari` | 2:clari | 0 | 1 | 2026-10-07 19:56:48 |
| 5 | `c6f210b5-ce6e-4b73-b401-6003d79a01bf` | `kr:ko:com.salesloftmobile` | 2:salesloft | 0 | 1 | 2026-10-07 19:56:56 |
| 6 | `1af25224-787b-453d-add7-487497c05984` | `kr:ko:com.zoominfo.enterprise` | 2:zoominfo | 0 | 1 | 2026-10-07 19:57:04 |
| 7 | `b9099479-489a-42f1-8912-2e3a32e1030e` | `kr:ko:com.highspot.Highspot` | 2:highspot | 0 | 1 | 2026-10-07 19:57:12 |
| 8 | `127cdff1-492a-4914-9b57-00462105abe2` | `kr:ko:ai.instantly.app` | 2:instantly | 0 | 1 | 2026-10-07 19:57:20 |
| 9 | `f8b6d2f3-fff2-469b-800a-c24a030de10a` | `kr:ko:ai.adcreative.m` | 3:adcreative-ai | 0 | 1 | 2026-10-07 19:57:36 |
| 10 | `37907d10-b433-476e-a6a5-0903ddaa7274` | `kr:ko:com.predis.app` | 3:predis-ai | 0 | 1 | 2026-10-07 19:57:44 |
| 11 | `34a2fddc-00d8-45f2-aee8-e3a2ff623070` | `kr:ko:co.simplified.main` | 3:simplified | 0 | 1 | 2026-10-07 19:57:52 |
| 12 | `e6df374f-7153-4993-8110-ee3fff2324fd` | `kr:ko:co.foreplay.ForeplayMobile` | 3:foreplay | 0 | 1 | 2026-10-07 19:59:05 |
| 13 | `34031838-b921-4705-ac52-25165821c6d1` | `kr:ko:com.people.rippling` | 4:rippling | 0 | 1 | 2026-10-08 08:31:53 |
| 14 | `9e2ca9a0-1a48-48a7-bffd-72c91689bcc4` | `kr:ko:com.gusto.money` | 4:gusto | 0 | 1 | 2026-10-08 08:32:01 |
| 15 | `8953630a-7199-4bea-8fd1-5043f274cce6` | `kr:ko:com.hibob` | 4:hibob | 0 | 1 | 2026-10-08 08:32:09 |
| 16 | `b392c930-895f-439d-bdfa-639c28030eb6` | `kr:ko:com.personio` | 4:personio | 0 | 1 | 2026-10-08 08:32:25 |
| 17 | `fa534580-7ae3-4e5f-ab69-0556d3c27914` | `kr:ko:com.lattice` | 4:lattice | 0 | 1 | 2026-10-08 08:32:33 |
| 18 | `7216d264-0b80-4af3-9ece-1d59454566de` | `kr:ko:com.fifteenfive.fifteenfiveapp` | 4:15five | 0 | 1 | 2026-10-08 08:32:41 |
| 19 | `48ef8d40-2441-4f52-a94a-895da9ecdbb1` | `kr:ko:com.tldv.tldvlite` | 01-meeting-notes:tldv | 0 | 0 | 2026-10-06 00:05:07 |
| 20 | `c66f3f63-2bc7-43b3-9271-cd51630c974b` | `kr:ko:ai.krisp.krispMobile` | 01-meeting-notes:krisp | 0 | 0 | 2026-10-06 00:05:15 |
| 21 | `d69b4673-7b7c-4927-8689-59d8b5b0775c` | `kr:ko:com.read.ai` | 01-meeting-notes:read-ai | 0 | 0 | 2026-10-06 00:05:23 |
| 22 | `404123b9-3ba0-487f-8e48-15f7b175d215` | `kr:ko:ai.granola` | 01-meeting-notes:granola | 0 | 0 | 2026-10-06 00:05:31 |

- 같은 제품끼리 맞바뀐 쌍이 12개다(② 5 · ③ 4 · ④ 2 · gong 1 — gong 은 #464 us:en 이 이미 받음). 한국 스토어에서 0건인 제품을 미국 스토어로 옮기는 셈이라 제품 단위 커버리지는 줄지 않는다.
- 19~22(연속빈값 0)는 tldv·krisp·read-ai·granola. 이 중 tldv·read-ai·granola 는 #464 us:en 이 이미 있다.
- 내린 행은 planRevive 가 되살리지 않는다: 1~18 은 consecutive_empty=1(대상 아님), 19~22 는 대상이지만 구글 플레이 게이트 여유가 0(활성 ≥ 80)인 동안은 안 돈다.
- 예비 후보 10개(같은 규칙 다음 순서, 이번엔 안 씀): avoma `2f8e8631…` · fellow `b56092b8…` · meetgeek `be04065f…` · sembly-ai `ea464383…` · jamie `f397e8f6…` · circleback `bea4dea8…` · rev `07a34412…` · meeting-os `d1b3ca55…` · shipstation `28d7ebbd…` · linnworks `867e5296…` (전부 tc 0 · ce 0).
- ⚠️ 적용 전에 위 22행 중 하나라도 그사이 수집되면(total_collected>0) 마이그 DO ⑤ 가 RAISE 하고 전체 롤백된다 — 그때는 이 표를 다시 뽑는다(예비 후보에서 채움).

## 3. 구글 플레이 활성 수 — 전·후

| 구분 | 적용 전 | 적용 후 |
|---|---|---|
| 활성 전체 | 88 | 88 |
| └ PR #464 일회성 예외(us:en 8) | 8 | 8 |
| └ 그 밖(동결선 80 대상) | **80** | **80** |
| 　　기존 kr:ko 활성 | 80 | 58 (−22 맞바꾸기) |
| 　　v37 신규(us:en 20 + kr:ko 2) | 0 | 22 |

- 80 이하 유지 증명: 마이그 DO ⑥(이번 INSERT 수 = 이번 UPDATE 수, 활성 순변화 0) · DO ⑦(us:en 중 v37 밖 행 = 예외분을 뺀 활성 ≤ 80). 어긋나면 RAISE.
- #464 2차 9개가 먼저 들어가 활성이 97 이 돼도 DO ⑦ 은 97 − 17 = 80 으로 같은 판정을 낸다.
- 앱스토어 활성 0 → 30. 30% 게이트(SHARE_GATE)는 DO ⑨ 가 확인한다 — 구글 플레이 88 만으로도 30/118 = 25.4% 라 운영 값에서는 걸리지 않는다.

## 4. 요청 예산 영향

- **구글 플레이 하루 요청: +0.** 러너 예산 = min(daily_request_cap, 램프 목표) − 오늘 쓴 요청(ramp.ts), 이 마이그는 review_sources·review_source_ramp 를 안 바꾼다. 하루 30 그대로.
  - 바뀌는 건 30요청이 어디로 가느냐다. 첫 방문 22개 × 최대 2페이지 = ≤44요청(약 1.5일치 예산)을 먼저 쓴다(last_run_at NULL = 미방문 앞순위). 내린 22개는 방문마다 1요청을 쓰고 0건이던 자리라, 한 바퀴 길이는 첫 바퀴에만 최대 +0.7일 늘고 그 뒤 같다.
  - 미방문 앞순위라 기존 미방문 kr:ko 14개와 같은 등급에서 경쟁한다 — 둘 다 합쳐 약 36방문 ≈ 1.5~2일.
- **앱스토어: 1회성 ≤300요청**(30타깃 × RSS 최대 10페이지). 평가 수가 작은 앱(③ 대부분 2~20)은 1페이지로 끝나 실제는 훨씬 적다. 비증분형이라 끝까지 읽으면 exhausted 로 닫히고, 재방문은 7일 간격(target-supply NON_INCREMENTAL_MIN_REVISIT_DAYS) — 그때 같은 양. cap·P_SAFE 안에서 러너가 며칠에 나눠 쓴다(현재 cap 값은 설계 Q0 로 확인 — 이 세션 확인 불가).
- **번역 비용**: 채점 카드 번역은 하루 30건·$3 상한 고정이라 안 는다. 속성 인용 번역은 extract 1회당 프로젝트 1호출이라 영어 프로젝트 수만큼(②7·③5·④2·⑤8 = 최대 22호출/회) 는다(설계 §1-3).
- cap 자동 상향(request-cap.ts 2배 규칙)은 건드리지 않는다. 두 소스는 소유자 예외라 cap 이 fixed.

## 5. ⑤ 시험 암 라벨 표기 규칙 (글쓰기 · wordpress · shopify 가 섞이지 않게)

- 공통: 영역 접두 `5:` (target-supply areaOf `^([1-5]):` 호환). `|` 앞 표지는 **시장·스토어**, `|` 뒤는 사전 slug.
- **글쓰기 암**: 앱 스토어 두 곳만, 꼴은 셋 — `5:<slug>`(kr) · `5:us-en|<slug>`(구글 플레이 us) · `5:us|<slug>`(앱스토어 us). slug ∈ {grammarly, quillbot, wordtune, notion-ai, craft-docs, sudowrite, gamma, ginger, wrtn, polaris-office-ai}.
- **wordpress 암**(리뷰관리, 등록 전): `5:wp|<slug>` — 예 `5:wp|judge-me`. source_key 는 wordpress 어댑터 키.
- **shopify 암**(리뷰관리, 소유자 예외 결정 전): `5:shopify|<slug>` — 예 `5:shopify|yotpo`.
- 섞이지 않는 근거 두 겹: ① slug 집합이 서로 겹치지 않는다(글쓰기 10개 vs 리뷰관리 8개 yotpo·judge-me·loox·okendo·crema·alpha-review·vreview·snapreview — `data/area-map-v26.json`). ② 표지가 다르다(`us-en`·`us`·없음 vs `wp`·`shopify`). 모니터링 M4 는 slug 집합으로 먼저 가르고 표지로 다음에 가른다.
- 금지: 글쓰기 암에 `wp|`·`shopify|` 표지를 쓰지 않는다 · 리뷰관리 slug 를 앱 스토어 칸으로 `5:us|…` 에 넣지 않는다(이미 있는 kakao `5:yotpo` 류는 review_mgmt_other 로 따로 센다).
- 프로젝트 하나에 두 암 라벨이 섞이면 M4 가 `mixed` 로 띄운다(0 으로 접지 않는다).

## 6. data/area-map-v26.json 변경 (10줄 + 주석 1줄)

- 글쓰기 시험 slug 10개 `hold → "5"`. 나머지 05 글쓰기 23개는 hold 그대로. `_notes.writing-trial-v37` 에 이유·되돌리는 법.
- 왜 필요한가: 영역 판정 배정 설계(area-quota §2.4)는 접두 없는 프로젝트를 pitch → slug → 이 지도로 귀속하고 hold 를 **판정 순위 맨 뒤**로 민다. 지도가 hold 면 ⑤ 시험 프로젝트가 3일 안에 T2 판정을 못 받아 "판정 100건 relevant 비율"이 확인 불가로 끝난다. 또 투입기(dictionary-targets.mjs)를 나중에 `--areas=05` 로 돌려도 같은 10개만 `5:` 라벨로 들어가 라벨이 한 벌로 유지된다.
- 셀프테스트 `scripts/dictionary-targets-selftest.mjs` 의 지도 개수 단언(5:8→18, hold:59→49)과 "05→hold" 단언을 "05: 시험 10개→5 · 나머지 23개→hold" 로 고쳤다.
- 되돌리기: 이 10줄을 hold 로 되돌리는 커밋 하나. DB 타깃·데이터는 영향 없음(지도는 투입기 계획만 바꾼다).

### 투입기(`--slugs`·`--market=us`)는 고치지 않았다 — 필요 없어서

- 구글 플레이 22개는 투입기로 못 넣는다: gateHeadroom 이 googleplay 활성 ≥ 80 이면 0 이라 전부 `share_gate` 로 빠진다. 맞바꾸기와 한 트랜잭션이어야 활성 수 불변을 증명할 수 있어 마이그가 맞는 자리다.
- 앱스토어 30개도 같은 마이그에 넣어 검토 대상을 한 파일로 모았다(라벨·프로젝트 규칙은 투입기와 같은 식). 투입기 옵션은 다음에 투입기로 영어 칸을 넣을 일이 생길 때 추가한다.

## 7. 확인 불가 · 제외 목록

- **제외(공식 앱 없음)**: jasper · copy-ai · writesonic(⑤ 후보, 사전 `미발견` + iTunes search 판매자 불일치) · motion-creative 구글 플레이 · wordtune 구글 플레이 · culture-amp · clap.
- **제외(확인 불가)**: outreach 앱스토어(사전 `확인 불가` — ID 근거 없음).
- **제외(판단)**: lemonbase 영어 타깃(한국 제품, 미국 평가 0) · deepl-write(앱이 번역기라 Write 리뷰 아님, 설계 §2-1) · wordtune·sudowrite 앱스토어 kr(평가 4·1).
- **확인 불가(이 세션)**:
  - 운영 DB 의 현재 상태(활성 88·후보 22행 조건) — 오케스트레이터 스냅샷 기준. 마이그 '적용 전' 쿼리와 DO 블록이 적용 시점에 다시 본다.
  - 구글 플레이 미국 스토어의 앱별 **글** 리뷰 수(페이지의 평가 수는 별점 포함) · foreplay·craft-docs 는 평가 수 표시 자체가 없음.
  - 구글 플레이 kr:ko 의 wrtn·polaris 한국 스토어 평가 수(us 페이지로 패키지 실존만 확인).
  - 같은 글쓰기 제품의 기존 프로젝트(다른 pitch) 존재 여부 — §2-3.
  - 앱스토어 daily_request_cap·램프 현재값(설계 Q0).

## 8. 셀프테스트 (이 세션 실행)

- `node scripts/dictionary-targets-selftest.mjs` → **74 pass / 0 fail**(지도 단언 수정 반영).
- 마이그·롤백 SQL — PGlite(인메모리 Postgres, 운영 DB 아님)에 최소 스키마 + 오케스트레이터 164행 + 다른 소스 활성 30행을 심고 실행 → **21 pass / 0 fail**. 하네스는 scratchpad(`pgtest/run.mjs`, 커밋 안 함 — 리포에 pglite 의존성이 없다).
  - 적용: NOTICE `이번 INSERT 타깃 52(googleplay 22) · 내림 22 · googleplay 활성 88→88 (예외 제외 80) · appstore 활성 30/148 · 프로젝트 후보 10`.
  - 적용 후 신규 라벨 접두 분포 2:14 · 3:9 · 4:4 · 5:25 · 같은 제품 = 같은 프로젝트(clari 4타깃 1프로젝트, grammarly 3타깃 1프로젝트) · 신규 52행 전부 미방문.
  - 재실행: 쓰기 0(INSERT 0 · 내림 0) · 상태 동일.
  - 롤백 A: googleplay 활성 88 → 88 · 신규 52행 failed · 맞바꾼 22행 active 복귀 · #464 us:en 8행 active 유지 · 롤백 재실행 성공.
  - 음성 4건 전부 RAISE·쓰기 0: 후보가 그사이 수집됨 / 신규 ref 가 다른 프로젝트에 이미 있음 / 앵커(kr 타깃) 없음 / 앱스토어 30% 게이트 초과.
  - 같은 pitch 프로젝트가 이미 있으면 재사용(새 프로젝트 9).
- 모니터링 SQL — 같은 하네스(`pgtest/mon.mjs`)에서 9개 문 전부 실행 성공, 가짜 입력 4·판정 3·번역 인용 2(하나 131자)로 값 확인: M2a flag `재질문`(50%) · M4 writing `judged_of_100=3 · relevant_pct=100.0`(human_verdict 우선 반영) · M0 `active_ex_exception=80`.

## 9. 적용하는 쪽이 할 일 (순서)

1. Opus 사전검토(마이그 SQL/롤백 — CLAUDE.md §10.1 모델 배정).
2. 마이그 머리말 '적용 전' 쿼리 3개: 활성 88 · 후보 22행 조건 유지 · 글쓰기 기존 프로젝트 유무.
3. 야간 수집 시간대를 피해 적용. NOTICE 가 위 §8 첫 줄과 같은지 본다.
4. 하단 확인 쿼리(양성 4 · 음성 2) 직접 실행.
5. `docs/migration-exceptions.md` 한 줄 · Notion 일일 상태 로그(대량 UPDATE 4조건: 드라이런=이 문서 · 롤백=_rollback.sql · 무중단=야간 수집 사이 · 기록).
6. 3일간 모니터링 SQL M0·M1·M2a·M5 매일, 3일 뒤 M3·M4 로 ⑤ 비교표(설계 §2-3) 채움.

주의:
- ⚠️ PR #464 롤백 파일(`reports/2026-10-08/20261008000001_…_rollback.sql` A)의 식별자 `product_ref LIKE 'us:en:%' AND label LIKE '%us-en|%'` 는 **v37 구글 플레이 us:en 20행도 잡는다.** #464 만 멈추려면 그 파일을 그대로 쓰지 말고 id 로 좁힌다. v37 롤백은 정확한 (source, ref) 52쌍만 쓴다.
- T0 라벨 정규화(20261008000010, 별도 브랜치)와는 순서 무관: v37 은 기존 행 label 을 읽지도 쓰지도 않고, 새 라벨은 이미 `N:` 형식이다. 맞바꾸기 대상 중 6행(helium-10·triple-whale·tldv·krisp·read-ai·granola)은 T0 가 label 을 바꾸는 행이지만 v37 은 status 만 바꾸므로 충돌 없음.

## 10. 자가검증 (`_principles.md` §0)

- 더 효과적인 대안? (a) 투입기 `--market=us` 로 넣기 — 구글 플레이는 게이트 여유 0 이라 0건, 기각. (b) 동결선 예외 확대 — 남헌 v37 "예외 금지", 기각. (c) 맞바꾸기 대상을 동적으로 SQL 이 고르게 — 롤백이 id 를 몰라 되돌릴 수 없다, 고정 id 목록 + 상태 검사로 확정.
- 찾은 개선점(반영함):
  1. "방문·연속빈값0" 22개 중 8개가 #464 가 `now()` 로 넣은 미방문 행이었다 → kr:ko 로 후보를 좁혔다(안 그랬으면 방금 넣은 영어 타깃을 다시 내렸다).
  2. 신규 타깃을 `last_run_at=now()`(#464 방식)로 넣으면 한 바퀴(~4일) 뒤에야 첫 방문 → ⑤ 3일 시험이 빈 손 → NULL(미방문 앞순위)로 바꿨다.
  3. 롤백 식별자를 LIKE 가 아니라 정확한 52쌍으로 — #464 행을 같이 멈추는 사고 방지.
  4. 같은 (source, ref) 가 다른 프로젝트에 있으면 같은 앱을 두 번 수집 → 투입기 `exists` 와 같은 뜻의 사전 검사 + RAISE.
  5. 구글 플레이 평가 표시 없는 foreplay·craft-docs 는 요청 낭비 위험 — 그래도 넣었다(③ 0건 5개 우선 지시·⑤ 두 스토어 같은 조건). 첫 방문 0건이면 M5 에서 바로 보이고 다음 맞바꾸기 후보가 된다.
- 남은 위험: 맞바꾼 kr:ko 22행은 한국어 리뷰가 앞으로 생겨도 못 받는다(현재 0건·연속 빈값). 복구는 롤백 A 한 번.
