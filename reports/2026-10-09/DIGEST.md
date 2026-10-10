# CMO 데일리 다이제스트 2026-10-09

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 2건
- 스테이징(staged): 1건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

# 성과 해설 — 2026-10-09 (sa-cmo-analyst)

**결론: 이번 채점으로는 규칙에 대해 아무것도 말할 수 없다.** 유효 0 · 무효 0이고 전부 보류다. 지금 할 일은 새 앵글을 고르는 것보다 h168 스냅샷이 쌓이는지, 같은 값이 두 지표에 찍힌 것이 정상인지 확인하는 것이다.

## 채점 (예측 항목 기준)
- **유효 0 / 무효 0 / 보류 6 (표본 부족·확인 불가)** — 엔트리 3개, 항목 2개씩이다.
- **채점 불가 1 엔트리:** LOG-20260907-01은 연결된 발행 글이 없다. 이것은 보류와 다른 사건이다. 점수 0이 아니라 확인 불가다.
- 예측 항목은 7개인데 출력이 나열한 것은 6개다. 나머지 1개는 LOG-20260907-01 소속으로 보이지만 출력에 명시가 없어 확인하지 못했다.
- 전체 규모는 판정 로그 23건 중 예측이 달린 것 4건뿐이다. 나머지 19건은 채점 대상 자체가 아니다.
- 규칙별 신뢰도는 C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 계산할 수 없다(분모 0). 이 6개 규칙에 대해서는 "먹힌다"도 "안 먹힌다"도 말하지 않는다.

## 보류 사유
- **LOG-20260906-01 (like_rate, share_rate):** h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집에 실패한 것이고, 둘 중 어느 쪽인지는 이 출력만으로 확인 불가다.
- **LOG-20260907-03 (share_rate, like_rate):** 위와 같은 사유다.
- **LOG-20260907-02 (reply_rate, like_rate):** 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 여기서 나온 판정은 규칙 근거로 쓰지 않는다.

## 확인 대상
- **LOG-20260907-02의 실측값이 reply_rate와 like_rate 모두 0.0315로 같다.** 우연일 수 있지만 서로 다른 지표가 같은 값이면 집계 오류를 먼저 의심해야 한다. 채점이 보류라서 드러나지 않았을 뿐이다. 원인은 이 데이터로는 확인 불가이며, CTO(sa-cto-data) 점검 대상이다.
- **스냅샷 4건이 제외됐다.** h1/h24/h168 창과 안 맞는 나이의 `catchup` 관측이다. 그 글에 데이터가 없다는 뜻은 아니다. 다만 h168 스냅샷이 없는 두 엔트리가 이 제외분과 관련 있는지는 확인 불가다.
- **발행 누적 건수는 출력에 없다.** 부트스트랩 문턱(10건)을 넘었는지는 `node scripts/threads-report.mjs`를 돌려야 알 수 있다. 이번에는 실행하지 않았다.

## 커버리지: 매칭 가능 병목 7/7, 갭 0
- 서로 다른 케이스 2곳이라는 문턱 아래인 병목은 없다.
- **여유가 가장 적은 병목은 DISTRIBUTION과 SUPPLY다.** 케이스 3곳으로 문턱보다 1곳 많을 뿐이다(무브는 각각 6건, 5건).
- UNIT_ECONOMICS는 케이스 5곳 · 무브 7건이다.
- TRUST는 케이스 4곳 · 무브 11건으로 가장 두껍다.
- 나머지 AWARENESS, CONVERSION, RETENTION은 케이스 4곳이다. 무브는 각각 6건, 7건, 6건이다.

## 다음 앵글 후보 (병목 단위까지만 말할 수 있다)
출력에 무브 ID와 내용이 없어 특정 무브를 지목할 수 없다. 무브 단위 선정은 `case-match.mjs` 상세 출력을 본 뒤에 한다.
1. **TRUST 무브(11건):** 후보 풀이 가장 넓어 채점이 막힌 지금 글 한 편을 써도 선택 부담이 적다. 다만 예측 6필드를 달아 h168 데이터가 실제로 쌓이는 글이어야 한다.
2. **DISTRIBUTION 무브(케이스 3곳 · 6건):** 갭은 아니지만 여유가 가장 적은 축이다. 이 병목의 매칭이 실제로 성립하는지 글 한 편으로 일찍 확인해 두는 게 낫다.
3. **SUPPLY 무브(케이스 3곳 · 5건):** 무브 수가 7개 병목 중 가장 적다. 2번과 같은 이유로 여유가 얇은 구간부터 쓴다.

세 후보 모두 어느 병목이 성과가 좋은지에 대한 근거는 없다. 골랐다면 커버리지 여유와 표본 확보를 기준으로 고른 것이다.

## 확인 못 한 것
- 7번째 예측 항목의 소속: 출력에 없다.
- 두 엔트리의 h168 부재가 시점 미도래인지 수집 실패인지: 스냅샷 수집 로그를 읽지 않았다.
- 발행 누적 건수와 `views < 100` 해당 건: `threads-report.mjs`를 실행하지 않았다.
- 규칙 ID와 병목의 대응: 출력에 없다. 그래서 어떤 병목의 글이 어떤 규칙을 시험했는지 연결하지 못했다.

## 절차 점검 (`_principles.md` §0)
- 검토한 것: 보류를 성공이나 실패로 세지 않았는지, 부트스트랩 판정을 근거로 쓰지 않았는지, 수치마다 출처가 있는지 확인했다.
- 찾아낸 개선점: 두 지표의 동일값(0.0315)을 확인 대상으로 올렸다. 앵글 후보는 무브 ID를 지어내지 않고 병목 단위로 낮췄다.

## 다음 주 주목 지표

- `like_rate` — zenefits-licensing-macro-trust-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — zenefits-licensing-macro-trust-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-10-09-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-09 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-10T00:02:17.619Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 27곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic, testimonial-to-solo-saas-channel-bootstrap
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- 이식성 미판정 무브 2건 / 후보 3건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): zenefits-licensing-macro-trust-collapse/OPERATIONS(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":13})
- ℹ️ Notion 푸시: ence-startup-wind-down-3f5100b7ffb48193ab2cfd3a36fe735a ✅ DISCOVERY-2026-10-09 → https://app.notion.com/p/DISCOVERY-2026-10-09-3f5100b7ffb481ff9219f445213132d8 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-10-CMO 기록·재확인

_실행 키 `cmo-2026-10-09-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
