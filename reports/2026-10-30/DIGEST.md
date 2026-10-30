# CMO 데일리 다이제스트 2026-10-30

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 53시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-10-30

## 결론
- 채점된 예측이 **0건**이다. 이번 원자료만으로는 어떤 규칙이나 훅도 "먹힌다/안 먹힌다"고 결론낼 수 없다.
- 커버리지 갭은 없다. 병목 7개 전부가 서로 다른 케이스 2곳 이상으로 매칭 가능하다.
- 지금 병목은 소재 부족이 아니라 **측정 데이터 부족**이다. 다음 앵글은 h168 채점까지 이어질 글을 우선한다.

## 채점 (예측 항목 7개, 엔트리 4개)
- **유효 0 / 무효 0 / 보류 6 (표본 부족) / 채점 불가 1 엔트리**. 보류는 실패로도 성공으로도 세지 않았다.
- LOG-20260906-01: 보류 2항목. h168 스냅샷이 없어 확인 불가다. 아직 시점이 안 됐거나 수집이 실패했는지는 이 출력으로 구분되지 않는다.
- LOG-20260907-03: 보류 2항목. 위와 같은 사유(h168 없음)다.
- LOG-20260907-02: 보류 2항목. 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 이 구간 값은 규칙 근거로 쓰지 않는다.
- LOG-20260907-01: 채점 불가. 연결된 발행 글이 없다. 0점이 아니라 확인 불가다.
- 항목 수가 맞지 않는다. 7개 중 출력에 나온 건 6개이고, 나머지 1개는 채점 불가 엔트리 몫으로 추정한다. 출력에 없어서 확인 못 했다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09: 모두 유효 0 / 무효 0 / 보류 1, Wilson 하한 없음.
- 6개 규칙 모두 n=0이라 신뢰도 순위를 매길 수 없다.

## 의심스러운 점
- LOG-20260907-02에서 reply_rate와 like_rate의 실측이 둘 다 0.0315로 똑같다. 우연일 수 있지만 같은 값을 두 지표에 넣은 버그일 수도 있다. 원자료만으로는 판별이 안 되니 스냅샷 원본 대조가 필요하다.
- 스냅샷 4건은 h1/h24/h168 창에 안 맞는 조기·사후 1회성 관측이라 제외했다. 이 글들에 데이터가 없다는 뜻은 아니다.
- 실측 스냅샷 14개는 post 8건 몫이다. 발행 누적이 10건을 넘었는지는 이 출력으로 확인 불가라, 부트스트랩 구간 해제 여부는 모른다.

## 커버리지: 매칭 가능 7/7, 갭 없음
- AWARENESS: 케이스 4곳 · 무브 6건.
- TRUST: 케이스 4곳 · 무브 11건.
- CONVERSION: 케이스 4곳 · 무브 7건.
- RETENTION: 케이스 4곳 · 무브 6건.
- UNIT_ECONOMICS: 케이스 5곳 · 무브 7건.
- **DISTRIBUTION: 케이스 3곳 · 무브 6건.** 하한(2곳)과 1곳 차이다.
- **SUPPLY: 케이스 3곳 · 무브 5건.** 7개 중 무브가 가장 적고 하한과 1곳 차이다.

## 다음 앵글 후보
이 원자료에는 무브 단위 정보가 없다. 그래서 병목 단위로만 제시하고, 구체 무브 선정은 CMO가 승인된 무브 목록에서 한다.
1. **TRUST**: 무브가 11건으로 가장 풍부하다. 보류 6건을 채점으로 넘기려면 골라 쓸 소재가 넉넉한 병목에서 예측이 달린 글을 내는 게 가장 빠르다.
2. **SUPPLY**: 무브 5건으로 가장 얇다. 케이스가 하나만 빠져도 매칭이 불가능해지니, 소재가 남은 지금 한 건 써 두는 게 안전하다.
3. **DISTRIBUTION**: 케이스 3곳으로 SUPPLY와 같은 여유다. SUPPLY와 병행해 얇은 병목을 먼저 소진하지 않도록 순서를 정한다.

어느 후보든 예측 6필드를 달고 나가야 한다. 지금 규칙 6개가 전부 n=0이라, 예측이 없는 글은 학습에 보탬이 안 된다.

## 확인 못 한 것
- 무브 단위 정보(어떤 무브가 이미 발행됐는지, 어떤 무브가 후보인지): 커버리지 출력에 케이스명과 건수만 있다.
- 발행 누적 건수와 `views < 100` 해당 건수: `threads-report.mjs` 결과가 이번 원자료에 없다.
- h168 스냅샷이 없는 두 엔트리가 "시점 미도래"인지 "수집 실패"인지 구분하는 것.
- 0.0315 중복 값의 원인.
- 이번 해설은 제공된 텍스트만 근거로 했고, 추가 스크립트는 실행하지 않았다.

## 자가검증
- 보류 6건을 유효·무효에 섞지 않았다. 표본 0건에서 나온 진단이라 "채점 불가"와 "보류"를 따로 세었다.
- 개선점으로 중복 값 0.0315와 항목 수 불일치(7 vs 6)를 찾았다. 둘 다 원인을 추정하지 않고 확인 대상으로 남겼다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-30-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-30 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-30T23:43:48.564Z)
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
- ℹ️ Notion 푸시: middle-market-no-niche-409100b7ffb4817bb1b9cd14ba82b33a ✅ DISCOVERY-2026-10-30 → https://app.notion.com/p/DISCOVERY-2026-10-30-409100b7ffb481eabfd8c79e7d433a8d 푸시 완료 — 초안 0건 · 신규케이스 2건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-31-CMO 기록·재확인

_실행 키 `cmo-2026-10-30-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
