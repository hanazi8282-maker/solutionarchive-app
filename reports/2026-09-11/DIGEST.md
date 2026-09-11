# CMO 데일리 다이제스트 2026-09-11

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 2건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.

## 스코어보드

- 조사(new_drafts): 2건
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

# CMO 성과 분석 — 2026-09-11

## TL;DR
발행 이력이 아직 부트스트랩 구간이라 **채점 가능한 판정이 하나도 없다** — 유효 0 / 무효 0, 전부 보류 또는 확인 불가다. 반면 **커버리지는 7/7 병목 전부 매칭 완료**라 콘텐츠화 갭은 없다. 오늘 이미 RETENTION(듀오링고)·DISTRIBUTION(피그마) 무브가 드래프트 중이므로, 다음 앵글은 오늘 손 안 댄 나머지 유휴 병목에서 고르는 게 맞다.

## 채점 결과 (score-predictions)
- 판정 로그 13건 중 예측 달린 엔트리 4건 · 예측 항목 7개 · 실측 스냅샷 2개(발행글 1건 기준) — 표본 자체가 매우 작다.
- **유효 0 / 무효 0 / 보류(표본부족) 4항목**: LOG-20260906-01(like_rate↑, share_rate↑) 2항목, LOG-20260907-03(share_rate↑, like_rate↑) 2항목 — 사유는 h168 스냅샷 부재. "아직 그 시점이 안 됐다"와 "수집이 실패했다"는 원자료에서도 구분이 안 돼 있어 나도 못 가른다.
- **확인 불가 2건(위와 다른 사유)**: LOG-20260907-01, LOG-20260907-02 — 연결된 발행 글 자체가 없음. 표본부족이 아니라 채점 대상 자체가 성립하지 않는 경우다.
- 스냅샷 2개가 이미 존재한다는 것(post 1건 기준)은 "관측을 아예 안 한 것"은 아니라는 뜻 — h168 시점만 비어 있다는 것과 관측 자체가 없다는 것은 다른 사건이므로 구분해 적는다.

## 규칙별 신뢰도
- C-12 / G-8 / P-03 / P-09 — 4개 규칙 전부 **유효 0 / 무효 0 / 보류 1**, Wilson 하한 계산 불가(분모 0).
- 부트스트랩 경고 그대로 적용: 이 4개 규칙 중 어느 것도 "먹힌다/안 먹힌다" 결론을 지금 낼 근거가 없다.

## 커버리지 갭 (case-match --coverage)
- 매칭 가능 병목 **7/7** — 현재 시점 커버리지 갭은 없다.
- 다만 AWARENESS·TRUST·CONVERSION·RETENTION·UNIT_ECONOMICS·DISTRIBUTION 6곳은 정확히 최소치(케이스 2곳)라 한 곳만 탈락해도 미매칭으로 되돌아가는 **fragile 매칭**이다. SUPPLY만 3곳(Oatly, Peloton, Purple Innovation)으로 여유가 있다.
- 참고(git status 기준, 아직 승인 전): `drafts/cases/`에 AWARENESS 신규 케이스 초안 2건(hoka, pets.com)이 대기 중 — 승인되면 AWARENESS가 4곳으로 늘어 fragile 상태를 벗어나지만, 승인은 이 역할이 판단할 사안이 아니다.

## 다음 앵글 후보 (무브 단위, 최대 3개)
- **TRUST**(Carvana/Warby Parker 무브 중 1건) — 오늘 케이스조사도 스레드드래프트도 전혀 안 건드린 완전 유휴 병목이면서 최소 매칭치라 방치 리스크가 있다.
- **CONVERSION**(Slack/Notion 무브 중 1건) — 마찬가지로 오늘 활동 이력이 없는 최소치 매칭 병목.
- **UNIT_ECONOMICS**(Casper/컬리 무브 중 1건) — 마찬가지로 오늘 미가동. AWARENESS는 오늘 이미 신규 케이스조사(hoka, pets.com)로 자원이 투입되고 있어 순위를 뒤로 뺐다.
- 성과 데이터(위 채점 결과)로 우선순위를 가른 건 아니다 — 전부 보류라 그럴 근거가 없다. 이번 3개는 "오늘 아무 활동도 없는 fragile 매칭 병목부터 채운다"는 절차적 판단이다.

## 확인 못 한 것
- 개별 무브의 구체 타이틀/ID — `case-match.mjs --coverage` 출력은 케이스 쌍과 무브 건수만 주고 무브 식별자를 안 준다. DB 접근이 없어 위 3개 후보는 병목/케이스 수준까지만 특정했다.
- LOG-20260907-01·02가 "연결된 발행 글 없음" 상태가 된 원인(미발행/취소/기록 누락 중 무엇인지) — 원자료에 사유가 없다.

## 다음 주 주목 지표

- `like_rate` — duolingo-streak (이번에 스테이징한 초안의 예측)
- `reply_rate` — duolingo-streak (이번에 스테이징한 초안의 예측)
- `like_rate` — figma-non-designer-distribution (이번에 스테이징한 초안의 예측)
- `share_rate` — figma-non-designer-distribution (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-11-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"committed":1,"all_draft":1})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_done":1,"queue_failed":1})
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): duolingo-streak/PRODUCT_FEATURE(C), figma-non-designer-distribution/PRODUCT_FEATURE(C)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-11-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
