# CMO 데일리 다이제스트 2026-11-10

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 3건(가장 오래된 것 318시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 7건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 2026-11-10 성과 해설

**결론: 지금 채점으로 증명된 규칙은 0개다. 유효 0, 무효 0이고 전부 보류다. 채점이 막힌 이유는 표본 부족(기준선 0건)과 h168 스냅샷 미수집 두 가지이므로, 다음 앵글은 성과가 아니라 커버리지 얇은 병목 기준으로 고른다.**

## 채점 (엔트리 4건 기준)
- 유효 0 / 무효 0 / **보류 3** / 채점 불가 1. 보류는 실패도 성공도 아니다.
- 예측 항목 기준으로는 보류 6건이다. 사유는 둘로 갈린다.
- **h168 스냅샷 없음 4건** (LOG-20260906-01, LOG-20260907-03 각 2건). 아직 그 시점이 안 됐거나 수집이 실패한 것이다. 둘을 이 데이터로 구분할 수 없으니 확인 불가다.
- **부트스트랩 구간 2건** (LOG-20260907-02). 기준선 표본이 0건이고 채점 최소는 4건이다. 이 구간의 판정은 규칙 근거로 쓰지 않는다.
- **채점 불가 1건** (LOG-20260907-01). 연결된 발행 글이 없다. 0건이 아니라 확인 불가이며, 글 연결이 먼저다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 전부 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않았다. "이 훅이 먹힌다/안 먹힌다"는 결론은 낼 수 없다.

## 의심 지점
- LOG-20260907-02의 reply_rate와 like_rate 실측이 둘 다 0.0315로 같다. 우연일 수도 있지만 같은 값을 두 지표에 잘못 연결했을 수도 있다. 이 데이터만으로는 확인 불가이니 수집 쪽에서 원자료를 확인해야 한다.
- 스냅샷 4건은 h1/h24/h168 창과 나이가 안 맞아 제외됐다(`catchup` 1회성 관측). 그 글에 데이터가 없다는 뜻은 아니다.
- 판정 로그 23건 중 예측이 달린 것은 4건(약 17%)뿐이다. 나머지 19건은 채점 대상이 아니다. 표본이 안 쌓이는 근본 원인이 이것인지는 이 데이터로 확인 불가다.

## 커버리지 (매칭 가능 병목 7/7)
- 0/1곳 갭인 병목은 없다. 전부 서로 다른 케이스 2곳 이상이라 매칭이 성립한다.
- 얇은 쪽: SUPPLY 3곳·5무브, DISTRIBUTION 3곳·6무브. 케이스 1곳만 빠져도 2곳 기준에 가까워진다.
- 중간: AWARENESS 4곳·6무브, RETENTION 4곳·6무브, CONVERSION 4곳·7무브.
- 두꺼운 쪽: TRUST 4곳·11무브, UNIT_ECONOMICS 5곳·7무브.

## 확인 못 한 것
- 무브 단위 후보를 고르는 데 필요한 무브 목록. `--coverage` 출력에는 병목별 건수만 있어서 후보는 병목 단위로만 적었다.
- 발행 지표 요약(`threads-report`)은 이 입력에 없어서 views·반응 추이는 해설하지 못했다.
- 위 h168 미수집이 대기인지 수집 실패인지.

## 카드 후보
- SUPPLY 병목 무브 (Fathom Analytics·Magic Spoon·Purple Innovation 중 하나) — 3곳·5무브로 가장 얇고 성과 데이터로 대체 근거를 댈 수도 없어, 커버리지 기준으로 먼저 채운다.
- DISTRIBUTION 병목 무브 (Figma·Testimonial.to·Zapier 중 하나) — 3곳이라 SUPPLY와 함께 매칭 여유가 가장 적다. 발행 글이 늘면 규칙 검증 표본도 같이 쌓인다.
- AWARENESS 병목 무브 (Dr. Squatch·e.l.f. Beauty·GoPro·HOKA 중 하나) — 4곳·6무브로 중간 수준이다. 부트스트랩 구간 규칙(P·G·H 계열)이 기준선 표본을 모을 때 훅 비교용으로 쓸 수 있다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-10-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-10 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-11T00:39:51.610Z)
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
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: s-vanish-solo-shutdown-415100b7ffb481d5b025e483d8661b16 ✅ DISCOVERY-2026-11-10 → https://app.notion.com/p/DISCOVERY-2026-11-10-415100b7ffb481b69f15d541705ae522 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-11-CMO 기록·재확인

_실행 키 `cmo-2026-11-10-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
