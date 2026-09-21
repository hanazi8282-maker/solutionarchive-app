# CMO 데일리 다이제스트 2026-09-21

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

- △ CONVERSION — 케이스 1곳 · 무브 1건 (ConvertKit). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ RETENTION — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ SUPPLY — 케이스 1곳 · 무브 2건 (Purple Innovation). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 2 / 7
- 막히거나 실패한 단계 없음.

## 개선 방안

# 성과 해설 (2026-09-21) — sa-cmo-analyst

**결론부터**: 이번 판정 로그로는 어떤 규칙도 유효/무효를 아직 말할 수 없다 — 전부 보류다. 커버리지는 7개 병목 중 2개(AWARENESS, TRUST)만 매칭 성립 상태라 다음 앵글은 이 둘에서만 근거 있게 고를 수 있다.

## 채점 결과 — 유효 / 무효 / 보류

- 유효 0 / 무효 0 / **보류 4** (표본 부족: h168 스냅샷 미도달 또는 수집 실패) — LOG-20260906-01(like_rate·share_rate), LOG-20260907-03(share_rate·like_rate)
- **채점 불가 2건** (0건도 보류도 아닌 별개 사유: 연결된 발행 글 없음) — LOG-20260907-01, LOG-20260907-02
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 — 네 규칙 전부 유효0·무효0·보류1, Wilson 하한 산출 불가
- 판정 로그 13개 중 예측 달린 엔트리는 4개(예측 항목 7개)뿐 — 나머지 9개는 예측 자체가 없어 채점 대상이 아니다(이 원자료엔 사유 없음, 확인 못 함)

→ **규칙 근거로 쓸 수 있는 실측이 아직 하나도 없다.** "이 훅이 먹힌다"는 결론은 이번 사이클에서 낼 수 없다(_principles.md §부트스트랩 금지).

## 커버리지 갭 — 매칭 가능 병목 2/7

- ✅ AWARENESS — 케이스 3곳(Dr. Squatch, e.l.f. Beauty, GoPro), 무브 4건 — 매칭 성립
- ✅ TRUST — 케이스 3곳(Everlane, Ritual, Tuft & Needle), 무브 7건 — 매칭 성립
- △ CONVERSION — 케이스 1곳(ConvertKit), 무브 1건 — **갭, 2번째 케이스 필요**
- △ DISTRIBUTION — 케이스 1곳(Zapier), 무브 2건 — **갭, 2번째 케이스 필요**
- △ SUPPLY — 케이스 1곳(Purple Innovation), 무브 2건 — **갭, 2번째 케이스 필요**
- ❌ RETENTION — 케이스 0곳, 무브 0건 — **갭, 1번째 케이스부터 필요**
- ❌ UNIT_ECONOMICS — 케이스 0곳, 무브 0건 — **갭, 1번째 케이스부터 필요**

## 다음 앵글 후보 (무브 단위, 최대 3개)

원자료에 개별 무브 제목이 없어(브랜드·건수만 제공됨) 병목 단위로만 근거를 댄다 — **개별 무브 선택은 확인 불가**, cmo가 case_moves 상세를 별도로 봐야 함.

1. **TRUST 계열 (Everlane / Ritual / Tuft & Needle, 무브 7건)** — 왜 지금: 매칭 성립된 두 병목 중 무브 표본이 가장 크다(7건). 규칙 신뢰도가 전부 보류인 지금, 표본이 큰 쪽에서 뽑아야 다음 채점 주기에 데이터가 쌓인다.
2. **AWARENESS 계열 (Dr. Squatch / e.l.f. Beauty / GoPro, 무브 4건)** — 왜 지금: 드래프트 폴더에 이미 Dr. Squatch 신규 케이스(`drafts/threads/2026-09-21-dr-squatch-humor-video-natural-soap.*`)가 대기 중 — 같은 병목·같은 브랜드로 파이프라인이 이미 움직이고 있어 중복 조사 없이 이어갈 수 있다.
3. **SUPPLY (Purple Innovation, 무브 2건)** — 왜 지금: 드래프트 폴더에 SUPPLY 성격 신규 케이스 2건(`magic-spoon-cereal-supply-reorder-discipline.json`, `zume-pizza-mobile-oven-production-collapse.json`)이 이미 조사 대기 중 — 승인되면 SUPPLY가 케이스 2곳으로 올라가 △→✅ 전환된다. 단, **지금 당장은 매칭 불성립(케이스 1곳)이라 교차 근거 앵글로는 아직 못 쓴다** — 위 두 초안 승인 이후가 조건이다.

## 확인 못 한 것

- 예측 항목 7개 중 상세가 드러난 것은 4개(2개 로그)뿐 — 나머지 3개 항목의 규칙·판정은 원자료에 없어 확인 불가.
- 판정 로그 13개 중 예측 없는 9개의 사유(예측 미설정인지 별도 채점 경로인지) — 원자료에 없어 확인 불가.
- 개별 무브(케이스 내 세부 실행) 제목·내용 — `case-match.mjs --coverage` 출력에 케이스명·건수만 있고 무브 단위 상세는 없어 확인 불가.
- `drafts/cases/`에 걸린 두 신규 SUPPLY 초안의 검증(gate) 통과 여부 — 이번 원자료 범위 밖이라 확인 불가.

## 다음 주 주목 지표

- `like_rate` — dr-squatch-humor-video-natural-soap (이번에 스테이징한 초안의 예측)
- `reply_rate` — dr-squatch-humor-video-natural-soap (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-21-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-21 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-21T23:15:41.574Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 13건 / 후보 13건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): everlane-radical-transparency-trust/CONTENT(A), everlane-radical-transparency-trust/PRICING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2,"transferability_unrated":13})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-21-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
