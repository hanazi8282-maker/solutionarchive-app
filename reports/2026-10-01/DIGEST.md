# CMO 데일리 다이제스트 2026-10-01

**붙여넣기 대기: 2건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 발행 대기 2건. 앱에서 확인하고 직접 발행한다.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

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

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

# 성과 분석 — 2026-10-01

**결론: 채점 가능한 건이 0건이다. 이번 성과 데이터로는 어떤 규칙도 유효·무효로 말할 수 없다. 다음 앵글은 커버리지 갭이 아니라 측정 가능성 기준으로 고른다.**

## 채점 결과
- 유효 0 / 무효 0 / **보류 6 (표본 부족·확인 불가)**.
  - 보류 6건은 예측 항목 7개 중 채점 대상 엔트리 3개의 항목이다.
  - 나머지 1개는 채점 불가 엔트리 `LOG-20260907-01`(연결된 발행 글 없음)의 것으로 추정한다. 원자료에 항목별 귀속이 없어 확인은 못 했다.
- 보류 사유 ① — h168 스냅샷이 없다: `LOG-20260906-01`(2항목), `LOG-20260907-03`(2항목)이 해당한다.
  - 두 건 모두 발행 후 168시간이 한참 지났을 시점이다(원자료상 날짜 기준 약 3주 전, 발행일은 로그 ID 날짜로 추정).
  - "아직 시점이 안 됐다"로는 설명이 안 된다. 수집 실패 가능성이 있고, 원인은 원자료만으로 확인할 수 없다.
- 보류 사유 ② — 부트스트랩 구간이다: `LOG-20260907-02`(2항목)는 기준선 표본이 0건이다. 4건 미만이라 채점하지 않는다.
- 이번 구간에서 채점된 결과는 없다. 부트스트랩 구간 판정이라 어차피 규칙 근거로 쓰지 않는다.
- 규칙별(C-12, G-4, G-8, H3, P-03, P-09): 전부 유효 0 / 무효 0 / 보류 1. Wilson 하한은 전부 계산 불가다.
- 채점 불가 1건(`LOG-20260907-01`)은 0건이 아니라 **확인 불가**다. 발행 글 연결이 끊겼는지, 발행 자체가 안 됐는지 구분이 안 된다.

## 표본 현황
- 판정 로그 23건 중 예측이 달린 엔트리는 4건뿐이다. 예측 항목은 7개다.
- 실측 스냅샷은 14개(post 8건)다. 스냅샷 4건은 `catchup`(명목 창과 안 맞는 나이)이라 채점에서 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.
- 발행 누적 수는 원자료에 없다. 부트스트랩 구간(10건 미만) 여부는 `LOG-20260907-02`의 기준선 0건으로만 확인된다.

## 커버리지
- 매칭 가능 병목 **7/7**. 케이스 0/1곳인 갭은 없다.
- 얇은 쪽 (케이스 수 기준, 3곳이 최소): DISTRIBUTION 3곳·무브 6건, SUPPLY 3곳·무브 5건.
- 나머지는 AWARENESS 4, TRUST 4, CONVERSION 4, RETENTION 4, UNIT_ECONOMICS 5곳이다.

## 다음 앵글 후보
무브 단위 데이터가 원자료에 없다. 아래는 병목 단위 후보이고, 무브 선택은 CMO 가 `case-match.mjs` 로 한다.
- **SUPPLY (무브 5건, 가장 얇다):** 케이스 3곳(Fathom, Magic Spoon, Purple Innovation)이 최소선이다. 승인 무브가 하나 빠지면 매칭이 깨질 수 있어 지금 글로 소진하기 전에 보강 조사부터 필요하다.
- **TRUST (무브 11건, 가장 두껍다):** 선택지가 가장 넓다. 예측에 `like_rate`·`share_rate`·`reply_rate` 같은 지표 방향을 달아 규칙 표본을 쌓기에 유리하다. 쌓이는 표본이 없는 게 지금 가장 큰 문제다.
- **DISTRIBUTION (무브 6건):** SUPPLY 다음으로 얇다. Figma, Testimonial.to, Zapier 3곳이다. 발행 간격을 두고 한 건씩 돌려 케이스 소진 속도를 본다.

공통 전제: 새 글에는 반드시 연결된 post 를 남기고 h168 수집이 도는지 먼저 확인한다. 안 그러면 또 보류가 쌓인다.

## 확인 못 한 것
- h168 스냅샷이 없는 이유(수집 실패 vs 미발행 vs 연결 누락). 원자료에 `collect-metrics` 로그가 없다. 확인 대상이다.
- `LOG-20260907-01`의 발행 글 연결 여부.
- `LOG-20260907-02`의 `reply_rate`·`like_rate` 실측이 둘 다 0.0315로 동일하다. 우연인지 지표 매핑 오류인지 판단할 근거가 없다.
- 발행 누적 총수와 `views < 100` 해당 건수. `threads-report.mjs` 는 이번 입력에 없어 실행하지 않았다.
- 오늘 날짜의 새 초안(Munchery, Seed DS-01)이 어느 병목에 걸리는지. 원자료에 없다.

## 검토 근거 (§0)
- 검토: 보류 6건을 전부 "실패"로도 "성공"으로도 세지 않고 별도 칸에 뒀다.
- 개선: 커버리지 7/7을 "문제 없음"으로 접지 않고 얇은 병목(SUPPLY·DISTRIBUTION)을 따로 짚었다. 채점 0건의 원인을 앵글이 아니라 측정 파이프라인(h168 수집·post 연결)에서 찾았다.

## 다음 주 주목 지표

- `like_rate` — munchery-precook-overproduction-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — munchery-precook-overproduction-collapse (이번에 스테이징한 초안의 예측)
- `like_rate` — seed-ds01-clinical-strain-probiotic (이번에 스테이징한 초안의 예측)
- `reply_rate` — seed-ds01-clinical-strain-probiotic (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-10-01-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-01 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-01T23:52:42.298Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 43건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 3건 (내일 다시 후보): seed-ds01-clinical-strain-probiotic/PRICING(C), munchery-precook-overproduction-collapse/OPERATIONS(A), seed-ds01-clinical-strain-probiotic/CONTENT(C)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":3,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-01-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
