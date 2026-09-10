# CMO 데일리 다이제스트 2026-09-10

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.

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

## 개선 방안

# CMO 성과 분석 — 2026-09-10

**결론**
- 채점 가능한 예측 0건 — 전부 보류. "이 훅이 먹힌다"고 말할 근거가 아직 없다.
- 커버리지는 7/7 병목 전부 매칭 가능 — 다음 앵글은 성과 데이터가 아니라 "아직 안 건드린 병목" 기준으로 고른다.
- 규칙 신뢰도(C-12, G-8, P-03, P-09) 전부 Wilson 하한 계산 불가 — 규칙 근거로 쓸 수 있는 것이 없다.

## 예측 대 실측 채점 — 유효 / 무효 / 보류

- **유효 0건 / 무효 0건 / 보류 4건 (표본 부족)** — 판정 로그 13개 중 예측이 달린 건 4개, 예측 항목은 7개. 실측 스냅샷이 2개(post 1건)뿐이라 h168 시점 자체가 아직 안 왔다.
- LOG-20260906-01: like_rate↑, share_rate↑ 둘 다 보류 — h168 스냅샷 없음 (확인 불가: 시점 미도래 또는 수집 실패, 구분 안 됨).
- LOG-20260907-03: share_rate↑, like_rate↑ 둘 다 보류 — 동일 사유.
- LOG-20260907-01 / LOG-20260907-02: **채점 불가 별건** — 연결된 발행 글 없음. 이건 "보류"와 다른 사유(표본 부족이 아니라 연결 끊김)이므로 같은 칸에 세지 않는다.
- 규칙별 신뢰도: C-12 / G-8 / P-03 / P-09 — 넷 다 유효 0·무효 0·보류 1, Wilson 하한 산출 불가. **부트스트랩 구간(발행 10건 미만) 판정이라 규칙 근거로 쓰지 않는다.**

## 커버리지 갭

- 매칭 가능 병목 **7/7** — 갭 없음. AWARENESS(e.l.f. Beauty, Nubank) · TRUST(Carvana, Warby Parker) · CONVERSION(Slack, Notion) · RETENTION(Chewy, Duolingo) · UNIT_ECONOMICS(Casper, 컬리) · DISTRIBUTION(조선미녀, Figma) 각 케이스 2곳, SUPPLY만 3곳(Oatly, Peloton, Purple Innovation).
- 오늘(2026-09-10) 이미 초안화된 것: DISTRIBUTION(조선미녀), CONVERSION(Slack) — `drafts/threads/` 확인.

## 다음 앵글 후보 (병목 단위 — 주의: 개별 무브 명칭은 이 원자료에 없어 특정 불가, 아래 참고)

- **SUPPLY (Oatly, Peloton, Purple Innovation)** — 케이스 3곳·무브 6건으로 가장 두터운데 오늘 초안에서 비어 있다. 근거 밀도가 가장 높은 병목을 놀리고 있는 셈.
- **TRUST (Carvana, Warby Parker)** — 매칭 기준(2곳)은 넘겼고 오늘 드래프트 대상에도 없다. 신뢰 축은 AWARENESS/CONVERSION과 다른 독자 반응을 볼 수 있는 병목이라 다음 순번.
- **RETENTION (Chewy, Duolingo)** — 마찬가지로 매칭 성립·오늘 미착수. UNIT_ECONOMICS(Casper, 컬리)와 순번이 겹치는데, RETENTION이 소비자 체감 사례(Chewy/Duolingo)라 진입 장벽이 낮아 우선.

## 확인 못 한 것

- **개별 무브(move) 내용** — coverage 출력에 "무브 4건/6건" 건수만 있고 무브 텍스트 자체가 없다. 무브 단위 후보를 정확히 못 골랐다. `case-match.mjs --coverage`가 아니라 무브 상세 조회가 있어야 채워짐.
- **h168 실측 시점 도래 여부** — 보류 4건이 "아직 시점이 안 됐다"인지 "수집이 실패했다"인지 원자료로는 구분 안 됨. 둘 다 "확인 불가"로만 처리했다.
- **LOG-20260907-01/02가 왜 발행 글에 연결이 안 됐는지** — staging 오류인지 의도적 누락인지 원자료에 없음.

## 다음 주 주목 지표

- `like_rate` — beauty-of-joseon (이번에 스테이징한 초안의 예측)
- `share_rate` — beauty-of-joseon (이번에 스테이징한 초안의 예측)
- `like_rate` — slack-bottom-up-conversion (이번에 스테이징한 초안의 예측)
- `share_rate` — slack-bottom-up-conversion (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-10-manual` · 트리거 manual · 목표 조사 2 / 초안 2
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"committed":1,"all_draft":1})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_done":1,"queue_failed":1})
- ✅ `angle` 앵글 선정 ({"angles":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-10-manual` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
