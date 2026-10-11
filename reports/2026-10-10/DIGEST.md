# CMO 데일리 다이제스트 2026-10-10

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

# 성과 해설 — 2026-10-10

**결론:** 이번 채점에서 규칙 근거로 쓸 수 있는 판정은 0건이다. 커버리지는 7/7이라 갭은 없다. 지금 병목은 새 케이스 조사가 아니라 **채점 가능한 발행 표본이 쌓이지 않는 것**이다.

## 채점 (예측 항목 7개)
- **유효 0 / 무효 0 / 보류 6 (표본 부족) / 채점 불가 1.**
- 보류 6건은 세 엔트리에 걸려 있다.
  - LOG-20260906-01은 항목 2건이 모두 h168 스냅샷 없음이다. 아직 그 시점이 안 됐거나 수집이 실패한 것이다. 둘 중 어느 쪽인지는 확인 불가다.
  - LOG-20260907-03도 항목 2건이 모두 h168 스냅샷 없음이다. 같은 확인 불가다.
  - LOG-20260907-02는 항목 2건이 부트스트랩 구간(기준선 표본 0건, 최소 4건)이라 참고값이다. 이 건으로 "훅이 먹힌다"고 결론 내지 않는다.
- 채점 불가 1건은 LOG-20260907-01이다. 연결된 발행 글이 없어서이고, 0건이 아니라 확인 불가다. 항목 수는 출력에 없다(7−6=1은 추정).
- 로그 23건 중 예측이 달린 것은 4건이다. 나머지 19건은 예측 자체가 없어 채점 대상이 아니다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09는 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다(규칙 6개, 각 n=1 보류).
- 어느 규칙도 좋다 나쁘다 말할 수 없다. 판정 가능 표본은 전체 0이다.

## 확인이 필요한 것
- LOG-20260907-02에서 `reply_rate`와 `like_rate` 실측이 둘 다 0.0315로 같다. 우연일 수 있지만 지표 매핑 오류일 수도 있다. 이 출력만으로는 가를 수 없어 확인 불가다.
- 실측 스냅샷은 14개(글 8건)이고 4건은 `catchup` 관측이라 채점에서 뺐다. 14개에 그 4건이 포함인지는 출력에 없다.
- h168 스냅샷이 없는 두 글이 "아직 시점 전"인지 "수집 실패"인지는 발행일 없이 구분할 수 없다. 이 출력에는 발행일이 없다.

## 커버리지 갭
- 매칭 가능 병목은 7/7이다. 케이스 0~1곳인 갭 병목은 없다.
- 가장 얇은 곳은 DISTRIBUTION(케이스 3곳·무브 6건)과 SUPPLY(케이스 3곳·무브 5건)다. 매칭 하한(2곳)에서 1곳 여유뿐이다. 케이스 1곳이 숨김·반려되면 하한에 걸린다.
- UNIT_ECONOMICS는 케이스 5곳으로 가장 두껍다. TRUST는 무브가 11건으로 가장 많다.

## 다음 앵글 후보 (병목 단위)
원자료에 무브 이름이 없어 무브 단위 선정은 못 했다. 병목까지만 좁혔고, 무브 지정은 `case-match.mjs`로 해야 한다.
1. **TRUST** — 무브가 11건으로 가장 많다. 병목은 표본 축적이라 새 조사 없이 발행 건수를 늘릴 수 있는 쪽이 지금 맞다.
2. **SUPPLY** — 무브 5건으로 가장 적고 케이스도 3곳뿐이다. 한 건 발행이 곧 이 병목의 첫 실측이 된다.
3. **DISTRIBUTION** — 케이스 3곳이라 하한 여유가 1곳뿐이다. 발행 전에 케이스 상태(숨김·반려)를 먼저 확인하는 편이 안전하다.

## 개선점
- 예측 6필드가 채워진 글 중 h168에 도달한 것이 0건이라, 규칙 검증이 계속 보류로 쌓인다. 다음 발행분은 예측 항목 수를 줄이더라도 h24·h168 수집 성공 여부를 먼저 확인하는 것이 낫다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-10-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-10 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-10T23:31:57.866Z)
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
- ℹ️ Notion 푸시: com/p/DISCOVERY-2026-10-10-3f5100b7ffb48152bc2ff68ccad3da7a 푸시 완료 — 초안 0건 · 신규케이스 2건 · 발굴 1건 · 스킵 1건 ⏭️ CS-20261009-01 — 결정문서(drafts/threads/2026-10-10-zenefits-licensing-macro-trust-collapse.md) 못 찾음
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-11-CMO 기록·재확인

_실행 키 `cmo-2026-10-10-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
