# CMO 데일리 다이제스트 2026-10-31

**붙여넣기 대기: 0건**

## TL;DR

1. 조사 1건 · 적립 1건 · 초안 0건.
2. 막힌 단계 없음.
3. 오늘 발행 대기 없음.
4. ⚠️ 발행됐는데 연결 안 된 Threads 게시물 1건(가장 오래된 것 76시간 경과) — /dashboard 에서 연결 · 파이프라인 외 게시물 2건(초안 없이 직접 쓴 글 — 연결 대상 아님)

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

# 성과 해설 2026-10-31

## 결론
- 지금 할 일은 새 앵글 선정이 아니라 **측정 복구**다. 판정 가능한 예측이 0건이고, 규칙 6개 모두 근거가 없다.
- 보류 6항목 중 4항목은 h168 스냅샷이 없는 "확인 불가"다. 이 항목들에 대해 수집이 실패했는지부터 확인해야 한다.
- 커버리지는 7개 병목 모두 매칭 가능이라 갭이 없다. 앵글을 막는 것은 소재가 아니라 표본이다.

## 채점 결과
- 유효 0 / 무효 0 / 보류 3건 (표본 부족·확인 불가) / 채점 불가 1건. 예측이 달린 엔트리는 4개, 예측 항목은 7개다.
- 보류 3건은 6항목이다. 이 중 2건(4항목)은 h168 스냅샷이 없고, 1건(2항목)은 부트스트랩 구간이다.
- 채점 불가 1건(LOG-20260907-01)은 연결된 발행 글이 없어 0건이 아니라 확인 불가다. 판정 로그 23개 중 예측이 달린 것은 4개뿐이다.
- 규칙별 신뢰도는 C-12, G-4, G-8, H3, P-03, P-09 모두 유효 0 / 무효 0 / 보류 1이다. Wilson 하한은 전부 산출 불가다.
- 어느 훅·규칙에도 "먹힌다"거나 "안 먹힌다"고 결론 내릴 수 없다. 규칙 근거로 쓸 수 있는 건이 없다.

## 해석 주의
- LOG-20260907-02는 실측 0.0315가 있으나 기준선 표본이 0건이다. 4건 미만은 채점하지 않으므로 이 수치는 참고값이다.
- 같은 엔트리에서 `reply_rate`와 `like_rate`의 실측값이 둘 다 0.0315로 똑같다. 우연일 수도 있고 같은 값을 두 번 읽은 것일 수도 있다. 원자료만으로는 가를 수 없어 확인 대상이다.
- LOG-20260906-01과 LOG-20260907-03의 h168 스냅샷 부재는 "아직 시점이 안 됨"으로 읽기 어렵다. 엔트리 ID 날짜가 9월 6~7일이라 7주가 지났다. 발행일은 원자료에 없어 수집 실패라고 단정할 수는 없다.
- 스냅샷 4건은 명목 창(h1/h24/h168)과 나이가 안 맞아 채점에서 빠졌다. 그 글에 데이터가 없다는 뜻은 아니다. 스냅샷 14개는 post 8건 분이다.

## 커버리지 갭
- 매칭 가능 병목은 7/7이다. 케이스 0~1곳인 병목은 없다.
- 여유가 가장 작은 곳은 DISTRIBUTION(3곳·6무브)과 SUPPLY(3곳·5무브)다. 케이스 1곳이 반려되거나 빠지면 2곳이 되어 아슬아슬하고, 2곳이 빠지면 매칭이 끊긴다.
- UNIT_ECONOMICS는 5곳, TRUST는 무브 11건으로 소재가 가장 두텁다.
- 이 커버리지는 승인된 케이스 기준이다. 발행 여부나 성과와는 무관하다.

## 다음 앵글 후보
성과 근거가 없어서, 아래는 모두 커버리지 기준 후보다. 원자료에 무브 제목이 없으므로 무브 단위 지정은 못 하고 병목 단위로만 적는다.
- **TRUST** — 무브 11건으로 소재가 가장 많다. 지금은 기준선 표본(4건 이상)을 빨리 채우는 게 급해서, 한 병목 안에서 훅을 바꿔 가며 쌓기에 가장 적합하다.
- **SUPPLY** — 3곳·5무브로 가장 얇다. 발행 소재로 쓰기 전에 케이스 보강 여부를 같이 봐야 한다. 아직 다루지 않은 영역이라 기준선 표본에도 다양성을 더한다.
- **DISTRIBUTION** — 3곳·6무브로 SUPPLY 다음으로 얇다. 반려가 한 번 나면 여유가 사라지므로, 추가 조사 큐에 넣을지 판단할 시점이다.

## 확인 못 한 것
- h168 스냅샷이 없는 이유(수집 실패인지, 글이 아직 시점 전인지). 발행일과 `collect-metrics` 실행 기록은 원자료에 없다.
- `reply_rate`와 `like_rate`의 실측값이 같은 이유.
- LOG-20260907-01에 연결된 발행 글이 없는 이유. 미발행인지 연결 누락인지 구분할 수 없다.
- 발행 누적 건수. 부트스트랩 구간(10건 미만) 여부를 `threads-report.mjs`로 확인하지 않았다. 원자료에 그 출력이 없다.
- 개별 무브 제목과 케이스별 등급. 앵글을 무브 단위로 못 정한 이유다.

## 절차 근거 (_principles §0)
- 검토한 것: 보류 사유 3종(스냅샷 없음·기준선 0건·글 연결 없음)을 서로 섞지 않고 구분했다. 부트스트랩 수치를 규칙 근거로 쓰지 않았다.
- 개선한 것: 앵글 후보를 "성과 근거"가 아니라 "커버리지 근거"라고 명시했다. 근거가 없는 우열 판단을 막기 위해서다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-31-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-31 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-31T23:22:46.905Z)
- ✅ `preflight` 사전 점검 ({"cases_reachable":1})
- ✅ `queue` 조사 큐 선정 ({"claimed":1})
- ⚠️ VOC 내보내기 확인 불가 — voc-export: 확인 불가 — 57014 canceling statement due to statement timeout. VOC 없이 조사한다.
- ✅ `research` 조사 ({"attempted":1,"agent_ok":1,"new_drafts":1})
- ✅ `commit_cases` 케이스 적립 ({"commit_attempted":1,"committed":1,"all_draft":1,"partial_failed":0})
- ✅ `queue_resolve` 조사 큐 정리 ({"queue_attempted":1,"queue_done":1,"queue_failed":0,"queue_unresolved":0,"queue_stalled":0,"partial_failed":0})
- ⚠️ 열린 초안(미발행)이 있는 케이스 29곳은 형제 무브도 고르지 않았다: blue-apron-paid-acquisition-treadmill, ag1-single-sku-subscription-greens, content-goblin-low-tier-pricing-support-collapse, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, zenefits-licensing-macro-trust-collapse, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse, peloton-owned-manufacturing-exit, seed-ds01-clinical-strain-probiotic
- ⚠️ 영역 밖·영역 모름으로 거른 케이스 35곳: blue-apron-paid-acquisition-treadmill, pets-com-mass-awareness-negative-margin, everlane-radical-transparency-trust, ag1-single-sku-subscription-greens, zapier-integration-page-seo-distribution, tuft-and-needle-amazon-review-trust, cydoc-cost-plus-pricing-collapse, slack-bottom-up-conversion, juttu-nice-to-have-pricing-collapse, kite-individual-dev-pricing-collapse
- ⏭️ `angle` 앵글 선정 — 쓸 수 있는 승인 무브가 0건 (승인은 사람이 한다 — 루프의 실패가 아니다)
- ⏭️ `draft` 초안 작성 + 게이트 — 앵글 0건
- ⏭️ `stage` 발행 대기 스테이징 — 스테이징 매니페스트 0건
- ✅ `performance` 성과 분석 ({"commented":1})

_실행 키 `cmo-2026-10-31-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
