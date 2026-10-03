# CMO 데일리 다이제스트 2026-10-03

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

## 결론

- 채점 결과는 **유효 0 / 무효 0 / 보류 6**이다. 규칙 근거로 쓸 수 있는 판정이 아직 없다.
- 커버리지는 **매칭 가능 병목 7/7**이고 갭(0·1곳)은 없다. 지금 병목은 앵글 부족이 아니라 **측정 부족**이다.
- 다음 앵글은 "무엇이 먹히나"를 가리는 용도가 아니라 기준선 표본(4건 이상)을 채우는 용도로 고른다.

## 채점 (예측 항목 기준)

- **유효: 0건**
- **무효: 0건**
- **보류(표본 부족): 6건**
  - LOG-20260906-01: like_rate·share_rate 2건. h168 스냅샷이 없어 확인 불가다.
  - LOG-20260907-02: reply_rate·like_rate 2건. 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다).
  - LOG-20260907-03: share_rate·like_rate 2건. h168 스냅샷이 없어 확인 불가다.
- **채점 불가: 1엔트리.** LOG-20260907-01은 연결된 발행 글이 없다. 보류와 다른 칸이다.
- 출력은 예측 항목 7개라고 하는데, 채점된 엔트리 3개에 항목이 6개 있다. 남은 1개는 LOG-20260907-01의 항목으로 추정하지만, 출력에 직접 적혀 있지는 않다.
- 규칙별 신뢰도는 C-12, G-4, G-8, H3, P-03, P-09 모두 **유효 0 / 무효 0 / 보류 1**이다. Wilson 하한이 없어서 6개 규칙 모두 판단할 수 없다.
- 판정이 된 값은 LOG-20260907-02의 실측 0.0315 하나뿐이다. 기준선 표본이 0건이라 참고값이고, 이걸로 "이 훅이 먹힌다"고 결론 내지 않는다.

## 측정 상태

- 실측 스냅샷은 14개, 글은 8건이다. 명목 창(h1/h24/h168)과 안 맞는 스냅샷 4건은 제외됐다. 그 글에 데이터가 없다는 뜻은 아니다.
- **확인 필요 1:** LOG-20260907-02에서 reply_rate와 like_rate의 실측이 둘 다 0.0315로 똑같다. 우연일 수 있지만 서로 다른 지표가 같은 값이면 계산·매핑 오류일 수 있다. 원본 스냅샷을 열어 확인해야 한다.
- **확인 필요 2:** 09-06, 09-07 로그의 h168 스냅샷이 없다. 오늘이 10-03이라 "아직 시점이 안 됐다"로 읽기 어렵다. 다만 로그 날짜가 발행일인지 판정일인지는 출력만으로 알 수 없다. 발행일이 맞다면 수집 실패일 가능성이 크다.
- 발행 누적 건수는 이 출력에 없다. 부트스트랩 구간(10건 미만) 여부는 `threads-report.mjs`로 확인해야 한다.

## 커버리지

- **갭(케이스 0·1곳) 병목: 없음.**
- 가장 얇은 곳은 SUPPLY(케이스 3곳·무브 5건), DISTRIBUTION(케이스 3곳·무브 6건)이다. 매칭 하한(2곳)은 넘겼지만 여유가 1곳뿐이다.
- 가장 두꺼운 곳은 TRUST(케이스 4곳·무브 11건)다. 나머지는 AWARENESS 4곳·6건, CONVERSION 4곳·7건, RETENTION 4곳·6건, UNIT_ECONOMICS 5곳·7건이다.

## 다음 앵글 후보

무브 ID는 이 출력에 없어서 후보는 병목 단위다. 무브 선택은 `case-match.mjs` 결과를 본 뒤에 정한다.

1. **TRUST** — 무브가 11건으로 가장 많아 서로 다른 훅으로 글을 여러 개 만들 수 있다. 기준선 4건을 가장 빨리 채울 수 있어서 지금이다.
2. **SUPPLY** — 무브 5건으로 가장 얇다. 지금 한두 건을 쓰면 이후 매칭 여유가 줄어드는지 미리 알 수 있어서다.
3. **DISTRIBUTION** — 케이스가 3곳이라 하한 여유가 1곳뿐이다. 승인이 한 곳이라도 빠지면 매칭이 끊기므로, 갭이 되기 전에 쓰고 보강 조사를 건다.

## 확인하지 못한 것

- 발행 누적 건수와 `views < 100` 해당 건수: `threads-report.mjs`를 돌리지 않았다.
- 각 글의 발행일: 로그 날짜와 같은지 알 수 없다.
- 0.0315 중복의 원인: 원본 스냅샷이 없다.
- 후보 3개를 무브 단위로 좁히는 것: 무브 목록이 출력에 없다.

## 자가검증 (`_principles.md` §0)

- 이 해설은 보류 6건을 성공으로도 실패로도 세지 않았다.
- 검토 중 찾은 개선점은 0.0315 중복과 h168 누락의 시점 모순이다. 이 둘을 "확인 필요"로 올렸다.

## 다음 주 주목 지표

- `like_rate` — content-goblin-low-tier-pricing-support-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — content-goblin-low-tier-pricing-support-collapse (이번에 스테이징한 초안의 예측)
- `like_rate` — zume-pizza-mobile-oven-production-collapse (이번에 스테이징한 초안의 예측)
- `reply_rate` — zume-pizza-mobile-oven-production-collapse (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-10-03-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-03 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-03T23:02:48.155Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- 이식성 미판정 무브 20건 / 후보 39건 — 판정은 사람이 /cases 승인 때 고른다
- ⚠️ 앵글 경고 — zume-pizza-mobile-oven-production-collapse: 초안 파일 2026-09-26-zume-pizza-mobile-oven-production-collapse.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- ⚠️ 앵글 경고 — content-goblin-low-tier-pricing-support-collapse: 초안 파일 2026-09-27-content-goblin-low-tier-pricing-support-collapse.body.txt 이 이미 있는데 DB(content_items·stage.json)에는 없다 — 스테이징이 실패했을 수 있다. 중복 초안을 만들기 전에 확인하라
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): zume-pizza-mobile-oven-production-collapse/PACKAGING(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":20})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":17})
- ℹ️ Notion 푸시: -saas-passion-shutdown-3ee100b7ffb481448dcfd5de3f267958 ✅ DISCOVERY-2026-10-03 → https://app.notion.com/p/DISCOVERY-2026-10-03-3ee100b7ffb481db9571c6dd0a9cd500 푸시 완료 — 초안 2건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-04-CMO 기록·재확인

_실행 키 `cmo-2026-10-03-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
