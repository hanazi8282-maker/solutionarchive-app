# CMO 데일리 다이제스트 2026-10-07

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 2건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. 발행됐는데 연결 안 된 Threads 게시물 0건

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 2건
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

# 성과 분석 해설 (2026-10-07)

**결론 3줄**
- 지금 성과로 규칙을 판정할 근거는 없다. 채점된 예측 항목은 0건이다.
- 병목 7개가 모두 매칭 가능하므로 커버리지 갭은 없다. 지금 병목은 소재가 아니라 측정이다.
- 해야 할 일은 h168 스냅샷이 쌓이는지 확인하는 것과, 연결 글이 없는 LOG-20260907-01 을 푸는 것이다.

## 채점 (예측 항목 7개)
- **유효 0 / 무효 0 / 보류 7 (표본 부족).** 보류는 성공으로도 실패로도 세지 않는다.
- 보류 6건은 h168 스냅샷이 없어서다. LOG-20260906-01 의 2항목(like_rate·share_rate)과 LOG-20260907-03 의 2항목(share_rate·like_rate)이 여기에 든다. 이건 확인 불가다. 아직 그 시점이 안 된 것일 수도 있고, 수집이 실패했을 수도 있다. 이 원자료만으로는 둘을 가를 수 없다.
- 나머지 보류 2건은 LOG-20260907-02 의 reply_rate·like_rate 이고, 이유는 부트스트랩 구간이다. 기준선 표본이 0건이라 채점하지 않는다(4건 미만은 채점 안 함). 실측값 0.0315 는 참고값일 뿐 "이 훅이 먹힌다"의 근거가 아니다.
- 채점 불가 1건: LOG-20260907-01 은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 엔트리 구성은 전체 23개, 예측이 달린 것 4개다. 4개 중 3개는 채점 대상에 올랐지만 전부 보류이고, 1개는 채점 불가다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 개 모두 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 계산되지 않는다(-).
- 어느 규칙도 신뢰도 근거로 쓸 수 없다. "이 규칙이 맞다/틀리다"는 결론은 내리지 않는다.

## 커버리지
- **매칭 가능 병목 7/7.** 갭인 병목은 없다.
- 케이스 수가 가장 적은 병목은 DISTRIBUTION(3곳 · 6건)과 SUPPLY(3곳 · 5건)다. 둘 다 매칭 성립선(2곳)을 넘었다. 다만 여유는 한 곳뿐이라, 한 곳이 숨김 처리되면 그 병목은 매칭 불가가 된다.
- 무브 수가 가장 많은 병목은 TRUST(4곳 · 11건)다. 가장 적은 건 SUPPLY(5건)다.

## 다음 앵글 후보 (무브 단위, 3개)
- **SUPPLY 무브 (Fathom Analytics · Magic Spoon · Purple Innovation 중)**: 무브가 5건으로 가장 적고 케이스 여유도 한 곳뿐이다. 성과 데이터가 없는 지금은 얇은 병목에 글을 한 편 더해 표본을 쌓는 편이 낫다.
- **DISTRIBUTION 무브 (Figma · Testimonial.to · Zapier 중)**: 케이스 3곳으로 SUPPLY 와 같은 얇은 구간이다. 아직 반응 데이터가 없어서 이 병목이 먹히는지 판단할 근거가 없다.
- **TRUST 무브 (무브 11건 중)**: 후보가 가장 많아 비교용 글을 고르기 쉽다. 반응 비교가 가능한 기준선이 필요한 시점에 맞고, 현재 기준선 표본이 0건이라 부트스트랩 탈출에 가장 빨리 기여한다.
- 세 후보 모두 "이 앵글이 잘 먹혀서"가 아니라 "표본을 쌓아야 해서"라는 이유로 고른 것이다. 성과 근거로 고른 앵글이 아니다.

## 확인 못 한 것
- h168 스냅샷이 없는 이유(아직 시점 전인지, 수집 실패인지). 발행일 정보가 원자료에 없다.
- LOG-20260907-01 에 연결된 글이 없는 이유. 발행이 안 됐는지, 연결이 빠졌는지 알 수 없다.
- 발행 누적 건수가 10건 미만인지 정확히 알 수 없다. 단 기준선 표본이 0건이므로 부트스트랩 구간으로 읽는다.
- `threads-report.mjs` 결과는 받지 못했다. views 기준(100 미만 보류)은 확인하지 못했다.
- 스냅샷 4건은 명목 창(h1/h24/h168)과 나이가 안 맞아 제외됐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 절차 점검 (_principles §0)
- 검토한 것: 채점 결과 7항목, 규칙 6개, 병목 7개. 개선한 것: 보류 원인을 "스냅샷 없음(확인 불가)"과 "부트스트랩 구간"으로 갈라 적었다.
- 남은 개선점: 후보 선정 이유가 성과 근거가 아니라는 점을 명시했다. 성과가 쌓이면 이 근거를 다시 읽어야 한다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-07-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-07 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-08T00:11:28.985Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 27곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic, testimonial-to-solo-saas-channel-bootstrap
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- 이식성 미판정 무브 2건 / 후보 3건 — 판정은 사람이 /cases 승인 때 고른다
- 같은 케이스라 오늘은 미룬 무브 1건 (내일 다시 후보): zenefits-licensing-macro-trust-collapse/OPERATIONS(A)
- ✅ `angle` 앵글 선정 ({"angles":2,"deferred_same_slug":1,"transferability_unrated":2})
- ✅ `draft` 초안 작성 + 게이트 ({"drafted":2,"manifests":0})
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-07-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
