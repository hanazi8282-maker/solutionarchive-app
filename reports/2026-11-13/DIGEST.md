# CMO 데일리 다이제스트 2026-11-13

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 127시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 8건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-11-13

- **결론:** 지금 규칙을 판단할 근거가 없다. 채점된 예측이 0건이고, 유효 0 / 무효 0이다.
- **커버리지는 갭이 없다.** 매칭 가능 병목이 7/7이다. 병목은 앵글 재료가 아니고 예측 채점 데이터 부족이 병목이다.
- **먼저 할 일:** h168 스냅샷이 왜 없는지 확인한다 (아래 "확인 못 한 것").

## 채점 결과 (예측 항목 7개 기준)

- **유효 0 / 무효 0 / 보류 6 (표본 부족·스냅샷 없음) / 채점 불가 1.**
- 판정 로그 엔트리는 23개이고, 예측이 달린 건 4개뿐이다.
- 보류 6건은 엔트리 3개에서 나온다 (엔트리당 2항목).
- LOG-20260906-01은 보류 2건이다. like_rate와 share_rate 모두 h168 스냅샷이 없다 (n=0).
- LOG-20260907-03도 보류 2건이다. share_rate와 like_rate 모두 h168 스냅샷이 없다 (n=0).
- LOG-20260907-02는 보류 2건이다. reply_rate와 like_rate는 실측값이 있지만 기준선 표본이 0건이다 (채점 최소 4건). 그래서 부트스트랩 구간이다.
- LOG-20260907-01은 채점 불가 1건이다. 연결된 발행 글이 없고 "0건"이 아니라 확인 불가다. 이 엔트리의 항목 수는 원자료에 없다. 7−6=1로 추정되지만 확인된 값은 아니다.
- 실측 스냅샷은 14개(글 8건)다. 4건은 h1/h24/h168 창과 안 맞는 조기·사후 관측(`catchup`)이라 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도

- C-12, G-4, G-8, H3, P-03, P-09 여섯 규칙이 모두 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 산출되지 않는다 (n=0).
- 어느 규칙도 "먹힌다"거나 "안 먹힌다"고 결론낼 수 없다.
- 규칙당 보류가 1건씩이라, 이번 채점이 규칙별 표본을 1건도 늘리지 못했다.

## 주의할 점

- **LOG-20260907-02의 실측이 이상하다.** reply_rate와 like_rate가 둘 다 0.0315로 같다. 서로 다른 지표가 소수점 넷째 자리까지 같은 것은 우연이라기보다 같은 값을 두 번 읽었을 가능성이 있다. 원인은 확인하지 못했다. 이 값은 기준선이 생기더라도 근거로 쓰지 않는다.
- **h168 스냅샷 부재의 원인이 안 갈린다.** 로그 ID가 09-06·09-07인데 오늘은 11-13이다. 연결된 글의 발행일은 원자료에 없다. 그래서 "아직 시점이 안 됐다"와 "수집 실패" 중 어느 쪽인지 판단할 수 없다.
- **부트스트랩 문턱이 문서마다 다르다.** 분석가 헌장은 발행 누적 10건 미만이라고 적고, 채점 스크립트는 기준선 4건 미만이면 보류한다. 이번 결과는 둘 다에 걸려 영향은 없다. 불일치 자체는 알아 둘 만하다.

## 커버리지

- **매칭 가능 병목은 7/7이다.** 케이스가 0~1곳인 갭은 없다.
- 가장 얇은 병목은 DISTRIBUTION(케이스 3곳, 무브 6건)과 SUPPLY(케이스 3곳, 무브 5건)다.
- 가장 두터운 병목은 TRUST(케이스 4곳, 무브 11건)다.
- 나머지는 다음과 같다.
  - AWARENESS: 케이스 4곳, 무브 6건.
  - CONVERSION: 케이스 4곳, 무브 7건.
  - RETENTION: 케이스 4곳, 무브 6건.
  - UNIT_ECONOMICS: 케이스 5곳, 무브 7건.
- 원자료에 무브 ID가 없다. 아래 후보는 병목·케이스 단위까지만 짚었고, 무브 선정은 CMO가 한다.

## 확인 못 한 것

- h168 스냅샷이 없는 이유. 수집 실패인지 시점 미도래인지 알 수 없다. 발행 시각과 `collect-metrics` 로그가 필요하다.
- 예측이 없는 엔트리 19개(23−4)의 사유. 원자료에 없다.
- LOG-20260907-01에 연결된 글이 없는 이유와 그 엔트리의 항목 수.
- 0.0315 중복 값이 실제 지표인지 읽기 오류인지.
- 후보 무브의 개별 ID와 성과. 원자료에 없다.

## 이번 검토

- 검토한 것: 채점 보류의 원인이 표본 부족인지 수집 누락인지.
- 개선한 것: 보류를 한 칸으로 뭉치지 않고 "기준선 0건"과 "h168 없음"으로 나눴다. 후자는 점검 대상으로 올렸다.

## 카드 후보

- SUPPLY 병목(Magic Spoon·Purple Innovation·Fathom Analytics): 케이스 3곳·무브 5건으로 7개 병목 중 무브가 가장 적다. 앵글이 얇은 곳부터 채워 매칭 재료를 늘릴 때다.
- DISTRIBUTION 병목(Figma·Testimonial.to·Zapier): 케이스가 3곳이라 매칭 하한(2곳)에서 한 곳 여유밖에 없다. 한 곳이 반려·숨김되면 바로 갭이 된다.
- AWARENESS 병목(Dr. Squatch·e.l.f. Beauty·GoPro·HOKA): 케이스 4곳에 무브 6건으로 케이스당 무브가 가장 적은 축이다. TRUST(무브 11건)와 달리 쓸 무브가 남아 있고, 예측이 채점 가능한 h168까지 도달하는 글을 늘리려면 발행 글을 병목별로 분산하는 편이 낫다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-13-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-13 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-14T00:53:28.024Z)
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
- ℹ️ Notion 푸시: s://app.notion.com/p/CASE-codeparrot-pivot-hell-no-follow-on-raise-1500-mrr-shutdown-418100b7ffb4816ea9facd138c13f11d ⏭️ 발굴 — 채택·확인불가 0건 (후보 0건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-14-CMO 기록·재확인

_실행 키 `cmo-2026-11-13-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
