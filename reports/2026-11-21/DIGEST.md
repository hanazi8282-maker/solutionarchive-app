# CMO 데일리 다이제스트 2026-11-21

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 7건(가장 오래된 것 319시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 4건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 2026-11-21 성과 해설

**지금 할 일:** 채점된 글이 0건이라 어느 훅이 먹히는지는 아직 모른다. 앵글은 성과가 아니라 커버리지 얇은 곳(SUPPLY, DISTRIBUTION)을 기준으로 고른다. 그리고 예측이 달린 글이 h168 스냅샷에 도달하는지부터 확인한다.

## 채점 (score-predictions)
- **유효 0 / 무효 0 / 보류 3 / 채점 불가 1.** 단위는 엔트리다. 판정 로그는 23개이고 예측이 달린 것은 4개다.
- 항목 단위로는 예측 7개 중 6개가 보류이고 1개가 채점 불가다. 둘 다 확인 불가로 센다.
- **보류 사유 ①, 스냅샷 없음.** LOG-20260906-01과 LOG-20260907-03 두 엔트리, 4항목이다. h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집이 실패한 것이고, 원자료로는 둘을 구분할 수 없다.
- **보류 사유 ②, 부트스트랩.** LOG-20260907-02 한 엔트리, 2항목이다. 기준선 표본이 0건이라 채점하지 않는다(4건 미만은 채점하지 않는다).
- **채점 불가:** LOG-20260907-01은 연결된 발행 글이 없다. 0점이 아니라 확인 불가다.
- **규칙별 신뢰도는 전부 판단 불가.** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다. 이 판정을 규칙 근거로 쓰지 않는다.
- **이상한 점 하나.** LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 같다. 우연일 수 있고 집계 오류일 수도 있다. 원자료만으로는 판단할 수 없고, 기준선도 없어서 어느 쪽이든 결론에 쓰지 않는다.
- **제외된 스냅샷 4건.** h1/h24/h168 창과 안 맞는 'catchup' 관측이다. 그 글에 데이터가 없다는 뜻은 아니다. 남은 실측은 14개(post 8건)다.
- **확인 못 한 것.** 발행 누적 건수는 원자료에 없다. 부트스트랩 구간(10건 미만)이 끝났는지는 확인 불가다. `threads-report.mjs`는 이번 원자료에 없어서 보지 못했다.

## 커버리지 (case-match --coverage)
- **매칭 가능 병목 7/7.** 케이스 0~1곳인 갭은 없다.
- **가장 얇은 곳은 SUPPLY와 DISTRIBUTION이다.** 둘 다 케이스 3곳이다. 매칭 최소선(2곳)은 넘었지만 여유는 1곳뿐이다.
  - SUPPLY: 무브 5건 (Fathom Analytics, Magic Spoon, Purple Innovation)
  - DISTRIBUTION: 무브 6건 (Figma, Testimonial.to, Zapier)
- AWARENESS(4곳·6건)와 RETENTION(4곳·6건)도 무브 수는 얇은 편이다.
- 가장 두꺼운 곳은 TRUST(4곳·11건)와 UNIT_ECONOMICS(5곳·7건)다.

## 다음 앵글 후보
- 원자료에는 무브 단위 내용이 없다. 아래는 병목 단위 후보이고, 무브 선정은 `case-match`로 한다.
- 성과 데이터가 0건이라 "무엇이 먹히나"를 근거로 한 선정은 불가능하다. 그래서 커버리지와 측정 가능성으로 골랐다.

## 카드 후보
- SUPPLY 병목에서 Fathom / Magic Spoon / Purple 중 무브 1개 — 케이스 3곳·무브 5건으로 7개 병목 중 무브 수가 가장 적다. 지금 한 편 쓰면 매칭 여유 1곳을 안 줄이고 신호를 얻는다.
- DISTRIBUTION 병목에서 Figma / Testimonial.to / Zapier 중 무브 1개 — 케이스 3곳으로 얇다. 유통은 SUPPLY와 달리 반응이 빨리 보이는 주제라 h168 데이터 확보에 유리할 수 있다. 다만 이 유리함은 원자료 근거가 아니라 가설이다.
- TRUST 병목(무브 11건)의 무브 1개를 예측 6필드 포함으로 발행 — 선택지가 가장 많아 반복 비교에 쓸 수 있다. 보류 6항목이 쌓여 있어, 새 글은 h168까지 스냅샷이 잡히는지 확인하는 용도로 쓴다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-21-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-21 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-22T00:19:32.390Z)
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

_실행 키 `cmo-2026-11-21-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
