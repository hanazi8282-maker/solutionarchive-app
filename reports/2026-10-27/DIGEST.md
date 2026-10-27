# CMO 데일리 다이제스트 2026-10-27

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

# 성과 해설 2026-10-27

**결론:** 채점으로 확인된 규칙은 아직 0개다. 이번 판정은 전부 보류이고, 규칙 근거로 쓸 수 없다. 커버리지는 7/7이라 매칭 갭은 없다. 지금 병목은 소재가 아니라 측정이다. 기준선 표본이 0건이고 h168 스냅샷이 비어 있다.

## 채점 (판정 로그 23개 중 예측이 달린 4개, 예측 항목 7개)
- **유효 0 / 무효 0 / 보류 3개 엔트리 (예측 항목 6개).** 보류를 실패나 성공으로 세지 않았다.
- **채점 불가 1개 엔트리 (LOG-20260907-01).** 연결된 발행 글이 없다. 0점이 아니라 확인 불가다. 항목 수는 원자료에 직접 없다. 예측 항목 7개에서 채점된 6개를 뺀 1개로 추정했다.
- **LOG-20260906-01 (n=2 항목):** like_rate, share_rate 모두 h168 스냅샷이 없어 확인 불가다. 아직 그 시점이 안 됐거나 수집에 실패했는데, 원자료만으로는 어느 쪽인지 구분되지 않는다.
- **LOG-20260907-03 (n=2 항목):** 위와 같은 사유로 h168 스냅샷이 없다.
- **LOG-20260907-02 (n=2 항목):** 실측값은 있지만 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 부트스트랩 구간이라 참고값일 뿐이다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09가 각각 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 산출 불가다. 이 규칙들이 먹힌다거나 안 먹힌다는 결론은 낼 수 없다.
- **제외된 스냅샷 4건:** h1/h24/h168 명목 창과 나이가 안 맞는 catchup 관측이다. 그 글에 데이터가 없다는 뜻은 아니다. 전체 실측 스냅샷은 14개(post 8건)다.

## 커버리지 (매칭 가능 병목 7/7)
- **갭 없음.** 케이스 0~1곳인 병목이 없다.
- **얇은 곳:** DISTRIBUTION은 케이스 3곳·무브 6건, SUPPLY는 케이스 3곳·무브 5건이다. SUPPLY는 무브 풀이 가장 작다. 두 병목 모두 매칭 기준(2곳)을 1곳 넘긴 수준이라, 케이스 1곳이 빠지면 바로 갭이 된다.
- **두꺼운 곳:** TRUST는 케이스 4곳·무브 11건으로 가장 풍부하다. UNIT_ECONOMICS는 케이스 5곳으로 가장 많다.

## 다음 앵글 후보 (원자료에 무브 ID가 없어 병목 단위로만 제안)
1. **SUPPLY 무브:** 승인 무브가 5건으로 가장 적다. 소재가 줄기 전에 쓰는 게 낫다.
2. **DISTRIBUTION 무브:** 케이스가 3곳뿐이라 1곳만 빠져도 갭이 된다. 지금 발행해 성과 신호를 남겨 두자.
3. **TRUST 무브:** 무브가 11건이라 같은 병목 안에서 훅만 바꿔 비교할 수 있다. 기준선 4건을 가장 빨리 채울 수 있다. 다만 이건 측정 목적의 제안이고, 성과가 좋다는 근거는 없다.

## 확인 못 한 것
- **발행 누적 건수:** 원자료에 없어 부트스트랩 문턱(10건)에 얼마나 남았는지 모른다.
- **h168 스냅샷 부재의 원인:** 시점 미도래인지 수집 실패인지 구분되지 않는다. `collect-metrics`와 발행 시각을 대조해야 한다.
- **LOG-20260907-02의 reply_rate와 like_rate:** 두 지표가 똑같이 0.0315다. 우연일 수도 있지만 지표 매핑 오류일 수도 있다. 원자료만으로는 판단할 수 없으니 확인이 필요하다.
- **무브 단위 후보:** `--coverage` 출력에 무브 ID가 없어 병목 단위까지만 제안했다.

**검토 과정 (원칙 §0):** 병목별 후보를 정할 때 "소재 소진을 막는 것"과 "측정 표본을 채우는 것" 두 목적을 따로 따졌고, 후보 3은 성과 근거가 아니라 측정 목적이라는 점을 명시했다. 원자료에 없는 수치는 넣지 않았다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-27-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-27 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-27T23:45:14.694Z)
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
- ℹ️ Notion 푸시: te-funded-team-burnout-406100b7ffb4812abc61fd2282741ab7 ✅ DISCOVERY-2026-10-27 → https://app.notion.com/p/DISCOVERY-2026-10-27-406100b7ffb4818c9faefa578908c54f 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-28-CMO 기록·재확인

_실행 키 `cmo-2026-10-27-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
