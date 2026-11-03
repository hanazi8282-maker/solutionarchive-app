# CMO 데일리 다이제스트 2026-11-02

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 127시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-02

- **지금 할 일:** 이번 주기에는 유효·무효로 확정된 채점이 0건이다. 규칙 신뢰도를 판단할 수 없으니, 훅이 먹힌다거나 안 먹힌다는 결론은 내지 않는다.
- **먼저 볼 것:** h168 스냅샷이 없는 이유다. 수집 실패인지 시점 불일치인지 CTO 쪽 확인이 필요하다.
- **커버리지:** 갭은 없다. 병목 7개 전부 서로 다른 케이스 2곳 이상으로 매칭이 가능하다.

## 채점 (score-predictions)

- **유효 0 / 무효 0 / 보류(표본 부족) 6항목.** 판정 로그 23개 중 예측이 달린 것은 4개, 예측 항목은 7개다. 보류 6항목은 엔트리 3개에서 나왔다(LOG-20260906-01, 0907-02, 0907-03).
- **채점 불가(확인 불가) 1엔트리.** LOG-20260907-01은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다. 이 엔트리가 7번째 항목을 가진 것으로 보이지만, 원자료에 항목 수가 직접 적혀 있지는 않다.
- **h168 스냅샷 없음, 4항목.** LOG-20260906-01과 0907-03(각 n=2 항목)은 h168 스냅샷이 없어 보류됐다.
  - 엔트리 번호가 9월 초이고 오늘이 11월 2일이니, 아직 그 시점이 안 된 것은 아닐 가능성이 크다. 다만 번호의 날짜가 실제 발행일인지는 원자료로 확인할 수 없다.
  - 시점 문제가 아니라 수집 실패라면 §7.1의 "확인 불가"로 계속 쌓이는 상태다. 확인 대상이다.
- **부트스트랩 구간, 2항목.** LOG-20260907-02는 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 실측값 reply_rate 0.0315는 참고값이고, 규칙 근거로 쓰지 않는다.
- **같은 값 의심.** 같은 엔트리에서 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다. 우연일 수 있지만, 지표 계산이나 매핑 오류일 가능성도 배제할 수 없다. 확인 불가로 두고 CTO에 점검을 넘긴다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다. 여섯 규칙 모두 판단 근거가 없다.
- **표본 규모:** 실측 스냅샷은 14개, 글은 8건이다. 명목 창(h1/h24/h168)과 안 맞는 조기·사후 1회성 스냅샷 4건은 제외됐다. 그 글에 데이터가 없다는 뜻은 아니다.
- **발행 총수는 원자료에 없다.** 스냅샷이 있는 글이 8건이라 10건 기준에 못 미치는 것으로 보이지만, 발행 총수로 확인한 것은 아니다.

## 커버리지 (case-match --coverage)

- **매칭 가능 병목 7/7.** 0·1곳 갭은 없다.
- **가장 얇은 병목:** DISTRIBUTION은 3곳·6무브(Figma, Testimonial.to, Zapier)다. SUPPLY는 3곳·5무브(Fathom Analytics, Magic Spoon, Purple Innovation)다. 둘 다 최소 기준(2곳)보다 1곳 많을 뿐이다.
- **그 외:**
  - AWARENESS 4곳·6무브
  - TRUST 4곳·11무브
  - CONVERSION 4곳·7무브
  - RETENTION 4곳·6무브
  - UNIT_ECONOMICS 5곳·7무브
- **수치의 의미:** 위 수치는 승인된 케이스 기준이며, 글이 얼마나 나갔는지와는 무관하다.

## 확인 못 한 것

- **무브 단위 목록.** 무브 내용과 개별 무브 ID가 원자료에 없다. 그래서 앵글 후보는 병목·케이스 단위로 적는다. 무브 확정은 CMO가 목록을 보고 한다.
- **h168 스냅샷 부재의 원인.** 수집 실패인지 시점 문제인지 이 원자료로는 가르지 못한다.
- **0.0315 중복의 원인.** 위에 적은 대로 확인 불가다.
- **threads-report.** 이번 호출에서 실행하지 않아 발행 지표 요약은 없다.

## 점검 기록

- **검토한 것:** 보류와 확인 불가를 분리했고, 부트스트랩 값은 규칙 근거에서 뺐다.
- **개선한 것:** "아직 시점이 안 됐다"는 기본 해석을 버렸다. 9월 초 엔트리가 11월 현재까지 h168이 없다는 점을 이상 신호로 올렸다.

## 카드 후보

- TRUST (무브 11건·케이스 4곳, Everlane/Ritual/Seed Health/Tuft & Needle) — 선택지가 가장 많아 예측이 달린 글을 새로 쌓기 쉽다. 채점 유효 건이 0인 지금은 표본 확보가 먼저다.
- DISTRIBUTION (케이스 3곳, Figma/Testimonial.to/Zapier) — 커버리지가 가장 얇은 축이다. 이 축의 첫 글이 규칙 검증에도 쓰이도록 예측 항목을 규칙별로 분산해서 단다.
- SUPPLY (케이스 3곳·5무브, Fathom/Magic Spoon/Purple Innovation) — 5무브로 병목 중 무브가 가장 적다. 쓸 수 있는 무브가 소진되기 전에 앞서 쓰면서, 같은 규칙을 서로 다른 병목에서 비교 검증하는 근거를 만든다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-02-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-02 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-03T02:16:34.212Z)
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

_실행 키 `cmo-2026-11-02-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
