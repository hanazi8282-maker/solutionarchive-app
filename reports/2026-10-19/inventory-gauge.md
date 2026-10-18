# 타깃 재고 게이지 — 2026-10-19 (v71au ⑩)

라벨: [직접 실행 확인] = 오늘 DB 읽기(`node scripts/inventory-gauge.mjs`, SELECT 만). 쓰기·변수 변경 없음.

## 결론 3줄
- 재방문 시계는 **돈다** [직접 실행 확인]: nightly-review-collect pre-step(`target-revive.mjs --auto`)이 슬롯마다 실행, 되살림 롤백 파일 기준 10-17 5행(3회), 10-18 10행(2+6+2, 3회) — 파일명 시각 UTC 04:37·09:52·13:23.
- 그러나 **되살림이 하루 10행 안팎**이다. 앱스토어 exhausted 223 중 즉시 자격 1, 간격 대기 222(가장 이른 자격 10-19T23:20Z). 병목은 "읽을 곳 0"이 아니라 **간격 대기 + 슬롯당 되살림 상한(queue_full: 회당 타깃 수 − 활성)** 이다 [코드만 확인: lib/review/target-supply.ts planRevive].
- 소비형 2곳(appstore·youtube)이 14일 미만(둘 다 즉시 재고 0일) — 보충 제안은 아래 블록(적용 안 함, 자율 범위: 차단 0·한 단계·한도 대장 기록·24h 재평가).

## 오늘 블록 (그대로 출력)
```
[재고 게이지 2026-10-19]
- 수집 연료계: 소비형 appstore 0일 · youtube 0일 (14일 미만 2/2개) · 순환형 이상 27곳(82cook, bobaedream, brunch, bubble_forum, clien 외) · SLO 0개를 3일 연속
- 82cook: 순환형(활성 2) · 대기 예약 0 · 경고
- appstore: 재고 0일(활성 0 + 즉시 예약 1) · 대기 예약 222 · 다음 자격 2026-10-19T23:20Z · 경고
- bobaedream: 순환형(활성 0) · 대기 예약 2 · 다음 자격 2026-10-21T04:42Z · 긴급
- brunch: 순환형(활성 0) · 대기 예약 0 · 긴급
- bubble_forum: 순환형(활성 2) · 대기 예약 0 · 경고
- clien: 순환형(활성 1) · 대기 예약 3 · 다음 자격 2026-10-31T05:05Z · 경고
- damoang: 순환형(활성 0) · 대기 예약 0 · 긴급
- devto: 순환형(활성 0) · 대기 예약 0 · 긴급
- disquiet: 순환형(활성 1) · 대기 예약 0 · 경고
- fmkorea: 순환형(활성 0) · 대기 예약 0 · 긴급
- github_issues: 순환형(활성 16) · 대기 예약 0 · 정상
- glide_community: 순환형(활성 2) · 대기 예약 0 · 경고
- googleplay: 순환형(활성 57) · 대기 예약 50 · 다음 자격 2026-10-20T00:05Z · 경고
- hackernews: 순환형(활성 2) · 대기 예약 81 · 다음 자격 2026-10-18T20:39Z · 경고
- indiehackers: 순환형(활성 1) · 대기 예약 0 · 경고
- itunes_search: 순환형(활성 0) · 대기 예약 0 · 긴급
- kakao_blog: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:31Z · 긴급
- kakao_cafe: 순환형(활성 0) · 대기 예약 4 · 다음 자격 2026-10-22T22:32Z · 긴급
- make_community: 순환형(활성 2) · 대기 예약 0 · 경고
- n8n_community: 순환형(활성 2) · 대기 예약 0 · 경고
- okky: 순환형(활성 1) · 대기 예약 0 · 경고
- retool_community: 순환형(활성 2) · 대기 예약 0 · 경고
- shopify_apps: 순환형(활성 1) · 대기 예약 9 · 다음 자격 2026-10-25T18:19Z · 경고
- softr_community: 순환형(활성 2) · 대기 예약 0 · 경고
- theqoo: 순환형(활성 0) · 대기 예약 0 · 긴급
- tumblbug: 순환형(활성 0) · 대기 예약 0 · 긴급
- velog: 순환형(활성 0) · 대기 예약 5 · 다음 자격 2026-10-23T22:43Z · 긴급
- wordpress_org: 순환형(활성 0) · 대기 예약 9 · 다음 자격 2026-10-23T12:18Z · 긴급
- youtube: 재고 0일(활성 0 + 즉시 예약 0) · 대기 예약 19 · 다음 자격 2026-10-18T21:27Z · 긴급
- yozm: 순환형(활성 0) · 대기 예약 0 · 긴급
- 보충 제안(적용 안 함): 
  - appstore: 예약 222개가 간격 대기 중(다음 자격 2026-10-19T23:20:04.764Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - bobaedream: 예약 2개가 간격 대기 중(다음 자격 2026-10-21T04:42:47.501Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - clien: 예약 3개가 간격 대기 중(다음 자격 2026-10-31T05:05:24.363Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - googleplay: 예약 50개가 간격 대기 중(다음 자격 2026-10-20T00:05:07.609Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - hackernews: 예약 81개가 간격 대기 중(다음 자격 2026-10-18T20:39:55.706Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_blog: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:31:06.086Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - kakao_cafe: 예약 4개가 간격 대기 중(다음 자격 2026-10-22T22:32:58.528Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - shopify_apps: 예약 9개가 간격 대기 중(다음 자격 2026-10-25T18:19:45.497Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - velog: 예약 5개가 간격 대기 중(다음 자격 2026-10-23T22:43:33.357Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - wordpress_org: 예약 9개가 간격 대기 중(다음 자격 2026-10-23T12:18:31.207Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - youtube: 예약 19개가 간격 대기 중(다음 자격 2026-10-18T21:27:33.244Z) → 한 단계: TARGET_REVIVE_PER_SOURCE +2 또는 CE_EXP_MAX 지수 −1, 한도 대장 기록·24h 재평가
  - 새 타깃 필요 17곳 — 82cook(활성 2), brunch(활성 0), bubble_forum(활성 2), damoang(활성 0), devto(활성 0), disquiet(활성 1), fmkorea(활성 0), glide_community(활성 2), indiehackers(활성 1), make_community(활성 2), n8n_community(활성 2), okky(활성 1), retool_community(활성 2), softr_community(활성 2), theqoo(활성 0), tumblbug(활성 0), yozm(활성 0): 창문 발굴 대상이 아니다. 새 게시판·타깃 등재(발굴 ⑤·마이그)가 필요, 사람·역할 세션 몫
```

## 읽기 근거
- 입력: `scripts/target-supply.mjs` loadSupplyInputs(review_sources·review_source_ramp·review_targets·review_collection_runs 14일) → `computeSupply` → `inventoryGauge`(lib/review/target-supply.ts, 기존 함수 그대로).
- 즉시 재고 일수 = (활성 + 지금 되살릴 수 있는 예약) ÷ (하루 슬롯 × 회당 타깃). 순환형(증분형)은 일수가 정의되지 않아 활성 0 = 긴급, 결손 = 경고로 센다.
- 한계: queue_full 이 활성을 tpr 이하로 묶어 소비형 일수가 항상 작게 나온다(코드 주석의 '독립 검토 1'). 14일 미만 판정을 문턱으로 쓰면 영구 경고가 될 수 있어, 이 블록은 **제안만** 내고 자동 적용하지 않는다.
- 차단·쿼터 신호는 24h 로 센다(14일치가 아니다).

## 같은 날 함께 찍은 병목·한도 재평가
```
[병목 2026-10-19]
- 앱스토어 N/T/여유: 활성 0 / 필요 294 / 30% 여유 40 · 24h 방문 66 요청 126 신규 2748 (exhausted 223는 재방문 시계 대기 — 활성 0은 정상 휴지 상태)
- 30% 게이트·동결선 밖 결손(설계 수요 N−gap 중 여유 초과분; 실제 거절 건수는 로그가 없다): 620 (appstore 254 · danawa 7 · googleplay 326 · shopify_apps 3 · wordpress_org 30)
- 등록 속도(24h 새 타깃): 25
- 요청 예산 사용률(목표 90%↑): appstore 126/140 근접
- 구글 플레이: 활성 57 / 동결선 80 · 확대 보류
- 차단·쿼터 신호(24h): 차단 0 · 쿼터 0
- 판정 대기 며칠치(L-42): 확인 불가 — 이 스크립트 범위 밖(판정 표 별도)

[한도 재평가 2026-10-19]
- github_issues 120→240 (2026-10-18T08:14Z, cc-ceo-staff-2026-10-18): pending — 변경 8h 경과 — 24h 뒤 재평가
- github_issues 60→120 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 1h 경과 — 24h 뒤 재평가
- appstore 120→140 (2026-10-18T14:37Z, cc-ceo-staff-2026-10-18): pending — 변경 1h 경과 — 24h 뒤 재평가
- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 7158건 × 보수 단가) ≈ $6.44 / 한도 $5 (129%) [추정]
- 상향 가능 소스(제안만):
  - 없음
```
