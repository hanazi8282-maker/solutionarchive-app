# CMO 데일리 다이제스트 2026-09-25

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 4건(가장 오래된 것 55시간 경과) — /dashboard 에서 연결

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 2건
- 스테이징(staged): 2건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

`.claude/agents/sa-cmo-analyst.md`와 `ops/roles/_principles.md`를 확인했다. 이 역할(읽기 전용 성과 분석가) 기준으로 원자료만 근거해 해설한다.

# 성과 분석 — 2026-09-25

**결론**
1. 예측 채점 가능 항목 0건 — 예측 7개 전부 보류/확인불가. "이 훅이 먹힌다"고 말할 근거가 아직 없다.
2. 커버리지는 7/7 병목 매칭 가능 — 오늘 기준 갭 없음.
3. 규칙 신뢰도로 다음 앵글을 못 고르므로(표본 0), 오늘은 커버리지 두께로 우선순위를 정한다.

## 예측 대 실측 채점

- 판정 로그 13건 중 예측 달린 엔트리 4개, 예측 항목 7개.
- 유효 0 / 무효 0 / **보류(표본부족·확인불가) 7** — 셋으로 나눌 실적 자체가 없다.
  - LOG-20260906-01 (like_rate↑, share_rate↑ 2항목) — 보류, h168 스냅샷 없음 (확인 불가: 아직 그 시점이 안 됐는지 수집 실패인지는 원자료로 구분 안 됨)
  - LOG-20260907-03 (share_rate↑, like_rate↑ 2항목) — 보류, 동일 사유
  - LOG-20260907-01 / LOG-20260907-02 — 채점 불가(연결된 발행 글 없음). 이건 "0건"이 아니라 별도 사건이라 위 보류 7건과 분리해서 센다.
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 — **넷 다** 유효 0 · 무효 0 · 보류 1, Wilson 하한 계산 불가(표본 0). 어느 규칙도 근거로 못 쓴다.

## 커버리지

- 매칭 가능 병목 **7/7** — 오늘 기준 갭 없음(모든 병목이 서로 다른 케이스 2곳 이상 확보).
- AWARENESS 4케이스·6무브 / TRUST 3·7 / CONVERSION 4·7 / RETENTION 3·4 / UNIT_ECONOMICS 2·3 / DISTRIBUTION 3·6 / SUPPLY 3·5.
- UNIT_ECONOMICS가 케이스 2곳으로 매칭 최소 임계치에 걸려 있다 — 한 곳만 무효화되면 즉시 갭으로 전환.

## 다음 앵글 후보 (최대 3 — 무브 단위 식별자가 원자료에 없어 병목/케이스 단위로 제시. 사유는 아래 "확인 못 한 것")

1. **UNIT_ECONOMICS** (Plausible Analytics, Harry's) — 왜 지금: 케이스 2곳·무브 3건으로 전 병목 중 가장 얇고 임계치 붕괴 위험이 가장 크다.
2. **RETENTION** (Hims & Hers, Native, Superhuman) — 왜 지금: 케이스 3곳 대비 무브 4건, ≥3케이스 병목 중 케이스당 무브 비율이 가장 낮아 가장 덜 캐낸 곳이다.
3. **기존 채점 규칙(C-12/G-8/P-03/P-09) 반복 보류** — 왜 지금: 넷 다 표본 0이라 우선순위 근거가 없다. h168 스냅샷이 쌓일 때까지는 같은 규칙 반복보다 다른 훅으로 다양화하는 편이 정보 이득이 크다.

## 확인 못 한 것

- 무브 개별 제목·내용 단위 후보 — `case-match.mjs --coverage` 출력에 브랜드명·건수만 있고 무브 식별자가 없어, 원자료에 없는 것을 지어내지 않았다.
- h168 미도달이 "아직 시점 안 됨"인지 "수집 실패"인지 — score-predictions 출력이 "확인 불가"로만 뭉쳐 표시해 원인 구분 불가.
- LOG-20260907-01/02의 "연결된 발행 글 없음"이 스테이징 누락인지 의도적 미발행인지 — 원자료로는 판단 불가.

## 다음 주 주목 지표

- `like_rate` — magic-spoon-cereal-supply-reorder-discipline (이번에 스테이징한 초안의 예측)
- `reply_rate` — magic-spoon-cereal-supply-reorder-discipline (이번에 스테이징한 초안의 예측)
- `like_rate` — plausible-analytics-usage-based-pricing-margin (이번에 스테이징한 초안의 예측)
- `reply_rate` — plausible-analytics-usage-based-pricing-margin (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-25-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-09-25 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-25T23:17:45.460Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 32건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): plausible-analytics-usage-based-pricing-margin/PRICING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":17})
- ℹ️ Notion 푸시: pse → https://app.notion.com/p/CASE-content-goblin-low-tier-pricing-support-collapse-3e6100b7ffb481d4974fdcb8ca032a04 ⏭️ 발굴 — 채택·확인불가 0건 (후보 4건). 페이지를 만들지 않는다. 푸시 완료 — 초안 2건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-26-CMO 기록·재확인

_실행 키 `cmo-2026-09-25-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
