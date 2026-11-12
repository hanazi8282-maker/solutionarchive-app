# CMO 데일리 다이제스트 2026-11-11

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 80시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 7건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 분석 해설 (2026-11-11)

**결론: 이번 회차는 채점된 예측이 0건이다. 규칙이 먹히는지는 아직 아무것도 모른다.** 지금 필요한 건 새 앵글보다 h168 지표가 쌓이는 것이다. 커버리지는 7/7이라 매칭이 막히는 병목은 없다.

## 채점 (예측 항목 7개, 출처 score-predictions)
- **유효 0 / 무효 0 / 보류 6 (표본 부족·확인 불가)**: 채점된 항목이 없으므로 맞았다는 근거도 틀렸다는 근거도 없다.
- **채점 불가 1건 (LOG-20260907-01)**: 연결된 발행 글이 없다. 실패가 아니라 확인 불가다. 7개 중 나머지 1개가 이 엔트리의 항목으로 보이지만, 출력에 명시되진 않았다(추정).
- **h168 스냅샷 없음, 2건 (LOG-20260906-01, LOG-20260907-03)**: 각각 like_rate·share_rate 항목이다. 아직 그 시점이 안 됐거나 수집이 실패한 것인데, 출력만으로는 둘을 구분할 수 없다.
- **부트스트랩 구간, 1건 (LOG-20260907-02)**: reply_rate·like_rate 항목이고 기준선 표본이 0건이다. 4건 미만은 채점하지 않는 규칙이라 보류다.
- **규칙별 신뢰도: 6개 규칙 모두 0/0/1이고 Wilson 하한은 없다.** 대상은 C-12, G-4, G-8, H3, P-03, P-09다. 이 상태로는 어떤 규칙도 근거로 쓰지 않는다.

## 확인 대상 (안전장치가 걸린 건이라 정상으로 읽지 않는다)
- **LOG-20260907-02 에서 reply_rate 와 like_rate 의 실측이 둘 다 0.0315 로 똑같다.** 우연일 수 있다. 다만 지표 매핑 오류일 가능성도 배제하지 못한다. 기준선이 생겨 채점되기 전에, 이 글의 스냅샷 원본에서 reply·like 수를 각각 대조해 볼 것을 권한다.
- **스냅샷 4건을 h1/h24/h168 명목 창과 안 맞는다며 제외했다(collect-metrics 'catchup').** 제외 사유는 나이 불일치이며, 그 글에 데이터가 없다는 뜻이 아니다. 남은 스냅샷은 14개(글 8건)다.

## 커버리지 (매칭 가능 병목 7/7)
- **갭(케이스 0~1곳)인 병목은 없다.**
- **얇은 병목 2개**: SUPPLY는 케이스 3곳·무브 5건, DISTRIBUTION은 케이스 3곳·무브 6건이다. 매칭 문턱(2곳)은 넘었지만 여유가 가장 적다. 한 곳이 반려되거나 숨김 처리되면 문턱까지 한 칸 남는다.
- **두터운 병목**: TRUST는 케이스 4곳·무브 11건, UNIT_ECONOMICS는 케이스 5곳·무브 7건으로 선택지가 많다.
- 나머지는 AWARENESS(4곳·6건), CONVERSION(4곳·7건), RETENTION(4곳·6건)이다.

## 확인 못 한 것
- **무브별 내용**: coverage 출력에 케이스·무브 개수만 있고 무브 제목이 없다. 그래서 앵글 후보는 병목·케이스 단위로 적었고, 구체 무브는 `case-match.mjs` 로 골라야 한다.
- **h168 스냅샷 부재의 원인**: 시점 미도래인지 수집 실패인지 `threads-report.mjs` 를 돌리지 않아 가르지 못했다.
- **발행 누적 수**: 10건 미만 부트스트랩 구간인지 직접 확인하지 못했다. 다만 LOG-20260907-02 가 기준선 0건으로 보류됐으므로 아직 구간 안일 가능성이 높다(추정).

## 카드 후보
- SUPPLY 병목 (Fathom Analytics / Magic Spoon / Purple Innovation): 케이스 3곳으로 가장 얇아, 여기서 예측을 달아 발행해야 새 규칙 표본과 커버리지 안정이 함께 생긴다.
- TRUST 병목 (Everlane / Ritual / Seed Health / Tuft & Needle, 무브 11건): 선택지가 가장 많아, 지금 필요한 같은 규칙 반복 측정(표본 쌓기)에 맞다.
- DISTRIBUTION 병목 (Figma / Testimonial.to / Zapier): 케이스 3곳으로 두 번째로 얇고, 예측 대비 실측이 없는 규칙과 짝지을 자리를 만들 수 있다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-11-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-11 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-12T01:54:12.074Z)
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

_실행 키 `cmo-2026-11-11-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
