# CMO 데일리 다이제스트 2026-10-24

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

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

# 성과 해설 — 2026-10-24

**결론:** 이 원자료로는 어떤 훅·규칙도 먹힌다/안 먹힌다고 말할 수 없다. 채점된 항목은 전부 보류다. 지금 필요한 일은 기준선 표본(4건 이상)을 쌓고 h168 스냅샷 수집을 확인하는 것이다.

## 채점 (score-predictions)

- **유효 0 / 무효 0 / 보류 6 (표본 부족)**
  - 채점 대상 엔트리는 3개이고 항목은 6개다.
  - 판정 로그는 23개 엔트리 중 4개에만 예측이 달려 있고, 예측 항목은 총 7개다.
- **보류 사유 (엔트리별):**
  - LOG-20260906-01 (2항목): h168 스냅샷이 없다. 아직 시점이 안 됐거나 수집이 실패했는지는 확인 불가다.
  - LOG-20260907-03 (2항목): 위와 같다.
  - LOG-20260907-02 (2항목): 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 부트스트랩 구간이라 참고값이다.
- **채점 불가 1건:** LOG-20260907-01은 연결된 발행 글이 없다. 이것은 실패가 아니라 확인 불가다.
- **7개 중 나머지 1개:** 출력에 나온 항목은 6개뿐이다. 나머지 1개는 채점 불가 엔트리 몫으로 보이지만, 원자료에 없어서 확인 불가다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다(n=1, 근거 없음). 규칙 근거로 쓰지 않는다.
- **의심 한 건:** LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다. 우연일 수 있다. 하지만 지표 매핑 오류일 가능성도 있어서 확인이 필요하다. 원자료만으로는 판단할 수 없다.
- **제외 스냅샷:** 4건을 뺐다(`collect-metrics 'catchup'`, 창 불일치). 그 글에 데이터가 없다는 뜻은 아니다.
- **실측 규모:** 스냅샷 14개, 글 8건이다. 같은 h168 창에 맞는 글은 아직 기준선 4건에 못 미친다.

## 커버리지 (case-match --coverage)

- **매칭 가능 병목 7/7.** 케이스가 0~1곳인 갭은 없다. 매칭 조건인 서로 다른 케이스 2곳 이상을 모든 병목이 넘는다.
- **가장 얇은 곳 (갭은 아님):**
  - DISTRIBUTION: 케이스 3곳, 무브 6건.
  - SUPPLY: 케이스 3곳, 무브 5건.
- **두꺼운 곳:**
  - TRUST: 케이스 4곳, 무브 11건.
  - UNIT_ECONOMICS: 케이스 5곳, 무브 7건.
- **한계:** 이 출력은 승인 기준의 개수만 보여 준다. 승인 경로(사람 승인인지 자동 승인인지)와 각 무브의 세부 내용은 없어서 확인 불가다.

## 다음 앵글 후보 (병목 단위)

원자료에 무브 목록이 없어서 무브 단위로는 못 고른다. 병목과 후보 케이스까지만 제시한다.

1. **TRUST (Everlane, Ritual, Seed Health, Tuft & Needle)**
   - 지금인 이유: 무브가 11건으로 가장 많다. 같은 병목 안에서 비슷한 형태의 글을 연달아 낼 수 있어서 기준선 4건을 가장 빨리 채운다. 그래야 부트스트랩 구간에서 벗어난다.
2. **SUPPLY (Fathom Analytics, Magic Spoon, Purple Innovation)**
   - 지금인 이유: 무브가 5건으로 가장 적다. 소진 전에 한 번 나가 봐야 실측이 이 병목의 반응을 보여 주는지 알 수 있다.
3. **DISTRIBUTION (Figma, Testimonial.to, Zapier)**
   - 지금인 이유: 케이스가 3곳뿐이라 매칭 여유가 적다. 발행으로 소진되기 전에 반응을 먼저 확인해 두는 편이 낫다.

## 확인 못 한 것

- h168 스냅샷이 없는 이유(시점 미도래인지 수집 실패인지). 원자료에 글의 발행 시각과 수집 로그가 없다.
- 두 지표가 0.0315로 같은 이유(우연인지 매핑 오류인지).
- 7번째 예측 항목이 어느 엔트리 몫인지.
- 각 병목의 무브 단위 내용과 승인 경로.
- `threads-report.mjs`의 발행 지표 요약. 이번 원자료에 포함되지 않았다.

## 절차 근거 (_principles §0)

- **검토한 것:** 보류를 어느 칸에도 세지 않았고, 기준선 0건 구간은 근거에서 뺐다. 커버리지는 "2곳 이상" 기준으로 읽었다.
- **개선점으로 찾은 것:** 두 지표의 실측이 동일한 점과, 무브 단위 후보를 못 고르는 정보 공백이다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-24-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-24 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-24T22:27:57.352Z)
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

_실행 키 `cmo-2026-10-24-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
