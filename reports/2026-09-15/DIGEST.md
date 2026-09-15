# CMO 데일리 다이제스트 2026-09-15

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 1개 — 아래 "병목 진단"을 먼저 봐라. 안전장치가 작동한 것이지 사고가 아니다.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 2건
- 스테이징(staged): 2건
- 막힘(blocked): 1단계
- 실패(failed): 0단계

## 병목 진단

- ❌ AWARENESS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ TRUST — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ RETENTION — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ UNIT_ECONOMICS — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ DISTRIBUTION — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- ❌ SUPPLY — 케이스 0곳 · 무브 0건. 매칭에는 서로 다른 케이스 2곳이 필요하다.
- 매칭 가능 병목 1 / 7
- ▲ `stage` 발행 대기 스테이징 ({"staged":2}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).

## 개선 방안

죄송합니다, 방금 도구 호출은 이 작업과 무관한 것이었습니다 — 무시해 주세요. `sa-cmo-analyst` 역할 기준으로 해설한 결과입니다.

# CMO 성과 분석 — 2026-09-15

**결론**: 채점 가능한 유효/무효 신호는 0건이다. 예측 4건·항목 7개가 전부 보류/채점불가 상태라 규칙 신뢰도 판단은 아직 불가능하다. 커버리지는 CONVERSION 1개 병목만 매칭 성립(1/7)이고, 다음 앵글은 성과가 아니라 커버리지 갭이 유일한 근거다.

## 예측 대 실측 채점
- 판정 로그 13건 중 예측 연결 4건, 예측 항목 7개 — 채점 완료(유효+무효) **0건**.
- **보류 4항목**(LOG-20260906-01·LOG-20260907-03, 각 2항목: like_rate up / share_rate up) — 사유: h168 스냅샷 없음, "확인 불가(시점 미도래 또는 수집 실패, 구분 안 됨)".
- **채점 불가 3항목**(LOG-20260907-01·02, 엔트리 2건) — 사유: 연결된 발행 글 없음. 표본 부족형 보류와는 다른 사유이므로 별도로 센다 — 0건이 아니라 확인 불가.
- 실측 스냅샷 4개 중 post 연결은 2건뿐 — 나머지 2개가 무엇에 연결됐는지는 이 원자료로 확인 불가.

## 규칙별 신뢰도
- C-12, G-8, P-03, P-09 — 4개 규칙 전부 유효 0 / 무효 0 / 보류 1, Wilson 하한 계산 불가(표본 1건).
- 4개 규칙 모두 표본 1건, 부트스트랩 구간(발행 누적 10건 미만) 미만 — 어떤 규칙도 "먹힌다/안 먹힌다" 결론 낼 근거 없음.

## 커버리지 갭
- ✅ CONVERSION — 케이스 2곳(ConvertKit, Homejoy), 무브 2건 — 유일하게 매칭 성립.
- ❌ AWARENESS / TRUST / RETENTION / UNIT_ECONOMICS / DISTRIBUTION / SUPPLY — 전부 케이스 0곳·무브 0건, 매칭 성립 조건("서로 다른 케이스 2곳") 미달.
- 매칭 가능 병목 1/7 — 단, CONVERSION 도 성과 신호(유효/무효)는 아직 0건이라 "매칭 성립"은 구조적 자격일 뿐 효과 검증은 아니다.

## 다음 앵글 후보 (최대 3개)
성과 데이터가 전부 보류라 "무엇이 먹힌다"는 근거로 앵글을 고를 수 없다. 아래 3개는 성과가 아니라 순수 커버리지 갭 기준이며, 6개 갭 병목 중 서로 우선순위를 가릴 근거는 이 원자료에 없다 — 동급으로 제시한다.
- AWARENESS — 케이스 0곳: CONVERSION 다음으로 매칭 성립 조건(2곳)을 채워야 커버리지가 넓어짐.
- DISTRIBUTION — 케이스 0곳: 동일하게 매칭 미성립 갭.
- TRUST — 케이스 0곳: 동일하게 매칭 미성립 갭.
(RETENTION·UNIT_ECONOMICS·SUPPLY 도 동일 조건(0곳)이라 이 셋과의 우선순위 차등 근거는 원자료에 없음 — 확인 불가)

## 확인 못 한 것
- 6개 갭 병목 중 어디를 먼저 조사할지 — 무브 후보 목록·비즈니스 우선순위 데이터가 원자료에 없어 확인 불가.
- 실측 스냅샷 4개 중 post 미연결 2건의 정체 — score-predictions/coverage 원자료에 없음.
- LOG-20260907-01·02가 "연결된 발행 글 없음" 상태인 이유(발행 예정 대기 중인지, 애초에 스킵됐는지) — 확인 불가.

## 다음 주 주목 지표

- `like_rate` — convertkit-concierge-migration-conversion (이번에 스테이징한 초안의 예측)
- `reply_rate` — convertkit-concierge-migration-conversion (이번에 스테이징한 초안의 예측)
- `like_rate` — homejoy-discount-conversion-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — homejoy-discount-conversion-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-15-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- 기준 날짜 2026-09-15 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-15T22:52:51.713Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":1,"queue_failed":1,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":0,"transferability_unrated":0})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ▲ `stage` 발행 대기 스테이징 ({"staged":2}) — CG-1 미통과 — 등급 C 무브를 인용했는데 본문에 출처 귀속 문구가 없다. posts 는 draft 로 눕혔다(본문은 남아 있다).
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":17})
- ℹ️ Notion 푸시: dc8e53a362b5d ✅ CASE-zapier-integration-page-seo-distribution → https://app.notion.com/p/CASE-zapier-integration-page-seo-distribution-3dc100b7ffb481b8a8e1edf4957451a9 푸시 완료 — 초안 1건 · 신규케이스 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-09-16-CMO 기록·재확인

_실행 키 `cmo-2026-09-15-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
