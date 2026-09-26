# CMO 데일리 다이제스트 2026-09-26

**붙여넣기 대기: 1건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 1건.
2. 막힌 단계 없음.
3. 발행 대기 1건. 앱에서 확인하고 직접 발행한다.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 4건(가장 오래된 것 78시간 경과) — /dashboard 에서 연결

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 1건
- 스테이징(staged): 1건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

## 결론 (3줄)
- 성과 채점은 아직 **유효 0 / 무효 0** — 판정 가능한 규칙이 하나도 없다. 전부 보류(4건, h168 스냅샷 미도달) 또는 채점 불가(2건, 발행 글 미연결)다. 지금 시점에 "이 훅이 먹힌다"고 말할 근거는 없다.
- 커버리지는 7/7 병목 전부 매칭 가능 상태(각 병목 최소 2케이스 충족). 다만 **UNIT_ECONOMICS 는 정확히 최소치(2케이스)** — 완충 없는 유일한 병목.
- 앵글 선택은 이번엔 성과 데이터가 아니라 **커버리지 두께**로만 정당화 가능하다.

## 채점 결과
- 판정 로그 엔트리 13개 중 예측이 달린 엔트리 4개 / 예측 항목 7개 (실측 스냅샷 9개, post 4건 기준).
- **유효 0 / 무효 0 / 보류 4건 (표본 부족)** — LOG-20260906-01(like_rate·share_rate), LOG-20260907-03(share_rate·like_rate). 사유: h168 스냅샷 없음 — "그 시점이 안 됐다"와 "수집 실패"를 원자료가 구분하지 못해 둘 다 확인 불가로 묶인다.
- **채점 불가 2건 (별도 사유, 보류와 혼합하지 않음)** — LOG-20260907-01, LOG-20260907-02: 연결된 발행 글 없음. 이건 "표본 부족"이 아니라 "채점 대상 자체가 없음"이라 보류와 다른 사건이다.
- 예측 항목 7개 중 규칙 신뢰도표에 실제로 잡힌 건 4개(C-12, G-8, P-03, P-09 — 각 보류 1). **남은 3개 항목이 어느 로그 엔트리(채점 불가 2건 쪽으로 추정)에 속하는지는 원자료에 개별 항목이 나열돼 있지 않다 — 확인 불가.**
- 규칙별 Wilson 하한: C-12/G-8/P-03/P-09 전부 `-` (분모 0, 계산 불가). 부트스트랩 구간이라 이 값들을 규칙 근거로 쓸 수 없다.

## 커버리지
- 매칭 가능 병목 **7/7** — 현재 갭 없음.
- AWARENESS: 케이스 4 · 무브 6 (Dr. Squatch, e.l.f. Beauty, GoPro, HOKA)
- TRUST: 케이스 3 · 무브 7 (Everlane, Ritual, Tuft & Needle)
- CONVERSION: 케이스 4 · 무브 7 (ConvertKit, 락토핏, Notion, Slack)
- RETENTION: 케이스 3 · 무브 4 (Hims & Hers, Native, Superhuman)
- UNIT_ECONOMICS: 케이스 2 · 무브 3 (Plausible Analytics, Harry's) — **최소치 정확히 충족, 완충 0**
- DISTRIBUTION: 케이스 3 · 무브 6 (Figma, Testimonial.to, Zapier)
- SUPPLY: 케이스 3 · 무브 5 (Fathom Analytics, Magic Spoon, Purple Innovation)

## 다음 앵글 후보 (최대 3, 병목 단위 — 무브 개별 제목은 원자료에 없음, 아래 "확인 못한 것" 참조)
1. **UNIT_ECONOMICS** (Plausible Analytics / Harry's 중 신규 3번째 케이스) — 왜 지금: 유일하게 케이스 2곳뿐인 병목. 한 곳이라도 반려·재채점으로 빠지면 매칭 성립 조건(2곳 이상)이 즉시 무너진다.
2. **RETENTION** (Hims & Hers / Native / Superhuman) — 왜 지금: 케이스 3곳은 확보했지만 무브 4건으로 전체 병목 중 두 번째로 얇다. 커버리지는 살아있지만 앵글 다양성이 가장 부족한 축.
3. **SUPPLY** (Fathom Analytics / Magic Spoon / Purple Innovation) — 왜 지금: 케이스 3곳·무브 5건으로 세 번째로 얇음. TRUST(7)·DISTRIBUTION(6)·CONVERSION(7)·AWARENESS(6)보다 우선순위가 앞선다.

## 확인 못 한 것
- 예측 항목 7개 중 3개가 정확히 어느 로그 엔트리·어느 규칙에 속하는지 — 규칙 신뢰도표와 채점 불가 2건 목록만으로는 매핑이 안 된다. 원자료에 항목별 상세가 빠져 있다.
- 병목별 "무브" 목록(케이스 이름만 있고 개별 무브 제목·날짜 없음) — 위 앵글 후보를 무브 단위로 더 좁히려면 `case-match.mjs --coverage` 의 상세 출력(현재는 집계치만 받음)이 필요하다.
- LOG-20260906-01 / LOG-20260907-03 의 h168 미도달이 "아직 시점이 안 됨"인지 "수집 실패"인지 — 원자료가 이 둘을 한 문구("확인 불가")로 합쳐서 구분 불가.

## 다음 주 주목 지표

- `like_rate` — testimonial-to-solo-saas-channel-bootstrap (이번에 스테이징한 초안의 예측)
- `reply_rate` — testimonial-to-solo-saas-channel-bootstrap (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-26-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-09-26 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-26T22:47:23.890Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 30건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): testimonial-to-solo-saas-channel-bootstrap/CHANNEL(A), zume-pizza-mobile-oven-production-collapse/PACKAGING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":1})
- ✅ `stage` 발행 대기 스테이징 ({"staged":1})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-26-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
