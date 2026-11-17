# CMO 데일리 다이제스트 2026-11-16

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 3건(가장 오래된 것 201시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 8건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 2026-11-16 성과 해설

**지금 할 일:** 규칙 신뢰도를 판단할 근거가 아직 없습니다. 이번 채점에서 유효·무효는 모두 0건이고, 6항목이 보류, 1엔트리가 채점 불가입니다. 앵글은 성과가 아니라 커버리지 얇은 병목 기준으로만 고릅니다. 먼저 h168 스냅샷이 왜 안 들어오는지 확인해야 합니다.

## 채점 (예측 항목 기준)
- **유효 0 / 무효 0 / 보류 6 (표본 부족)**. 보류는 실패도 성공도 아닙니다.
- 보류 4건: LOG-20260906-01과 LOG-20260907-03 각 2항목. h168 스냅샷이 없어 확인 불가입니다. 아직 그 시점이 안 됐을 수도, 수집이 실패했을 수도 있는데 이 출력만으로는 구분할 수 없습니다.
- 보류 2건: LOG-20260907-02(reply_rate·like_rate). 기준선 표본이 0건이라 부트스트랩 구간입니다(4건 미만은 채점하지 않음). 이 판정은 규칙 근거로 쓰지 않습니다.
- **채점 불가 1엔트리: LOG-20260907-01.** 연결된 발행 글이 없습니다. 0건이 아니라 확인 불가입니다. 전체 예측 7항목에서 보류 6을 뺀 나머지가 이 엔트리의 항목으로 보이지만, 항목 수는 로그에 직접 적혀 있지 않습니다.
- 표본: 판정 로그 23엔트리 중 예측이 달린 것은 4엔트리(항목 7개)입니다. 실측 스냅샷은 14개(post 8건)입니다.
- 스냅샷 4건은 h1/h24/h168 명목 창과 맞지 않는 나이(`catchup` 1회성 관측)라 채점에서 뺐습니다. 그 글에 데이터가 없다는 뜻은 아닙니다.

## 규칙별 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 개 모두 **유효 0 / 무효 0 / 보류 1**이고, Wilson 하한은 계산되지 않았습니다.
- 어느 규칙도 "먹힌다"거나 "안 먹힌다"고 말할 근거가 없습니다.

## 확인 대상
- **LOG-20260907-02**: reply_rate와 like_rate의 실측이 둘 다 0.0315로 같습니다. 우연일 수도 있고 같은 값을 두 번 읽은 것일 수도 있는데, 이 출력만으로는 가릴 수 없습니다. 기준선이 없어 보류된 건이지만, 다음 실행 때 두 지표의 원천 필드를 대조해 볼 만합니다.
- **h168 스냅샷 공백**: 같은 사유의 보류가 4/6건입니다. 기다리면 해결되는 문제인지 수집 실패인지는 이 출력만으로 확인할 수 없습니다. 발행 시각과 `collect-metrics` 실행 이력은 이 원자료에 없습니다.

## 커버리지
- **매칭 가능 병목 7/7**이고 갭(0/1곳)은 없습니다.
- 가장 얇은 곳은 DISTRIBUTION과 SUPPLY(케이스 3곳씩)입니다. 매칭 하한(2곳)과 한 곳 차이입니다.
- 케이스 4곳짜리 병목은 AWARENESS(무브 6건), TRUST(11건), CONVERSION(7건), RETENTION(6건)입니다. UNIT_ECONOMICS는 5곳(7건)입니다.
- 무브 수가 가장 적은 병목은 SUPPLY(5건)입니다.

## 확인 못 한 것
- 발행 누적 건수와 각 글의 views: `threads-report.mjs`를 실행하지 않아 부트스트랩 문턱(10건)과 `views<100` 여부를 직접 확인하지 못했습니다.
- 무브 단위 정보: 원자료에 병목별 케이스·무브 수만 있고 개별 무브 내용은 없습니다. 그래서 아래 후보는 병목 단위이고, 무브 선정은 CMO가 합니다.

## 다음 앵글 후보 (성과 신호 없음, 커버리지 기준)
- SUPPLY(Fathom Analytics, Magic Spoon, Purple Innovation): 무브 5건으로 7개 병목 중 가장 적고 케이스도 3곳이라 얇습니다.
- DISTRIBUTION(Figma, Testimonial.to, Zapier): 케이스 3곳으로 매칭 하한에 가장 가깝고, 무브 6건으로 SUPPLY 다음으로 적습니다.
- UNIT_ECONOMICS(Bannerbear, Blueland, Plausible Analytics, Shyp, Harry's): 케이스 5곳으로 후보 풀이 가장 넓습니다. 규칙 근거가 없는 지금은 예측 6필드를 채워 표본을 쌓기에 부담이 적습니다.

## 카드 후보
- SUPPLY 병목 무브 1개 — 무브 5건·케이스 3곳으로 7개 병목 중 가장 얇아서 갭 진입 전에 먼저 보강
- DISTRIBUTION 병목 무브 1개 — 케이스 3곳이라 매칭 하한(2곳)에 가장 가깝고 무브도 6건뿐
- UNIT_ECONOMICS 병목 무브 1개 — 케이스 5곳으로 풀이 넓어, 규칙 근거 0건인 지금 예측 6필드 표본을 쌓기에 안전

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-16-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-16 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-17T02:55:29.640Z)
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
- ℹ️ Notion 푸시: SE-morningscore-seo-tool-relaunch-failed-ai-substitution-pivot-to-service-unverified-41b100b7ffb4812799f4d855ab631426 ⏭️ 발굴 — 채택·확인불가 0건 (후보 0건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-17-CMO 기록·재확인

_실행 키 `cmo-2026-11-16-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
