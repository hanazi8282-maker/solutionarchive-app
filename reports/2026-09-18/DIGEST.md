# CMO 데일리 다이제스트 2026-09-18

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 2건.
2. 막힌 단계 1개 — 아래 "병목 진단"을 먼저 봐라. 안전장치가 작동한 것이지 사고가 아니다.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 2건
- 초안(drafted): 2건
- 스테이징(staged): 2건
- 막힘(blocked): 1단계
- 실패(failed): 0단계

## 병목 진단

- ❌ TRUST — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 4 / 7
- ▲ `stage` 발행 대기 스테이징 ({"staged":2}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).

## 개선 방안

`.claude/agents/sa-cmo-analyst.md`와 `ops/roles/_principles.md`를 확인했다. 이 역할(성과 분석가, 읽기 전용)로 해설한다.

---

## 성과 분석 리포트 — 2026-09-18

**결론부터:** 이번 판정 사이클은 아직 **부트스트랩 구간**이다(발행 스냅샷 확보된 post 3건 < 10건 기준). 규칙 4개(C-12/G-8/P-03/P-09) 전부 표본 1개짜리 보류이며, 유효/무효 판정이 하나도 나지 않았다 — "이 훅이 먹힌다"고 결론 낼 근거가 아직 없다.

### 채점 결과 (판정 로그 13개 / 예측부착 4개 / 예측항목 7개)

- **유효 0 / 무효 0 / 보류 4 / 확인불가(엔트리) 2** — 셋이 아니라 넷으로 갈렸다. 보류와 확인불가는 사유가 다르다.
- 보류 4항목(LOG-20260906-01, LOG-20260907-03 각 2항목: like_rate↑, share_rate↑) — 사유: **h168 스냅샷 미도달**. 0건이 아니라 "아직 그 시점이 안 됐거나 수집 실패", 구분 불가.
- 확인불가 2엔트리(LOG-20260907-01, -02) — 사유: **연결된 발행 글 없음**. 예측 7항목 중 나머지 3항목이 여기 속하는 것으로 산술상 추정되나, 개별 내역은 원자료에 없어 미상으로 남긴다.
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 — 전부 유효0·무효0·보류1, **Wilson하한 전부 `-`**. 표본 1개로는 어느 방향으로도 결론 낼 수 없다.
- 부트스트랩 경고: 실측 스냅샷이 걸린 post 는 3건뿐이다. 이 사이클의 판정을 "규칙이 검증됐다"는 근거로 쓰지 않는다.

### 커버리지 갭 (매칭 가능 병목 4/7)

- ✅ 매칭됨 — AWARENESS(3케이스·5무브: e.l.f. Beauty·GoPro·Pets.com), CONVERSION(2·2: ConvertKit·Homejoy), RETENTION(2·5: Blue Apron·Fab.com), SUPPLY(3·6: Oatly·Peloton·Purple Innovation)
- ❌ 갭(케이스 0곳) — TRUST, UNIT_ECONOMICS: 매칭 이전에 **첫 케이스 자체가 없다.**
- △ 매칭 미성립(케이스 1곳) — DISTRIBUTION(Zapier, 2무브): 1곳은 절반이 아니라 매칭 불가. 서로 다른 2번째 케이스가 있어야 갭에서 빠진다.

### 다음 앵글 후보 (무브 단위, 최대 3개)

1. **SUPPLY** (Oatly·Peloton·Purple Innovation, 3케이스·6무브) — 매칭 병목 중 근거 밀도 최고(무브 최다), 게이트 통과 리스크가 가장 낮아 지금 쓸 소재로 가장 안전하다.
2. **AWARENESS** (e.l.f. Beauty·GoPro·Pets.com, 3케이스·5무브) — SUPPLY 다음으로 근거가 두껍고, 퍼널 상단 앵글이라 신규 도달 확보에 지금 맞다.
3. **RETENTION** (Blue Apron·Fab.com, 2케이스·5무브) — 케이스 수는 매칭 최소선(2)이지만 무브는 5건으로 소재가 충분하다. 매칭이 갓 성립한 병목이라 지금 소진해 둘 가치가 있다.

(CONVERSION 은 매칭됐으나 무브 2건으로 소재가 가장 얇아 후보에서 제외했다.)

### 확인 못 한 것

- LOG-20260907-01/02 가 왜 발행 글에 연결되지 않았는지 — score-predictions 원자료에 사유가 없다.
- 보류 4항목의 h168 도달 예정 시점 — "아직 안 됐다"와 "수집 실패"를 가를 근거가 원자료에 없다.
- DISTRIBUTION 의 2번째 후보 케이스 존재 여부 — coverage 원자료는 갭 유무만 주고 후보 파이프라인은 알려주지 않는다.

## 다음 주 주목 지표

- `like_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `reply_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `like_rate` — fab-com-curation-retention-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — fab-com-curation-retention-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-18-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-18 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-18T22:34:04.243Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 8건 / 후보 8건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): blue-apron-paid-acquisition-treadmill/CHANNEL(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":8})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ▲ `stage` 발행 대기 스테이징 ({"staged":2}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-18-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
