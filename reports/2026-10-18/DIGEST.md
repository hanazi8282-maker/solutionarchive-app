# CMO 데일리 다이제스트 2026-10-18

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

# 성과 해설 2026-10-18

**결론:** 이번 주 채점으로 확정된 것은 없다. 규칙은 유효로도 무효로도 판정하지 않는다. 다음 앵글은 성과가 아니라 커버리지로 고르고, 같은 지표를 예측하는 글을 쌓아 기준선 4건을 채우는 게 먼저다.

## 채점 (엔트리 4개, 예측 항목 7개)
- **유효 0 / 무효 0.** 채점이 성립한 건이 없다.
- **보류 3엔트리 (6항목, 표본 부족).** 이 건들은 성공도 실패도 아니다.
  - h168 스냅샷 없음: 2엔트리·4항목 (LOG-20260906-01, LOG-20260907-03). 아직 그 시점이 안 됐거나 수집이 실패한 것인데, 로그만으로는 어느 쪽인지 구분되지 않는다.
  - 부트스트랩 구간: 1엔트리·2항목 (LOG-20260907-02). 기준선 표본이 0건이다(4건 미만은 채점하지 않음).
- **채점 불가 1엔트리 (LOG-20260907-01).** 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 규칙 6개(C-12, G-4, G-8, H3, P-03, P-09)는 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 계산되지 않았다.
- **이 구간 판정은 규칙 근거로 쓰지 않는다.** 규칙당 n=1이고 전부 보류라 "이 훅이 먹힌다"는 결론은 낼 수 없다.

## 의심스러운 점
- LOG-20260907-02는 reply_rate와 like_rate의 실측값이 둘 다 0.0315로 같다. 우연일 수도 있고 지표 매핑 오류일 수도 있다. 판정이 보류라 지금은 영향이 없지만, 기준선이 쌓이기 전에 CTO가 원자료를 확인해야 한다.
- 제외된 스냅샷 4건은 명목 창(h1/h24/h168)과 나이가 안 맞는 1회성 관측(`catchup`)이다. 그 글에 데이터가 없다는 뜻이 아니다.
- h168 스냅샷이 없는 4항목은 "아직 안 됐다"와 "수집 실패"가 구분되지 않는다. 발행 시각 대비 경과 시간을 확인하면 가를 수 있고, 지금은 분석가가 못 한다.

## 커버리지: 매칭 가능 병목 7/7, 0~1곳 갭은 없음
- 가장 얇은 병목은 SUPPLY(케이스 3곳·무브 5건)다.
- DISTRIBUTION(3곳·6건)도 얇다.
- AWARENESS·TRUST·CONVERSION·RETENTION은 4곳, UNIT_ECONOMICS는 5곳이다.
- 무브 수는 TRUST가 11건으로 가장 많다. 7개 병목 합은 48건이다.
- 이 수치는 승인된 케이스 기준이다. 발행 이력과 겹치는지는 이 자료로 알 수 없다.

## 다음 앵글 후보
무브를 지정하려면 케이스 상세를 읽어야 하는데 이번 자료에는 없다. 그래서 병목 단위로만 제안한다.
1. **SUPPLY** (Fathom, Magic Spoon, Purple Innovation): 커버리지가 가장 얇다(3곳·5건). 이 병목을 먼저 써야 매칭 풀이 비는 일이 없다.
2. **DISTRIBUTION** (Figma, Testimonial.to, Zapier): 3곳으로 SUPPLY와 같이 얇다. 두 병목을 번갈아 쓰면 얇은 쪽에서 케이스가 1곳이 되는 일을 막을 수 있다.
3. **TRUST** (무브 11건): 선택폭이 가장 넓다. 보류 6항목은 모두 같은 지표(좋아요·공유·답글률)에 몰려 있으므로, 같은 지표를 예측하는 글을 이 병목에서 골라야 기준선 4건이 가장 빨리 찬다.

## 확인 못 한 것
- 엔트리별 병목·무브 정보가 없어서 위 후보가 이미 발행된 병목인지 알 수 없다. `threads-report.mjs` 는 이번에 실행하지 않았다.
- 발행 누적 건수 자체가 원자료에 없어서 부트스트랩 10건 기준에 얼마나 남았는지 모른다.
- 예측 항목 7개 중 6개는 보류로 로그에 나왔다. 나머지 1개는 채점 불가 엔트리(LOG-20260907-01)의 몫으로 추정했고 로그에는 직접 나오지 않는다.

## 검토 근거 (§0)
- 이 요약을 후보 그대로 내면 얇은 병목만 제시하고 지표 정렬은 빠뜨린다. 그래서 3번 후보에 "같은 지표 예측으로 기준선을 채운다"는 기준을 넣었다.
- 0.0315 중복은 처음 요약에 없었다. 재검토에서 찾아 추가했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-18-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-18 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-18T22:24:34.572Z)
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
- ℹ️ Notion 푸시: no-commitment-shutdown-3fd100b7ffb48154bcc4f7c28e540672 ✅ DISCOVERY-2026-10-18 → https://app.notion.com/p/DISCOVERY-2026-10-18-3fd100b7ffb4811f9880f4bba58fd6e9 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-19-CMO 기록·재확인

_실행 키 `cmo-2026-10-18-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
