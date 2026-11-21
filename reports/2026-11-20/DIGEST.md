# CMO 데일리 다이제스트 2026-11-20

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 7건(가장 오래된 것 296시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 4건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-20

- **결론:** 규칙 신뢰도로 쓸 수 있는 채점이 아직 0건이다. 유효 0 / 무효 0 / 보류 3엔트리. 지금은 "무엇이 먹힌다"를 말할 근거가 없다.
- **할 일 1:** `h168` 스냅샷이 비는 이유를 확인한다. 2엔트리, 4항목이 걸려 있고 지금은 "아직"인지 "수집 실패"인지 구분이 안 된다.
- **할 일 2:** 앵글은 성과가 아니라 커버리지 기준으로 고른다(아래).

## 채점 (score-predictions)

- 전체: 판정 로그 23개 중 예측이 달린 것은 4개, 예측 항목은 7개다.
- **유효 0건**
- **무효 0건**
- **보류 3엔트리 (6항목)**, 전부 표본 부족·확인 불가다. 실패도 성공도 아니다.
  - LOG-20260906-01: like_rate·share_rate 2항목. h168 스냅샷 없음 → 확인 불가.
  - LOG-20260907-03: share_rate·like_rate 2항목. h168 스냅샷 없음 → 확인 불가.
  - LOG-20260907-02: reply_rate·like_rate 2항목. 부트스트랩 구간이고 기준선 표본이 0건이다(4건 미만은 채점하지 않는다).
- **채점 불가 1엔트리:** LOG-20260907-01은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
  - 7항목 중 6항목이 보류이고, 남은 1항목은 이 엔트리 소속으로 추정된다(7−6, 원자료에 직접 명시는 없음).
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 `-`이다.
  - 이 6개 규칙은 근거도 반증도 없는 상태다. 어느 규칙도 "통한다"거나 "안 통한다"고 쓰지 않는다.

## 확인 대상 (정상으로 읽지 않는다)

- **h168 스냅샷 부재:** 로그 ID 날짜가 09-06·09-07인데 오늘이 11-20이다. 글이 그 무렵 발행됐다면 h168 시점은 한참 지났다.
  - 그렇다면 "아직 안 됨"보다 수집 실패 쪽이 의심된다. 다만 원자료에 발행일이 없어서 확정하지 못한다.
  - 제외된 스냅샷 4건(catchup)과 같은 글인지도 이 자료로는 모른다.
- **LOG-20260907-02:** reply_rate와 like_rate의 실측이 둘 다 0.0315로 같다. 우연일 수도 있고 같은 값을 읽은 것일 수도 있다. 원자료만으로는 판단할 수 없고, 이 건은 어차피 보류라 결론에 영향은 없다.
- **스냅샷 현황:** 14개(글 8건)이고, 이 중 4건은 명목 창과 맞지 않아 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 커버리지 갭

- **매칭 가능 병목 7/7.** 케이스 0~1곳인 갭 병목은 없다.
- 여유가 가장 적은 병목은 케이스 3곳으로, 매칭 최소 기준(2곳)보다 1곳 많을 뿐이다.
  - SUPPLY: 케이스 3곳 · 무브 5건 (가장 얕음)
  - DISTRIBUTION: 케이스 3곳 · 무브 6건
- 나머지: AWARENESS 4곳·6건, RETENTION 4곳·6건, CONVERSION 4곳·7건, TRUST 4곳·11건, UNIT_ECONOMICS 5곳·7건.

## 확인 못 한 것

- 발행 지표 추이(`threads-report`)는 이번 원자료에 없다. views, 좋아요율 추이, `views < 100` 해당 건수를 모른다.
- 무브 단위 목록이 없어서 후보는 병목·케이스 단위로 적었다. 무브 선택은 `case-match` 실행 뒤에 한다.
- 4엔트리 이외 19개 엔트리에 예측이 없는 이유를 모른다.

## 자가검증

- 성과 데이터로 앵글을 고르면 근거 없는 숫자를 만들게 된다. 그래서 후보 선정 기준을 커버리지와 채점 가능성으로 바꿨다.
- 개선점: 후보마다 "발행하면 h168 채점이 가능한 예측을 달 수 있는가"를 확인하는 조건을 붙였다.

## 카드 후보

- SUPPLY 병목 무브 (Magic Spoon·Purple Innovation·Fathom Analytics 중) — 케이스 3곳·무브 5건으로 7개 병목 중 가장 얕다. 소진되기 전에 첫 발행 1건을 만들어 매칭 여유를 확인한다.
- DISTRIBUTION 병목 무브 (Figma·Testimonial.to·Zapier 중) — 케이스 3곳으로 여유가 SUPPLY와 같다. 한 곳이 반려되면 매칭이 깨지므로 먼저 쓴다.
- TRUST 병목 무브 (Everlane·Ritual·Seed Health·Tuft & Needle 중) — 무브 11건으로 가장 풍부하다. 기준선 표본 4건이 필요한 지금, 예측 항목을 달아 발행하기 가장 쉬운 병목이다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-20-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-20 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-21T01:29:53.192Z)
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

_실행 키 `cmo-2026-11-20-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
