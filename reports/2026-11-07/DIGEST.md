# CMO 데일리 다이제스트 2026-11-07

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 245시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 6건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-11-07

**결론:** 채점으로 확정된 규칙은 아직 없다. 유효 0 · 무효 0이고 전부 보류다. 이번 주에 할 일은 표본을 쌓는 것이다. 커버리지는 7/7이라 막히지 않았다.

## 채점 (score-predictions)
- **유효 0 / 무효 0 / 보류 6 (표본 부족)** — 예측 항목 7개 중 6개를 채점하려 했고 전부 보류다. 판정 로그 엔트리 23개 중 예측이 달린 것은 4개다.
- 보류 사유 A, 4항목: 엔트리 3개(LOG-20260906-01, LOG-20260907-03 각 2항목)의 h168 스냅샷이 없다. 그 시점이 아직 안 됐거나 수집이 실패한 것이다. 어느 쪽인지 이 출력만으로는 가를 수 없다. 확인 불가다.
- 보류 사유 B, 2항목: LOG-20260907-02는 부트스트랩 구간이다. 기준선 표본이 0건이고, 4건 미만이면 채점하지 않는다.
- **채점 불가 1건:** LOG-20260907-01은 연결된 발행 글이 없어 7번째 항목이 여기 속한다. 0건이 아니라 확인 불가다.
- 규칙별 신뢰도: C-12 · G-4 · G-8 · H3 · P-03 · P-09가 각각 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않는다. 어느 규칙도 "먹힌다/안 먹힌다"의 근거가 없다.
- 확인 대상: LOG-20260907-02에서 reply_rate와 like_rate의 실측이 둘 다 0.0315로 똑같다. 우연일 수도 있지만, 지표가 같은 값으로 채워졌을 가능성이 있어 원 스냅샷 확인이 필요하다. 이 출력만으로는 판단할 수 없다.
- 제외된 스냅샷 4건은 h1/h24/h168 창에 안 맞는 조기·사후 1회성 관측(catchup)이다. 그 글에 데이터가 없다는 뜻이 아니다. 실측 스냅샷은 14개(post 8건)다.

## 커버리지 (case-match --coverage)
- **매칭 가능 병목 7/7.** 케이스 0~1곳인 갭 병목은 없다.
- 가장 얕은 곳: DISTRIBUTION은 케이스 3곳 · 무브 6건이다. SUPPLY는 케이스 3곳 · 무브 5건으로 무브가 가장 적다.
- 중간: AWARENESS는 케이스 4곳 · 무브 6건이고, CONVERSION은 케이스 4곳 · 무브 7건이다. RETENTION은 케이스 4곳 · 무브 6건이다.
- 가장 두터운 곳: TRUST는 케이스 4곳 · 무브 11건, UNIT_ECONOMICS는 케이스 5곳 · 무브 7건이다.
- 이 커버리지는 승인된 케이스·무브의 수일 뿐이다. 어느 병목이 성과가 좋은지는 보여주지 않는다.

## 확인 못 한 것
- 발행 누적 건수와 `views` 분포: `threads-report.mjs`를 이번 원자료에서 받지 못했다. 발행 10건 미만인지, 부트스트랩 구간에서 벗어났는지 확인 불가다.
- 후보 무브의 개별 ID와 규칙 연결: 원자료에 케이스명만 있다. 아래 후보는 병목·케이스 단위이고, 무브 단위 선정은 CMO가 `case-match`로 한다.
- h168 스냅샷 누락의 원인: 아직 시점 전인지 수집 실패인지 구분할 수 없다.

## 진행 판단 근거 (_principles §0)
- 검토한 것: 보류를 실패·성공으로 접지 않았는지, 부트스트랩 판정을 규칙 근거로 쓰지 않았는지, 갭 정의가 케이스 2곳 이상인지.
- 개선한 것: 처음엔 "갭 없음"으로 끝내려 했다. 그러나 3곳짜리 병목은 케이스 하나만 탈락해도 매칭이 깨지는 경계라서 후보 선정에 반영했다.

## 카드 후보
- SUPPLY 무브 1개 (Magic Spoon · Fathom Analytics · Purple Innovation 중) — 무브 5건으로 7개 병목 중 가장 얕고 케이스가 3곳뿐이라, 지금 발행해 두면 이후 매칭 여유와 첫 성과 표본을 함께 얻는다.
- DISTRIBUTION 무브 1개 (Zapier · Figma · Testimonial.to 중) — 케이스 3곳이라 하나만 빠져도 매칭이 깨지는 경계다. 발행 이력이 쌓이기 시작했으니 이 병목의 반응을 일찍 본다.
- TRUST 무브 1개 (무브 11건 풀에서) — 기준선 표본이 0건이라 채점이 막혀 있다. 선택지가 가장 넓은 병목에서 예측을 단 글을 빨리 늘려야 기준선 4건을 채워 보류를 풀 수 있다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-07-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-07 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-07T23:38:39.356Z)
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
- ℹ️ Notion 푸시: //app.notion.com/p/CASE-checkout-x-shopify-api-lockout-platform-dependency-wind-down-411100b7ffb4813c9896ff4aede742c1 ⏭️ 발굴 — 채택·확인불가 0건 (후보 6건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 2건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-08-CMO 기록·재확인

_실행 키 `cmo-2026-11-07-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
