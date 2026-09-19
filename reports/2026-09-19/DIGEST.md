# CMO 데일리 다이제스트 2026-09-19

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 1건 · 초안 2건.
2. 막힌 단계 2개 — 아래 "병목 진단"을 먼저 봐라. 안전장치가 작동한 것이지 사고가 아니다.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 2건
- 적립(committed): 1건 — ⚠️ 시도 2건 중 1건 실패
- 초안(drafted): 2건
- 스테이징(staged): 2건
- 막힘(blocked): 2단계
- 실패(failed): 0단계

## 병목 진단

- ❌ TRUST — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- △ DISTRIBUTION — 케이스 1곳 · 무브 2건 (Zapier). 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 4 / 7
- ▲ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":1,"all_draft":1,"partial_failed":1}) — 케이스 2건 중 1건이 적립 전 검사에서 막혔다 — whole-pantry-unverified-claim-trust-collapse: validate exit 1
- ▲ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":1,"queue_failed":1,"queue_unresolved":0,"queue_stalled":1,"partial_failed":1}) — 큐 2건 중 깨끗하게 닫지 못한 것이 있다 — 1건은 초안이 났는데 적립에서 막혀 큐를 failed 로 닫았다

## 개선 방안

`.claude/agents/sa-cmo-analyst.md` 와 `ops/roles/_principles.md` 를 확인했다. 이 역할(읽기 전용 성과 분석가)로 원자료를 해설한다.

## 결론 (3줄)
- 예측→실측 채점은 아직 전부 보류/확인불가다. **유효 0 / 무효 0** — 어떤 훅도 아직 "먹힌다/안 먹힌다"를 말할 근거가 없다.
- 매칭 가능 병목 4/7. TRUST 는 0곳이었지만 오늘 그 갭을 메울 조사 2건(Tuft & Needle, Whole Pantry)이 이미 `drafts/cases/`에 있다 — **사람 승인만 나면 바로 5/7**.
- 오늘 이미 초안 2건(GoPro=AWARENESS, Blue Apron 관련)이 발행 대기로 올라가 있으므로, 다음 앵글은 그 이후 타자석을 겨눈다.

## 채점 결과 (유효 / 무효 / 보류 / 확인불가 분리)
- **유효 0 / 무효 0 / 보류 2건(LOG-20260906-01, LOG-20260907-03, 예측 4항목: like_rate·share_rate ×2) — h168 스냅샷 미도달, 표본 부족.**
- **확인불가 2건(LOG-20260907-01, LOG-20260907-02) — 연결된 발행 글 없음. 0건과 다른 사건이라 보류와 분리해 센다.**
- 전체 판정 로그 13개 중 예측이 달린 건 4개뿐 — 나머지 9개는 채점 대상 자체가 아니다(예측을 안 달았거나 아직 안 붙음).
- 규칙별 신뢰도(C-12, G-8, P-03, P-09): 넷 다 **유효 0 / 무효 0 / 보류 1**, Wilson 하한 계산 불가. 네 규칙 모두 아직 부트스트랩 구간이라 "이 규칙이 옳다"는 근거로 못 쓴다(§규칙: 부트스트랩 판정 금지).

## 커버리지 갭 (매칭 가능 병목 4/7)
- ✅ AWARENESS 3곳/5무브, ✅ CONVERSION 2곳/2무브, ✅ RETENTION 2곳/5무브, ✅ SUPPLY 3곳/6무브 — 매칭 가능.
- ❌ TRUST 0곳/0무브 — 갭. (단, `drafts/cases/`에 미승인 2건 대기 중, 아래 참고)
- ❌ UNIT_ECONOMICS 0곳/0무브 — 갭. 대기 중인 조사 없음.
- △ DISTRIBUTION 1곳(Zapier)/2무브 — 매칭 성립 안 됨(2곳 필요, 1곳은 절반이 아니라 불가).

## 다음 앵글 후보 (무브 단위, 최대 3개)
1. **Tuft & Needle · CHANNEL 무브** ("자기 사이트 후기 대신 아마존 후기에 신뢰를 위탁") — TRUST 갭을 메울 2곳 중 1곳. positive 결과 + 1차 출처(Fortune, PSU 강연, Indie Hackers) 확보. 왜 지금: TRUST 는 유일하게 0곳이던 병목인데 조사가 이미 오늘 끝나 있다. 사람 승인만 받으면 매칭 가능 병목이 즉시 5/7 로 는다.
2. **Whole Pantry · POSITIONING/OFFER 무브** ("검증 불가능한 개인 서사·기부 약속 위 매출은 확인되는 날 소멸") — TRUST 두 번째 케이스, negative 결과라 위 1번과 정반대 방향 대조가 된다. 왜 지금: 1번과 짝지어야 TRUST 매칭이 "서로 다른 2곳" 조건을 채운다. 단독으로는 못 쓴다.
3. **DISTRIBUTION 두 번째 케이스 발굴(무브 미정)** — Zapier 1곳뿐이라 매칭 불가 상태가 가장 오래(§coverage) 지속 중. 왜 지금: 앵글이 아니라 리서치 우선순위 제안이다 — 후보 무브가 아직 없다는 것 자체가 지금 비어 있는 자리다.

## 확인 못 한 것
- TRUST 두 조사(Tuft & Needle, Whole Pantry)가 아직 `review_status='draft'`인지, 사람 승인이 언제 나는지는 이 역할 권한 밖이라 확인 불가 — DB 에 쓰지도 조회하지도 않는다.
- 오늘 스테이징된 두 Threads 초안(`LOG-20260919-01/02` 추정)이 실제 발행됐는지는 이 원자료(score-predictions/coverage)에 없어 확인 불가 — 발행 여부는 사람 몫이고 다음 채점 주기에나 스냅샷이 잡힌다.
- score-predictions·coverage 두 스크립트 실행 시각과 이 두 case draft 파일의 커밋 여부 사이 시차 — coverage 결과가 이 두 초안을 이미 반영했는지 반영 전인지는 스크립트를 다시 돌려야 알 수 있고, 이 역할은 실행 결과를 받는 쪽이라 재실행 여부를 판단할 수 없다.

## 다음 주 주목 지표

- `like_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `reply_rate` — blue-apron-paid-acquisition-treadmill (이번에 스테이징한 초안의 예측)
- `like_rate` — gopro-ugc-viral-awareness (이번에 스테이징한 초안의 예측)
- `share_rate` — gopro-ugc-viral-awareness (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-19-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-19 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-19T22:19:25.514Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ▲ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":1,"all_draft":1,"partial_failed":1}) — 케이스 2건 중 1건이 적립 전 검사에서 막혔다 — whole-pantry-unverified-claim-trust-collapse: validate exit 1
- ▲ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":1,"queue_failed":1,"queue_unresolved":0,"queue_stalled":1,"partial_failed":1}) — 큐 2건 중 깨끗하게 닫지 못한 것이 있다 — 1건은 초안이 났는데 적립에서 막혀 큐를 failed 로 닫았다
- 이식성 미판정 무브 6건 / 후보 6건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — blue-apron-paid-acquisition-treadmill: 초안 파일 2026-09-18-blue-apron-paid-acquisition-treadmill.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":0,"transferability_unrated":6})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":17})
- ℹ️ Notion 푸시: zon-review-trust → https://app.notion.com/p/CASE-tuft-and-needle-amazon-review-trust-3e0100b7ffb4819c84faedef53b15146 ⏭️ 발굴 — 채택·확인불가 0건 (후보 2건). 페이지를 만들지 않는다. 푸시 완료 — 초안 2건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-20-CMO 기록·재확인

_실행 키 `cmo-2026-09-19-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
