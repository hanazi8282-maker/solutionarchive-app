# CMO 데일리 다이제스트 2026-09-27

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

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

_이번 실행은 해설을 생성하지 못했다 — analyst exit 1. 원자료: reports/2026-09-27/performance.md_

## 다음 주 주목 지표

- `like_rate` — ag1-single-sku-subscription-greens (이번에 스테이징한 초안의 예측)
- `reply_rate` — ag1-single-sku-subscription-greens (이번에 스테이징한 초안의 예측)
- `like_rate` — content-goblin-low-tier-pricing-support-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — content-goblin-low-tier-pricing-support-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-27-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-09-27 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-27T23:01:49.461Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 47건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): content-goblin-low-tier-pricing-support-collapse/PRICING(C), ag1-single-sku-subscription-greens/CONTENT(C)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"raw_only":1})

_실행 키 `cmo-2026-09-27-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
