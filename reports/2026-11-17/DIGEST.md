# CMO 데일리 다이제스트 2026-11-17

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 5건(가장 오래된 것 225시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 7건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-17

**결론: 이번 주 성과로 "이 훅이 먹힌다/안 먹힌다"를 말할 수 있는 규칙은 0개다.** 채점된 예측은 전부 보류이고, 규칙 신뢰도(Wilson 하한)도 전부 비어 있다. 다음 앵글은 성과가 아니라 커버리지로 고른다. 커버리지는 7개 병목 모두 매칭 가능하다.

## 채점 결과 (예측 달린 엔트리 4개)

- **유효 0 / 무효 0 / 보류 3 / 채점 불가 1.** 보류와 채점 불가는 실패도 성공도 아니다.
- 보류 엔트리 3개는 LOG-20260906-01, LOG-20260907-02, LOG-20260907-03이다.
- 보류 사유는 두 가지다.
  - **h168 스냅샷 없음(확인 불가):** LOG-20260906-01 2항목, LOG-20260907-03 2항목이다. 아직 그 시점이 안 됐거나 수집이 실패한 것이고, 어느 쪽인지는 원자료만으로 알 수 없다.
  - **부트스트랩 구간:** LOG-20260907-02 2항목이다. 기준선 표본이 0건이고 4건 미만은 채점하지 않는다.
- 채점 불가 1건은 LOG-20260907-01이다. 연결된 발행 글이 없어서 0건이 아니라 확인 불가다.
- 항목 수는 원자료 머리말에 7개로 적혀 있는데 본문에 나온 것은 6개(보류 3개 × 2)다. 나머지 1개는 채점 불가 엔트리 몫으로 보이지만 확인하지 못했다.

## 규칙 신뢰도 (표본 n 기준)

- 규칙은 C-12, G-4, G-8, H3, P-03, P-09 6개이고, 각각 유효 0 / 무효 0 / 보류 1이다(n=1은 보류뿐).
- 분모가 0이라 Wilson 하한은 계산되지 않았다. 규칙 근거로 쓸 수치가 없다.

## 주의할 점

- **한 엔트리에서 두 지표의 실측값이 같다.** LOG-20260907-02는 reply_rate와 like_rate가 모두 0.0315로 찍혔다. 우연일 수도 있고 집계 오류일 수도 있어서 확인 대상이다. 어느 쪽인지는 원자료로 가를 수 없다.
- **판정 로그 23개 중 예측이 달린 것은 4개뿐이다.** 나머지 19개는 예측 없이 쌓여 있어서 채점할 수 없다.
- **스냅샷 4건은 제외했다.** h1/h24/h168 명목 창에 안 맞는 조기·사후 1회성 관측(catchup)이다. 그 글에 데이터가 없다는 뜻은 아니다.
- **발행 누적 건수는 원자료에 없다.** 스냅샷이 있는 글은 8건이고, 부트스트랩 문턱(10건)과 비교할 값은 확인하지 못했다.

## 커버리지 (매칭 가능 병목 7/7, 갭 0)

- 병목 7개 모두 서로 다른 케이스 2곳 이상이라 갭은 없다.
- **DISTRIBUTION:** 케이스 3곳, 무브 6건. 최소 구간이다.
- **SUPPLY:** 케이스 3곳, 무브 5건. 무브 수가 가장 적다.
- **TRUST:** 케이스 4곳, 무브 11건. 가장 두껍다.
- **AWARENESS, CONVERSION, RETENTION:** 각각 케이스 4곳에 무브 6/7/6건이다.
- **UNIT_ECONOMICS:** 케이스 5곳, 무브 7건이다.
- 케이스 3곳 병목(DISTRIBUTION·SUPPLY)은 1곳이 빠져도 2곳이 남아 매칭이 유지된다. 2곳이 빠지면 깨진다.

## 확인 못 한 것

- 무브 단위 식별자·승인일·발행 여부는 원자료에 없다. 그래서 아래 후보는 병목·케이스 단위까지만 짚었고, 무브 선택은 CMO가 한다.
- h168 스냅샷이 없는 이유(시점 미도래인지 수집 실패인지)는 확인하지 못했다.
- LOG-20260907-01에 발행 글이 연결되지 않은 이유는 확인하지 못했다.

## 카드 후보

- SUPPLY 병목 무브 1건(Fathom Analytics·Magic Spoon·Purple Innovation 중). 무브가 5건으로 가장 얇고, 규칙별 표본이 전부 0이라 아직 안 쓴 병목에서 발행 표본을 늘리는 게 우선이다.
- DISTRIBUTION 병목 무브 1건(Figma·Testimonial.to·Zapier 중). 케이스가 3곳이라 매칭 여유가 가장 적은 병목이고, 발행이 늘어야 기준선 4건 문턱을 넘길 수 있다.
- UNIT_ECONOMICS 병목 무브 1건(Bannerbear·Blueland·Plausible Analytics·Shyp·Harry's 중). 케이스가 5곳으로 후보 풀이 가장 넓어 위 두 병목과 병행해도 선택지가 남고, 서로 다른 병목에서 비교 표본을 만들 수 있다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-17-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-17 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-18T02:25:30.292Z)
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
- ℹ️ Notion 푸시: nel-late-exit-shutdown-41c100b7ffb481daaacfead910863714 ✅ DISCOVERY-2026-11-17 → https://app.notion.com/p/DISCOVERY-2026-11-17-41c100b7ffb4817891a6c9f45b366ca1 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-18-CMO 기록·재확인

_실행 키 `cmo-2026-11-17-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
