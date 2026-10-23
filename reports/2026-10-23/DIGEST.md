# CMO 데일리 다이제스트 2026-10-23

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 1건.
2. 막힌 단계 없음.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 1건
- 스테이징(staged): 1건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

# 성과 해설 — 2026-10-23

**결론: 이번 원자료로는 "어떤 훅이 먹힌다/안 먹힌다"를 말할 수 없다.** 채점 가능한 예측이 0건이다. 앵글은 성과가 아니라 커버리지 근거로만 고른다. 사람이 할 일은 `LOG-20260907-01` 에 발행 글을 연결하는 것 하나다.

## 채점 (예측 항목 7개, 엔트리 4개)
- **유효 0 / 무효 0.** 채점이 성립한 항목이 없다.
- **보류 6항목 (엔트리 3개).** 표본 부족이나 시점 미도래 때문이고 실패도 성공도 아니다.
  - `LOG-20260906-01` (2항목)과 `LOG-20260907-03` (2항목)은 h168 스냅샷이 없다. 아직 시점이 안 됐거나 수집에 실패한 것이고, 둘 중 어느 쪽인지는 이 원자료로 못 가른다.
  - `LOG-20260907-02` (2항목)는 부트스트랩 구간이다. 기준선 표본이 0건이라 채점하지 않는다(4건 미만이면 채점 안 함). 참고값으로도 쓰지 않는다.
- **채점 불가 1엔트리.** `LOG-20260907-01` 은 연결된 발행 글이 없다. 0점이 아니라 확인 불가다.
- **규칙 신뢰도.** C-12, G-4, G-8, H3, P-03, P-09 가 각각 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 전부 계산 불가다. 규칙 근거로 쓸 수 있는 규칙은 없다.
- **제외된 스냅샷 4건.** 명목 창(h1/h24/h168)과 나이가 안 맞는 조기·사후 관측이다. 그 글에 데이터가 없다는 뜻이 아니다.
- **스냅샷 규모.** 실측 스냅샷은 14개(post 8건)다.

## 확인 대상 (안전장치가 걸린 것)
- `LOG-20260907-02` 는 reply_rate 와 like_rate 의 실측이 둘 다 0.0315로 똑같다. 우연일 수도 있지만, 지표 매핑이 같은 값을 읽고 있을 가능성도 있다. 원본 스냅샷을 열어 확인해야 한다. 지금은 어느 쪽이라고 결론 내지 않는다.
- h168 스냅샷 없음 4항목이 "아직 안 됨"인지 "수집 실패"인지 구분이 안 된다. 발행 시각 대비 경과 시간을 보면 갈린다. 이 원자료에는 발행 시각이 없다.

## 커버리지
- **매칭 가능 병목 7/7.** 케이스 2곳 미만인 갭은 없다.
- **얇은 곳 (갭은 아님).** DISTRIBUTION 은 케이스 3곳·무브 6건, SUPPLY 는 케이스 3곳·무브 5건이다. SUPPLY 의 무브 수가 가장 적다.
- **두터운 곳.** UNIT_ECONOMICS 는 케이스 5곳·무브 7건이다. 오늘 초안(`bannerbear-price-floor-unit-economics`)도 이 병목이다. 이 근거는 git status 의 파일명뿐이고 내용은 읽지 않았다.

## 다음 앵글 후보
무브 이름은 이 원자료에 없어서 병목 단위로만 적는다. 무브 단위 선택은 `case-match.mjs` 출력이 필요하다.
- **DISTRIBUTION** — 케이스 3곳으로 7개 중 가장 얇은 축에 속한다. 승인 전 초안(`fieldbook-freemium-...acquihire`)이 이미 같은 병목에 있어서, 승인되면 4곳째가 된다.
- **SUPPLY** — 무브 5건으로 7개 병목 중 가장 적다. 케이스 3곳이라 매칭은 성립하지만 고를 폭이 좁다.
- **AWARENESS** — 케이스 4곳·무브 6건으로, 4곳짜리 병목 중 무브가 가장 적다. 앞의 둘과 달리 성과 근거가 없는 순수 커버리지 기준 선택이다.

## 확인 못 한 것
- 발행 글별 views 와 발행 시각. 원자료에 없다.
- 각 예측 항목의 임계값과 기준선 정의.
- 위 후보 병목의 무브 단위 목록.

**검토 절차(원칙 §0).** 개선점으로 두 가지를 찾아 반영했다. 하나는 같은 값(0.0315)이 두 지표에 나온 점이고, 다른 하나는 앵글 근거가 커버리지뿐이라는 한계를 후보 3번에 명시한 것이다.

## 다음 주 주목 지표

- `like_rate` — bannerbear-price-floor-unit-economics (이번에 스테이징한 초안의 예측)
- `reply_rate` — bannerbear-price-floor-unit-economics (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-10-23-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-23 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-23T23:07:23.670Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 28곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":0,"transferability_unrated":0})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-23-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
