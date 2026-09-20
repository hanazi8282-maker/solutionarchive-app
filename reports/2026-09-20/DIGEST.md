# CMO 데일리 다이제스트 2026-09-20

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 2건
- 초안(drafted): 2건
- 스테이징(staged): 1건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 5 / 7
- 막히거나 실패한 단계 없음.

## 개선 방안

# 성과 분석 — 2026-09-20

**결론부터: 채점 가능한 예측이 아직 0건이다(전부 보류/확인불가). 규칙 신뢰도는 아직 아무것도 증명되지 않았으니, 오늘 앵글 선택은 "성과가 증명된 규칙"이 아니라 "매칭 가능 커버리지"로만 판단해야 한다.**

## 1. 채점 결과 (score-predictions)

- 유효 0 / 무효 0 / **보류 4** (표본 부족 — h168 스냅샷 없음): LOG-20260906-01의 like_rate·share_rate 2건, LOG-20260907-03의 share_rate·like_rate 2건. 아직 그 시점이 안 됐거나 수집 실패 — 실패로 오판하지 않는다.
- **채점 자체 불가 2건**(보류와 다른 사유): LOG-20260907-01, LOG-20260907-02 — 연결된 발행 글 없음. 표본 부족이 아니라 연결 누락이라 별도 칸에 센다.
- 판정 로그 총 13개 중 예측이 달린 건 4개(항목 7개)뿐 — 나머지 9개 로그에 왜 예측이 없는지는 원자료로 확인 불가(§4 참조).
- 규칙별 신뢰도: C-12·G-8·P-03·P-09 전부 유효0/무효0/보류1, Wilson 하한 계산 불가. **지금 시점에 "이 훅이 먹힌다"고 결론 낼 수 있는 규칙은 0개다.**

## 2. 커버리지 갭 (case-match --coverage)

매칭 가능 병목 5/7:
- AWARENESS — 케이스 3곳·무브 5건 (e.l.f. Beauty, GoPro, Pets.com)
- TRUST — 케이스 3곳·무브 8건 (Everlane, Tuft & Needle, Zenefits)
- CONVERSION — 케이스 2곳·무브 2건 (ConvertKit, Homejoy)
- RETENTION — 케이스 2곳·무브 5건 (Blue Apron, Fab.com)
- SUPPLY — 케이스 3곳·무브 6건 (Oatly, Peloton, Purple Innovation)

갭 2곳:
- **UNIT_ECONOMICS** — 케이스 0곳·무브 0건. 완전 공백, 매칭 불가.
- **DISTRIBUTION** — 케이스 1곳·무브 2건 (Zapier). 1곳은 매칭 불가이지 절반이 아니다 — 최소 1곳 더 필요.

## 3. 다음 앵글 후보 (무브 단위, 최대 3)

1. **TRUST 풀에서 다음 무브 하나** (3케이스·8무브, 매칭 가능 병목 중 재고 최다) — 왜 지금: SUPPLY(오틀리)는 오늘 이미 2건째 초안(`2026-09-08`, `2026-09-20`)이 나가 재고를 소모 중이고, TRUST는 이번 로그에 아직 안 나와 다음 순번 소재가 가장 두껍다.
2. **AWARENESS 풀에서 다음 무브 하나** (3케이스·5무브) — 왜 지금: 매칭 가능 병목 중 SUPPLY·TRUST 다음으로 케이스 다양성(3곳)이 높아, 성과가 아직 증명 안 된 지금 단계에서 소재 다양성으로 리스크를 분산할 수 있다.
3. **RETENTION 풀에서 다음 무브 하나** (2케이스·5무브, Blue Apron·Fab.com) — 왜 지금: 무브 재고(5건)에 비해 아직 이번 판정 로그·초안 이력에 등장하지 않은 병목이라 우선순위가 밀려 있다.

별도 제안(앵글이 아니라 리서치 큐): DISTRIBUTION은 Zapier 외 케이스 1곳만 채우면 매칭이 성립한다(신규 조사 대비 비용 최소). UNIT_ECONOMICS는 완전 공백이라 리서치 우선순위로 올릴 근거가 된다.

## 4. 확인 못 한 것

- 판정 로그 13개 중 예측 없는 9개의 내용·사유 — 원자료가 예측 달린 4개만 보여줘 나머지는 확인 불가.
- LOG-20260907-01/02가 "연결된 발행 글 없음"인 원인(발행 전 대기인지 유실인지) — 원자료에 사유 없음.
- 발행 지표 추이(`threads-report.mjs`) 자체 — 이번 원자료에 포함되지 않아 이번 보고에서 다루지 않았다.

## 다음 주 주목 지표

- `like_rate` — oatly-capacity-overbuild (이번에 스테이징한 초안의 예측)
- `share_rate` — oatly-capacity-overbuild (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-20-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-20 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-20T22:25:36.662Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 12건 / 후보 12건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — oatly-capacity-overbuild: 초안 파일 2026-09-08-oatly-capacity-overbuild.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): everlane-radical-transparency-trust/CONTENT(A), everlane-radical-transparency-trust/PRICING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2,"transferability_unrated":12})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":15})
- ℹ️ Notion 푸시: -weight-unit-economics-3e1100b7ffb48165a255f7214b144d70 ✅ DISCOVERY-2026-09-20 → https://app.notion.com/p/DISCOVERY-2026-09-20-3e1100b7ffb4810ab0a0e2156be9d507 푸시 완료 — 초안 1건 · 신규케이스 2건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-21-CMO 기록·재확인

_실행 키 `cmo-2026-09-20-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
