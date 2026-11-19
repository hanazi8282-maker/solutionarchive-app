# CMO 데일리 다이제스트 2026-11-18

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 7건(가장 오래된 것 248시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 6건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-11-18

- 결론: 채점으로 확정된 것은 0건이다. 유효 0 / 무효 0이고, 규칙 근거로 쓸 수 있는 판정이 없다.
- 지금 해야 할 일은 새 앵글보다 먼저 h168 스냅샷이 왜 비어 있는지 확인하는 것이다.
- 커버리지는 7/7로 갭이 없다. 병목 때문에 글을 못 쓰는 상태가 아니다.

## 채점 (예측 항목 7개, 엔트리 4개)
- 유효 0 / 무효 0 / **보류 6 (표본 부족)** / 채점 불가 1건(엔트리 단위). 보류는 성공으로도 실패로도 세지 않았다.
- 보류 6개 중 4개는 h168 스냅샷이 없다 (LOG-20260906-01 2개, LOG-20260907-03 2개). 원인은 확인 불가다. 이 4개는 아직 시점이 안 된 것인지 수집이 실패한 것인지 원자료만으로 가를 수 없다.
- 보류 6개 중 2개는 부트스트랩 구간이다 (LOG-20260907-02 reply_rate·like_rate). 기준선 표본이 0건이다 (4건 미만은 채점하지 않는다).
- 채점 불가 1건은 LOG-20260907-01이다. 연결된 발행 글이 없다. 이건 성과 0이 아니라 확인 불가다.
- 7개 중 보류 6개를 뺀 나머지 1개는 채점 불가 엔트리 소속으로 추정한다. 원자료가 개수를 따로 적지 않았다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 `-`다. 어느 규칙도 "먹힌다/안 먹힌다"로 말할 수 없다.

## 확인 대상 (안전장치·이상 신호)
- LOG-20260906-01, LOG-20260907-03의 h168 스냅샷이 비어 있다. LOG ID가 가리키는 날짜가 발행일이라면 약 10주가 지났다. 그렇다면 "아직 안 됨"일 가능성이 낮아 수집 실패가 의심된다. 발행일은 원자료에 없어서 확인 불가다.
- 스냅샷 4건이 h1/h24/h168 창과 안 맞아 제외됐다 (collect-metrics `catchup`). 그 글에 데이터가 없다는 뜻은 아니다. 정규 창 수집이 빠진 글이 있는지 CTO 쪽에서 볼 만하다.
- LOG-20260907-02는 reply_rate와 like_rate의 실측이 둘 다 0.0315로 똑같다. 우연일 수도, 지표 매핑 문제일 수도 있다. 원자료만으로는 판단할 수 없다. 이 값은 보류 건이라 어떤 결론에도 쓰지 않았다.
- 실측 스냅샷은 14개이고 대상 글은 8건이다. 제외된 4건이 14개에 포함되는지는 원자료에 없다.

## 커버리지
- 매칭 가능 병목 7/7. 케이스 0~1곳인 갭 병목은 없다.
- 가장 얇은 곳은 SUPPLY(케이스 3·무브 5)와 DISTRIBUTION(케이스 3·무브 6)이다. 매칭 최소선(서로 다른 케이스 2곳)보다 1곳 많은 상태다. 케이스 1곳만 반려·강등돼도 여유가 사라진다.
- 가장 두터운 곳은 TRUST(케이스 4·무브 11)와 UNIT_ECONOMICS(케이스 5·무브 7)다.

## 확인 못 한 것
- 각 무브의 내용과 규칙 태그. 원자료에 케이스·무브 건수만 있어서, 아래 후보는 병목·케이스 단위로만 적었다. 무브 선택은 CMO가 케이스 데이터를 보고 정한다.
- 발행 누적 건수. 10건 미만이면 어차피 부트스트랩 구간이라 규칙 결론을 내릴 수 없다.

## 검토 절차 근거 (_principles §0)
- 원자료의 보류 6개와 규칙표 6개가 서로 맞는지 대조했다.
- 개선한 것: "h168 없음 = 아직 시점 안 됨"이라는 안이한 읽기를 버리고 수집 실패 가능성을 확인 대상으로 올렸다.
- 개선한 것: 같은 값이 두 지표에 찍힌 이상 신호를 따로 적었다.

## 카드 후보
- TRUST 병목(Everlane·Ritual·Seed Health·Tuft & Needle) 무브: 승인 무브가 11건으로 가장 많아 선택지가 넓다. 규칙 근거가 0인 지금, 채점 가능한 글을 빨리 쌓기에 유리하다.
- SUPPLY 병목(Fathom Analytics·Magic Spoon·Purple Innovation) 무브: 승인 무브 5건으로 7개 병목 중 가장 얇다. 케이스 1곳만 빠져도 매칭 최소선이 깨지므로 노출을 먼저 시험해 둘 만하다.
- DISTRIBUTION 병목(Figma·Testimonial.to·Zapier) 무브: 케이스 3곳으로 최소선 바로 위다. 아직 예측이 걸린 글이 없는 병목이라(원자료 기준 확인 불가) 실측이 하나라도 생기면 규칙 후보가 생긴다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-18-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-18 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-19T01:52:25.913Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ⚠️ VOC 내보내기 확인 불가 — voc-export: 확인 불가 — 57014 canceling statement due to statement timeout. VOC 없이 조사한다.
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 29곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ⏭️ `angle` 앵글 선정 — 쓸 수 있는 승인 무브가 0건 (승인은 사람이 한다 — 루프의 실패가 아니다)
- ⏭️ `draft` 초안 작성 + 게이트 — 앵글 0건
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-11-18-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
