# CMO 데일리 다이제스트 2026-11-04

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 174시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 4건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-11-04

## 결론
- 채점 가능한 예측이 0건이다. 유효도 무효도 없으니 어떤 훅·규칙도 효과가 있다거나 없다고 말할 근거가 없다.
- 지금 병목은 앵글 부족이 아니라 측정이다. 7개 병목 전부 케이스 3곳 이상이 있고, 막힌 곳은 h168 스냅샷 부재와 기준선 표본 0건이다.
- 할 일은 두 가지다. LOG-20260907-01 의 발행 글 연결 누락을 확인하고, 발행 글이 h168 에 도달하는 것을 기다린다.

## 채점 (예측 항목 7개, 엔트리 4개)
- 유효 0 / 무효 0 / 보류 6 / 채점 불가 1. 보류와 채점 불가는 성공도 실패도 아니다.
- 보류 6건은 LOG-20260906-01, 20260907-02, 20260907-03 에 각각 2항목씩이다.
- LOG-20260906-01 과 20260907-03(h168 스냅샷 없음, 4항목): 아직 그 시점이 안 됐거나 수집이 실패했다. 어느 쪽인지는 이 원자료로 구분할 수 없다. 확인 불가다.
- LOG-20260907-02(2항목): 실측값 0.0315 는 있다. 기준선 표본이 0건이라 채점하지 않는다. 기준선은 4건 미만이면 채점하지 않는다.
- 채점 불가 1건(LOG-20260907-01): 연결된 발행 글이 없다. "0건 나왔다"가 아니라 "연결을 못 찾았다"는 뜻이다. 예측 항목 7개 중 이 엔트리가 1개를 차지한다.

## 확인할 것
- LOG-20260907-02 에서 reply_rate 와 like_rate 의 실측이 둘 다 0.0315 로 같다. 우연일 수도 있지만, 두 지표가 같은 값을 읽었을 가능성이 있다. 부트스트랩 구간이라 판정에는 영향이 없지만 수집 쪽 확인이 필요하다. 원자료만으로는 원인을 알 수 없다.
- 스냅샷 4건은 h1/h24/h168 창과 안 맞는 나이라 채점에서 빠졌다(catchup 1회성 관측). 그 글에 데이터가 없다는 뜻이 아니다.
- 실측 스냅샷은 14개(글 8건)다. 글 8건 중 몇 건이 채점 대상 발행인지는 원자료에 없다. 발행 누적 10건 미만 여부도 확인 불가다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09: 모두 유효 0 / 무효 0 / 보류 1, Wilson 하한 없음.
- 6개 규칙 어느 것도 n=1 보류 상태다. 부트스트랩 판정은 규칙 근거로 쓰지 않는다.

## 커버리지
- 매칭 가능 병목 7/7. 갭(케이스 0~1곳)은 없다.
- 가장 얇은 병목은 DISTRIBUTION(케이스 3곳·무브 6건)과 SUPPLY(케이스 3곳·무브 5건)다. 둘 다 매칭 최소(2곳)에 여유가 1곳뿐이다.
- 나머지: AWARENESS 4곳·6건, TRUST 4곳·11건, CONVERSION 4곳·7건, RETENTION 4곳·6건, UNIT_ECONOMICS 5곳·7건.

## 다음 앵글 후보
이 원자료에는 무브 목록과 어느 무브가 이미 발행됐는지가 없다. 그래서 병목과 케이스 단위로만 제안하고, 구체 무브 선정은 `case-match.mjs` 로 따로 확인해야 한다.
- SUPPLY: 무브가 5건으로 가장 적고, 케이스(Fathom Analytics, Magic Spoon, Purple Innovation)가 3곳뿐이라 먼저 쌓아야 한다.
- DISTRIBUTION: 케이스(Figma, Testimonial.to, Zapier)가 3곳이라 SUPPLY 와 같은 이유로 여유가 얇다.
- TRUST: 무브가 11건으로 가장 두터워 발행 후보가 가장 많다. 발행이 늘면 기준선 4건 확보가 가장 빨라 부트스트랩 구간 탈출에 유리하다.

## 이 해설의 검토 근거 (`_principles.md` §0)
- 원자료의 보류를 실패나 성공으로 접지 않았다.
- 동일한 두 실측값을 개선점으로 발굴했다.
- 무브 단위 근거가 없어서 후보를 병목·케이스 단위로 낮췄고, 수치는 원자료에서만 가져왔다.

## 카드 후보
- SUPPLY 병목 신규 무브 발행 — 5건뿐인 최저 무브 수 병목(Fathom Analytics·Magic Spoon·Purple Innovation)을 먼저 채운다
- DISTRIBUTION 병목 신규 무브 발행 — 케이스 3곳(Figma·Testimonial.to·Zapier)이라 매칭 여유가 1곳뿐이다
- TRUST 병목 무브 연속 발행 — 무브 11건으로 후보가 가장 많아 기준선 4건 확보와 부트스트랩 탈출이 가장 빠르다

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-04-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-04 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-05T00:54:05.904Z)
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
- ℹ️ Notion 푸시: masked-by-growth-pivot-40f100b7ffb48187893fd2610b692989 ✅ DISCOVERY-2026-11-04 → https://app.notion.com/p/DISCOVERY-2026-11-04-40f100b7ffb48146b178f7fbf3e3d78c 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-05-CMO 기록·재확인

_실행 키 `cmo-2026-11-04-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
