# ② 영어·해외 리뷰 현황 (2026-10-19 00:xx KST, 읽기 전용 실측)

라벨: [직접 실행 확인]=DB·lookup 실측 · [코드만 확인]=코드 · [추정]=계산식 명시.

## 1. 현황 (소스 × 국가)
- 앱스토어 [직접 실행 확인]: kr 86 · us 67 · ca 20 · gb 19 · au 15 · in 8 · ie 4 · nz 2 · sg 2 (전부 active 0 / exhausted — 재방문 시계가 되살림). 누적 us 7,845 · ca 3,123 · au 1,244 · gb 566.
- 구글 플레이 [직접 실행 확인]: kr 82(active 29) · us 39(active 28). 누적 kr 1,979 · us 1,846. 타깃당 누적이 80 근처에서 멈추는 패턴(어댑터 1회 방문 상한) → GP 영어는 타깃당 약 80건이 천장.
- 영어 타깃이 없는 제품: 앱스토어 53곳 · 구글 플레이 49곳(한국 앱 다수 포함). 영역별 영어 없음(프로젝트 기준): ① 18/28 · ④ 16/24 · 07-ecommerce 9/12 · ③ 1/22 · ⑤ 1/10 · ② 0/37.
- 앱스토어 lang 컬럼은 전부 NULL(어댑터가 언어를 안 채움) 20,453건 [직접 실행 확인].

## 2. 0건 원인 분류 (앱스토어 kr 타깃 0건 41개 중)
- a 한국 지역만 읽음: 글로벌 앱(Fathom·Avoma·Krisp·Granola·tl;dv·Read AI·Fireflies 2건·Circleback 등)이 kr 스토어 리뷰 0 → us 스토어에는 평점 수천 개(Granola 14,565 · Fireflies 5,309 · Plaud 23,664). 가장 큰 원인 [직접 실행 확인 — us lookup].
- b ID 오류: 이번 lookup 58개 중 us 에서 조회 안 되는 7개(ezadmin·adot·clova·pandarank·playauto·ixio·everin) = 한국 전용 앱, 오류가 아니라 us 스토어 미출시.
- c 글 없음: us 평점 수 0~20 인 앱(Fathom 3 · tl;dv 0 · Sembly 0 · Avoma 16 · Helium10 9 · Personio 10) — 읽어도 거의 없다.
- d 타깃 없음: 위 53/49곳 중 us 평점 ≥50 인 19곳(앱스토어)이 실제 등록 대상.

## 3. 구글 플레이 lang 오라벨 [직접 실행 확인]
- googleplay lang: ko 1,936 · en 1,819 · und-latn 38 · und 32.
- ko 로 라벨됐으나 한글 0자 + 라틴 3자 이상: **53건 (ko 의 2.7%)**. lib/review/lang.ts(10-08) 수정 이전 수집분. 백필 `20261019000020_googleplay_lang_backfill`(+rollback, 53행 id 고정, 미적용).

## 4. 저평점(1~3점) 우선 수집 — 영어 타깃에도 적용? [코드만 확인]
- **적용 안 됨.** 앱스토어 어댑터는 항상 sortBy=mostRecent(`feedUrl` 기본값, mostHelpful 은 프로브 측정 전용), 구글 플레이는 SORT_NEWEST 고정이고 별점 필터 없음. RSS 에 별점 필터 파라미터가 없어 앱스토어는 구조적으로 불가, 구글 플레이는 batchexecute 에 별점 인자가 있으면 가능하나 미확인 [코드만 확인].
- 대안: 수집 후 판정 단계에서 rating ≤3 을 우선 판정(비용 절감 겸).

## 5. 등록 마이그 초안 (미적용)
- `20261019000010_window_targets_20261019` (+rollback): **29행** — 앱스토어 us 19 + 구글 플레이 us:en 10. 영역 ① 18(앱스토어 11 + GP 7) · ③ 2 · ④ 7 · 07 2. 앵커 29개 전부 DB 에 1건씩 존재 확인.
  - 앱스토어 us 19: aftership·shipstation(07)·rev·notta·bluedot·circleback·fireflies-ai·granola·jamie·krisp·meetgeek·plaud·read-ai(①)·miricanvas(③)·bamboohr·rippling·hibob·gusto·deel(④). 선정 기준 = us lookup 평점 수 ≥50 (daglo 261 은 한국 앱이라 제외).
  - 구글 플레이 us:en 10: otter-ai·fireflies-ai·notta·plaud·bluedot·jamie·avoma(①)·deel·workday(④)·canva(③). GP 는 us 스토어 노출 미확인이라 실패 가능(기존 07 영어 3개가 failed).
  - 가드(마이그 내장): GP 활성 ≤80(현재 57+10=67), 앱스토어 활성 비율 ≤0.3(현재 앱스토어 활성 0 + 19). 어기면 RAISE.
- 해외 리뷰 수집 불가(G2·Capterra 등 차단 소스에만 있는 제품): 이번 범위 앱 스토어 미출시 제품은 별도 목록화 못 함 — 소스 맵에서 G2·Capterra 가 차단 유지라 해당 제품은 '해외 리뷰 수집 불가'로 분류(제품 목록은 후속).

## 6. 요청 한도 상향 초안 (한도 대장 형식)
- 앱스토어 `review_source_ramp.daily_request_target`: 140 → 160 (이전값 140). 롤백 140. 24h 재평가: 요청당 신규 ≥15, 429/403 0. 조건: 신규 19타깃 첫 통독(타깃당 최대 ≈10요청 ≈190요청)이 2일 안에 안 끝나면 시행.

## 7. 제품당 100건 도달 예상 / 오늘 기대량 [추정]
- 앱스토어 us: 타깃당 첫 방문에서 RSS 최대 500건(실측 us 평균 117건/타깃). 하루 목표 140요청 ÷ 타깃당 ~5~10요청 = 14~28 타깃/일 → 19타깃 **1~2일 안에 전부 100건 도달**(평점 수 ≥1,000 인 13곳은 첫 방문에 100건 도달, 나머지 6곳은 방문당 신규 <100).
- 구글 플레이 us:en: 타깃당 상한 ≈80 → **100건 도달 불가**(재방문 증분만).
- 오늘(적용 직후 1회 야간 슬롯) 기대: 앱스토어 ≈ 14 타깃 × 117 ≈ 1,640건 raw, 관련성 78% ≈ 1,280 relevant. GP ≈ 10 × 40 ≈ 400 raw. 합 **≈ 1,700 relevant (일회성, 이후 증분 일 ≈100~250)**. 앱스토어 일 요청 상한 200 에 닿으면 하루 늦어짐.
