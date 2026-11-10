# CMO 데일리 다이제스트 2026-11-09

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 3건(가장 오래된 것 296시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 5건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-09

**결론: 이번 주 채점으로 확인된 규칙은 0개다.** 유효 0 / 무효 0 / 보류 3건이라, 어떤 훅·규칙도 "먹힌다/안 먹힌다"로 쓸 수 없다. 수집이 막힌 것인지 아직 이른 것인지부터 가려야 한다. 커버리지는 7/7이라 병목 갭은 없고, 다음 앵글은 얇은 병목 순으로 고른다.

## 채점 (score-predictions)

- 판정 로그 23개 중 예측이 달린 것은 4개, 예측 항목은 7개다.
- **유효 0 / 무효 0 / 보류 3** — 보류 3건은 LOG-20260906-01, LOG-20260907-02, LOG-20260907-03이다(항목 6개). 보류는 실패도 성공도 아니다.
- **채점 불가 1건(확인 불가)**: LOG-20260907-01은 연결된 발행 글이 없다. 0점이 아니라 측정 자체가 없다. 이 건의 예측 항목(7개 중 6개만 출력에 보여서 나머지 1개로 추정)은 출력에 나오지 않았다.
- 보류 사유 ① LOG-20260906-01, LOG-20260907-03 (n=2건, 항목 4개): h168 스냅샷이 없다.
- 보류 사유 ② LOG-20260907-02 (n=1건, 항목 2개): 기준선 표본이 0건이다. 4건 미만이면 채점하지 않으며, 부트스트랩 구간이라 참고값조차 규칙 근거로 쓰지 않는다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 여섯 개 모두 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 계산되지 않았다. 규칙 근거는 0건이다.

## 확인 대상 (정상으로 접지 않는다)

- **h168 스냅샷 없음이 "아직 시점이 안 됨"인지 "수집 실패"인지 원자료로는 구분되지 않는다.** 로그 ID가 9/6~9/7인데 오늘은 11/9다. 발행일이 로그 날짜와 같다면 7일 창이 두 달 전에 닫혔어야 하므로 수집 실패 쪽이 유력하다. 발행일은 원자료에 없다. 이 부분은 확인 불가다.
- **스냅샷 4건을 명목 창(h1/h24/h168)과 안 맞는다는 이유로 뺐다.** 조기·사후 1회성 관측(catchup)이다. 이 4건이 h168 없는 글의 유일한 데이터일 수 있는데, 어느 글의 것인지는 원자료에 없다. 제외 필터가 보류를 만든 쪽인지 확인이 필요하다.
- **LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 같다.** 우연일 수도 있고 같은 값을 두 지표에 쓴 버그일 수도 있다. 원자료만으로는 가를 수 없어 확인 불가로 둔다.
- 이번 해설은 주어진 텍스트만 근거로 했다. `threads-report.mjs`(발행 지표 요약)는 입력에 없어 보지 못했다. 발행 누적이 10건을 넘었는지도 확인 불가다.

## 커버리지 갭

- 매칭 가능 병목 **7/7**. 케이스 0~1곳인 갭은 없다.
- 케이스 수가 가장 얇은 병목은 SUPPLY(케이스 3곳·무브 5건)와 DISTRIBUTION(케이스 3곳·무브 6건)이다. 매칭 최소선(2곳)에서 1곳 위다.
- 가장 두터운 병목은 TRUST(4곳·11건)와 UNIT_ECONOMICS(5곳·7건)다.
- 커버리지는 쓸 재료가 있다는 뜻일 뿐, 성과 근거가 아니다. 위 채점은 비어 있다.

## 다음 앵글 후보

원자료에 무브 목록이 없어 무브 단위가 아니라 병목+케이스 단위로만 짚는다. 무브는 `case-match.mjs`로 고른다.
- **SUPPLY**(Fathom Analytics, Magic Spoon, Purple Innovation): 무브가 5건으로 가장 적어서, 지금 한 건 쓰면 재고 소진이 가장 빠르게 드러난다.
- **DISTRIBUTION**(Figma, Testimonial.to, Zapier): 케이스 3곳뿐이라 같은 케이스를 반복하지 않고 쓸 수 있는 폭이 좁다. 먼저 쓰는 게 낫다.
- **UNIT_ECONOMICS**(Bannerbear, Blueland, Plausible Analytics, Shyp, Harry's): 케이스가 5곳으로 가장 많아 한 병목 안에서 서로 다른 케이스로 비교 발행을 할 수 있다. 기준선 표본이 0건인 지금 표본을 모으기에 가장 쉽다.

## 카드 후보

- SUPPLY 병목 (Fathom Analytics·Magic Spoon·Purple Innovation 중) — 무브 5건으로 7개 병목 중 가장 얇아 지금 써 두는 게 소진 위험이 가장 낮다
- DISTRIBUTION 병목 (Figma·Testimonial.to·Zapier 중) — 케이스 3곳뿐이라 반복 없이 쓸 수 있는 폭이 좁아 먼저 소비할 가치가 있다
- UNIT_ECONOMICS 병목 (Bannerbear·Blueland·Plausible Analytics·Shyp·Harry's 중) — 케이스 5곳으로 서로 다른 케이스 비교 발행이 가능해 기준선 표본 0건을 채우기 좋다

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-09-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-09 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-10T02:44:10.698Z)
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
- ℹ️ Notion 푸시: ✅ 대기함 설명서 동기화 1150자 ⏭️ 발굴 — 채택·확인불가 0건 (후보 0건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 0건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-10-CMO 기록·재확인

_실행 키 `cmo-2026-11-09-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
