# CMO 데일리 다이제스트 2026-10-16

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 1건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 1건
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

## 결론 (맨 위 3줄)
- 성과 근거로 쓸 수 있는 채점 결과가 아직 0건이다. 예측 항목 전부가 보류이고, 규칙 신뢰도는 어느 쪽으로도 말할 수 없다.
- 커버리지에는 갭이 없다. 매칭 가능 병목은 7/7이고, 0/1 케이스 병목은 없다.
- 다음 앵글은 성과가 아니라 커버리지 얇음을 기준으로 고른다. 성과 신호가 없어서다.

## 채점 (예측 항목 기준, 출처: score-predictions)
- 유효 0 / 무효 0 / **보류 6 (표본 부족)**. 판정 로그 엔트리 23개 중 예측이 달린 것은 4개다.
- 보류 사유 4건은 h168 스냅샷이 없는 것이다. 아직 그 시점이 안 됐거나 수집에 실패했는지 로그만으로는 가를 수 없다. 해당 항목은 LOG-20260906-01 2건과 LOG-20260907-03 2건이다.
- 보류 사유 2건은 부트스트랩 구간이다. 기준선 표본이 0건이라, 4건 미만은 채점하지 않는다는 규칙에 걸렸다. 해당 항목은 LOG-20260907-02 2건이다.
- **채점 불가 1건**: LOG-20260907-01은 연결된 발행 글이 없다. 실패가 아니라 확인 불가다. 합계 7개 항목 중 이 건의 항목 수는 원자료에 따로 찍혀 있지 않아, 위 6개와 별도로 센다.
- 스냅샷 14개 중 4건은 조기·사후 1회성 관측이라 제외됐다. 그 글에 데이터가 없다는 뜻이 아니다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 개 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다.
- 이 값으로 "이 훅이 먹힌다"나 "안 먹힌다"를 결론 낼 수 없다. 규칙마다 n=1이고 그마저 보류다.

## 확인 대상 (정상으로 읽지 않는다)
- LOG-20260907-02의 실측값이 reply_rate와 like_rate 둘 다 0.0315로 똑같다. 서로 다른 지표가 같은 값이 나온 것이므로 지표 매핑이나 집계 버그일 수 있다. 원자료만으로는 우연인지 버그인지 가를 수 없다. 이 건은 근거로 쓰지 말고 CTO 쪽 점검 대상으로 넘긴다.
- h168 스냅샷 부재가 시점 미도래인지 수집 실패인지는 확인하지 못했다. 발행 시각과 collect-metrics 실행 기록을 대조해야 한다.

## 커버리지 (출처: case-match --coverage)
- 매칭 가능 병목은 **7/7**이다. 갭(케이스 0/1곳)은 없다.
- 여유가 가장 얇은 병목은 DISTRIBUTION(케이스 3곳, 무브 6건)과 SUPPLY(케이스 3곳, 무브 5건)다. 2곳 하한에서 1곳 위다.
- SUPPLY는 무브 5건으로 7개 병목 중 가장 적다.
- AWARENESS(케이스 4곳, 무브 6건)와 RETENTION(케이스 4곳, 무브 6건)도 무브 수는 얇다.

## 다음 앵글 후보 (병목 단위)
원자료에 개별 무브 목록이 없어서 특정 무브를 지목하지 못한다. 병목까지만 제시하고, 무브 선택은 CMO가 승인 무브 목록에서 한다.
1. **SUPPLY** (Fathom Analytics, Magic Spoon, Purple Innovation): 무브 5건으로 가장 적고 케이스는 3곳이다. 한 곳이 빠져도 매칭이 유지되는 여유가 가장 작다.
2. **DISTRIBUTION** (Figma, Testimonial.to, Zapier): 케이스 3곳이라 2곳 하한에서 1곳 위다. 발행으로 쓰기 시작하면 앵글 소진이 빨라질 수 있다.
3. **AWARENESS** (Dr. Squatch, e.l.f. Beauty, GoPro, HOKA): 케이스 4곳으로 여유가 있다. 성과 비교용 표본을 만들려면 병목이 다른 글을 섞어 발행해야 한다. 이 병목은 비교 대조군 자리다.

## 확인 못 한 것
- 발행 누적 건수가 10건 미만인지 이상인지. 원자료에는 발행 글 8건(스냅샷이 있는 post 기준)만 보이고 총 발행 수는 없다.
- `threads-report.mjs`의 발행 지표 요약은 오늘 입력에 없어서 views 기준 표본 판정은 못 했다.
- 위 후보 3개가 성과로 뒷받침되는지. 현재 채점 0건이므로 근거는 커버리지뿐이다.

## 자가검증
- 검토한 것: 보류·채점 불가의 분리, 부트스트랩 구간 규칙, 커버리지 0/1 갭 기준.
- 찾아낸 개선점: LOG-20260907-02의 지표값 동일 문제, 그리고 특정 무브가 아니라 병목 단위로만 후보를 낼 수 있다는 한계.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-16-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-16 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-16T22:49:46.716Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 28곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":0,"transferability_unrated":0})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":0})
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: get-grant-bet-shutdown-3fb100b7ffb48195bd2ed8c8ac4a44fc ✅ DISCOVERY-2026-10-16 → https://app.notion.com/p/DISCOVERY-2026-10-16-3fb100b7ffb481ee9a39f8aaf3db6d63 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-17-CMO 기록·재확인

_실행 키 `cmo-2026-10-16-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
