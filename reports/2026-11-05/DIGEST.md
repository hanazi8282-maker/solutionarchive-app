# CMO 데일리 다이제스트 2026-11-05

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 198시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 5건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 2026-11-05 성과 해설 (sa-cmo-analyst)

**결론: 이번 회차에는 "무엇이 먹혔다"고 말할 근거가 없다. 규칙 신뢰도는 판정 가능 0건이다. 다음 앵글은 성과가 아니라 커버리지로 고른다.**

## 0. 검토 절차 (principles §0)
- 검토한 것: 채점 결과 4개 엔트리와 7개 예측, 규칙별 신뢰도, 병목 커버리지.
- 개선점 1: 채점 불가 1건과 보류 3건을 합쳐서 "4건 보류"로 쓰지 않고 따로 셌다. 원인이 다르다.
- 개선점 2: LOG-20260907-02에서 서로 다른 지표 두 개가 같은 값을 보인다(아래 확인 대상). 정상 수집으로 접지 않고 표시했다.

## 1. 채점 (예측 항목 7개 · 실측 스냅샷 14개 · 글 8건)
- **유효 0 / 무효 0 / 보류 3 (표본 부족)**, 별도로 **채점 불가 1**. 보류 3건은 모두 예측 항목이 2개씩(총 6개)이고 전부 보류다.
- LOG-20260906-01: 보류. h168 스냅샷이 없다(like_rate, share_rate 2개 모두). 아직 그 시점이 안 됐거나 수집 실패라서 확인 불가다.
- LOG-20260907-02: 보류. 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). reply_rate와 like_rate 2개 모두 실측 0.0315다.
- LOG-20260907-03: 보류. h168 스냅샷이 없다(share_rate, like_rate 2개 모두).
- LOG-20260907-01: 채점 불가. 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 채점에서 뺀 스냅샷 4건은 h1/h24/h168 명목 창과 안 맞는 'catchup' 관측이다. 그 글에 데이터가 없다는 뜻이 아니다.

## 2. 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09: 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다.
- 규칙마다 n=1이고 그것도 보류다. 이 훅이나 규칙이 먹힌다 또는 안 먹힌다는 결론은 낼 수 없다.
- 부트스트랩 구간의 판정은 참고값이며 규칙 근거로 쓰지 않는다.

## 3. 커버리지: 매칭 가능 병목 7/7 (갭 없음)
- 갭(케이스 0~1곳)인 병목은 없다. 매칭 성립선인 서로 다른 케이스 2곳을 모두 넘겼다.
- 상대적으로 얇은 곳은 DISTRIBUTION(케이스 3곳·무브 6건)과 SUPPLY(케이스 3곳·무브 5건)다.
- 나머지 병목:
  - UNIT_ECONOMICS: 5곳·7건
  - TRUST: 4곳·11건
  - AWARENESS: 4곳·6건
  - CONVERSION: 4곳·7건
  - RETENTION: 4곳·6건

## 4. 확인 못 한 것
- **h168 스냅샷 부재 원인:** 글이 아직 168시간이 안 됐는지, 수집이 실패했는지 이 원자료로는 가를 수 없다. 글별 발행 시각과 collect-metrics 실행 이력이 필요하다.
- **LOG-20260907-02의 실측 일치:** reply_rate와 like_rate가 둘 다 0.0315다. 우연일 수도 있고, 같은 필드를 두 지표로 읽는 파서 문제일 수도 있다. 이 원자료만으로는 판단할 수 없으니 원본 스냅샷 행을 대조해야 한다. 그 전까지 이 값을 근거로 쓰지 않는다.
- **LOG-20260907-01:** 글이 연결되지 않은 원인(미발행 또는 연결 누락)을 확인하지 못했다.
- **무브 단위 후보:** 원자료에는 병목별 케이스명만 있고 무브 내용이 없다. 아래 후보는 병목·케이스 단위이고, 무브 선택은 CMO가 승인 무브 목록에서 한다.

## 5. 다음 앵글 후보 (성과 근거 아님, 커버리지 근거)
1. **DISTRIBUTION (Figma·Testimonial.to·Zapier):** 케이스가 3곳으로 가장 얇은 축이다. 매칭 성립선에서 한 곳만 빠져도 무너져서 지금 다뤄야 한다.
2. **SUPPLY (Fathom Analytics·Magic Spoon·Purple Innovation):** 무브가 5건으로 가장 적다. 같은 케이스에서 다른 무브를 골라 쓰면 규칙 n을 늘릴 수 있다.
3. **UNIT_ECONOMICS (Bannerbear·Blueland·Plausible Analytics·Shyp·Harry's):** 케이스가 5곳으로 가장 두터운 축이다. 기준선이 0건인 지금 같은 병목에서 글을 연달아 내야 부트스트랩 구간을 빨리 벗어난다.

## 카드 후보
- DISTRIBUTION 병목 앵글(Figma·Testimonial.to·Zapier 중 무브 1개): 케이스 3곳으로 7개 병목 중 가장 얇아 매칭 여유가 없다
- SUPPLY 병목 앵글(Fathom Analytics·Magic Spoon·Purple Innovation 중 무브 1개): 무브 5건으로 가장 적고, 같은 케이스의 다른 무브로 규칙 표본을 늘릴 수 있다
- UNIT_ECONOMICS 병목 앵글(케이스 5곳 중 무브 1개): 케이스가 가장 두터워 기준선 표본 0건 구간을 벗어나는 데 가장 빠르다

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-05-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-05 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-06T00:57:54.647Z)
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
- ℹ️ Notion 푸시: ll-then-ai-calls-pivot-410100b7ffb481818c55ead26c404419 ✅ DISCOVERY-2026-11-05 → https://app.notion.com/p/DISCOVERY-2026-11-05-410100b7ffb4812199a1d8db1eb92e29 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-06-CMO 기록·재확인

_실행 키 `cmo-2026-11-05-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
