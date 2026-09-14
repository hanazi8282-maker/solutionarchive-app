# CMO 데일리 다이제스트 2026-09-14

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 2건
- 초안(drafted): 2건
- 스테이징(staged): 2건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 개선 방안

# 성과 분석 — 2026-09-14

**결론부터:** 채점 가능한 예측 7건 전부 보류다. 유효/무효 판정은 아직 하나도 안 나왔다 — 규칙 신뢰도를 근거로 다음 훅을 고르면 안 되는 구간이다. 대신 커버리지는 7/7 매칭 가능하지만 5개 병목이 최소선(2케이스)에 걸려 있어, 다음 앵글은 "검증된 패턴"이 아니라 "커버리지 여유"로 골라야 한다.

## 채점 결과

- 유효 0 / 무효 0 / **보류 7 (전체)** — 이번 판정 로그에서 유효·무효로 확정된 예측은 0건이다.
- 보류 7건 중 4건: LOG-20260906-01(like_rate↑, share_rate↑), LOG-20260907-03(share_rate↑, like_rate↑) — 사유 "h168 스냅샷 없음, 확인 불가(아직 시점 미도달 또는 수집 실패, 구분 안 됨)".
- 보류 7건 중 나머지 3건: LOG-20260907-01·02 소속 — 사유가 다르다. "연결된 발행 글 없음" = 애초에 채점 시도조차 못 한 건. 표본 부족과 다른 사건이라 따로 센다.
- 판정 로그 13개 중 예측이 달린 건 4개뿐, 실측 스냅샷은 발행 글 2건 분량 4개 — 표본 자체가 부트스트랩 구간이다(발행 누적 10건 기준 미충족).
- 규칙별 신뢰도 C-12 / G-8 / P-03 / P-09 — 넷 다 유효0·무효0·보류1, Wilson하한 "-"(계산 불가). **네 규칙 전부 "이 훅이 먹힌다"고 말할 근거가 아직 없다.** 참고값으로만 쓴다.

## 커버리지 갭

- 매칭 가능 병목 7/7 — 갭 없음(모든 병목이 서로 다른 케이스 2곳 이상 확보).
- 여유 있는 병목: AWARENESS(6케이스·10무브) — 최소선 대비 3배 여유.
- 여유 있는 병목: SUPPLY(3케이스·6무브) — 최소선 대비 1건 여유.
- **최소선(정확히 2케이스)에 걸린 병목 5개: TRUST, CONVERSION, RETENTION, UNIT_ECONOMICS, DISTRIBUTION.** 각 병목 내 케이스 1곳이 재평가로 빠지면 그 즉시 갭으로 전환된다. 지금은 "갭 없음"이지 "안전"이 아니다.

## 다음 앵글 후보 (무브 단위, 최대 3)

1. **TRUST 병목 무브 (Carvana / Warby Parker 중 1)** — 왜 지금: 최소선(2케이스)에 걸려 있어 여유가 없는 5개 병목 중 하나. 지금 완충해야 나중에 갭으로 안 넘어간다.
2. **RETENTION 병목 무브 (Chewy / Duolingo 중 1)** — 왜 지금: 마찬가지로 정확히 2케이스. 게다가 규칙 신뢰도가 전부 보류(표본 0)인 지금은 어느 병목이든 새 발행이 표본을 쌓는 유일한 길이라, 여유 없는 쪽부터 채우는 게 이득이 크다.
3. **SUPPLY 병목 무브 (Oatly / Peloton / Purple Innovation 중 1)** — 왜 지금: 유일하게 최소선을 넘는(3케이스) 병목이라 이번 판정이 예상과 다르게 나와도 갭이 생기지 않는다. 검증된 규칙이 하나도 없는 지금, 리스크 낮은 자리에서 새 훅을 시험하기 좋다.

## 확인 못 한 것

- LOG-20260906-01·07-03의 h168 미스냅샷이 "아직 시점이 안 됐다"인지 "수집 실패"인지 원자료가 구분하지 못한다 — 스크립트 재실행 없이는 판단 불가.
- LOG-20260907-01·02에 발행 글이 왜 연결 안 됐는지(발행 자체가 없었는지, 연결 누락인지)는 이 원자료만으로 알 수 없다.
- 개별 케이스가 어떤 무브를 구체적으로 갖고 있는지(제목·근거)는 이 raw data에 없어, 위 후보는 회사/병목 단위까지만 특정했고 무브 선택은 다음 단계(케이스 상세 조회)가 필요하다.

## 다음 주 주목 지표

- `like_rate` — allbirds-awareness-ceiling-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — allbirds-awareness-ceiling-collapse (이번에 스테이징한 초안의 예측)
- `like_rate` — elf-beauty-awareness-engine (이번에 스테이징한 초안의 예측)
- `reply_rate` — elf-beauty-awareness-engine (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-14-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-14 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-14T23:07:32.794Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 17건 / 후보 17건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — elf-beauty-awareness-engine: 초안 파일 2026-09-08-elf-beauty-awareness-engine.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":0,"transferability_unrated":17})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":19})
- ℹ️ Notion 푸시: c209fde36f3 ✅ CASE-convertkit-concierge-migration-conversion → https://app.notion.com/p/CASE-convertkit-concierge-migration-conversion-3db100b7ffb4811ca7d4d112742f11f7 푸시 완료 — 초안 2건 · 신규케이스 2건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-15-CMO 기록·재확인

_실행 키 `cmo-2026-09-14-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
