# CMO 데일리 다이제스트 2026-11-14

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 2건(가장 오래된 것 150시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 8건(초안 없이 직접 쓴 글 — 연결 대상 아님)

## 스코어보드

- 조사(new_drafts): 1건
- 적립(committed): 1건
- 초안(drafted): 0건
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

# 성과 해설 — 2026-11-14

**결론:** 이번 판정에서 규칙 근거로 쓸 수 있는 것은 0건이다. 유효 0 / 무효 0 / 보류 6, 채점 불가 1건이다. 다음 앵글은 성과가 아니라 커버리지 두께로 고르고, 그 사실을 후보에 적는다. 오늘 할 일은 연결된 발행 글이 없는 LOG-20260907-01 점검이다.

## 채점 (예측 항목 7개)

- 유효 0 / 무효 0 / **보류 6 (표본 부족·확인 불가)** — 셋을 분리해서 센다.
- 채점 불가 1건: LOG-20260907-01, 연결된 발행 글 없음. 보류 6개와 별개로 센다.
- LOG-20260906-01 보류 2건: like_rate·share_rate 모두 h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집 실패이고, 원자료로는 둘을 구분할 수 없다.
- LOG-20260907-03 보류 2건: share_rate·like_rate 모두 h168 스냅샷이 없다. 위와 같은 사유다.
- LOG-20260907-02 보류 2건: 부트스트랩 구간이라 기준선 표본이 0건이다(4건 미만은 채점하지 않는다). 이 구간의 판정은 참고값이고 규칙 근거가 아니다.
- 규칙별 신뢰도 6개(C-12·G-4·G-8·H3·P-03·P-09)는 전부 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않았다. 지금은 어떤 훅·규칙에 대해서도 "먹힌다 / 안 먹힌다"를 말할 수 없다.
- 스냅샷은 14개(글 8건)다. 그중 4건은 h1/h24/h168 명목 창과 맞지 않는 catchup 관측이라 채점에서 뺐다. 이는 그 글에 데이터가 없다는 뜻이 아니다.

## 커버리지

- 매칭 가능 병목 **7/7**. 케이스 0~1곳인 갭은 없다.
- 병목별 케이스·무브 수(적은 순):
  - SUPPLY 3곳·5건
  - DISTRIBUTION 3곳·6건
  - AWARENESS 4곳·6건
  - RETENTION 4곳·6건
  - CONVERSION 4곳·7건
  - UNIT_ECONOMICS 5곳·7건
  - TRUST 4곳·11건
- 갭은 아니지만 SUPPLY와 DISTRIBUTION이 케이스 3곳으로 가장 얇다. 한 곳이 반려되면 2곳이 되어 매칭 하한에 붙는다.

## 확인 못 한 것

- `threads-report.mjs` 결과가 원자료에 없다. 발행 건수와 views 분포를 모르니 부트스트랩 문턱(발행 10건)을 넘었는지 확인 불가다.
- LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 같다. 우연일 수 있지만 지표 매핑 오류일 수도 있어, 수집 계층 확인 전에는 이 값을 근거로 쓰지 않는다.
- h168 스냅샷 부재가 "아직 시점 미도달"인지 "수집 실패"인지 원자료로는 구분할 수 없다. 게시 시각을 대조해 가려야 한다.
- 무브 단위 식별자와 각 무브의 승인 상태·등급은 원자료에 없다. 아래 후보는 병목·케이스 단위로만 적었다.

## 다음 앵글 근거

- 성과 데이터가 앵글을 가르지 못한다. 전 항목이 보류라서 어떤 훅이 낫다는 근거가 없다.
- 그래서 후보는 커버리지 두께 기준이고, 이번 판단의 한계다.
- 새 글은 h168 시점에 채점 가능해야 한다. LOG-20260907-01처럼 발행 글이 연결되지 않는 일을 먼저 막아야 한다.

## 카드 후보

- SUPPLY 병목 무브(Fathom Analytics·Magic Spoon·Purple Innovation 중) — 케이스 3곳·무브 5건으로 7개 병목 중 가장 얇아, 글이 나가면 근거 두께를 넓히면서 매칭 하한(2곳)에 가장 가깝다.
- DISTRIBUTION 병목 무브(Figma·Testimonial.to·Zapier 중) — 케이스 3곳·무브 6건으로 SUPPLY 다음으로 얇고, 사례 간 대비가 뚜렷해 한 글에서 비교하기 쉽다.
- AWARENESS 병목 무브(Dr. Squatch·e.l.f. Beauty·GoPro·HOKA 중) — 케이스 4곳·무브 6건이다. 성과 신호가 전혀 없는 지금은 훅이 다른 병목 앵글과 겹치지 않는 쪽을 골라야 이후 h168 비교가 깨끗하다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-14-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-14 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-14T23:54:14.562Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 29곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ⏭️ `angle` 앵글 선정 — 쓸 수 있는 승인 무브가 0건 (승인은 사람이 한다 — 루프의 실패가 아니다)
- ⏭️ `draft` 초안 작성 + 게이트 — 앵글 0건
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-11-14-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
