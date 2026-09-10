# CMO 데일리 다이제스트 2026-09-10

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 2건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.

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

# CMO 성과 분석 — 2026-09-10

**TL;DR:** 채점 가능한 예측이 아직 하나도 없다 (유효 0 / 무효 0). 커버리지는 7/7 매칭됐지만 6개 병목이 최소 요건(2케이스)에 딱 걸쳐 있어 취약하다. 지금은 "무엇이 먹혔다"가 아니라 "커버리지를 지킨다" 기준으로만 다음 앵글을 고를 수 있다.

## 채점 결과 (score-predictions)

- **유효 0 / 무효 0 / 보류 2건 (표본 부족: h168 스냅샷 미도달)** — LOG-20260906-01(like_rate↑, share_rate↑), LOG-20260907-03(share_rate↑, like_rate↑). 예측 항목 4개 전부 "아직 그 시점이 안 됐거나 수집 실패" — 어느 쪽인지는 이 자료로 구분 불가.
- **확인 불가 2건 (보류와 다른 사건: 연결된 발행 글 없음)** — LOG-20260907-01, LOG-20260907-02. 표본 부족이 아니라 발행-예측 연결 자체가 안 된 상태라 별도로 센다.
- 규칙 신뢰도 4개(C-12, G-8, P-03, P-09) 전부 유효0/무효0/보류1, Wilson 하한 계산 불가 — 지금 "이 훅이 먹힌다/안 먹힌다"고 결론 낼 규칙이 하나도 없다.
- 부트스트랩 경고: 판정 로그 13건 중 예측 달린 건 4건뿐 — 아직 규칙 근거로 쓸 축적량이 아니다.

## 커버리지 갭 (case-match --coverage)

- 매칭 가능 병목 **7/7** — 현재 갭 없음.
- SUPPLY만 3케이스(Oatly, Peloton, Purple Innovation) · 무브 6건 — 6개 병목 중 유일하게 최소 요건(2곳) 이상의 여유.
- 나머지 6개(AWARENESS, TRUST, CONVERSION, RETENTION, UNIT_ECONOMICS, DISTRIBUTION)는 전부 정확히 2케이스 · 무브 4건 — 최소 요건에 딱 걸친 상태라, 그중 한 케이스가 재채점(regrade)이나 반려로 빠지면 즉시 매칭 불가(0/1)로 떨어진다.

## 다음 앵글 후보 (무브 단위, 최대 3)

성과 데이터가 전부 보류/확인불가라 "무엇이 먹혔는지"로 고를 근거가 없다. 그래서 아래는 성과 기반이 아니라 **커버리지 취약점 방어** 기준이고, 6개 병목이 동률로 취약해 이 세 개를 우선할 근거는 이 자료 안에 없다는 점을 먼저 밝힌다 — 실제 우선순위는 각 케이스의 review_status·evidence_grade를 확인해야 갈리는데 그 값은 이번 입력에 없다.

- **AWARENESS (e.l.f. Beauty / Nubank)** — 왜 지금: 2케이스 최소요건 병목 중 하나. 셋 중 하나가 재채점으로 빠지면 즉시 매칭 붕괴.
- **TRUST (Carvana / Warby Parker)** — 왜 지금: 동일하게 2케이스 최소요건. 우선순위를 가를 근거는 없고 방어가 필요하다는 사실만 확인됨.
- **CONVERSION (Slack / Notion)** — 왜 지금: 동일 사유. 나머지(RETENTION, UNIT_ECONOMICS, DISTRIBUTION)도 같은 상태이므로 이 3개 선택은 예시일 뿐 확정 우선순위가 아니다.

## 확인 못 한 것

- LOG-20260906-01 / 20260907-03의 h168 미도달이 "아직 시점 안 됨"인지 "수집 실패"인지 — score-predictions 출력이 둘을 구분하지 않아 이 자료만으로는 판단 불가.
- LOG-20260907-01 / 02가 발행 글과 왜 연결이 안 됐는지(초안 유실? 파이프라인 버그?) — 원인 데이터 없음.
- threads-report.mjs 결과가 이번 입력에 없어 실제 발행 지표(조회수·좋아요 절대치)는 확인 불가 — 위 채점은 score-predictions 결과만 반영.
- 6개 2케이스 병목 중 어느 것이 review_status/evidence_grade 상 더 위태로운지 — 이번 coverage 출력엔 병목당 케이스명만 있고 등급/상태가 없어 우선순위를 가를 수 없다.

## 다음 주 주목 지표

- `like_rate` — chewy-autoship-retention (이번에 스테이징한 초안의 예측)
- `share_rate` — chewy-autoship-retention (이번에 스테이징한 초안의 예측)
- `like_rate` — chewy-autoship-retention (이번에 스테이징한 초안의 예측)
- `share_rate` — chewy-autoship-retention (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-10-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"committed":2,"all_draft":2})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_done":2,"queue_failed":0})
- ✅ `angle` 앵글 선정 ({"angles":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-10-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
