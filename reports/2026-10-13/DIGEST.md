# CMO 데일리 다이제스트 2026-10-13

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

# 성과 해설 — 2026-10-13

## 결론
- **채점할 수 있는 규칙 근거가 아직 없다.** 유효 0 / 무효 0 / 보류 6, 별도로 채점 불가 1이다. 어떤 훅이나 규칙도 "먹힌다/안 먹힌다"고 말할 수 없다.
- **09-06, 09-07 글의 h168 스냅샷이 한 달 넘게 비어 있다.** 7일 창은 09-13~14에 닫혔어야 하는데 오늘이 10-13이다. 수집 실패 가능성이 커서 CTO가 확인해야 한다.
- **커버리지는 갭이 없다.** 앵글은 성과가 아니라 커버리지 기준으로만 고를 수 있다.

## 채점 (예측 항목 7개, 엔트리 4개)
- **유효 0 / 무효 0.** 판정이 난 항목이 없다.
- **보류 6 (표본 부족), 엔트리 3개.**
  - LOG-20260906-01: like_rate, share_rate 2항목 — h168 스냅샷 없음.
  - LOG-20260907-03: share_rate, like_rate 2항목 — h168 스냅샷 없음.
  - LOG-20260907-02: reply_rate, like_rate 2항목 — 기준선 표본 0건, 부트스트랩 구간(4건 미만은 채점하지 않음).
- **채점 불가 1 (확인 불가).** LOG-20260907-01은 연결된 발행 글이 없다. 이건 0건이 아니라 확인 불가이고, 보류 6에도 합치지 않았다.
- **규칙별 신뢰도는 모두 빈칸이다.** C-12, G-4, G-8, H3, P-03, P-09는 각각 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 "-"이다. 분모가 0이라 신뢰도를 말할 수 없다.
- **표본 규모.** 실측 스냅샷은 14개, post는 8건이다. 명목 창과 안 맞아 뺀 조기·사후 스냅샷은 4건이다. 이 8건 중 채점 가능한 글은 없다.

## 의심할 점
- **LOG-20260907-02의 실측값이 두 지표에서 똑같이 0.0315이다.** reply_rate와 like_rate가 같다. 우연일 수 있지만 지표 매핑 오류일 수도 있다. 원자료만으로는 어느 쪽인지 알 수 없어 확인 불가로 둔다. 기준선이 생겨 채점 가능해지기 전에 한 번 확인할 만하다.
- **"아직 그 시점이 안 됐다"는 설명은 이 두 날짜에 맞지 않는다.** 09-06, 09-07 글은 h168이 이미 지났다. 따라서 수집 실패(collect-metrics가 놓침)일 가능성이 높다. 다만 원자료에는 사유가 없어 단정하지 않는다.

## 커버리지 갭
- **매칭 가능 병목 7/7.** 케이스가 0곳이거나 1곳인 병목은 없다.
- **가장 얇은 병목은 DISTRIBUTION과 SUPPLY이다.** 둘 다 케이스 3곳이고, 최소 기준 2곳과 1곳 차이다. 무브는 각각 6건, 5건이다.
- **UNIT_ECONOMICS가 가장 두텁다.** 케이스 5곳, 무브 7건이다.
- 이 숫자는 승인된 케이스 수다. 성과가 검증됐다는 뜻이 아니다.

## 다음 앵글 후보
무브 ID가 원자료에 없어서 무브 단위로 지정하지 못했다. 병목과 케이스 단위로 적는다.
- **SUPPLY (Fathom Analytics, Magic Spoon, Purple Innovation)** — 무브가 5건으로 7개 병목 중 가장 적다. 이 병목이 약해지면 제일 먼저 매칭이 막힌다.
- **DISTRIBUTION (Figma, Testimonial.to, Zapier)** — 케이스 3곳이라 두꺼운 병목보다 앵글을 하나 더 쓰는 값이 크다. 같은 병목에서 훅을 바꿔 짝으로 내면 나중에 비교할 근거도 생긴다.
- **RETENTION (AG1, Hims & Hers, Native, Superhuman)** — 4곳에 무브 6건이다. 셋째 후보라는 근거는 약하다. 다만 지금 채점이 막힌 이유가 앵글 부족이 아니라 발행 누적과 h168 수집이라서, 병목을 넓게 돌려 발행 수를 늘리는 쪽이 낫다.

## 확인하지 못한 것
- **발행 누적 건수.** 원자료에 없다. 스냅샷이 있는 글이 8건이라 10건 미만일 가능성이 크지만, 단정하지 않는다.
- **LOG-20260907-01의 예측 항목 수.** 7개 중 6개가 위 3개 엔트리에 있으니 이 엔트리는 1개로 보이지만, 로그에 직접 적혀 있지 않다.
- **h168이 빈 이유.** 수집 실패인지, 글이 다른 id로 연결됐는지 알 수 없다. DB 접근이 없어 못 본다.
- **규칙 ID가 어느 엔트리·항목에 붙었는지.** 원자료에 매핑이 없다.
- **위 후보 병목의 무브 단위 성과.** 커버리지 출력에는 성과가 없다.

## 진행 판단 절차 (`_principles.md` §0)
- **검토한 것:** 보류와 확인 불가를 분리했는지, 부트스트랩 구간 판정을 규칙 근거로 쓰지 않았는지, 갭 기준(케이스 2곳 이상)을 적용했는지.
- **찾은 개선점:** (1) 보류 6을 채점 불가 1과 분리했다. (2) 09-06/07 글의 h168 누락이 "아직 시점이 안 됨"이 아님을 짚었다. (3) 같은 값 0.0315 이중 출현을 의심 항목으로 올렸다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-13-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-13 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-13T23:43:41.404Z)
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

_실행 키 `cmo-2026-10-13-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
