# CMO 데일리 다이제스트 2026-09-30

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

# 성과 분석 2026-09-30

## 결론
- **채점으로 검증된 규칙이 0개다.** 유효 0 / 무효 0이고, 이 원자료로는 "어떤 훅이 먹힌다"고 말할 수 없다.
- 채점 창(h168)이 안 닫혔거나 기준선 표본이 0건이라 전부 보류다. 이는 실패도 성공도 아니다.
- 커버리지는 7/7이라 갭이 없다. 지금 병목은 소재가 아니라 **성과 표본**이다.

## 채점 (예측 항목 7개, 엔트리 4개)
- **유효: 0건**
- **무효: 0건**
- **보류: 6항목 (엔트리 3개, 표본 부족)**
  - h168 스냅샷 없음 4항목: LOG-20260906-01(like_rate, share_rate), LOG-20260907-03(share_rate, like_rate). 그 시점이 안 됐거나 수집이 실패한 것으로, 원자료는 둘을 가르지 못한다.
  - 부트스트랩 구간 2항목: LOG-20260907-02(reply_rate, like_rate). 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 참고값이며 규칙 근거로 쓰지 않는다.
- **채점 불가: 1엔트리** (LOG-20260907-01, 연결된 발행 글 없음). 항목 수는 원자료에 없다. 7개에서 위 6개를 뺀 1개로 추정한다. 이것도 보류가 아니라 확인 불가다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 여섯 개 전부 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 없다. 표본이 1이라 어느 쪽으로도 읽을 수 없다.

## 커버리지
- **매칭 가능 병목 7/7.** 케이스 2곳 미만인 갭은 없다.
- 케이스가 가장 얇은 곳은 DISTRIBUTION(3곳·무브 6건)과 SUPPLY(3곳·무브 5건)다. 갭은 아니지만 여유가 가장 작다.
- 가장 두꺼운 곳은 TRUST(무브 11건·4곳)와 UNIT_ECONOMICS(5곳·무브 7건)다.
- 이 수치는 승인 커버리지다. 무브별로 이미 글이 나갔는지는 이 원자료에 없다.

## 다음 앵글 후보
무브 ID가 원자료에 없어서 병목 단위로만 적는다. 무브 선정은 CMO가 coverage 원본에서 한다.
1. **TRUST 무브.** 풀이 11건으로 가장 두꺼워서, 같은 형식을 반복해 기준선 4건을 가장 빨리 채울 수 있다. 지금 모든 채점이 기준선 0건에서 막혀 있다.
2. **UNIT_ECONOMICS 무브.** 케이스가 5곳으로 최다여서 2곳 이상 비교 앵글이 안정적으로 성립한다. TRUST와 겹치지 않는 병목이라 첫 비교 표본 후보가 된다.
3. **(조건부) SUPPLY 또는 DISTRIBUTION 무브.** 앞의 두 병목에서 기준선이 쌓이기 전에는 우선할 이유가 없다. 성과 근거가 생긴 뒤에 얇은 풀을 쓰는 편이 안전하다.

## 확인 못 한 것
- h168 스냅샷이 없는 4항목이 미도래인지 수집 실패인지 가르지 못했다. 이 출력만으로는 구분이 안 된다. `collect-metrics`의 해당 글 실행 기록을 봐야 한다.
- 제외된 스냅샷 4건은 h1/h24/h168 창과 나이가 안 맞는 `catchup` 관측이다. 수집 타이밍이 창에서 밀려서 이 글들이 채점 자격을 잃는 구조인지는 확인하지 못했다. 이 스냅샷 4건이 전체 11건의 3분의 1이 넘어서 구조 문제일 수 있다.
- LOG-20260907-02에서 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다. 우연인지 계산·수집 버그인지 판단할 근거가 없다. 기준선이 채워지기 전에 원본 스냅샷을 대조해야 한다.
- LOG-20260907-01에 연결된 발행 글이 없는 이유는 모른다. 미연결인지 미발행인지 원자료로는 알 수 없다.

## 검토·개선점 (원칙 §0)
- 개선점은 **채점 가능한 글의 수를 늘리는 것**이다. 창에서 밀린 스냅샷과 미연결 엔트리를 먼저 복구해야 한다. 앵글을 더 만들어도 채점되는 표본은 늘지 않는다.

## 다음 주 주목 지표

- `like_rate` — everpix-vc-track-fixed-cost-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — everpix-vc-track-fixed-cost-collapse (이번에 스테이징한 초안의 예측)
- `like_rate` — kite-individual-dev-pricing-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — kite-individual-dev-pricing-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-09-30-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-09-30 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-09-30T23:46:36.371Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 45건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — everpix-vc-track-fixed-cost-collapse: 초안 파일 2026-09-29-everpix-vc-track-fixed-cost-collapse.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): kite-individual-dev-pricing-collapse/OPERATIONS(C)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-09-30-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
