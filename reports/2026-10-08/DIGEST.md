# CMO 데일리 다이제스트 2026-10-08

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

# 성과 해설 — 2026-10-08

**결론:** 채점으로 확정된 것은 없다. 유효 0 · 무효 0 · 보류 전부다. 지금은 규칙을 평가할 때가 아니라 표본을 쌓을 때다. 커버리지는 7/7이라 앵글 선택에 막힘이 없다.

## 채점 결과
- **유효 0 / 무효 0 / 보류 3 (표본 부족)** — 예측이 채점 대상으로 잡힌 엔트리 3개이고, 항목으로는 6개다.
- **채점 불가 1건(보류와 별개):** LOG-20260907-01은 연결된 발행 글이 없어 채점할 수 없다. 0건이 아니라 확인 불가다.
- **항목 수 불일치:** 원자료 헤더의 "예측 항목 7개" 중 6개만 본문에서 확인된다. 나머지 1개는 채점 불가 엔트리 소속으로 추정하지만, 원자료만으로는 확정할 수 없다.
- LOG-20260906-01은 보류다. like_rate와 share_rate 둘 다 h168 스냅샷이 없다. 아직 그 시점이 안 됐거나 수집이 실패했는지 구분되지 않는다.
- LOG-20260907-03도 보류다. share_rate와 like_rate 둘 다 h168 스냅샷이 없고, 위와 같은 이유로 구분되지 않는다.
- LOG-20260907-02는 보류다. 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 이 구간 값은 참고값이고 규칙 근거로 쓰지 않는다.
- **확인 대상:** LOG-20260907-02에서 reply_rate와 like_rate의 실측값이 둘 다 0.0315로 같다. 우연일 수도 있지만 지표 매핑 오류일 수도 있다. 이 원자료로는 가르지 못하니, 기준선이 쌓여 채점이 시작되기 전에 CTO가 원 스냅샷을 열어 봐야 한다.
- **제외된 스냅샷:** 4건은 h1/h24/h168 창과 나이가 안 맞는 `catchup` 관측이라 채점에서 뺐다. 그 글에 데이터가 없다는 뜻은 아니다.

## 규칙 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09는 모두 유효 0 / 무효 0 / 보류 1이고 Wilson 하한은 계산되지 않았다.
- 이 6개 규칙은 "먹힌다"도 "안 먹힌다"도 말할 수 없다. 표본 1(보류)로는 신뢰도를 논할 수 없다.

## 커버리지
- 매칭 가능 병목은 **7/7**이고, 케이스 0~1곳인 갭은 없다.
- 가장 얇은 병목은 SUPPLY(케이스 3곳·무브 5건)와 DISTRIBUTION(케이스 3곳·무브 6건)이다. 매칭 최소선(케이스 2곳)에서 1곳 여유뿐이다.
- 가장 두꺼운 병목은 UNIT_ECONOMICS(케이스 5곳·무브 7건)이다. TRUST는 무브가 11건으로 가장 많지만 케이스는 4곳이다.

## 다음 앵글 후보
원자료에 무브 이름이 없어 무브 단위로는 못 고르고 병목 단위로만 제시한다. 어떤 병목이 이미 발행됐는지도 원자료에 없다. 중복 여부는 CMO가 발행 이력과 대조해야 한다.
1. **SUPPLY** (Magic Spoon / Fathom Analytics / Purple Innovation): 여유가 가장 얇다. 케이스 하나가 반려되거나 숨겨지면 매칭이 깨지므로, 쓸 수 있을 때 발행해 둔다.
2. **DISTRIBUTION** (Figma / Testimonial.to / Zapier): SUPPLY와 같은 이유로 여유가 1곳뿐이다.
3. **UNIT_ECONOMICS** (Blueland / Bannerbear / Plausible 등 5곳): 풀이 가장 깊어 반복 발행에 적합하다. 기준선 4건이 필요한 지금 같은 부트스트랩 구간에서는 동일 훅 계열을 이어 쌓아 비교 표본을 만들기 좋다.

## 확인 못 한 것
- **h168 스냅샷 부재 원인:** 시점 미도달인지 수집 실패인지 원자료에서 구분되지 않는다. 게시 일시나 수집 로그가 필요하다.
- **발행 누적 건수:** 부트스트랩 문턱(10건)과 비교할 값이 원자료에 없다. 스냅샷이 있는 글은 8건이다.
- **기존 발행 글의 병목 분포:** 후보 3개의 중복 여부를 판단할 수 없다.
- **`threads-report.mjs` 출력:** 이번 원자료에 없어 성과 추이는 해설하지 못했다.

**자가검증:** 원자료에 없는 무브 이름과 발행 건수는 만들지 않았고, 0.0315 중복은 결론 없이 확인 대상으로만 올렸다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-08-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-08 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-09T00:21:26.619Z)
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
- ✅ `digest` 다이제스트·상태·커밋 ({"committed_files":9})
- ℹ️ Notion 푸시: tbound-0-1pct-shutdown-3f4100b7ffb48141a37deb7467c28136 ✅ DISCOVERY-2026-10-08 → https://app.notion.com/p/DISCOVERY-2026-10-08-3f4100b7ffb481768d7bedc5c655cc2f 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-09-CMO 기록·재확인

_실행 키 `cmo-2026-10-08-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
