# CMO 데일리 다이제스트 2026-10-22

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

# 성과 해설 — 2026-10-22

## 결론
- **채점 가능한 예측이 0건이다.** 유효·무효를 말할 근거가 아직 없다. 지금 할 일은 새 앵글 선정이 아니라 측정을 복구하는 것이다.
- **병목 커버리지는 7/7이고 갭이 없다.** 케이스가 부족해서 발행이 막히는 상태는 아니다.
- **측정 쪽이 막혀 있다.** h168 스냅샷 누락 2건, 발행 글 미연결 1건, 기준선 0건 1건이다.

## 채점 (예측 항목 7개, 엔트리 4개)
- **유효 0 / 무효 0 / 보류 6 (표본 부족·확인 불가) / 채점 불가 1.** 유효·무효가 0이라 "먹힌다"도 "안 먹힌다"도 결론 낼 수 없다.
- **보류 6은 사유가 둘이다.**
  - **스냅샷 없음 4건:** LOG-20260906-01 과 LOG-20260907-03 이 h168 스냅샷이 없어 보류다. 항목은 엔트리당 like_rate·share_rate 2개다.
  - **기준선 0건 2건:** LOG-20260907-02 는 부트스트랩 구간이라 보류다. 기준선 표본이 0건이라 임계 비교 자체가 안 된다.
- **채점 불가 1:** LOG-20260907-01 은 연결된 발행 글이 없다. 이 엔트리의 항목 수는 출력에 없다. 7개에서 위 6개를 뺀 1개로 추정한 것이다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 가 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 "-"다. 규칙 근거로 쓸 수 없다.
- **스냅샷:** 14개(post 8건)가 있다. 명목 창(h1/h24/h168)과 안 맞는 4건은 이미 제외됐다. 그 4건은 'catchup' 1회성 관측이고, 그 글에 데이터가 없다는 뜻이 아니다.

## 확인 대상 (정상 아님)
- **LOG-20260907-02 의 reply_rate 와 like_rate 가 둘 다 0.0315 로 같다.**
  - 우연일 수 있다.
  - 같은 분자·분모를 두 지표에 쓰는 매핑 오류일 수도 있다.
  - 이 출력만으로는 구분할 수 없다. 기준선이 생기기 전에 먼저 확인해야 한다.
- **h168 누락을 "아직 시점이 안 됐다"로 읽기 어렵다.**
  - 엔트리 ID 날짜(09-06, 09-07)가 발행일과 같다고 가정하면, 오늘(10-22)은 h168 창을 한참 지났다.
  - 그러면 수집 실패일 가능성이 높다.
  - 엔트리 ID 날짜와 실제 발행일이 같은지는 이 자료로 확인하지 못했다.

## 커버리지 (매칭 가능 병목 7/7)
- **갭(케이스 0~1곳)인 병목은 없다.** 7개 모두 매칭 하한(서로 다른 케이스 2곳)을 넘는다.
- **여유가 가장 작은 곳은 DISTRIBUTION 과 SUPPLY 다.** 둘 다 케이스 3곳이고 하한 대비 여유가 1곳이다.
  - DISTRIBUTION: 무브 6건.
  - SUPPLY: 무브 5건.
- **다른 병목의 케이스 수와 무브 수:**
  - AWARENESS: 4곳, 6건.
  - TRUST: 4곳, 11건.
  - CONVERSION: 4곳, 7건.
  - RETENTION: 4곳, 6건.
  - UNIT_ECONOMICS: 5곳, 7건.

## 다음 앵글 후보
성과 데이터로 후보를 가를 수는 없다. 아래 근거는 재고와 측정 가능성이다. 무브 단위 선정은 `case-match.mjs` 의 무브 목록이 필요한데 이번 원자료에 없어서 하지 않았다. 병목 단위로만 적는다.
- **TRUST:** 무브 11건으로 재고가 가장 두껍다. 같은 병목으로 연속 발행하면 기준선 4건을 가장 빨리 채울 수 있다.
- **UNIT_ECONOMICS:** 케이스 5곳으로 가장 많아 한 곳이 소진돼도 매칭이 유지된다. 병목 간 비교 대조군으로 쓰기 좋다.
- **SUPPLY:** 케이스 3곳, 무브 5건으로 재고가 가장 적다. 소진되기 전에 어떤 무브가 반응하는지 먼저 보려면 지금 쓰는 편이 낫다. 다만 지금까지 어느 병목이 발행됐는지 이번 자료에 없어서, 중복 여부는 확인하지 못했다.

## 확인 못 한 것
- **0.0315 중복의 원인:** 원시 스냅샷을 볼 수 없었다.
- **h168 누락의 원인:** 수집 실패인지 발행일이 늦은 것인지 모른다.
- **LOG-20260907-01 의 항목 수와 연결 글:** 출력에 없다.
- **기존 발행 글의 병목 분포:** `threads-report.mjs` 결과가 이번 원자료에 없다.

## 검토 근거 (_principles §0)
- **개선 1:** 보류 6건의 사유를 둘로 나눴다(스냅샷 없음 / 기준선 0건). 대응이 서로 다르다.
- **개선 2:** 같은 값 0.0315 를 정상으로 넘기지 않고 확인 대상에 올렸다.
- **개선 3:** 성과 근거 없이 앵글을 "추천"하지 않고, 근거가 재고와 측정 가능성뿐이라고 명시했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-22-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-22 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-22T23:21:46.524Z)
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
- ℹ️ Notion 푸시: ilot-purgatory-ip-sale-401100b7ffb481709127d3a1d421546e ✅ DISCOVERY-2026-10-22 → https://app.notion.com/p/DISCOVERY-2026-10-22-401100b7ffb4811394f6c0115bbce296 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-23-CMO 기록·재확인

_실행 키 `cmo-2026-10-22-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
