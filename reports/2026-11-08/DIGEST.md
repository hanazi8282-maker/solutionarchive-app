# CMO 데일리 다이제스트 2026-11-08

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 269시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 4건(초안 없이 직접 쓴 글 — 연결 대상 아님)

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 0건
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

# 성과 해설 — 2026-11-08

- **결론: 이번 주 성과로 규칙의 유효·무효를 가릴 수 없다.** 유효 0 · 무효 0이고, 판정 가능한 건은 하나도 없다.
- **커버리지 갭은 없다.** 매칭 가능한 병목은 7/7이다. 다음 앵글은 커버리지 두께와 기준선 확보를 기준으로 골랐다. 성과 근거로 고른 것이 아니다.
- **먼저 볼 것은 수집이다.** 09-06 글은 두 달이 지났는데 h168 스냅샷이 없다. "아직 시점이 안 됐다"로 설명할 수 없는 구간이다.

## 채점 (예측 항목 7개 · 엔트리 23개 중 예측이 달린 것 4개)

- 유효 **0** / 무효 **0** / 보류 **6항목**(엔트리 3개, 표본 부족) / 채점 불가 **1엔트리**.
- 보류는 실패도 성공도 아니다. 규칙별 Wilson 하한은 전부 "-"다.
- LOG-20260906-01: 보류 2항목(like_rate, share_rate). h168 스냅샷이 없다.
- LOG-20260907-02: 보류 2항목(reply_rate, like_rate). 부트스트랩 구간이라 기준선 표본이 0건이다(채점 하한은 4건).
- LOG-20260907-03: 보류 2항목(share_rate, like_rate). h168 스냅샷이 없다.
- LOG-20260907-01: 연결된 발행 글이 없어 채점 불가다. 0건이 아니라 확인 불가다.
- 규칙 6개(C-12, G-4, G-8, H3, P-03, P-09)는 각각 유효 0 / 무효 0 / 보류 1이다. 어느 규칙도 근거를 쌓지 못했다.
- 원자료는 항목 7개라고 하는데 상세에는 6개만 보인다. 나머지 1개는 채점 불가 엔트리에 속한 것으로 보이나 출력만으로는 확인되지 않는다.

## 확인 대상

- **LOG-20260907-02의 0.0315.** reply_rate와 like_rate의 실측값이 같다. 우연일 수도 있지만, 두 지표가 같은 컬럼을 읽고 있을 가능성도 있다. 기준선이 0건이라 지금은 어느 쪽이든 판정에 영향이 없다. 기준선이 쌓이기 전에 수집 쪽에서 확인해야 한다.
- **h168이 비어 있는 이유.** 09-06·09-07 글인데 168시간 스냅샷이 없다. 수집 실패일 가능성이 크다. 다만 제외된 4건이 이 글들의 것인지는 원자료에서 알 수 없다.
- **catchup 스냅샷 4건을 뺐다.** h1/h24/h168 창과 나이가 맞지 않는 1회성 관측이다. 그 글에 데이터가 없다는 뜻은 아니다.
- **부트스트랩 구간이다.** 스냅샷이 있는 글은 8건이고, 기준인 발행 누적 10건에 못 미친다. 이 구간의 수치는 참고값이며 "어떤 훅이 먹힌다"는 결론의 근거로 쓰지 않는다.

## 커버리지 (매칭 가능 병목 7/7, 갭 0)

- UNIT_ECONOMICS: 케이스 5곳 · 무브 7건. 가장 두껍다.
- AWARENESS: 4곳 · 6건
- TRUST: 4곳 · 11건. 무브 수는 가장 많다.
- CONVERSION: 4곳 · 7건
- RETENTION: 4곳 · 6건
- DISTRIBUTION: **3곳** · 6건. 가장 얇은 쪽이다.
- SUPPLY: **3곳** · 5건. 케이스 수와 무브 수 모두 가장 얇다.
- 갭 기준(0~1곳)에 걸린 병목은 없다. 다만 3곳인 병목은 케이스 1곳만 빠져도 매칭 불가선(2곳)에 가까워진다.

## 확인 못 한 것

- 어떤 병목·무브가 이미 발행됐는지는 원자료에 없다. 아래 후보는 병목 단위이고, 무브 단위 선정은 후보를 고르는 시점에 `case-match.mjs`로 해야 한다.
- 발행 글의 실제 조회수·지표는 `threads-report.mjs`를 돌리지 않아 보지 못했다.
- 위 두 번째 확인 대상(h168 누락)은 원인을 단정하지 않았다.

## 카드 후보

- SUPPLY 병목 무브 1개 (Fathom Analytics · Magic Spoon · Purple Innovation 중). 케이스 3곳 · 무브 5건으로 7개 병목 중 가장 얇아서, 지금 무브를 소진하면 바로 매칭 불가선에 닿는다.
- DISTRIBUTION 병목 무브 1개 (Figma · Testimonial.to · Zapier 중). 케이스 3곳 · 무브 6건으로 SUPPLY 다음으로 얇고, 소진 전에 발행 성과를 먼저 받아 두는 편이 안전하다.
- UNIT_ECONOMICS 병목 무브 1개 (5곳 · 7건 중). 후보 폭이 가장 넓어서 훅을 달리한 두 글을 나란히 비교하기 쉽다. 스냅샷이 있는 글이 8건으로 10건 기준에 못 미치므로 기준선 채우기가 목적이다.

(§0 절차: 보류·채점 불가 구분 → 두 달 지난 글의 h168 누락과 같은 값 0.0315를 개선점으로 발굴 → 성과 근거가 없어 커버리지·기준선 기준으로 후보를 정했다고 명시.)

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-08-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-08 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-08T23:41:55.760Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 29곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ⏭️ `angle` 앵글 선정 — 쓸 수 있는 승인 무브가 0건 (승인은 사람이 한다 — 루프의 실패가 아니다)
- ⏭️ `draft` 초안 작성 + 게이트 — 앵글 0건
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-11-08-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
