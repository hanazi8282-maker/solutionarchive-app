# CMO 데일리 다이제스트 2026-10-06

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

# 2026-10-06 성과 해설 (sa-cmo-analyst)

**결론:** 이번 판정에서 규칙의 유효·무효를 가릴 수 있는 건 0건이다. 커버리지는 7/7로 앵글 선택에는 문제가 없다. 지금 병목은 앵글이 아니라 실측이 쌓이지 않는 것이다.

## 채점 (예측 대 실측)
- **유효 0 / 무효 0 / 보류 3 엔트리(예측 6항목) / 채점 불가 1 엔트리.** 보류는 성공도 실패도 아니다.
- 판정 로그는 23개이고, 그중 예측이 달린 엔트리는 4개(예측 항목 7개)다.
- LOG-20260906-01: 보류. like_rate·share_rate의 h168 스냅샷이 없어 확인 불가다. 아직 그 시점이 안 됐거나 수집이 실패한 것이고, 둘 중 어느 쪽인지는 원자료로 구분할 수 없다.
- LOG-20260907-03: 위와 같은 사유로 보류다(share_rate·like_rate, h168 없음, 확인 불가).
- LOG-20260907-02: 보류. 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 이 건은 규칙 근거로 쓰지 않는다.
- LOG-20260907-01: 채점 불가. 연결된 발행 글이 없다. 0건이 아니라 확인 불가이고, 로그와 글의 연결이 빠졌는지 확인이 필요하다.
- 7번째 예측 항목이 어느 엔트리 몫인지는 원자료에 없다. 채점 불가 엔트리 쪽으로 추정하지만 확인 불가다.
- 스냅샷 4건은 h1/h24/h168 창과 안 맞는 조기·사후 관측(`catchup`)이라 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 확인이 필요한 수치
- LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다.
  - 우연일 수도 있고, 두 지표가 같은 필드를 읽는 수집 버그일 수도 있다.
  - 기준선이 없어 지금은 채점에 영향이 없다. 기준선이 생기기 전에 CTO가 원본 스냅샷으로 구분하는 게 좋다.

## 규칙별 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 규칙 모두 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 계산 불가다.
- 어느 규칙도 "먹힌다"거나 "안 먹힌다"고 결론 낼 근거가 없다. 규칙마다 표본이 1건(보류)이다.

## 커버리지 갭
- 매칭 가능 병목은 7/7이고, 케이스 0~1곳인 갭은 없다.
- 상대적으로 얇은 곳은 SUPPLY(케이스 3곳·무브 5건)다.
- 그다음은 DISTRIBUTION(3곳·6건), AWARENESS(4곳·6건), RETENTION(4곳·6건)이다.
- 갭이 아니라 "얇은 편"이라는 뜻이다. 매칭은 성립한다.

## 다음 앵글 후보
무브 목록이 원자료에 없어서 무브 단위로는 못 고른다. 병목과 케이스 단위로만 제안하고, 무브 선택은 CMO에게 넘긴다.
- **SUPPLY (Fathom Analytics / Magic Spoon / Purple Innovation).** 승인 무브가 5건으로 가장 적다. 지금 쓰면 승인 무브 소진 속도가 가장 빠르다.
  - `git status` 기준으로 Fathom 초안(`2026-10-06-fathom-analytics-viral-traffic-infra-scaling`)이 오늘 이미 열려 있다. 새로 쓰기보다 그 초안을 마무리하고 같은 병목의 다른 케이스는 뒤로 미루는 게 낫다.
- **DISTRIBUTION (Figma / Testimonial.to / Zapier).** 케이스가 3곳뿐이고 오늘 열린 초안이 없다. 병목 다양성 면에서 다음 순서다.
- **AWARENESS 또는 RETENTION (각 무브 6건).** 실측이 아직 없어 어느 병목이 반응하는지 모른다. 그래서 병목을 한 곳에 몰지 말고 퍼뜨려야 이후 비교 표본이 생긴다.
  - TRUST는 Tuft & Needle 초안이 오늘 열려 있어 겹치지 않게 피한다.

## 확인 못 한 것
- h168 스냅샷이 없는 이유: 시점 미도래인지 수집 실패인지 구분할 수 없다. 발행일을 알면 판별되지만 원자료에 발행일이 없다.
- 오늘 발행 누적 건수는 원자료에 없다. 스냅샷이 있는 글이 8건이라는 것만 안다.
- 무브 단위 후보: 무브 목록이 없어 제시하지 못했다.

## 자가검증 (`_principles.md` §0)
- 검토한 것: 보류를 유효·무효로 세지 않았는지, 부트스트랩 판정을 근거로 쓰지 않았는지, 수치 출처가 원자료인지.
- 찾은 개선점: 두 지표의 동일한 0.0315를 별도 확인 항목으로 올렸다. 후보 선정에서 오늘 이미 열린 초안과의 중복을 걸러냈다.

## 다음 주 주목 지표

- `like_rate` — fathom-analytics-viral-traffic-infra-scaling (이번에 스테이징한 초안의 예측)
- `reply_rate` — fathom-analytics-viral-traffic-infra-scaling (이번에 스테이징한 초안의 예측)
- `like_rate` — tuft-and-needle-amazon-review-trust (이번에 스테이징한 초안의 예측)
- `reply_rate` — tuft-and-needle-amazon-review-trust (이번에 스테이징한 초안의 예측)

## 실행 기록

- 실행 키: `cmo-2026-10-06-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-06 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-06T23:47:31.082Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 25곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic, testimonial-to-solo-saas-channel-bootstrap, plausible-analytics-usage-based-pricing-margin
- ⚠️ 영역 허용목록 확인 불가(data/case-area-map.json 없음) — 영역 필터 없이 기존 동작으로 골랐다. 5영역 밖 케이스가 뽑힐 수 있다
- 이식성 미판정 무브 18건 / 후보 26건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 4건 (내일 다시 후보): tuft-and-needle-amazon-review-trust/OPERATIONS(A), tuft-and-needle-amazon-review-trust/CHANNEL(A), tuft-and-needle-amazon-review-trust/OFFER(A), fathom-analytics-viral-traffic-infra-scaling/OPERATIONS(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":4,"transferability_unrated":18})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":2})
- ✅ `stage` 발행 대기 스테이징 ({"staged":2})
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-06-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
