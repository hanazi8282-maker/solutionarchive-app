# CMO 데일리 다이제스트 2026-09-12

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

# CMO 성과 분석 — 2026-09-12

**결론**: 이번 구간엔 유효도 무효도 없다 — 예측 4건 전부 보류, 별도 2건은 발행 글 미연결로 채점 자체가 불가했다. 규칙 신뢰도(C-12/G-8/P-03/P-09) 전부 분모 0, "이 훅이 먹힌다"고 말할 근거 없음. 커버리지는 7/7 병목 매칭 완료, 갭은 없지만 6개 병목이 최소선(2곳)에 딱 걸려 있어 여유가 없다. 다음 액션: 성과 신호가 아직 없으니 앵글 선택은 커버리지 안전성 기준으로 하고, h168 미도달 원인(시점 미도달 vs 수집 실패)부터 별도로 확인한다.

## 채점 결과 (유효 / 무효 / 보류 분리)
- 유효 0 / 무효 0 / 보류 4 (표본 부족 — h168 스냅샷 미도달)
- LOG-20260906-01: like_rate↑ 보류, share_rate↑ 보류 — 둘 다 h168 스냅샷 없음, 확인 불가(시점 미도달인지 수집 실패인지 미구분)
- LOG-20260907-03: share_rate↑ 보류, like_rate↑ 보류 — 동일 사유
- 채점 불가 2건(0건과 다른 사건, 확인 불가로 별도 계상): LOG-20260907-01, LOG-20260907-02 — 연결된 발행 글 없음
- 판정 로그 13건 중 예측이 붙은 건 4건뿐(예측 항목 7개, 실측 스냅샷 2개·post 1건) — 나머지 9건은 예측 미첨부라 이번 채점 대상에 안 들어감

## 규칙별 신뢰도
- C-12 / G-8 / P-03 / P-09: 전부 유효0·무효0·보류1, Wilson 하한 산출 불가(분모 0)
- 넷 다 아직 데이터가 없는 상태이지 "안 먹힌다"가 아니다 — 지금 어떤 규칙도 근거로 쓸 수 없다

## 커버리지 (병목 갭)
- 매칭 가능 병목 7/7 — 현재 갭 없음
- AWARENESS 2곳(e.l.f. Beauty, Nubank) / TRUST 2곳(Carvana, Warby Parker) / CONVERSION 2곳(Slack, Notion) / RETENTION 2곳(Chewy, Duolingo) / UNIT_ECONOMICS 2곳(Casper, 컬리) / DISTRIBUTION 2곳(조선미녀, Figma) / SUPPLY 3곳(Oatly, Peloton, Purple Innovation)
- 6개 병목(SUPPLY 제외)이 최소선(2곳)에 정확히 걸려 있다 — 그중 케이스 1곳이 반려·재채점으로 빠지면 그 병목은 즉시 갭으로 되돌아간다

## 다음 앵글 후보 (무브 단위 상세는 이 데이터에 없어 케이스 단위로 대신 제시)
1. **SUPPLY — Oatly / Peloton / Purple Innovation**: 왜 지금 — 유일하게 최소선을 넘는 병목(3곳·무브 6건)이라 소재 폭이 가장 넓고, 성과 신호가 전무한 지금 특정 훅에 몰리지 않고 다양하게 시도해 볼 여유가 있는 유일한 병목이다.
2. **AWARENESS — e.l.f. Beauty / Nubank**: 왜 지금 — 최소선(2곳)에 걸린 6개 병목 중 하나. 근거가 딱 2곳뿐이라 지금 써 두는 게 안전하고, 늦출수록 케이스 반려 시 갭 리스크를 그대로 안고 가게 된다.
3. **RETENTION — Chewy / Duolingo**: 왜 지금 — 역시 최소선 병목. 데이터상 AWARENESS·TRUST·CONVERSION·UNIT_ECONOMICS·DISTRIBUTION과 우선순위 차이를 가를 근거가 없어 이 셋은 사실상 동순위 예시다 — 순서 자체에 데이터 근거는 없다.

## 확인 못 한 것
- 무브 단위 상세(어느 케이스의 어느 무브가 아직 초안화되지 않았는지)는 `--coverage` 출력에 없다. 케이스명·병목당 개수까지만 확인됨.
- h168 스냅샷 미도달이 "아직 그 시점이 안 됐다"인지 "수집 실패"인지는 원자료가 구분하지 않는다 — 다음 행동(그냥 기다림 vs 수집 파이프라인 점검)이 갈리므로 별도 확인 필요.
- LOG-20260907-01/02에 발행 글이 왜 연결 안 됐는지(글 자체가 없는지, 연결 키 불일치인지)는 이 원자료만으로는 근거가 없다.
- 6개 최소선 병목 중 어느 케이스가 반려·재채점 위험이 있는지는 이 출력 범위 밖(review_status는 다른 명령의 산출물).

## 다음 주 주목 지표

- `like_rate` — notion-template-gallery (이번에 스테이징한 초안의 예측)
- `share_rate` — notion-template-gallery (이번에 스테이징한 초안의 예측)
- `like_rate` — nubank-word-of-mouth-acquisition (이번에 스테이징한 초안의 예측)
- `share_rate` — nubank-word-of-mouth-acquisition (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-12-cron` · 트리거 cron · 목표 조사 2 / 초안 2
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":2})
- ✅ `research` 조사 ({"attempted":2,"agent_ok":2,"new_drafts":2})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":2,"committed":2,"all_draft":2,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":2,"queue_done":2,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 같은 케이스라 오늘은 미룬 무브 2건 (내일 다시 후보): notion-template-gallery/COMMUNITY(C), nubank-word-of-mouth-acquisition/PRICING(C)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-12-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
