# CMO 데일리 다이제스트 2026-10-28

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 5시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-10-28

**결론:** 채점으로 확정된 규칙이 아직 없다. 유효 0건, 무효 0건이고 전부 보류다. 이번 앵글은 성과가 아니라 커버리지로 고른다. 지금 할 일은 새 글보다 h168 스냅샷이 쌓이게 하는 것이다.

## 채점 (예측이 달린 엔트리 4개, 예측 항목 7개)
- **유효: 0건.**
- **무효: 0건.**
- **보류(표본 부족): 엔트리 3개, 항목 6개.** 근거는 아래 두 가지다.
  - LOG-20260906-01과 LOG-20260907-03: h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집에 실패했는지 구분되지 않는다.
  - LOG-20260907-02: 기준선 표본이 0건이다. 4건 미만은 채점하지 않는 부트스트랩 구간이다.
- **채점 불가: 엔트리 1개.** LOG-20260907-01은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 산출되지 않았다.
- 어느 규칙도 "먹힌다"거나 "안 먹힌다"고 결론 낼 수 없다.

## 확인 못 한 것
- 예측 항목 7개 중 출력에 나온 건 6개다. 나머지 1개는 채점 불가인 LOG-20260907-01 소속으로 추정되지만, 출력에는 없어서 확정하지 않는다.
- LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다. 우연일 수 있고 집계 오류일 수도 있다. 원자료만으로는 판별할 수 없으니 원 스냅샷을 대조해야 한다. 어느 쪽이든 부트스트랩 구간이라 규칙 근거로는 못 쓴다.
- 발행 누적이 10건 미만인지는 확인하지 못했다. 이 출력에 있는 건 "스냅샷이 있는 글 8건"뿐이고, 전체 발행 수는 없다.
- h168 스냅샷이 없는 이유가 시점 미도래인지 수집 실패인지 구분하지 못했다.
- 제외된 스냅샷 4건은 h1/h24/h168 창과 안 맞는 `catchup` 관측이다. 이 글들에 데이터가 없다는 뜻이 아니다.

## 커버리지
- **매칭 가능 병목: 7/7.** 케이스 0~1곳인 갭은 없다.
- 가장 얇은 곳은 SUPPLY와 DISTRIBUTION이다. 둘 다 케이스 3곳이라 매칭 하한(2곳)에서 1곳 여유뿐이다.
  - SUPPLY: 무브 5건 (Fathom Analytics, Magic Spoon, Purple Innovation)
  - DISTRIBUTION: 무브 6건 (Figma, Testimonial.to, Zapier)
- 가장 두꺼운 곳은 TRUST다. 케이스 4곳, 무브 11건이다.
- 나머지 병목: AWARENESS, CONVERSION, RETENTION은 케이스 4곳이다. UNIT_ECONOMICS는 케이스 5곳이다.

## 다음 앵글 후보
성과 데이터가 비교할 근거를 주지 않는다. 아래는 커버리지만 근거로 한 후보이고, 원자료에 무브 목록이 없어서 병목 단위로만 적는다. 구체 무브는 CMO가 승인된 무브에서 고른다.
1. **TRUST.** 무브 11건으로 재고가 가장 많아 앵글을 고를 폭이 넓다. 보류 상태의 규칙 6개를 같은 병목 안에서 변인 통제해 시험하기 좋다.
2. **SUPPLY.** 케이스 3곳, 무브 5건으로 가장 얇다. 지금 쓰지 않으면 병목 균형이 TRUST 쪽으로 더 기운다.
3. **DISTRIBUTION.** 케이스 3곳으로 매칭 여유가 1곳뿐이다. 이 병목은 케이스 조사로 1곳 더 보강하는 편이 먼저일 수 있다.

## 점검 (원칙 §0)
- 재검토해서 나온 개선점 두 가지다.
  - 지금 병목은 앵글 부족이 아니라 채점 인프라다. h168 스냅샷 수집 상태를 CTO 쪽에서 `sa-cto-data`로 확인해야 한다.
  - LOG-20260907-01은 연결된 글을 붙여야 채점 대상이 된다.
- 위 수치는 모두 이번 원자료에서만 가져왔다. 읽기 전용으로 분석했고 DB와 파일은 건드리지 않았다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-28-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-28 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-28T23:59:32.937Z)
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
- ℹ️ Notion 푸시: ✅ 대기함 설명서 동기화 1150자 ⏭️ 발굴 — 채택·확인불가 0건 (후보 6건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 0건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-29-CMO 기록·재확인

_실행 키 `cmo-2026-10-28-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
