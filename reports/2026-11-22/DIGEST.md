# CMO 데일리 다이제스트 2026-11-22

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 6건(가장 오래된 것 334시간 경과) — /dashboard 에서 연결 · 그중 칼럼 연재 편 1건은 posts 스테이징 먼저(scripts/column-threads-stage.mjs) · 파이프라인 외 게시물 4건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-22

**결론:** 채점으로 확정된 규칙 근거는 0건이다. 지금 급한 것은 새 앵글이 아니라 h168 스냅샷이 왜 비어 있는지 확인하는 일이다. 커버리지는 7/7로 갭이 없다.

## 채점 (예측 대 실측)
- 유효 0 / 무효 0 / **보류 3건 (표본 부족)**. 보류는 실패로도 성공으로도 세지 않았다.
- 채점 불가 1건(LOG-20260907-01)은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 판정 로그 23개 중 예측이 달린 것은 4개, 예측 항목은 7개다. 이 중 6개 항목(엔트리 3개)이 보류다. 7번째 항목은 원자료에 줄이 없어 확인하지 못했다.
- LOG-20260906-01 보류: h168 스냅샷이 없다. 항목은 like_rate, share_rate 2개다.
- LOG-20260907-03 보류: h168 스냅샷이 없다. 항목은 share_rate, like_rate 2개다.
- LOG-20260907-02 보류: 부트스트랩 구간이다. 기준선 표본이 0건이고 4건 미만은 채점하지 않는다. 항목은 reply_rate, like_rate 2개다. 이 판정은 참고값이라 규칙 근거로 쓰지 않는다.
- 규칙별 신뢰도: C-12, G-4, G-8, H3, P-03, P-09 6개가 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 산출 불가라서 "이 훅이 먹힌다/안 먹힌다"는 결론은 낼 수 없다.

## 주의할 점
- 보류 4개 항목의 사유는 "h168 스냅샷 없음"이다. 엔트리 날짜(09-06, 09-07)는 오늘(11-22)에서 약 두 달 반 전이다. 로그 날짜가 발행일과 같다면 시점이 안 된 것이 아니라 수집이 실패했을 가능성이 크다. 발행일은 원자료에 없어서 확인하지 못했다.
- LOG-20260907-02는 reply_rate와 like_rate의 실측이 둘 다 0.0315로 같다. 우연일 수도 있고 집계 오류일 수도 있다. 어느 쪽인지 확인하지 못했다.
- 스냅샷 4건은 명목 창(h1/h24/h168)과 맞지 않아 채점에서 뺐다. 이 글들에 데이터가 없다는 뜻은 아니다. 조기·사후 1회성 관측(catchup)이다.
- 실측 스냅샷은 8개 글에서 14개다. 부트스트랩 기준(발행 10건)에는 이 지표만으로 도달했는지 판단할 수 없다. 기준선 표본이 0건이라는 점은 도달하지 못했을 가능성을 시사한다.

## 커버리지 갭
- 매칭 가능 병목은 7/7이다. 케이스 2곳 미만인 병목은 없다.
- 케이스 수가 가장 적은 병목(3곳)은 DISTRIBUTION(무브 6건)과 SUPPLY(무브 5건)다. 갭은 아니지만 여유도 가장 얇다.
- AWARENESS(케이스 4곳·무브 6건)와 RETENTION(케이스 4곳·무브 6건)이 그다음이다.
- TRUST(케이스 4곳·무브 11건)와 UNIT_ECONOMICS(케이스 5곳·무브 7건)는 상대적으로 두텁다.

## 확인 못 한 것
- 위 엔트리의 발행일과 h168 스냅샷 누락 원인: 원자료에 없고 DB에도 접근할 수 없다.
- 7번째 예측 항목의 내용.
- 무브별 제목·훅: 커버리지 출력에 케이스명만 있고 무브 단위 정보가 없다. 그래서 앵글은 병목 단위로 적었고, 무브 선정은 CMO가 한다.
- `threads-report.mjs` 발행 지표 요약은 이번 원자료에 포함되지 않았다.

## 자가검증 (원칙 §0)
- 검토한 것: 보류를 유효·무효로 접지 않았는지, 부트스트랩 판정을 규칙 근거로 쓰지 않았는지, 표본 수를 함께 적었는지.
- 개선한 것: "h168 시점이 아직 안 됐다"는 해석을 그대로 받아들이지 않고 수집 실패 가능성을 따로 표시했다.
- 한계: 없는 수치는 만들지 않았다. 발행일과 7번째 항목은 위에 적은 대로 확인 불가다.

## 카드 후보
- SUPPLY 병목 무브 1개 (Fathom Analytics, Magic Spoon, Purple Innovation 중): 케이스 3곳·무브 5건으로 가장 얇아서, 지금 하나를 소진하면 매칭 여유가 줄기 전에 예측·실측 표본을 쌓을 수 있다.
- DISTRIBUTION 병목 무브 1개 (Figma, Testimonial.to, Zapier 중): 케이스 3곳으로 SUPPLY와 같은 수준의 얇은 병목이다. 서로 다른 병목으로 발행해야 규칙별 신뢰도(현재 전부 보류 1)를 분산해서 채울 수 있다.
- AWARENESS 병목 무브 1개 (Dr. Squatch, e.l.f. Beauty, GoPro, HOKA 중), 예측 6필드를 reply_rate·like_rate 중 하나로 단순화해서: 현재 보류는 대부분 기준선 표본 0건 또는 h168 누락이다. 지표 수를 줄이고 h168 수집을 먼저 확인해 부트스트랩 10건 도달을 앞당기는 것이 목적이다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-22-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-22 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-23T00:49:47.336Z)
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
- ℹ️ Notion 푸시: c-death-zone-wind-down-421100b7ffb481d89e21fe8fafa8785e ✅ DISCOVERY-2026-11-22 → https://app.notion.com/p/DISCOVERY-2026-11-22-421100b7ffb481429ab2c84ddee237a1 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-23-CMO 기록·재확인

_실행 키 `cmo-2026-11-22-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
