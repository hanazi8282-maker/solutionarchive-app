# CMO 데일리 다이제스트 2026-11-01

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 101시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-01

**결론:**
- 지금 채점으로 규칙을 평가할 수 없다. 유효 0, 무효 0이고 전부 보류나 확인 불가다.
- 커버리지는 갭이 없다(7/7). 병목은 앵글 부족이 아니라 측정이다. h168 스냅샷이 비어 있고 기준선 표본이 0건이다.
- 다음 앵글은 새 병목을 여는 것보다 기준선 표본을 쌓는 쪽이 낫다.

## 채점 (엔트리 단위)
- **유효 0 / 무효 0.** 판정이 난 엔트리가 하나도 없다.
- **보류 3건 (표본 부족).** 실패도 성공도 아니다.
  - LOG-20260906-01: h168 스냅샷 없음 (예측 2항목).
  - LOG-20260907-02: 기준선 표본 0건, 부트스트랩 구간 (예측 2항목).
  - LOG-20260907-03: h168 스냅샷 없음 (예측 2항목).
- **채점 불가 1건 (확인 불가).** LOG-20260907-01은 연결된 발행 글이 없다. 0점이 아니다.
- **규칙별 신뢰도.** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 산출 불가다. 이 중 어떤 규칙도 근거로 쓸 수 없다.
- **표본.** 판정 로그 23개 중 예측이 달린 것은 4개, 예측 항목은 7개다. 스냅샷은 14개(글 8건)다. 스냅샷 4건은 명목 창(h1/h24/h168)과 나이가 안 맞아 제외됐는데, 그 글에 데이터가 없다는 뜻은 아니다.

## 확인 못 한 것
- **예측 항목 7개 중 6개만 출력에 보인다.** 나머지 1개는 원자료에 없다. LOG-20260907-01의 항목일 수 있지만 확인하지 못했다.
- **LOG-20260907-02의 reply_rate와 like_rate가 같은 값(0.0315)이다.** 우연일 수 있다. 지표 매핑 오류일 가능성도 있어 이 값은 신뢰하지 않는다. 기준선이 없어서 이 값으로는 어떤 판정도 하지 않았다.
- **LOG-20260906-01과 -03의 h168 부재가 "아직 안 됐다"인지 "수집 실패"인지 구분되지 않는다.** 로그 ID 날짜(9/6, 9/7)로 보면 오늘(11/1)까지 7주 넘게 지났다. 발행일이 로그 날짜와 비슷하다면 h168은 이미 지났어야 한다. 이 경우는 수집 실패 의심이라 `collect-metrics` 점검이 필요하다. 발행일 자체는 원자료에 없어서 이 해석은 확정이 아니다.
- **LOG-20260907-01에 발행 글이 없는 이유**는 원자료에 없다. 글을 아직 발행하지 않은 것인지 연결이 끊긴 것인지 모른다.
- 발행 누적 건수는 원자료에 없다. 기준선 표본이 0건이니 부트스트랩 구간(10건 미만)으로 취급한다.

## 커버리지
- **매칭 가능 병목 7/7.** 갭인 병목(케이스 0~1곳)은 없다.
- **가장 얇은 곳은 케이스 3곳인 DISTRIBUTION(무브 6건)과 SUPPLY(무브 5건)다.** 최소 요건(2곳)보다 1곳 많을 뿐이다. 케이스 1곳이 철회되거나 반려되면 바로 갭 경계가 된다.
- AWARENESS, CONVERSION, RETENTION은 케이스 4곳이다. UNIT_ECONOMICS는 5곳이다. TRUST는 4곳에 무브 11건으로 재료가 가장 두껍다.

## 다음 앵글 후보 (병목 단위)
이번 원자료에는 무브 ID가 없다. 그래서 무브 단위가 아니라 병목 단위로만 제안하고, 무브 선택은 `case-match.mjs` 출력으로 한다.
- **TRUST — 무브 11건으로 재료가 가장 많다.** 같은 병목에서 구조가 비슷한 글을 여러 건 내면 기준선 표본 4건 이상을 가장 빨리 채울 수 있다. 지금 기준선이 0건이라 이게 가장 급하다.
- **SUPPLY 또는 DISTRIBUTION 중 하나.** 케이스가 3곳뿐이라 이 병목은 한 번도 안 써 보고 방치할 이유가 없다. 다만 이 병목의 기존 발행 여부는 원자료에 없어서 중복 여부는 확인 후에 정한다.
- **UNIT_ECONOMICS — 케이스 5곳, 무브 7건.** 케이스 여유가 가장 커서, 위 두 후보와 훅 구조를 달리해 비교 표본을 만들기에 가장 안전하다. 규칙별 비교는 표본이 쌓인 뒤에나 의미가 있다.

## 선행 조치 (앵글보다 먼저)
- `collect-metrics`에서 9/6, 9/7 글의 h168 스냅샷이 실제로 누락됐는지 확인한다. 이 결과가 채점 가능 여부를 좌우한다.
- LOG-20260907-01의 발행 글 연결 상태를 확인한다.

## 절차 점검
- 기획: 채점, 커버리지, 앵글 순서로 읽었다.
- 자가검증: 보류와 확인 불가를 분리했고, 근거 없는 후보 앵글(무브 ID)은 만들지 않았다.
- 개선점: 같은 값 0.0315, h168의 "미도래 vs 수집 실패" 구분, 예측 항목 1개 누락을 찾아 확인 대상으로 올렸다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-01-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-01 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-01T23:34:38.646Z)
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

_실행 키 `cmo-2026-11-01-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
