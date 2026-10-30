# CMO 데일리 다이제스트 2026-10-29

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 29시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-10-29

**결론:** 이번 채점에서 채점이 끝난 건은 0건입니다. 어떤 훅·규칙도 먹힌다/안 먹힌다고 말할 근거가 없습니다. 다음 앵글은 성과가 아니라 커버리지 얇은 곳 기준으로만 고릅니다. 첫 번째 할 일은 h168 스냅샷이 왜 비었는지 확인하는 것입니다.

## 채점 (예측 항목 7개, 판정 로그 엔트리 4개 기준)
- **유효 0 / 무효 0 / 보류 3 엔트리 (항목 6개)**, 채점 불가 1 엔트리입니다. 항목 7개 중 나머지 1개는 채점 불가 엔트리 LOG-20260907-01의 것으로 추정합니다. 원자료에 직접 적혀 있지는 않습니다.
- 보류 사유 A: LOG-20260906-01과 LOG-20260907-03(항목 4개)은 h168 스냅샷이 없어 확인 불가입니다.
- 보류 사유 B: LOG-20260907-02(항목 2개)는 기준선 표본이 0건이라 부트스트랩 구간입니다. 4건 미만은 채점하지 않으며, 이 구간 판정은 규칙 근거로 쓰지 않습니다.
- 채점 불가: LOG-20260907-01은 연결된 발행 글이 없습니다. 0건이 아니라 확인 불가이며, 실패로도 성공으로도 세지 않습니다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않습니다(n=0). 6개 규칙 모두 현재 근거가 없습니다.
- 표본 규모: 스냅샷 14개(post 8건)입니다. 발행 누적 10건 미만 기준에 걸릴 가능성이 높습니다. 다만 원자료에는 누적 발행 건수가 직접 없어 확인 불가입니다.

## 확인 대상 (정상으로 읽지 않는다)
- LOG-20260906-01은 9월 초 발행인데 h168 스냅샷이 없습니다. 오늘 기준 약 7주가 지났으므로 "아직 시점이 안 됨"은 설명이 안 됩니다. 수집 실패가 의심되며, 원인은 이 자료로 단정할 수 없습니다. 같은 이유로 LOG-20260907-03도 확인이 필요합니다.
- 제외된 스냅샷 4건은 `catchup` 1회성 관측입니다. 수집이 한 번 밀렸다가 사후에 보충된 흔적일 수 있습니다. 이 4건이 위 두 글 중 어느 것인지는 원자료로 확인 불가입니다.
- LOG-20260907-02는 reply_rate와 like_rate 실측이 둘 다 0.0315로 같습니다. 우연이거나 지표 매핑 오류일 수 있어, 기준선이 쌓이기 전에 먼저 확인해야 합니다.

## 커버리지
- 매칭 가능 병목은 **7/7**이고 0·1곳인 갭은 없습니다.
- 가장 얇은 곳은 케이스 3곳인 DISTRIBUTION(무브 6건)과 SUPPLY(무브 5건)입니다. 매칭 하한(2곳)에 가장 가깝습니다.
- 케이스 4곳은 AWARENESS(무브 6건), TRUST(11건), CONVERSION(7건), RETENTION(6건)입니다. UNIT_ECONOMICS는 5곳(7건)입니다.

## 다음 앵글 후보
원자료에는 무브별 제목이 없어 무브 단위로 지목하지 못했습니다. 병목 단위로 제안하며, 무브 선택은 CMO가 승인 무브 목록에서 합니다.
1. **SUPPLY** — 무브가 5건으로 7개 병목 중 가장 적고 케이스도 3곳뿐입니다. 하나가 탈락하면 매칭 하한(2곳)에 바로 가까워집니다.
2. **DISTRIBUTION** — 케이스 3곳으로 얇고, 무브 6건이 Figma·Testimonial.to·Zapier에 몰려 있어 다양성을 먼저 확보할 필요가 있습니다.
3. **AWARENESS** — 케이스 4곳에 무브는 6건으로, 4곳 병목 중 무브 대비 케이스가 가장 얇습니다(TRUST는 11건으로 과잉). 훅 검증 데이터가 쌓이는 중이니 첫 발행 후보로 적합합니다.

위 근거는 모두 커버리지입니다. 성과 데이터는 앵글 선택에 쓸 수 없는 상태입니다.

## 확인 못 한 것
- h168 스냅샷이 빈 이유: 수집 실패인지 매핑 문제인지, 원자료에 없습니다.
- 누적 발행 건수: 부트스트랩 임계(10건) 판정에 필요하지만 원자료에 직접 없습니다.
- 각 규칙(C-12 등)이 어느 엔트리에 붙어 있는지: 매핑이 출력에 없습니다.
- `threads-report.mjs` 발행 지표 요약은 이번 원자료에 없습니다.

## 진행 판단 절차 점검 (원칙 §0)
- 검토한 것: 채점 3상태, 부트스트랩 구간, 커버리지 하한.
- 개선점: 성과 신호가 없으므로 앵글 선택 근거를 커버리지로 한정했습니다. 또한 h168 공백과 0.0315 중복을 별도 확인 항목으로 올렸습니다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-29-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-29 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-29T23:55:37.784Z)
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

_실행 키 `cmo-2026-10-29-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
