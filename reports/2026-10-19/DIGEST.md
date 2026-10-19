# CMO 데일리 다이제스트 2026-10-19

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 0건 · 적립 0건 · 초안 0건.
2. 막힌 단계 없음.
3. 실패한 단계 2개 — 사람이 봐야 한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 0건
- 적립(committed): 0건
- 초안(drafted): 0건
- 스테이징(staged): 0건
- 막힘(blocked): 0단계
- 실패(failed): 2단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- ❌ `research` 조사 ({"attempted":1,"new_drafts":0}) — 미정 (SaaS · 실패/피벗/철수 사례): exit 1 [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ❌ `draft` 초안 작성 + 게이트 ({"drafted":0}) — bannerbear-price-floor-unit-economics/PRICING: exit 1

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

_이번 실행은 해설을 생성하지 못했다 — analyst exit 1. 원자료: reports/2026-10-19/performance.md_

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-19-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-19 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-19T23:37:27.750Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ❌ `research` 조사 ({"attempted":1,"new_drafts":0}) — 미정 (SaaS · 실패/피벗/철수 사례): exit 1 [claude-code:unrecognized_model] {"model":"claude-sonnet-5-5","query_source":"sdk"}
- ⏭️ `commit_cases` 케이스 적립 — 새 초안 0건
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":0,"queue_failed":1,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 28곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":0,"transferability_unrated":0})
- ❌ `draft` 초안 작성 + 게이트 ({"drafted":0}) — bannerbear-price-floor-unit-economics/PRICING: exit 1
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"raw_only":1})

_실행 키 `cmo-2026-10-19-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
