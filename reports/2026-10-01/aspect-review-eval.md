# 소구점 검수 자동화 평가 (2026-10-01)

- 확정 속성 45건 중 인용 있는 10건 × 다섯 필드 · 판정 빠짐 0건 · 근거 없음 제외 35건
- **완전 동의 정밀도 22/33 = 66.7% [49.6%, 80.2%] · 재현율 22/50 = 44% [31.2%, 57.7%]** (Wilson 95%)
- 분모 충분(그래도 필드는 한 속성 안에서 서로 독립이 아니다 — 한계 참고).

## 표본·방법
- 대상: `analysis_aspects.human_confirmed = true` 45건 → `evidence_quotes` 빈 것 35건 제외 → 10건.
- 1차 claude-cli `claude-sonnet-5-5`(로컬 로그인) · 2차 Gemini(geminiModelChain) — 같은 프롬프트(추출 단계 속성 정의 그대로 + UNTRUSTED_INPUT_NOTICE), 속성 이름·제품 설명·인용 원문만 준다. 사람값·상대 판정은 안 준다.
- 필드: importance · satisfaction · aspect_layer · attribution · pain_timing(인지시점 = pain_timing). 점수는 VERDICT_CUT 띠(중요도 ≥6 HIGH / 만족도 <3 LOW · ≥5 HIGH · 그 사이 MID)로 비교. 사람 attribution null = NONE(칭찬).
- 완전 동의 = 1·2차 값이 둘 다 있고 같다. 정밀도 = 완전 동의 중 사람값과 같음 · 재현율 = 사람값 있는 필드 전체 중 완전 동의∧사람값과 같음.
- 이번 실행 호출 1차 0 · 2차 0.

## 지표
| 구분 | 정밀도 (Wilson 95%) | 재현율 (Wilson 95%) | 오류 | 1·2차 엇갈림 | 판정 불가 | 주의 |
|---|---|---|---|---|---|---|
| 전체 | 22/33 = 66.7% [49.6%, 80.2%] | 22/50 = 44% [31.2%, 57.7%] | 11 | 12 | 5 |  |
| importance | 5/8 = 62.5% [30.6%, 86.3%] | 5/10 = 50% [23.7%, 76.3%] | 3 | 1 | 1 | ⚠️ N<30 해석 불가 |
| satisfaction | 2/5 = 40% [11.8%, 76.9%] | 2/10 = 20% [5.7%, 51%] | 3 | 4 | 1 | ⚠️ N<30 해석 불가 |
| aspect_layer | 4/6 = 66.7% [30%, 90.3%] | 4/10 = 40% [16.8%, 68.7%] | 2 | 4 | 0 | ⚠️ N<30 해석 불가 |
| attribution | 7/8 = 87.5% [52.9%, 97.8%] | 7/10 = 70% [39.7%, 89.2%] | 1 | 1 | 1 | ⚠️ N<30 해석 불가 |
| pain_timing | 4/6 = 66.7% [30%, 90.3%] | 4/10 = 40% [16.8%, 68.7%] | 2 | 2 | 2 | ⚠️ N<30 해석 불가 |

AI 원값(llm_*) 대비 사람 수정 여부별(풀링):

| 구분 | 정밀도 | 재현율 | 오류 | 엇갈림 | 판정 불가 | 주의 |
|---|---|---|---|---|---|---|
| 사람이 고친 필드 | 0/0 = 해당 없음  | 0/0 = 해당 없음  | 0 | 0 | 0 | ⚠️ N<30 해석 불가 |
| 안 고친 필드 | 22/33 = 66.7% [49.6%, 80.2%] | 22/50 = 44% [31.2%, 57.7%] | 11 | 12 | 5 |  |
| 원값 없음(마이그 이전 추출) | 0/0 = 해당 없음  | 0/0 = 해당 없음  | 0 | 0 | 0 | ⚠️ N<30 해석 불가 |

## 불일치 목록 28건 (1·2차·사람 셋이 같지 않은 필드)
- `16674930-2201-4702-890a-deeac94b368a` 카테고리 포화 및 차별화 부재 인식 · **importance** · 사람 LOW(5) · 1차 LOW(4) · 2차 HIGH(6)
- `16674930-2201-4702-890a-deeac94b368a` 카테고리 포화 및 차별화 부재 인식 · **satisfaction** · 사람 HIGH(5) · 1차 MID(4) · 2차 MID(3)
- `16674930-2201-4702-890a-deeac94b368a` 카테고리 포화 및 차별화 부재 인식 · **aspect_layer** · 사람 OUTCOME(OUTCOME) · 1차 OUTCOME(OUTCOME) · 2차 PROCESS(PROCESS)
- `16674930-2201-4702-890a-deeac94b368a` 카테고리 포화 및 차별화 부재 인식 · **attribution** · 사람 NONE(null) · 1차 ENVIRONMENT(ENVIRONMENT) · 2차 ENVIRONMENT(ENVIRONMENT)
- `2b415451-51a2-4951-86cf-9edc7a291516` 히트맵·세션리플레이를 통한 UX 인사이트 발견 · **pain_timing** · 사람 POST_PURCHASE(POST_PURCHASE) · 1차 판정 불가(null) · 2차 판정 불가(null)
- `366d775b-7155-44cb-b9ff-e325967235eb` 방문자 클릭·스크롤·타이핑 전면 기록에 대한 프라이버시 침해감 · **aspect_layer** · 사람 PROCESS(PROCESS) · 1차 OUTCOME(OUTCOME) · 2차 OUTCOME(OUTCOME)
- `366d775b-7155-44cb-b9ff-e325967235eb` 방문자 클릭·스크롤·타이핑 전면 기록에 대한 프라이버시 침해감 · **pain_timing** · 사람 PRE_PURCHASE(PRE_PURCHASE) · 1차 PRE_PURCHASE(PRE_PURCHASE) · 2차 POST_PURCHASE(POST_PURCHASE)
- `4aa7216b-af64-442d-bfe7-a674d291823b` 자체 호스팅/데이터 주권 대안에 대한 수요 · **importance** · 사람 HIGH(6) · 1차 LOW(3) · 2차 판정 불가(null)
- `4aa7216b-af64-442d-bfe7-a674d291823b` 자체 호스팅/데이터 주권 대안에 대한 수요 · **satisfaction** · 사람 MID(4) · 1차 판정 불가(null) · 2차 판정 불가(null)
- `4aa7216b-af64-442d-bfe7-a674d291823b` 자체 호스팅/데이터 주권 대안에 대한 수요 · **aspect_layer** · 사람 OUTCOME(OUTCOME) · 1차 PRODUCT(PRODUCT) · 2차 PRODUCT(PRODUCT)
- `4aa7216b-af64-442d-bfe7-a674d291823b` 자체 호스팅/데이터 주권 대안에 대한 수요 · **attribution** · 사람 PRODUCT_FAULT(PRODUCT_FAULT) · 1차 판정 불가(null) · 2차 NONE(NONE)
- `4aa7216b-af64-442d-bfe7-a674d291823b` 자체 호스팅/데이터 주권 대안에 대한 수요 · **pain_timing** · 사람 PRE_PURCHASE(PRE_PURCHASE) · 1차 판정 불가(null) · 2차 PRE_PURCHASE(PRE_PURCHASE)
- `613be254-3e33-4cd5-bf7b-6b2d2dcc70ef` 서드파티 스크립트 적재로 인한 페이지 성능/로딩 저하 · **satisfaction** · 사람 MID(4) · 1차 MID(3) · 2차 LOW(1)
- `613be254-3e33-4cd5-bf7b-6b2d2dcc70ef` 서드파티 스크립트 적재로 인한 페이지 성능/로딩 저하 · **pain_timing** · 사람 PRE_PURCHASE(PRE_PURCHASE) · 1차 POST_PURCHASE(POST_PURCHASE) · 2차 POST_PURCHASE(POST_PURCHASE)
- `63096bef-67ad-409f-bdce-6e6b75da8abd` 고가 요금제 대비 대안 도구의 가격 경쟁력 · **satisfaction** · 사람 MID(3) · 1차 HIGH(7) · 2차 LOW(2)
- `63096bef-67ad-409f-bdce-6e6b75da8abd` 고가 요금제 대비 대안 도구의 가격 경쟁력 · **aspect_layer** · 사람 PROCESS(PROCESS) · 1차 OUTCOME(OUTCOME) · 2차 PROCESS(PROCESS)
- `63096bef-67ad-409f-bdce-6e6b75da8abd` 고가 요금제 대비 대안 도구의 가격 경쟁력 · **attribution** · 사람 PRODUCT_FAULT(PRODUCT_FAULT) · 1차 NONE(NONE) · 2차 PRODUCT_FAULT(PRODUCT_FAULT)
- `7ee2aaf9-d97f-4061-b415-e55a31fa4a9e` 민감정보(비밀번호·카드번호·건강정보) 노출 및 GDPR 규제 위험 · **satisfaction** · 사람 MID(3) · 1차 LOW(2) · 2차 MID(3)
- `7ee2aaf9-d97f-4061-b415-e55a31fa4a9e` 민감정보(비밀번호·카드번호·건강정보) 노출 및 GDPR 규제 위험 · **aspect_layer** · 사람 OUTCOME(OUTCOME) · 1차 PROCESS(PROCESS) · 2차 OUTCOME(OUTCOME)
- `7ee2aaf9-d97f-4061-b415-e55a31fa4a9e` 민감정보(비밀번호·카드번호·건강정보) 노출 및 GDPR 규제 위험 · **pain_timing** · 사람 PRE_PURCHASE(PRE_PURCHASE) · 1차 POST_PURCHASE(POST_PURCHASE) · 2차 POST_PURCHASE(POST_PURCHASE)
- `9c3f7bb2-a11c-4d32-92f0-64aa6f125963` 피드백 위젯(행복도 슬라이더) 설계로 인한 부정 피드백 수집률 저하 · **importance** · 사람 LOW(3) · 1차 HIGH(6) · 2차 HIGH(8)
- `9c3f7bb2-a11c-4d32-92f0-64aa6f125963` 피드백 위젯(행복도 슬라이더) 설계로 인한 부정 피드백 수집률 저하 · **satisfaction** · 사람 MID(4) · 1차 LOW(2) · 2차 LOW(2)
- `f0a5cf31-03a5-4fc3-b67b-4bf2cea74547` 세션 과다로 인한 분석 정보 과부하 · **importance** · 사람 LOW(4) · 1차 HIGH(6) · 2차 HIGH(8)
- `f0a5cf31-03a5-4fc3-b67b-4bf2cea74547` 세션 과다로 인한 분석 정보 과부하 · **satisfaction** · 사람 MID(3) · 1차 MID(3) · 2차 LOW(2)
- `f0a5cf31-03a5-4fc3-b67b-4bf2cea74547` 세션 과다로 인한 분석 정보 과부하 · **aspect_layer** · 사람 PROCESS(PROCESS) · 1차 PROCESS(PROCESS) · 2차 OUTCOME(OUTCOME)
- `f7157c2c-f034-49d8-8593-4d626b451d67` 모던 SPA 프레임워크 호환성 및 녹화 건수 제한 · **importance** · 사람 LOW(4) · 1차 HIGH(6) · 2차 HIGH(7)
- `f7157c2c-f034-49d8-8593-4d626b451d67` 모던 SPA 프레임워크 호환성 및 녹화 건수 제한 · **satisfaction** · 사람 MID(3) · 1차 LOW(2) · 2차 LOW(2)
- `f7157c2c-f034-49d8-8593-4d626b451d67` 모던 SPA 프레임워크 호환성 및 녹화 건수 제한 · **pain_timing** · 사람 PRE_PURCHASE(PRE_PURCHASE) · 1차 PRE_PURCHASE(PRE_PURCHASE) · 2차 POST_PURCHASE(POST_PURCHASE)

## 한계
- AI 원값: llm_* 컬럼 있음. 단 마이그 20260820000001 이전 추출 행은 원값이 null 이라 "원값 없음" 으로 따로 센다. 이름(name)·메모는 원값을 보존하지 않는다 — 판정자가 보는 이름은 사람이 고친 것일 수 있다.
- 표본 크기: 속성 10건. 다섯 필드는 같은 인용에서 나와 서로 독립이 아니다 — 필드 단위 Wilson 구간은 실제보다 좁다. 분모 30 미만은 해석 불가.
- 1·2차 독립성: 서로의 출력·사람값을 보지 않지만 **같은 프롬프트·같은 인용**을 본다. 같은 인용에서 같이 틀리는 오류(공통 원인)는 완전 동의로 걸러지지 않는다.
- 인용은 1~3문장뿐이다. 추출 정의의 importance 는 "전체 리뷰에서 얼마나 자주·강하게" 라 인용만으로는 원래 척도를 재현할 수 없다 — importance 판정 불가·불일치가 많으면 이 때문일 수 있다.

## 남헌 결정 자리
- [ ] 이 수치로 속성 검수 자동승인 설계를 시작할지(시작한다면 문턱: 분모 ≥ ? · 정밀도 Wilson 하한 ≥ ?) — 하네스는 승인 로직을 만들지 않았다.
- [ ] 표본을 늘릴지: 인용 없는 확정 속성을 재추출(force)해 evidence_quotes 를 채울지.
- [ ] importance 를 평가 대상에서 뺄지(인용만으로 재현 불가한 척도).
