# CMO 데일리 다이제스트 2026-10-14

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 1건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 1건
- 스테이징(staged): 0건
- 막힘(blocked): 0단계
- 실패(failed): 0단계

## 병목 진단

- 커버리지 갭 없음 — 병목 전부 서로 다른 케이스 2곳 이상이다.
- 매칭 가능 병목 7 / 7
- 막히거나 실패한 단계 없음.

## 독자 피드백 (최근 24시간)

- 피드백 없음 (조회는 정상 — 최근 24시간 표 0건).

## 개선 방안

# 성과 해설 — 2026-10-14

**결론:** 이번 채점에서 유효나 무효로 확정된 규칙은 없다. 지금 할 일은 새 앵글 탐색이 아니라 h168 스냅샷과 기준선 표본(4건 이상)을 채우는 것이다. 커버리지는 7/7이라 매칭 갭은 없다.

## 채점 (예측 항목 7개, 판정 로그 4건)
- **유효 0 / 무효 0 / 보류 6 (표본 부족) / 채점 불가 1.** 이 구성은 셋 다 별도 칸이다.
- **보류 6개는 판정 로그 3건에 2개씩 걸려 있다.**
  - LOG-20260906-01: like_rate·share_rate가 h168 스냅샷 없음으로 보류. 아직 그 시점이 안 됐거나 수집이 실패한 것인데, 어느 쪽인지는 이 자료로 구분할 수 없다.
  - LOG-20260907-03: like_rate·share_rate가 같은 이유로 보류.
  - LOG-20260907-02: reply_rate·like_rate가 부트스트랩 구간(기준선 표본 0건, 4건 미만은 채점 안 함)이라 보류.
- **채점 불가 1건(LOG-20260907-01)은 연결된 발행 글이 없어서다.** 실패가 아니라 확인 불가다.
- **7개 중 보류 6개를 뺀 나머지 1개는 이 채점 불가 건 몫으로 추정한다.** 원자료에는 이 건의 항목 수가 직접 적혀 있지 않다.
- **규칙별 신뢰도:** C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 `-`다. 이 6개 규칙은 "먹힌다"도 "안 먹힌다"도 말할 수 없다.
- **데이터 규모:** 실측 스냅샷은 글 8건에서 14개다. 이 숫자는 채점 근거가 되지 못한다.

## 확인 대상
- LOG-20260907-02의 reply_rate와 like_rate 실측값이 둘 다 0.0315로 같다.
  - 서로 다른 지표가 소수 넷째 자리까지 같은 것은 우연일 수도, 지표 매핑 오류일 수도 있다.
  - 지금은 보류라 채점에 영향이 없다. 기준선이 쌓여 채점이 시작되기 전에 어느 쪽인지 확인해야 한다.
- 스냅샷 4건은 h1/h24/h168 명목 창과 맞지 않는 나이(`catchup` 1회성 관측)라 채점에서 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 커버리지
- **매칭 가능 병목 7/7.** 케이스 0곳이나 1곳인 갭은 없다.
- **얇은 곳은 DISTRIBUTION과 SUPPLY다.** 둘 다 케이스가 정확히 3곳이라 승인 케이스 하나만 빠져도 2곳(매칭 하한) 근처로 내려간다.
  - DISTRIBUTION: 케이스 3곳, 무브 6건.
  - SUPPLY: 케이스 3곳, 무브 5건. 7개 병목 중 무브가 가장 적다.
- 나머지 병목은 케이스 4~5곳이다. UNIT_ECONOMICS가 5곳으로 가장 두껍다.

## 다음 앵글 후보
무브 제목은 원자료에 없어서 병목·케이스 단위로 제안한다. 무브 선택은 CMO가 승인 무브 목록에서 해야 한다.
- **UNIT_ECONOMICS (Bannerbear, Plausible 등 5곳 중에서).** 케이스가 가장 두꺼워 매칭이 안정적으로 나온다. 기준선 표본 4건을 가장 빨리 채울 수 있는 병목이라 지금 적합하다.
- **TRUST (Everlane, Ritual 등 4곳, 무브 11건으로 최다).** 무브 선택지가 가장 많아 앵글을 나눠 쓸 수 있다. 같은 병목 안에서 훅을 바꿔 가며 지금의 예측 규칙 6개를 서로 다른 글에서 검증하기 좋다.
- **SUPPLY (Fathom, Magic Spoon, Purple 3곳).** 무브가 5건뿐이라 가장 얇다. 지금 무브를 소비해서 갭이 되기 전에 케이스 보강 조사를 같이 요청해야 한다. 이건 앵글 확정이 아니라 보강 신호다.

## 확인 못 한 것
- h168 스냅샷이 없는 이유: 시점 미도래인지 수집 실패인지 구분 못 했다. 각 글의 발행일이 자료에 없다.
- 발행 누적 건수: 부트스트랩 기준(10건 미만)과 비교하지 못했다. 기준선 표본 0건이라는 로그만 있다.
- `threads-report.mjs` 출력: 받지 못해 조회수(`views < 100`)별 보류 사유를 확인하지 못했다.
- 각 규칙이 어느 판정 로그에 달렸는지: 로그와 규칙 ID의 대응이 자료에 없다.

**검토 절차(§0):** 보류를 성공이나 실패로 접지 않았는지 확인했고, 0.0315 중복을 개선점으로 찾아냈다. 앵글 3개는 근거가 커버리지 수치뿐이라 무브 단위가 아닌 병목 단위로 제안했다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-14-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-14 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-14T23:11:58.417Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 28곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ✅ `angle` 앵글 선정 ({"angles":1,"deferred_same_slug":0,"transferability_unrated":0})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":1,"manifests":0})
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: ps://app.notion.com/p/CASE-teamometer-landing-page-signups-not-validation-zero-sales-3f9100b7ffb481b0992fce832085c57e ⏭️ 발굴 — 채택·확인불가 0건 (후보 0건). 페이지를 만들지 않는다. 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 0건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-15-CMO 기록·재확인

_실행 키 `cmo-2026-10-14-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
