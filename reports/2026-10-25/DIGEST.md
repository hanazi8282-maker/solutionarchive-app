# CMO 데일리 다이제스트 2026-10-25

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-10-25

**결론:** 채점으로 확정된 것은 0건이다. 이번 주는 "어떤 훅이 먹힌다"고 말할 수 없다. 커버리지 갭은 없다(7/7). 지금 필요한 것은 새 케이스가 아니라 h168 실측이 쌓이는 것이다.

## 채점 (예측 항목 7개 기준)
- **유효 0 / 무효 0 / 보류 6 (표본 부족) / 채점 불가 1**
- 보류 6건은 엔트리 3개에 각 2항목씩 걸려 있다.
  - LOG-20260906-01 (like_rate, share_rate), LOG-20260907-03 (share_rate, like_rate): h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집이 실패한 것이다. 둘 중 어느 쪽인지는 이 출력만으로 알 수 없다.
  - LOG-20260907-02 (reply_rate, like_rate): 실측값은 있지만 기준선 표본이 0건이다. 4건 미만은 채점하지 않으므로 부트스트랩 구간이고, 규칙 근거로 쓰지 않는다.
- 채점 불가 1건은 LOG-20260907-01이다. 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 7개 중 6개만 항목이 보인다. 나머지 1개는 LOG-20260907-01의 항목일 것으로 추정되지만 출력에 명시되어 있지 않다.
- 표본: 실측 스냅샷 14개, 글 8건. 명목 창(h1/h24/h168)과 안 맞는 4건(catchup 1회성 관측)은 채점에서 제외됐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 개 모두 **유효 0 / 무효 0 / 보류 1**이고 Wilson 하한은 계산되지 않았다.
- 각 규칙의 표본이 1건뿐이다. 신뢰도는 판단 불가다.

## 커버리지 갭
- **매칭 가능 병목 7/7.** 케이스 2곳 미만인 갭은 없다.
- 상대적으로 얇은 곳(갭은 아님)
  - SUPPLY: 케이스 3곳 · 무브 5건
  - DISTRIBUTION: 케이스 3곳 · 무브 6건
  - AWARENESS, RETENTION, CONVERSION, TRUST: 케이스 4곳 · 무브 6~11건
  - UNIT_ECONOMICS: 케이스 5곳 · 무브 7건

## 다음 앵글 후보
이 출력에는 무브 ID가 없다. 그래서 병목과 케이스 단위로만 적는다.
1. **SUPPLY** (Fathom / Magic Spoon / Purple): 무브 5건으로 7개 병목 중 가장 얇다. 케이스가 3곳뿐이라 매칭 후보 폭이 좁다.
2. **DISTRIBUTION** (Figma / Testimonial.to / Zapier): 케이스 3곳으로 SUPPLY와 함께 최소선이다. 지금까지 예측이 달린 글과 겹치지 않는지 CMO가 확인해야 한다.
3. **TRUST** (Everlane / Ritual / Seed Health / Tuft & Needle): 무브 11건으로 선택지가 가장 많다. 새 데이터를 만들려면 후보 풀이 넓은 쪽이 낫다. 다만 1·2번처럼 갭이 근거는 아니다.

세 후보 모두 성과 근거가 없다. 커버리지 숫자만으로 고른 것이다.

## 확인 못 한 것
- **어느 병목이 이미 발행됐는지:** 입력에 병목별 발행 이력이 없다. 그래서 후보가 중복인지 판단하지 못했다.
- **LOG-20260907-02의 reply_rate와 like_rate가 둘 다 0.0315로 같다:** 우연인지 같은 값이 두 지표에 들어간 것인지 이 출력으로는 구분할 수 없다. 기준선이 쌓이기 전에 `score-predictions.mjs`의 지표 계산 경로를 확인하는 것이 좋다.
- **h168 스냅샷이 없는 두 엔트리(0906-01, 0907-03):** 시점 미도래인지 수집 실패인지 알 수 없다. 발행 시각과 collect-metrics 실행 이력이 필요하다.
- **이번 분석은 읽기 전용이고 DB 접근이 없다:** 위 수치는 모두 전달받은 원자료에서 가져왔다.

**진행 절차(§0):** 후보 3개는 갭 얇기와 후보 폭 두 기준으로 비교했다. 개선점으로 `0.0315` 동일값 의심과 병목별 발행 이력 누락을 찾아 확인 불가로 분리했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-25-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-25 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-25T22:31:58.561Z)
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
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: ce-rescue-discontinued-404100b7ffb48170a6ddfdb571f303f0 ✅ DISCOVERY-2026-10-25 → https://app.notion.com/p/DISCOVERY-2026-10-25-404100b7ffb4817a9597fffc891a13d0 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-26-CMO 기록·재확인

_실행 키 `cmo-2026-10-25-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
