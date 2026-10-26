# CMO 데일리 다이제스트 2026-10-26

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 2026-10-26 성과 해설

**결론:** 지금은 성과로 규칙의 유효·무효를 판정할 수 없다. 채점된 예측은 전부 보류이고, 유효·무효 근거는 0건이다. 커버리지는 7/7이라 앵글 선택을 막는 갭은 없다. 병목은 앵글이 아니라 h168 실측 데이터 부재다.

## 채점 (예측 항목 7개 / 엔트리 4개)
- **유효 0 / 무효 0** (판정 근거 없음)
- **보류 6항목 (표본 부족, 엔트리 3개).** 사유는 아래 두 가지다.
  - 0906-01, 0907-03은 4항목 모두 h168 스냅샷이 없어 확인 불가다. 아직 그 시점이 안 됐거나 수집이 실패한 것이다.
  - 0907-02는 2항목 모두 부트스트랩 구간이다. 기준선 표본이 0건이고 최소 4건이 필요하다.
- **채점 불가 1건.** 0907-01은 연결된 발행 글이 없다. 이것도 0건이 아니라 확인 불가다.
- 항목 수 7은 로그 요약의 "예측 항목 7개"에서 가져왔다. 채점 불가 엔트리의 항목 수는 원자료에 없어 6항목 + 나머지 1로 추정했다.
- 스냅샷은 post 8건, 14개다. 8건은 발행 10건 미만이라 부트스트랩 구간이다. 이 구간의 판정은 규칙 근거로 쓰지 않는다.
- 스냅샷 4건은 h1/h24/h168 창과 나이가 안 맞아 채점에서 빠졌다. 조기·사후 1회성 관측이다. 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 계산 불가다.
- 6개 규칙 어느 것도 "먹힌다"거나 "안 먹힌다"고 말할 수 없다.
- 규칙마다 n=1(보류)이라 표본이 쌓이기 전에는 규칙 수정·폐기 근거로 쓰지 않는다.

## 커버리지: 매칭 가능 7/7, 갭 없음
- 서로 다른 케이스 2곳 이상이라는 기준에서 0/1곳인 병목은 없다.
- 얇은 병목은 DISTRIBUTION(케이스 3곳, 무브 6건)과 SUPPLY(케이스 3곳, 무브 5건)다. 케이스 1곳이 빠지면 2곳이 되므로 여유가 가장 작다.
- 가장 두터운 병목은 TRUST(케이스 4곳, 무브 11건)와 UNIT_ECONOMICS(케이스 5곳, 무브 7건)다.
- 이 커버리지는 승인된 케이스의 재고일 뿐이고 성과와는 무관하다.

## 다음 앵글 후보 (병목 단위)
원자료에 무브 내용이 없어서 무브 단위로는 못 고른다. 어떤 병목이 이미 발행됐는지도 원자료에 없다. 겹침 확인은 CMO가 한다.
1. **SUPPLY (Fathom Analytics, Magic Spoon, Purple Innovation 중).** 재고가 가장 얇은 편이라, 케이스 3곳 중 앵글로 쓸 케이스를 정하면 이후 조사 우선순위가 정해진다. 지금 발행하면 성과와 별개로 얇은 병목의 소진 속도를 먼저 확인할 수 있다.
2. **TRUST (무브 11건).** 재고가 가장 많아 서로 다른 케이스(Everlane, Ritual, Seed Health, Tuft & Needle)로 같은 병목을 반복 발행할 수 있다. 그러면 병목을 고정한 채 훅·규칙만 바꾸는 비교가 가능해진다. 보류만 쌓이는 지금 가장 필요한 것이 비교 가능한 n이다.
3. **DISTRIBUTION (Figma, Testimonial.to, Zapier).** 병목 중 케이스가 가장 적은 층이다. 후보 1과 같은 이유로 소진 전에 한 건 확보해 둘 만하다. 단 후보 1과 같은 주에 둘 다 쓸지는 CMO 판단이다.

## 확인 못 한 것
- **0907-02의 reply_rate와 like_rate 실측이 같은 0.0315다.** 우연인지 지표 매핑 오류인지 원자료로 알 수 없다. 이 값은 근거로 쓰지 않고 `score-predictions` 의 지표 계산을 점검해야 한다.
- 어느 발행 글이 어느 병목·무브에서 나왔는지는 원자료에 없다. 그래서 병목별 성과는 계산하지 못했다.
- h168 스냅샷이 없는 사유는 "아직 안 됐다"와 "수집 실패"를 원자료로 구분할 수 없다. 0906-01은 날짜상 h168이 한참 지났을 가능성이 있다. `collect-metrics` 의 수집 이력을 확인해야 한다.
- 0907-01에 발행 글이 연결되지 않은 이유(미발행인지 연결 누락인지)도 확인하지 못했다.

## 검토 근거 (_principles §0)
- 이번 판단에서 점검한 것은 "보류를 성공·실패로 세지 않기"와 "0건과 확인 불가 구분"이다.
- 이 점검에서 찾은 개선점은 두 가지다. 같은 값 0.0315에 대한 의심과, 채점 불가 엔트리의 항목 수를 추정한 사실이다. 둘 다 위에 표시했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-26-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-26 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-26T23:51:16.977Z)
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

_실행 키 `cmo-2026-10-26-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
