# CMO 데일리 다이제스트 2026-11-06

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 221시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 6건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 — 2026-11-06

## 결론 (먼저)
- **채점이 한 건도 끝나지 않았다.** 유효 0 / 무효 0이고, 전부 보류 아니면 확인 불가다. 규칙이 먹히는지는 아직 말할 수 없다.
- **커버리지는 갭이 없다.** 매칭 가능 병목은 7/7이다.
- **지금 병목은 콘텐츠 소재가 아니라 측정이다.** h168 스냅샷이 없는 건이 4개 항목에 걸쳐 있다. 이 부분은 수집 쪽 점검이 필요하다.
- 새 앵글은 소재가 가장 얇은 병목에서 고른다. 효과 추정은 아직 할 수 없다.

## 채점 (예측 항목 7개, 판정 엔트리 4개)
- **유효: 0건**
- **무효: 0건**
- **보류(표본 부족): 엔트리 3건(항목 6개)**
  - LOG-20260906-01: h168 스냅샷이 없다. like_rate와 share_rate 2개가 걸려 있다.
  - LOG-20260907-03: 같은 사유다. share_rate와 like_rate 2개가 걸려 있다.
  - LOG-20260907-02: 기준선 표본이 0건이라 부트스트랩 구간이다(4건 미만은 채점하지 않는다). 실측값은 0.0315로, 참고값일 뿐 규칙 근거로 쓰지 않는다.
- **확인 불가: 엔트리 1건**
  - LOG-20260907-01은 연결된 발행 글이 없다. 0건이 아니라 확인 불가다.
- 규칙별 신뢰도(C-12, G-4, G-8, H3, P-03, P-09): 6개 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한이 전부 `-`라서 어떤 규칙도 순위를 매길 수 없다.

## 확인이 필요한 것
- **오래된 건의 h168 부재.** LOG-20260906-01과 LOG-20260907-03은 9월 초 건이다. 약 두 달이 지났으니 "아직 그 시점이 안 됐다"가 아니라 수집 누락일 가능성이 크다. 다만 원자료만으로는 어느 쪽인지 단정하지 못한다.
- **LOG-20260907-02의 실측값.** reply_rate와 like_rate가 둘 다 0.0315로 똑같이 찍혔다. 우연인지 지표 매핑 문제인지 이 자료로는 모른다. 기준선이 0건이라 지금 채점에는 영향이 없다.
- **제외된 스냅샷 4건.** h1/h24/h168 창과 나이가 안 맞는 catchup 관측이다. 그 글에 데이터가 없다는 뜻은 아니다. 14개 스냅샷, post 8건 중 이 4건이 채점에서 빠졌다.
- **누적 발행 수.** 원자료에 없다. 10건 미만 부트스트랩 구간인지 직접 확인하지 못했다. 다만 기준선 표본이 0건이니 부트스트랩일 가능성이 높다.

## 커버리지 (매칭 가능 병목 7/7, 케이스 0~1곳인 갭 없음)
- AWARENESS: 케이스 4 · 무브 6
- TRUST: 케이스 4 · 무브 11 (가장 두껍다)
- CONVERSION: 케이스 4 · 무브 7
- RETENTION: 케이스 4 · 무브 6
- UNIT_ECONOMICS: 케이스 5 · 무브 7
- DISTRIBUTION: 케이스 3 · 무브 6 (케이스 수 최저)
- SUPPLY: 케이스 3 · 무브 5 (무브 수 최저)
- 매칭에 필요한 "서로 다른 케이스 2곳"은 모든 병목이 충족한다. 다만 DISTRIBUTION과 SUPPLY는 여유가 1곳뿐이다.

## 다음 앵글 후보 (2개)
- **SUPPLY 무브:** 후보 케이스는 Fathom Analytics, Magic Spoon, Purple Innovation이다. 무브가 5건으로 7개 병목 중 가장 적고, 케이스도 3곳뿐이라 가장 먼저 얇아진다.
- **DISTRIBUTION 무브:** 후보 케이스는 Figma, Testimonial.to, Zapier다. 케이스가 3곳이라 하나가 반려되거나 발행 불가가 되면 바로 매칭 하한에 닿는다.
- 세 번째 후보는 제시하지 않는다. 나머지 병목은 케이스 4곳 이상이라 갭 근거가 없고, 이미 발행된 무브 목록도 원자료에 없다.
- 무브 단위 지정은 못 했다. 원자료에 무브 ID와 발행 이력이 없어서, 병목·케이스 수준까지만 적었다.

## 카드 후보
- SUPPLY 병목 무브 (Fathom Analytics / Magic Spoon / Purple Innovation) — 무브 5건으로 7개 병목 중 최저라서 지금 보강한다
- DISTRIBUTION 병목 무브 (Figma / Testimonial.to / Zapier) — 케이스가 3곳뿐이라 하나만 빠져도 매칭 여유가 사라진다

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-11-06-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-11-06 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-11-07T00:06:52.518Z)
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
- ℹ️ Notion 푸시: -commission-cut-sunset-411100b7ffb481fb8da5fee048ac3f65 ✅ DISCOVERY-2026-11-06 → https://app.notion.com/p/DISCOVERY-2026-11-06-411100b7ffb4819fb2dcdf9e7aa6fbee 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-11-07-CMO 기록·재확인

_실행 키 `cmo-2026-11-06-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
