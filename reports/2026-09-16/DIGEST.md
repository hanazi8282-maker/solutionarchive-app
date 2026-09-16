# CMO 데일리 다이제스트 2026-09-16

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 1건.
2. 막힌 단계 없음.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 5시간 경과) — /dashboard 에서 연결

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 2건
- 초안(drafted): 1건
- 스테이징(staged): 1건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- ❌ AWARENESS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ TRUST — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ RETENTION — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ SUPPLY — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 1 / 7
- 막히거나 실패한 단계 없음.

## 개선 방안

# CMO 성과 분석 — 2026-09-16

**결론 (3줄)**
예측 대 실측 채점은 지금 **유효 0 / 무효 0** — 판단 근거 자체가 아직 없다. 규칙 4개(C-12/G-8/P-03/P-09) 신뢰도는 전부 보류라 "이 훅이 먹힌다"고 말할 근거가 없다. 매칭 가능 병목은 7개 중 1개(CONVERSION)뿐이고, DISTRIBUTION은 케이스 1곳만 더 채우면 즉시 2번째로 열린다 — 지금 가장 싼 다음 수는 그것.

## 채점 결과

- 유효: 0건
- 무효: 0건
- 보류(h168 스냅샷 미확보, 원인 미분리): 4건 — LOG-20260906-01(like_rate↑, share_rate↑), LOG-20260907-03(share_rate↑, like_rate↑). "시점이 아직 안 됐다"와 "수집이 실패했다"가 구분 안 된 상태라 표본 부족과 동일 취급하지 않는다.
- 확인 불가(별도 집계, 연결된 발행 글 없음): 로그 2건 — LOG-20260907-01, LOG-20260907-02. 이건 0건도 보류도 아니라 채점 대상 자체가 성립하지 않은 것이다.
- 전체: 판정 로그 13건 중 예측 달린 건 4건, 예측 항목 7개, 실측 스냅샷 4개(포스트 기준 2건) — n 이 극히 작다.

## 규칙별 신뢰도

- C-12: 유효0 / 무효0 / 보류1, Wilson하한 계산 불가
- G-8: 유효0 / 무효0 / 보류1, Wilson하한 계산 불가
- P-03: 유효0 / 무효0 / 보류1, Wilson하한 계산 불가
- P-09: 유효0 / 무효0 / 보류1, Wilson하한 계산 불가
- 4개 규칙 모두 검증 표본이 0이다. 판정 로그 총량(13건)도 부트스트랩 구간(발행 누적 10건 미만 참고값) 경계에 가까워, 지금 나오는 어떤 판정도 규칙 근거로 못 쓴다.

## 커버리지 갭

- 매칭 가능 병목: 1/7 (매칭은 서로 다른 케이스 2곳 이상 필요)
- ✅ CONVERSION — 케이스 2곳(ConvertKit, Homejoy), 무브 2건 — 유일하게 매칭 성립
- △ DISTRIBUTION — 케이스 1곳(Zapier), 무브 2건 — 케이스가 1곳뿐이라 무브 수와 무관하게 매칭 불성립
- ❌ AWARENESS — 케이스 0곳, 무브 0건
- ❌ TRUST — 케이스 0곳, 무브 0건
- ❌ RETENTION — 케이스 0곳, 무브 0건
- ❌ UNIT_ECONOMICS — 케이스 0곳, 무브 0건
- ❌ SUPPLY — 케이스 0곳, 무브 0건

## 다음 앵글 후보 (무브 단위, 최대 3)

1. **DISTRIBUTION 2번째 케이스** — Zapier 외 1곳만 더 채우면 매칭 가능 병목이 1/7→2/7로 즉시 는다. 지금 가진 무브 2건이 케이스 부족으로 묶여 있는 상태라, 새 케이스 발굴이 조사 대비 효율이 가장 높다.
2. **CONVERSION 후속 무브** — 유일하게 매칭 성립된 병목인데도 규칙 신뢰도(C-12/G-8/P-03/P-09)는 전부 0/0/보류다. 검증 표본이 쌓일 유일한 통로가 여기라, 지금 무브를 하나 더 내보내야 신뢰도 축적이 시작된다.
3. **미개척 5개 병목 중 택1(AWARENESS/TRUST/RETENTION/UNIT_ECONOMICS/SUPPLY)** — 다만 이건 "왜 지금인가"를 성과 데이터로 못 받친다. 케이스가 0곳이라 근거가 전무하고, 어느 병목을 먼저 열지는 성과 근거가 아니라 우선순위 판단 문제다 — 사람 판단 필요.

## 확인 못 한 것

- LOG-20260907-01, LOG-20260907-02: 예측이 달려 있는데 연결된 발행 글이 없다. 발행이 실제로 안 됐는지, 발행은 됐는데 연결만 끊겼는지 이 데이터만으로는 구분 불가.
- LOG-20260906-01·07-03의 h168 미확보 4건: 아직 그 시점(발행 후 168시간)이 안 지났는지, 수집이 실패했는지 구분 불가. score-predictions 원자료 자체가 이 둘을 하나로 묶어 표기하고 있어 더 쪼갤 수 없다.
- 위 두 항목 모두 스크립트 재실행 결과가 아니라 이번 한 번의 출력만 근거로 삼았으므로, 시간이 지나 재채점하면 값이 바뀔 수 있다.

## 다음 주 주목 지표

- `like_rate` — zapier-integration-page-seo-distribution (이번에 스테이징한 초안의 예측)
- `reply_rate` — zapier-integration-page-seo-distribution (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-16-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-16 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-16T22:55:21.114Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 2건 / 후보 2건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): zapier-integration-page-seo-distribution/PARTNERSHIP(C)
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":1,"transferability_unrated":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":15})
- ℹ️ Notion 푸시: 0dddad86f21319b ✅ CASE-fab-com-curation-retention-collapse → https://app.notion.com/p/CASE-fab-com-curation-retention-collapse-3dd100b7ffb481db9660f4ef5d0c4b85 푸시 완료 — 초안 1건 · 신규케이스 2건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-17-CMO 기록·재확인

_실행 키 `cmo-2026-09-16-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
