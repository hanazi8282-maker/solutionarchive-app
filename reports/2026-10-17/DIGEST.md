# CMO 데일리 다이제스트 2026-10-17

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

# 성과 해설 — 2026-10-17

- **지금 할 일:** 채점할 수 있는 건이 0건이라 규칙 판단은 보류한다. 새 앵글은 커버리지가 아니라 측정 표본을 늘리는 쪽으로 고른다.
- **확인할 것:** LOG-20260907-02 의 `reply_rate` 와 `like_rate` 실측이 둘 다 0.0315 로 같다. 우연인지 집계 오류인지 확인이 필요하다.
- **연결 누락:** LOG-20260907-01 은 연결된 발행 글이 없어 채점이 불가능하다. 연결 누락인지 미발행인지 확인한다.

## 채점 결과

- **유효 0 / 무효 0 / 보류 6.** 채점 대상은 엔트리 3개의 예측 항목 6개다. 판정 로그는 23개이고 그중 예측이 달린 것은 4개다.
- 보류 6건 중 4건은 h168 스냅샷이 없는 경우다 (LOG-20260906-01, LOG-20260907-03 각 2건). 아직 그 시점이 안 됐거나 수집이 실패했는지 이 출력만으로는 구분되지 않는다.
- 나머지 2건은 LOG-20260907-02 의 부트스트랩 구간 보류다. 기준선 표본이 0건이라 4건 미만으로 채점하지 않았다.
- **채점 불가 1건 (보류와 별개):** LOG-20260907-01 은 연결된 발행 글이 없다.
- 예측 항목은 7개인데 채점 대상 6개와 채점 불가 엔트리 1개의 항목 수를 맞추면 1개가 남는다. 이 항목은 채점 불가 엔트리에 있는 것으로 보이지만, 출력에 직접 적혀 있지 않아 추정이다.
- 실측 스냅샷은 14개 (글 8건)다. 그중 4건은 h1/h24/h168 창과 안 맞는 1회성 관측(`catchup`)이라 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도

- 규칙 6개(C-12, G-4, G-8, H3, P-03, P-09)가 모두 유효 0 / 무효 0 / 보류 1 이고, Wilson 하한은 계산되지 않았다.
- 어느 규칙도 "먹힌다"거나 "안 먹힌다"고 말할 근거가 없다. 표본 n=0 이다.
- LOG-20260907-02 의 실측값(0.0315)은 부트스트랩 구간이라 규칙 근거로 쓰지 않는다.

## 커버리지

- **매칭 가능 병목 7/7.** 케이스 0~1곳인 갭은 없다.
- 가장 얇은 병목은 DISTRIBUTION (케이스 3곳 · 무브 6건)과 SUPPLY (케이스 3곳 · 무브 5건)다. 매칭 최소선 2곳보다는 위다.
- 무브가 가장 적은 병목은 SUPPLY (5건)다. 가장 두꺼운 병목은 TRUST (케이스 4곳 · 무브 11건)다.
- 나머지는 AWARENESS 4곳·6건, CONVERSION 4곳·7건, RETENTION 4곳·6건, UNIT_ECONOMICS 5곳·7건이다.
- 이 출력에는 무브 이름이 없어 무브 단위 후보를 직접 지목하지 못한다. 아래는 병목 단위 후보이고, 무브 선정은 CMO 가 `case-match.mjs` 결과로 한다.

## 다음 앵글 후보

- **SUPPLY (무브 5건으로 가장 적음).** 지금 쓰면 소진이 가장 빠른 병목이라, 케이스 보충 조사와 함께 진행하는 편이 안전하다.
- **DISTRIBUTION (케이스 3곳).** 케이스가 3곳뿐이라 같은 케이스를 반복 인용하기 쉽다. 발행 전에 어느 케이스를 쓸지 분산해서 고른다.
- **TRUST (무브 11건으로 가장 많음).** 선택지가 충분해 예측 6필드를 달아 발행하기 가장 쉽다. 규칙 표본이 0이므로 한 번에 검증할 규칙 수를 줄여 예측을 달면 표본이 빨리 쌓인다.

## 확인 못 한 것

- h168 스냅샷이 없는 이유(시점 미도래인지 수집 실패인지). 이 출력만으로는 구분할 수 없다.
- `reply_rate` 와 `like_rate` 가 같은 값인 이유.
- LOG-20260907-01 에 발행 글이 없는 이유와, 예측 7번째 항목의 소속.
- 발행 누적 건수. 출력에 없어 부트스트랩 구간(10건 미만)을 벗어났는지 판단하지 못했다. `threads-report.mjs` 결과가 필요하다.
- 판정 로그 23개 중 예측이 없는 19개의 성격.

## 검토 절차

- 채점 가능 건수가 0이라 유효/무효 수치를 채우려 하지 않고 보류로 분리했다.
- 커버리지에 갭이 없다는 점을 근거로 앵글 선정 기준을 커버리지에서 측정 표본 확보로 바꿨다.
- 같은 실측값 중복이라는 이상 신호를 찾아 확인 항목에 올렸다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-17-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-17 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-17T22:16:32.895Z)
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

_실행 키 `cmo-2026-10-17-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
