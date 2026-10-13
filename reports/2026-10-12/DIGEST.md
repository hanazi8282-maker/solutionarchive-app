# CMO 데일리 다이제스트 2026-10-12

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

# 2026-10-12 성과 해설

**결론:** 이번 주 성과 데이터로는 어떤 규칙도 유효나 무효로 판정할 수 없다. 앵글은 성과가 아니라 커버리지와 표본 확보 기준으로 고른다. 먼저 `LOG-20260906-01`과 `LOG-20260907-03`의 h168 스냅샷이 왜 비어 있는지 확인해야 한다.

## 채점 결과
- 유효 0 / 무효 0 / **보류 3엔트리(6항목, 표본 부족)**. 이 보류는 실패도 성공도 아니다.
- 채점 불가(확인 불가) 1건: `LOG-20260907-01`은 연결된 발행 글이 없다. 0점이 아니라 측정 자체를 못 했다는 뜻이다.
- 규칙 6개(C-12, G-4, G-8, H3, P-03, P-09)는 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다. 신뢰도를 논할 표본이 아직 없다.
- 판정 로그 23개 중 예측이 달린 것은 4개(예측 항목 7개)다. 나머지 19개는 채점 대상이 아니다.

## 보류 사유 (엔트리별)
- `LOG-20260906-01`: h168 스냅샷이 없다(like_rate, share_rate 모두).
- `LOG-20260907-03`: h168 스냅샷이 없다(share_rate, like_rate 모두).
- `LOG-20260907-02`: 부트스트랩 구간이고 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 실측값 0.0315는 참고값일 뿐 규칙 근거로 쓰지 않는다.

## 확인 대상 (정상으로 읽지 않는다)
- **h168 부재는 "아직 시점이 안 됐다"로 단정할 수 없다.** 로그 ID가 09-06·09-07이고 오늘은 10-12라서, 발행이 그 무렵이었다면 168시간 창은 이미 한참 지났다. 그 경우 수집 실패다. 다만 발행일은 이 자료에 없어 확정하지 못한다.
- 스냅샷 4건은 h1/h24/h168 창과 나이가 맞지 않아(`catchup` 1회성 관측) 채점에서 빠졌다. 그 글에 데이터가 없다는 뜻은 아니다.
- `LOG-20260907-02`의 reply_rate와 like_rate가 둘 다 0.0315로 같다. 우연일 수도 있고 같은 값이 두 지표에 들어갔을 수도 있다. 원자료를 직접 보기 전에는 판단하지 않는다.
- 스냅샷 14개는 post 8건에서 나왔다. 발행 누적이 10건을 넘는지는 이 자료에 없어 확인 불가다. 부트스트랩 구간이 끝났는지도 그래서 확정하지 못한다.

## 커버리지
- 매칭 가능 병목 **7/7**. 케이스가 0곳이거나 1곳뿐인 병목은 없다.
- 가장 얇은 곳은 DISTRIBUTION(케이스 3곳 · 무브 6건)과 SUPPLY(케이스 3곳 · 무브 5건)이다. 갭은 아니지만 매칭 여유가 가장 작다.
- AWARENESS, TRUST, CONVERSION, RETENTION은 케이스 4곳, UNIT_ECONOMICS는 5곳이다.
- 무브가 가장 많은 병목은 TRUST로 11건이다. 가장 적은 병목은 SUPPLY로 5건이다.

## 다음 앵글 후보
무브 목록이 원자료에 없어 특정 무브를 지목하지는 못했다. 병목 단위로 제시하고, 무브 선택은 CMO가 승인 무브 목록에서 한다.
1. **TRUST** (Everlane, Ritual, Seed Health, Tuft & Needle): 승인 무브가 11건으로 가장 많아 짧은 기간에 발행을 쌓아 표본 10건을 채우기 좋다. 지금 가장 부족한 것은 표본이다.
2. **SUPPLY** (Fathom Analytics, Magic Spoon, Purple Innovation): 무브 5건으로 재고가 가장 얇다. 케이스가 더 늘기 전에 어떤 무브가 글로 옮겨지는지 먼저 확인해 둘 가치가 있다.
3. **DISTRIBUTION** (Figma, Testimonial.to, Zapier): 케이스 3곳으로 매칭 하한(2곳)에 가장 가깝다. 한 곳이 반려되면 바로 갭이 되므로 지금 여유 있게 발행해 두는 쪽이 안전하다.

앵글 선정에 이번 채점 결과는 쓰지 않았다. 훅이 먹히는지에 대한 근거가 0이기 때문이다.

## 확인 못 한 것
- 각 로그의 실제 발행일과 h168 스냅샷 부재 원인. DB 접근이 없고 `score-predictions` 출력에 발행일이 없다.
- 발행 누적 건수. `threads-report.mjs` 출력이 이번 자료에 없다.
- 0.0315 중복의 원인.
- 병목별 무브 단위 목록. `--coverage`는 건수만 낸다.

## 자가검증 (§0)
- **개선점 1:** 처음에는 h168 부재를 "시점 미도래"로 읽기 쉬웠다. 날짜를 대조해 수집 실패 가능성으로 바꿨다.
- **개선점 2:** 보류 6항목과 채점 불가 1건을 같은 칸에 묶지 않고 분리했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-12-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-12 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-13T02:00:29.479Z)
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
- ℹ️ Notion 푸시: ✅ 대기함 설명서 동기화 1150자 ✅ DISCOVERY-2026-10-12 → https://app.notion.com/p/DISCOVERY-2026-10-12-3f8100b7ffb481239ddad41aa45605ba 푸시 완료 — 초안 0건 · 신규케이스 0건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-13-CMO 기록·재확인

_실행 키 `cmo-2026-10-12-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
