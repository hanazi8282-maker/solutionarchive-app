# CMO 데일리 다이제스트 2026-10-11

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

# 성과 해설 — 2026-10-11

**결론:** 이번 주는 채점할 수 있는 예측이 0건이다. 규칙을 평가할 근거는 없다. 지금 할 일은 새 앵글을 고르는 것이 아니라 h168 스냅샷이 왜 비었는지 확인하는 것이다. 7개 병목은 모두 커버리지가 충족돼 있어서 갭은 없다.

## 채점 (예측 항목 7개)
- **유효 0 / 무효 0 / 보류 6.** 보류 6건이 전부 채점 불가 상태다. 성공도 실패도 아니다.
- 채점 불가 엔트리 1건(LOG-20260907-01)은 연결된 발행 글이 없다. 이 엔트리의 항목은 위 6건에 들어 있지 않다. 7개 중 나머지 1개로 보이지만, 로그에 항목 수가 적혀 있지 않아 확인 불가다.
- 보류 사유 ① h168 스냅샷 없음 (LOG-20260906-01, LOG-20260907-03): 항목 4건
- 보류 사유 ② 기준선 표본 0건, 4건 미만은 채점 안 함 (LOG-20260907-02): 항목 2건. 부트스트랩 구간이라 참고값이다.
- 규칙 6개(C-12, G-4, G-8, H3, P-03, P-09)는 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 계산되지 않았다. **이 6개 규칙에 대해서는 어떤 결론도 낼 수 없다.**
- 표본은 로그 엔트리 23개 중 예측이 달린 것이 4개, 스냅샷은 14개(글 8건)다.

## 확인할 것 (이상 징후)
- **h168 스냅샷 부재가 "아직 시점이 안 된 것"인지 의심스럽다.** LOG-20260906-01과 LOG-20260907-03은 로그 날짜가 5주 전이다. 이 날짜가 발행일이라면 h168은 이미 지났어야 한다. 그렇다면 보류가 아니라 수집 실패일 수 있다. 로그 날짜가 발행일인지는 원자료만으로 확인 불가다.
- **LOG-20260907-02의 reply_rate와 like_rate 실측값이 둘 다 0.0315로 같다.** 우연일 수도 있고, 지표 매핑 오류일 수도 있다. 원자료만으로는 구분할 수 없다. 이 값은 규칙 근거로 쓰지 않는다.
- **스냅샷 4건은 채점에서 제외됐다.** h1/h24/h168 명목 창과 맞지 않는 `catchup` 관측이다. 글에 데이터가 없다는 뜻은 아니다.

## 커버리지: 매칭 가능 병목 7/7 (갭 없음)
- **갭(케이스 0~1곳): 없음.** 가장 얇은 병목은 3곳이다.
- SUPPLY: 케이스 3곳 · 무브 5건. 가장 얇다.
- DISTRIBUTION: 케이스 3곳 · 무브 6건
- AWARENESS 4곳·6건, CONVERSION 4곳·7건, RETENTION 4곳·6건
- TRUST: 4곳 · 무브 11건. 가장 두껍다.
- UNIT_ECONOMICS: 케이스 5곳 · 무브 7건. 케이스 수는 가장 많다.

## 다음 앵글 후보 (무브 단위 이름은 원자료에 없어 병목 단위로만 제시)
1. **SUPPLY (Fathom Analytics, Magic Spoon, Purple Innovation 중)** — 무브가 5건으로 가장 적다. 케이스 3곳 중 1곳만 빠져도 2곳 미만이 되어 매칭이 깨지므로, 지금 쌓아 두면 여유가 생긴다.
2. **TRUST (Everlane, Ritual, Seed Health, Tuft & Needle 중)** — 무브 11건으로 재료가 가장 많다. 같은 병목에서 예측을 여러 건 내면 규칙당 표본이 빨리 쌓인다. 지금은 규칙마다 표본이 1건뿐이다.
3. **DISTRIBUTION (Figma, Testimonial.to, Zapier 중)** — SUPPLY와 같이 케이스 3곳으로 얇다. 성과 데이터가 없어 이 선택은 성과가 아니라 커버리지 균형만 근거로 한다.

## 확인 못 한 것
- 발행 누적 건수가 10건 이상인지: `threads-report.mjs` 결과가 없다. 스냅샷이 있는 글은 8건이다.
- `views < 100` 해당 여부: 원자료에 조회수가 없다.
- 위에 적은 h168 스냅샷 부재 원인과 0.0315 중복의 원인. DB 접근이 없어 판단하지 않았다.
- 후보 3개의 개별 무브 이름과 등급: 케이스 이름만 있고 무브 단위 목록이 없다.

**검토 근거 (_principles §0):**
- 보류를 실패나 성공으로 세지 않았다.
- 부트스트랩 값을 규칙 근거로 쓰지 않았다.
- 개선점으로 "보류"의 원인 분류(미도래 vs 수집 실패)와 0.0315 중복 의심을 찾았다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-11-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-11 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-11T23:38:46.788Z)
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
- ℹ️ Notion 푸시: doption-path-seed-fail-3f6100b7ffb4815aa6e2c20044602b87 ✅ DISCOVERY-2026-10-11 → https://app.notion.com/p/DISCOVERY-2026-10-11-3f6100b7ffb4813fb28cd8cd9c2baf57 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-12-CMO 기록·재확인

_실행 키 `cmo-2026-10-11-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
