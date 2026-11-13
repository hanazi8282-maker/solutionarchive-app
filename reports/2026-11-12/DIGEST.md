# CMO 데일리 다이제스트 2026-11-12

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 103시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 8건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-11-12

**결론: 지금은 규칙 신뢰도를 판단할 수 없다.** 채점된 예측은 유효 0 · 무효 0이고, 전부 보류다. 먼저 h168 스냅샷이 왜 없는지 확인해야 한다. 커버리지는 7/7로 갭이 없다.

## 채점 결과 (예측 항목 7개)
- **유효: 0건**
- **무효: 0건**
- **보류 (표본 부족·확인 불가): 6항목, 엔트리 3개.** 실패도 성공도 아니다.
  - LOG-20260906-01 (2항목)과 LOG-20260907-03 (2항목): h168 스냅샷이 없다.
  - LOG-20260907-02 (2항목): 기준선 표본이 0건이라 부트스트랩 구간에서 채점하지 않았다. 기준선은 4건 이상이어야 한다.
- **채점 불가: 1엔트리 (LOG-20260907-01).** 연결된 발행 글이 없다. 남은 1항목이 여기 속하는지는 원자료만으로 확인 불가다.
- 예측이 달린 엔트리는 23개 중 4개(17%)뿐이다. 스냅샷 14개는 post 8건 분이다.
- 규칙별(C-12, G-4, G-8, H3, P-03, P-09): 각각 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않았다. **어떤 규칙도 "먹힌다/안 먹힌다"로 말할 근거가 없다.**

## 확인 대상
- **h168이 없는 이유가 "아직 시점이 안 됨"일 수 없다.** LOG-20260906-01과 LOG-20260907-03은 9월 초 엔트리인데 오늘은 11-12다. 수집 실패나 catchup 스냅샷과 창이 안 맞는 문제로 보인다. 제외된 4건이 이 글들 것인지는 확인 불가다.
- **LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 같다.** 서로 다른 지표가 우연히 같은 값일 수도 있다. 하지만 같은 필드를 읽었을 가능성이 있으니 수집·집계 쪽 확인이 먼저다. 기준선이 없어 보류라는 점은 별개다.
- **부트스트랩 문턱(발행 10건) 충족 여부는 확인 불가다.** 스냅샷이 있는 글은 8건이다. 발행 누적 수는 이 원자료에 없다.
- `threads-report.mjs`는 실행 결과가 오지 않아 `views < 100` 보류 건수를 따로 셀 수 없었다.

## 커버리지: 매칭 가능 병목 7/7, 갭 0
- AWARENESS: 케이스 4곳, 무브 6건.
- TRUST: 케이스 4곳, 무브 11건. 무브가 가장 많다.
- CONVERSION: 케이스 4곳, 무브 7건.
- RETENTION: 케이스 4곳, 무브 6건.
- UNIT_ECONOMICS: 케이스 5곳, 무브 7건. 케이스가 가장 많다.
- DISTRIBUTION: 케이스 3곳, 무브 6건. 가장 얇은 편이다.
- SUPPLY: 케이스 3곳, 무브 5건. 무브 수도 최소다.
- 케이스 0/1곳인 병목은 없다. 다만 DISTRIBUTION과 SUPPLY는 케이스가 1곳만 빠져도 매칭 불가 경계(2곳)에 가깝다. 지금은 여유가 1곳이다.

## 다음 앵글 후보
무브 단위 이름은 원자료에 없어 병목 단위로만 적는다. 구체 무브는 `case-match.mjs` 실행 뒤에 고른다.
- 앵글 선정 근거는 성과가 아니라 커버리지와 표본이다. 성과 채점이 전부 보류라 어떤 훅이 먹히는지 아직 모른다.

## 카드 후보
- SUPPLY 병목(Fathom·Magic Spoon·Purple 계열) 무브 발행: 케이스 3곳·무브 5건으로 가장 얇아, 발행해 반응 표본을 먼저 쌓을 가치가 크다.
- DISTRIBUTION 병목(Figma·Testimonial.to·Zapier) 무브 발행: SUPPLY와 같은 케이스 3곳이라 매칭 여유가 1곳뿐이고, 발행 다양성도 채운다.
- TRUST 병목 무브 발행(무브 11건): 후보 풀이 가장 커서, h168까지 추적되는 예측 달린 글을 만들 선택지가 많다. 예측 6필드를 반드시 채운다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-12-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-12 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-13T01:04:08.651Z)
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
- ℹ️ Notion 푸시: eft-sold-to-competitor-417100b7ffb481598738d3ae6d4a5404 ✅ DISCOVERY-2026-11-12 → https://app.notion.com/p/DISCOVERY-2026-11-12-417100b7ffb4814794b3c4c815eea4a7 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-13-CMO 기록·재확인

_실행 키 `cmo-2026-11-12-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
