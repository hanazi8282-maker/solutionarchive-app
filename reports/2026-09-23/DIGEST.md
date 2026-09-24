# CMO 데일리 다이제스트 2026-09-23

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 4건 · 적립 4건 · 초안 2건.
2. 막힌 단계 1개 — 아래 "병목 진단"을 먼저 봐라. 안전장치가 작동한 것이지 사고가 아니다.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 6시간 경과) — /dashboard 에서 연결

## 스코어보드

- 조사(new_drafts): 4건
- 적립(committed): 4건
- 초안(drafted): 2건
- 스테이징(staged): 1건
- 막힘(blocked): 1단계
- 실패(failed): 0단계

## 병목 진단

- △ UNIT_ECONOMICS — 케이스 1곳 · 무브 1건 (Harry's). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ SUPPLY — 케이스 1곳 · 무브 2건 (Purple Innovation). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 5 / 7
- ▲ `stage` 발행 대기 스테이징 ({"staged":1}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).

## 개선 방안

# 성과 분석 — 2026-09-23

**`ops/roles/_principles.md`·`sa-cmo-analyst.md` 원칙에 따라 읽기 전용으로 작성. DB 접근 없이 오케스트레이터가 넘긴 두 스크립트 출력만 근거로 삼음.**

## 결론 (3줄)
- **채점 가능한 예측 7건 중 유효 0 / 무효 0 / 보류 7 — "무엇이 먹히는지" 판단할 근거가 아직 없다.** 규칙 신뢰도(C-12·G-8·P-03·P-09)도 전부 표본 1건 보류라 Wilson 하한 계산 불가.
- 발행 post 누적 4건 — sa-cmo-analyst 규칙상 10건 미만 부트스트랩 구간이라, 설령 판정이 나왔어도 참고값이지 규칙 근거로 못 쓴다.
- 커버리지는 5/7 병목 매칭 성립. 다음 앵글은 **성과 데이터가 아니라 커버리지 데이터에만 근거**해 고를 수밖에 없다 (아래 명시).

## 채점 결과 (score-predictions)
- 판정 로그 13개 중 예측 달린 것 4개, 예측 항목 7개. **유효 0 / 무효 0 / 보류 7** (표본 부족·확인 불가로 인한 보류이며, 0건이 아니다).
- LOG-20260906-01: like_rate↑, share_rate↑ 2건 모두 보류 — h168 스냅샷 없음(시점 미도달 또는 수집 실패, 구분 불가).
- LOG-20260907-03: share_rate↑, like_rate↑ 2건 모두 보류 — 사유 동일.
- LOG-20260907-01, LOG-20260907-02: 연결된 발행 글 없음 — **채점 불가**(0건과 다른 사건, 구조적 문제). 이 두 로그가 나머지 예측 항목 3건을 포함.
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 각각 유효0·무효0·보류1, Wilson 하한 `-`(계산 불가). 표본 1건씩뿐이라 규칙 우열을 가릴 수 없다.
- 실측 스냅샷 9개 확보(그중 post 4건) — 수집 자체는 도는데, h168 시점 미도달분이 보류의 절반을 차지.

## 커버리지 갭 (case-match --coverage)
- 매칭 가능 병목 **5/7**.
- ✅ AWARENESS — 케이스 3 / 무브 4 (Dr. Squatch, e.l.f. Beauty, GoPro)
- ✅ TRUST — 케이스 3 / 무브 7 (Everlane, Ritual, Tuft & Needle)
- ✅ CONVERSION — 케이스 4 / 무브 7 (ConvertKit, 종근당건강 락토핏, Notion, Slack)
- ✅ RETENTION — 케이스 3 / 무브 4 (Hims & Hers, Native, Superhuman)
- ✅ DISTRIBUTION — 케이스 2 / 무브 4 (Figma, Zapier) — **최소 매칭선(2곳)에 걸쳐 있음**, 여유 없음
- △ UNIT_ECONOMICS — 케이스 1 / 무브 1 (Harry's) — 갭. 2곳째 없으면 매칭 불가
- △ SUPPLY — 케이스 1 / 무브 2 (Purple Innovation) — 갭. 동일 사유

## 다음 앵글 후보 (최대 3, 무브 단위 아님 — 아래 확인 못 한 것 참조)
1. **CONVERSION (ConvertKit / 락토핏 / Notion / Slack)** — 매칭 병목 중 케이스 4·무브 7로 재료가 가장 넓다. 국내 사례(락토핏)를 포함해 로컬라이징 앵글도 가능. 지금 쓸 수 있는 풀이 가장 두껍다.
2. **TRUST (Everlane / Ritual / Tuft & Needle)** — 케이스 3곳에 무브 7건으로 케이스당 밀도가 가장 높다. 소수 케이스로 여러 앵글을 뽑아낼 여지가 남아 있다.
3. **AWARENESS 또는 RETENTION (각 케이스 3 / 무브 4, 동률)** — 둘 중 최근에 덜 쓰인 쪽을 우선해야 하는데, 이번 원자료에 앵글 사용 이력이 없어 우선순위를 못 가른다. 판단 보류.

**주의:** 이 셋은 채점 데이터(무엇이 잘 되는지)가 아니라 **커버리지 데이터(매칭 가능 여부)만으로** 고른 것이다. 성과 근거는 위에서 보듯 전부 보류라 앵글 선정에 반영할 수 없다.

## 확인 못 한 것
- **무브 단위 구체 항목**(제목·훅 문구)은 이번 원자료(coverage 출력)에 브랜드명·케이스 수·무브 수만 있고 개별 무브 내용이 없어 확인 불가. 위 후보는 병목+브랜드 단위까지만 좁혔다.
- h168 스냅샷 미도달 4건이 "아직 시점이 안 됨"인지 "수집 실패"인지 이번 출력만으로는 구분 불가 — score-predictions.mjs 출력 자체가 두 사유를 한 문구로 묶어 냄.
- 최근 앵글 사용 이력(어떤 브랜드/무브가 최근에 쓰였는지)이 이번 원자료에 없어, AWARENESS/RETENTION 동률을 깨지 못함.
- threads-report.mjs(발행 지표 요약)는 이번 입력에 포함되지 않아 실행하지 않음 — 발행 볼륨·채널별 추이는 별도 확인 필요.

## 다음 주 주목 지표

- `like_rate` — figma-non-designer-distribution (이번에 스테이징한 초안의 예측)
- `share_rate` — figma-non-designer-distribution (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-23-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-09-23 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-23T22:56:32.335Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":4})
- ✅ `research` 조사 ({"attempted":4,"agent_ok":4,"new_drafts":4})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":4,"committed":4,"all_draft":4,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":4,"queue_done":4,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 21건 / 후보 22건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — figma-non-designer-distribution: 초안 파일 2026-09-11-figma-non-designer-distribution.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): everlane-radical-transparency-trust/CONTENT(A), everlane-radical-transparency-trust/PRICING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2,"transferability_unrated":21})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":1})
- ▲ `stage` 발행 대기 스테이징 ({"staged":1}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":19})
- ℹ️ Notion 푸시: -plus-pricing-collapse-3e4100b7ffb481f48b0de8f7927987ce ✅ DISCOVERY-2026-09-23 → https://app.notion.com/p/DISCOVERY-2026-09-23-3e4100b7ffb4814d9b92fdd557029a71 푸시 완료 — 초안 0건 · 신규케이스 4건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-24-CMO 기록·재확인

_실행 키 `cmo-2026-09-23-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
