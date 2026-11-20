# CMO 데일리 다이제스트 2026-11-19

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 7건(가장 오래된 것 272시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 5건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-19

**결론: 이번 주 채점으로 "이 규칙이 먹힌다/안 먹힌다"를 말할 수 있는 건 0건이다. 먼저 할 일은 h168 스냅샷이 왜 비었는지 확인하는 것이다. 앵글 선정은 커버리지 얇은 병목(SUPPLY·DISTRIBUTION)이 근거로 쓸 만하다.**

## 채점 (score-predictions)

- 유효 0 / 무효 0 / **보류 6 (표본 부족·확인 불가)**. 판정 로그 23개 중 예측이 달린 엔트리는 4개다.
- 예측 항목은 총 7개다. 이 중 6개는 엔트리 3개(LOG-20260906-01, 0907-02, 0907-03)에서 채점이 보류됐다. 나머지 1개는 채점 불가 엔트리(아래)에 속하는 것으로 보이지만, 출력에 항목이 나오지 않아 확인 못 했다.
- 보류 사유 ① 0906-01, 0907-03: h168 스냅샷이 없다. 확인 불가이지 실패가 아니다.
- 보류 사유 ② 0907-02: 기준선 표본이 0건이다. 부트스트랩 구간(4건 미만은 채점 안 함)이므로 참고값이고 규칙 근거로 쓰지 않는다.
- **채점 불가 1건(0907-01)**: 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 실측 스냅샷은 14개(글 8건)다. 스냅샷 4건은 h1/h24/h168 창과 안 맞아 제외됐다(catchup 1회성 관측). 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도 (n 기준)

- C-12, G-4, G-8, H3, P-03, P-09: 규칙마다 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산 불가(`-`)다.
- 전 규칙이 n=1 보류다. 어떤 규칙도 근거로 쓸 수 없고, 순위를 매기지 않는다.

## 확인 필요 (이상 징후)

- **h168 스냅샷 공백**: 0906-01·0907-03 엔트리 ID 날짜는 9월이다. 발행일은 이 출력으로 확인 못 했지만, 로그 ID 날짜가 발행 시점과 비슷하다면 h168이 이미 지났을 텐데도 "아직 안 됐거나 수집 실패"로 남아 있다. 수집 실패라면 `collect-metrics`를 점검해야 한다.
- **0907-02 두 지표가 같은 값**: reply_rate와 like_rate 실측이 둘 다 0.0315다. 우연일 수 있지만, 같은 필드를 읽는 버그일 수도 있다. 이 출력만으로는 판단할 수 없다. `threads-report.mjs`로 원 스냅샷을 대조해야 한다.
- **0907-01 연결 글 없음**: 예측만 있고 발행 글 매핑이 없다. 발행 글 연결 누락인지 미발행인지 확인 못 했다.
- 위 세 가지는 이 원자료만으로 확인하지 못했다. `threads-report.mjs`는 이번 원자료에 포함되지 않았다.

## 커버리지

- **매칭 가능 병목 7/7.** 갭(케이스 0~1곳)인 병목은 없다.
- 가장 얇은 곳은 케이스 3곳 병목이다. DISTRIBUTION(무브 6건, Figma·Testimonial.to·Zapier)과 SUPPLY(무브 5건, Fathom·Magic Spoon·Purple Innovation)다. 케이스 1곳이 빠지면 2곳으로 줄어든다.
- AWARENESS는 케이스 4곳이지만 무브가 6건으로 적다. 병목당 앵글 선택지가 좁다.
- TRUST는 케이스 4곳에 무브 11건으로 가장 두껍다.

## 다음 앵글 후보

원자료에 무브 제목이 없어 무브 단위로 못 짚었다. 병목 단위로 적는다. 무브 선택은 CMO가 승인된 무브 목록에서 한다.

1. **SUPPLY**: 무브 5건으로 가장 적다. 케이스 3곳(Fathom, Magic Spoon, Purple)이라 이 병목 글이 나가야 규칙 채점 표본도 다양해진다.
2. **DISTRIBUTION**: 케이스 3곳, 무브 6건이다. 같은 이유로 얇고, SUPPLY와 병목이 달라 표본이 겹치지 않는다.
3. **TRUST**: 무브 11건으로 선택지가 가장 넓다. 지금 채점이 전 규칙 n=1 보류라서, 발행 건수를 빨리 쌓을 수 있는 병목이 필요하다.

## 이번 검토에서 한 일

- 원자료의 보류·확인 불가를 유효/무효로 접지 않았다.
- 개선점 2건을 찾았다: h168 공백 점검, 0907-02 지표 동일값 대조.

## 카드 후보

- SUPPLY 병목 무브 1건: 케이스 3곳·무브 5건으로 7개 병목 중 가장 얇아서
- DISTRIBUTION 병목 무브 1건: 케이스 3곳·무브 6건이고 SUPPLY와 표본이 겹치지 않아서
- TRUST 병목 무브 1건: 무브 11건으로 발행을 빨리 쌓을 수 있고, 규칙 전부가 n=1 보류라 채점 표본이 필요해서

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-19-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-19 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-20T01:46:51.916Z)
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
- ℹ️ Notion 푸시: tention-equal-shutdown-41e100b7ffb481e891d4d5bda7d63968 ✅ DISCOVERY-2026-11-19 → https://app.notion.com/p/DISCOVERY-2026-11-19-41e100b7ffb48131b33df12d48572c21 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-20-CMO 기록·재확인

_실행 키 `cmo-2026-11-19-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
