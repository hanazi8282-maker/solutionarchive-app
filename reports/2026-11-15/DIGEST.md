# CMO 데일리 다이제스트 2026-11-15

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 174시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 8건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-15

**결론:** 이번 판은 새로 채점된 것이 없다. 채점된 항목은 모두 보류라서, "이 훅이 먹힌다"는 결론은 낼 수 없다. 우선순위는 두 가지다. (1) h168 스냅샷이 안 잡히는 이유를 확인한다. (2) 기준선 표본이 4건 찰 때까지 발행 건수를 늘린다.

## 채점 결과 (예측 항목 7개 기준)

- **유효 0 / 무효 0 / 보류 3건(6항목) / 채점 불가 1건.** 보류를 성공이나 실패로 세지 않았다.
- LOG-20260906-01 보류: h168 스냅샷이 없어 확인 불가다. 대상은 like_rate와 share_rate 2항목이다.
- LOG-20260907-03 보류: 위와 같은 사유(h168 스냅샷 없음)이고, 대상은 share_rate와 like_rate 2항목이다.
- LOG-20260907-02 보류: 부트스트랩 구간이다. 기준선 표본이 0건이라(4건 미만은 채점 안 함) 판정이 불가하다. 대상은 reply_rate와 like_rate 2항목이다.
- LOG-20260907-01 채점 불가: 연결된 발행 글이 없다. 예측이 아니라 연결 문제다.
- 7항목 중 6항목은 위 보류 3건에서 확인된다. 나머지 1항목은 출력에 나오지 않아 위치를 확인하지 못했다. 채점 불가 엔트리의 항목일 가능성이 있으나 확정하지 못했다.

## 규칙 신뢰도

- C-12, G-4, G-8, H3, P-03, P-09: 모두 유효 0 / 무효 0 / 보류 1이다.
- Wilson 하한은 6개 모두 "-"이다. 규칙 근거로 쓸 수 있는 규칙이 없다.

## 이상 징후

- LOG-20260907-02에서 reply_rate와 like_rate의 실측값이 둘 다 0.0315로 같다. 우연일 수도 있지만 수집·계산 오류일 수도 있다. 어느 쪽인지는 이 원자료로 판단할 수 없다.
- 스냅샷 4건을 h1/h24/h168 창 밖의 조기·사후 1회성 관측(catchup)으로 제외했다. 그 글에 데이터가 없다는 뜻은 아니다.
- 실측 스냅샷은 14개(글 8건)이다. 그런데 h168 스냅샷이 없어 보류된 엔트리가 2건이다. 발행 시점이 아직 7일 전이 아니어서인지, 수집이 실패해서인지는 이 원자료로는 구분되지 않는다.

## 커버리지

- **매칭 가능 병목 7/7.** 케이스 0~1곳인 갭은 없다.
- 상대적으로 얇은 곳은 DISTRIBUTION(케이스 3곳·무브 6건)과 SUPPLY(케이스 3곳·무브 5건)이다. 최소 기준인 2곳은 넘지만 선택 폭이 좁다.
- AWARENESS는 케이스 4곳·무브 6건, RETENTION은 케이스 4곳·무브 6건이다.
- TRUST는 케이스 4곳·무브 11건으로 가장 두껍다. UNIT_ECONOMICS는 케이스 5곳·무브 7건이다.

## 확인 못 한 것

- h168 스냅샷이 없는 이유(시점 미도래인지 수집 실패인지)를 확인하지 못했다. 발행일과 수집 로그가 필요하다.
- 발행 누적이 10건 미만인지, `views < 100` 때문에 보류된 항목이 있는지는 원자료에 없다. `threads-report.mjs` 결과를 받지 못했다.
- 아래 앵글 후보를 구성할 때 무브별 상세와 과거 발행 이력도 보지 못했다. 후보는 성과 근거가 아니라 커버리지 균형에 근거한다.

## 다음 앵글 후보 (3개, 모두 커버리지 기준)

성과 데이터는 어떤 앵글이 먹히는지 말해 주지 않는다. 그래서 "기준선을 쌓을 앵글"을 골랐다. 구체 무브는 CMO가 승인 무브 목록에서 고른다.

1. SUPPLY (Magic Spoon, Fathom Analytics, Purple Innovation): 무브 5건으로 7개 병목 중 가장 적다. 발행 다양성을 확보하기에 좋다.
2. DISTRIBUTION (Figma, Testimonial.to, Zapier): 케이스 3곳으로 하한에 가깝다. 지금 발행해 두면 병목 간 비교 표본이 늘어난다.
3. RETENTION (AG1, Hims & Hers, Native, Superhuman): 케이스가 4곳이라 서로 다른 케이스에서 고를 수 있다. 앞의 두 병목과 함께 기준선 4건 확보에 기여한다.

## 카드 후보

- SUPPLY 병목 무브 1건 (Magic Spoon / Fathom Analytics / Purple Innovation 중 선택) — 무브가 5건뿐이라 먼저 발행해 기준선 표본을 늘린다
- DISTRIBUTION 병목 무브 1건 (Figma / Testimonial.to / Zapier 중 선택) — 케이스 3곳으로 얇은 병목이라 발행 다양성을 확보한다
- RETENTION 병목 무브 1건 (AG1 / Hims & Hers / Native / Superhuman 중 선택) — 기준선 표본 4건(채점 문턱)에 기여하고 병목 간 비교 표본을 늘린다

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-15-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-15 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-15T23:58:09.283Z)
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
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: -seed-funded-devtool-consulting-drift-pro-business-price-cliff-growth-miss-wind-down-41a100b7ffb4816ca17cd02c9d65a739 ⏭️ 발굴 — 채택·확인불가 0건 (후보 6건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-16-CMO 기록·재확인

_실행 키 `cmo-2026-11-15-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
