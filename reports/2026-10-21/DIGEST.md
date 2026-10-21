# CMO 데일리 다이제스트 2026-10-21

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 1건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 1건
- 스테이징(staged): 0건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

# 성과 해설 2026-10-21

**결론: 지금 판정할 수 있는 것이 하나도 없다.** 채점된 예측 항목은 전부 보류이고, 규칙 신뢰도는 어느 규칙도 계산되지 않았다. 커버리지는 7개 병목 모두 매칭 가능해서 갭이 없다. 그래서 다음 앵글은 "무엇이 먹히나"보다 "기준선 표본을 어떻게 채우나"로 고르는 편이 맞다.

## 채점 (예측 항목 7개)
- **유효 0 / 무효 0 / 보류 6.** 보류 6개는 엔트리 3건에 2개씩이다.
- **채점 불가 1건.** LOG-20260907-01은 연결된 발행 글이 없다. 이것은 보류가 아니라 확인 불가다. 이 엔트리의 항목 수는 원자료에 없고, 7 − 6 = 1로 추정했을 뿐이다.
- **보류 사유 ①:** LOG-20260906-01과 LOG-20260907-03은 h168 스냅샷이 없다(4개 항목). 아직 그 시점이 안 된 것인지 수집이 실패한 것인지 원자료만으로는 가를 수 없다.
- **보류 사유 ②:** LOG-20260907-02는 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 실측값은 있지만 비교 기준이 없다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산 불가다. 이 규칙들은 "먹힌다"도 "안 먹힌다"도 말할 수 없다.
- **스냅샷 현황:** 14개(글 8건)가 있다. 4건은 h1/h24/h168 명목 창과 맞지 않는 `catchup` 관측이라 뺐다. 이것은 그 글에 데이터가 없다는 뜻이 아니다.

## 커버리지
- **매칭 가능 병목 7/7.** 케이스 0곳이나 1곳인 병목은 없고, 갭도 없다.
- **여유가 가장 적은 병목:** DISTRIBUTION과 SUPPLY가 각각 케이스 3곳이다. 한 곳이 반려되거나 내려가면 매칭 하한인 2곳이 된다.
- **무브가 가장 적은 병목:** SUPPLY가 5건이다. 무브가 가장 많은 병목은 TRUST로 11건이다.
- **UNIT_ECONOMICS:** 케이스가 5곳으로 가장 넓다.

## 다음 앵글 후보
원자료에 무브 이름이 없어서 병목·케이스 단위로 적는다. 무브 단위 확정은 CMO가 승인 무브 목록을 보고 한다.
1. **TRUST 무브 1개** (Everlane, Ritual, Seed Health, Tuft & Needle 중). 지금 필요한 것은 기준선 표본 4건이고, TRUST는 재료가 11건으로 가장 많아 같은 포맷을 반복해 가장 빨리 채울 수 있다.
2. **SUPPLY 무브 1개** (Fathom Analytics, Magic Spoon, Purple Innovation 중). 무브 5건으로 가장 적고 케이스도 3곳이라 얇다. 발행으로 가시화해 두면 이후 조사 우선순위를 정하기 쉽다.
3. **DISTRIBUTION 무브 1개** (Figma, Testimonial.to, Zapier 중). 케이스 3곳으로 하한 바로 위다. 위 둘과 달리 아직 시도하지 않은 병목이라면 표본 다양성을 보탠다. 이미 발행됐는지는 확인 못 했다.

## 확인 못 한 것
- **발행 누적 건수:** 스냅샷이 있는 글이 8건이라는 것만 알고, 총 발행 수는 모른다. 그래서 부트스트랩 10건 문턱을 넘었는지 단정하지 않는다.
- **h168 스냅샷 부재 원인:** 시점이 안 된 것인지 `collect-metrics` 수집 실패인지 가를 수 없다. 둘이면 다음 행동이 정반대이므로 발행일 대조가 필요하다.
- **LOG-20260907-01에 연결된 글이 없는 이유:** 미발행인지 연결 누락인지 모른다.
- **LOG-20260907-02의 실측값:** reply_rate와 like_rate가 둘 다 0.0315로 똑같다. 우연일 수도 있지만 지표 매핑 오류일 수도 있다. 판단하지 않고, CTO 쪽 점검 후보로 올린다.
- **이미 발행된 병목:** 어느 병목이 이미 발행됐는지는 원자료에 없어서, 후보 3개의 "왜 지금"은 커버리지 수치에만 근거한다.
- **`threads-report.mjs`:** 이번 원자료에 포함되지 않아 발행 지표 요약은 보지 못했다.

**검토 절차(§0):** 위 후보 중 1·2번은 서로 목적이 달라(표본 채우기 vs 커버리지 보강) 한 번에 하나만 고르는 편이 낫다. 개선점은 두 가지다. 스냅샷 부재 원인 구분 없이는 보류가 영구화될 수 있고, 0.0315 동일값은 검증이 필요하다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-21-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-21 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-21T23:16:44.879Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 28곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":0,"transferability_unrated":0})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":0})
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-21-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
