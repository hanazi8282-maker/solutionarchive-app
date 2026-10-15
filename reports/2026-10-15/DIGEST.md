# CMO 데일리 다이제스트 2026-10-15

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

# 성과 해설 — 2026-10-15

**결론: 지금 규칙에 대해 말할 수 있는 건 없다. 채점된 예측이 0건이다.** 병목 커버리지는 7/7로 문제없다. 막힌 곳은 측정이다. h168 스냅샷이 없거나 기준선이 비어 있다.

## 채점 결과

- 유효 0 / 무효 0 / **보류 6 (표본 부족)**. 예측 항목 7개 중 6개가 보류다. 엔트리 3건(LOG-20260906-01, 0907-02, 0907-03)에 항목이 둘씩 있다.
- **채점 불가 1건**: LOG-20260907-01은 연결된 발행 글이 없다. 이건 보류가 아니라 확인 불가다. 이 엔트리의 항목 수는 원자료에 없다. 7−6=1로 추정했을 뿐이다.
- 보류 사유 ① LOG-20260906-01·0907-03: h168 스냅샷이 없다. 4개 항목(like_rate, share_rate이 각 2개)이다. 아직 그 시점이 안 됐거나 수집 실패다. 둘 중 어느 쪽인지 원자료로는 알 수 없다.
- 보류 사유 ② LOG-20260907-02: 부트스트랩 구간이다. 기준선 표본이 0건이라 4건 미만 규칙으로 채점하지 않는다(reply_rate, like_rate 2개 항목).
- 규칙별 신뢰도는 C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이고, Wilson 하한은 계산 불가다. 이 여섯 규칙에 대한 효과 결론은 없다.
- 부트스트랩 구간(발행 누적 10건 미만)이라 어떤 판정도 규칙 근거로 쓰지 않는다.

## 확인해야 할 것

- LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 똑같다. 우연일 수도 있고 같은 필드를 읽었을 수도 있다. 원자료만으로는 판단이 안 되니 스냅샷 원본을 대조해야 한다.
- 스냅샷 4건은 h1/h24/h168 명목 창에 안 맞아서 뺐다(조기·사후 1회성 관측, 'catchup'). 그 글들에 데이터가 없다는 뜻이 아니다.
- 스냅샷 14개(post 8건)는 있지만, 어느 글이 어느 창을 채웠는지는 이 출력에 없다. h168이 비는 이유를 가를 수 없다.

## 커버리지

- 매칭 가능 병목 **7/7**. 케이스 2곳 미만인 갭은 없다.
- 얇은 쪽은 SUPPLY(케이스 3곳·무브 5건), DISTRIBUTION(3곳·6건)이다. 갭은 아니지만 매칭 풀이 가장 좁다.
- AWARENESS(4곳·6건), RETENTION(4곳·6건)은 무브 수가 적은 편이다. 가장 두터운 쪽은 TRUST(4곳·11건), UNIT_ECONOMICS(5곳)다.

## 다음 앵글 후보

이 원자료에는 무브 이름이 없다. 그래서 무브 단위로 못 고르고 병목 단위로만 제안한다. 무브 선택은 `case-match.mjs`로 승인 무브 목록을 본 뒤에 해야 한다.

1. **SUPPLY**: 무브 5건으로 7개 병목 중 가장 적고, 케이스도 3곳뿐이다. 승인 무브가 가장 얕아서 지금 초안을 쓰면 같은 무브 재사용 위험이 가장 크다.
2. **DISTRIBUTION**: 케이스 3곳으로 풀이 좁다. 다른 병목 앵글과 훅·형식이 겹치지 않게 분산하기 좋다.
3. **TRUST**: 무브 11건으로 선택지가 가장 넓다. 다만 채점이 전부 보류라 어떤 훅이 먹히는지 아직 모른다. 이걸 근거로 TRUST를 밀지 말고, 후보를 고를 때 무브가 많은 쪽으로 쓰라는 정도로만 읽어라.

세 후보 모두 성과 근거가 아니라 커버리지 폭만으로 고른 약한 근거다. 성과 기반 선정은 h168 스냅샷이 쌓인 뒤에 가능하다.

## 확인 못 한 것

- h168 스냅샷이 없는 이유. 수집 실패인지 시점 미도래인지 이 출력으로는 구분이 안 된다.
- LOG-20260907-01에 연결된 발행 글이 왜 없는지, 그리고 이 엔트리의 예측 항목 수.
- 발행 누적 건수. 부트스트랩 기준 10건과 비교할 수치가 원자료에 없고, `threads-report.mjs`는 이번에 실행되지 않았다.
- 승인 무브의 개별 이름과 내용. 커버리지 출력에는 건수만 있다.

**절차 점검**: 원자료만으로 보류와 확인 불가를 분리했고, 근거 없는 효과 결론은 내리지 않았다. 개선점은 두 가지다. 같은 값(0.0315)이 두 지표에 찍힌 것을 확인 대상으로 올렸고, 앵글 후보가 커버리지 폭만으로 고른 것임을 명시했다. 이 분석은 읽기 전용이라 파일을 만들거나 DB를 건드리지 않았다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-15-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-15 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-15T23:04:12.702Z)
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

_실행 키 `cmo-2026-10-15-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
