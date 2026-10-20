# CMO 데일리 다이제스트 2026-10-20

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

# 2026-10-20 성과 해설

**결론: 오늘 근거로 "이 훅이 먹힌다/안 먹힌다"를 말할 수 있는 규칙은 0개다.** 채점된 건이 없고, 가장 큰 문제는 표본이 아니라 측정이다. 09-06·09-07 로그에서 h168 스냅샷이 아직 없다.

**할 일:** 새 앵글을 고르기 전에 h168 스냅샷이 비어 있는 이유를 CTO 쪽에 확인한다(아래 "확인 못 한 것").

## 채점 결과 (엔트리 기준, 예측이 달린 4개)
- 유효 0 / 무효 0 / **보류 3 (표본 부족·측정 없음)** / 채점 불가 1.
- 보류 3건은 모두 점수 0이다. 보류이므로 성공으로도 실패로도 세지 않았다.
- LOG-20260906-01은 h168 스냅샷이 없어 보류다 (like_rate·share_rate 2항목).
- LOG-20260907-03도 같은 사유로 보류다 (share_rate·like_rate 2항목).
- LOG-20260907-02는 실측값은 있다. 그러나 기준선 표본이 0건이라 보류다 (4건 미만은 채점하지 않는다). 부트스트랩 구간이라 이 값은 참고용이다.
- LOG-20260907-01은 연결된 발행 글이 없어 채점 불가다. 0점이 아니라 확인 불가다.
- 항목 기준으로는 7개 중 6개가 개별 보류로 표시됐다. 나머지 1개는 출력에 개별 줄이 없다. 채점 불가 엔트리 소속으로 보이지만 확인하지 못했다.
- 판정 로그 23개 중 예측이 달린 것은 4개뿐이다. 나머지 19개는 애초에 채점할 수 없다.

## 규칙별 신뢰도
- C-12, G-4, G-8, H3, P-03, P-09 여섯 규칙 모두 유효 0 / 무효 0 / 보류 1이다.
- Wilson 하한은 전부 "-"다. 규칙 신뢰도 근거가 없다.
- 규칙 6개가 보류 1건씩이므로 어느 규칙도 증거로 쓸 수 없다.

## 실측 스냅샷
- 스냅샷 14개, 글 8건이다. 발행 10건 기준(부트스트랩 구간)에 못 미친다. 이 기준은 발행 누적 수로 정의되는데, 이 원자료에는 누적 발행 수가 없다. 스냅샷 대상 글 수 8건 기준으로 추정한 것이다.
- 스냅샷 4건은 채점에서 제외됐다. h1/h24/h168 명목 창과 안 맞는 'catchup' 관측이다. 그 글에 데이터가 없다는 뜻은 아니다.

## 커버리지
- 매칭 가능 병목은 **7/7**이다. 케이스 2곳 미만인 갭은 0개다.
- 가장 얇은 병목은 DISTRIBUTION과 SUPPLY(케이스 각 3곳)다. 최소 요건 2곳에서 1곳만 여유가 있다.
- 케이스 수는 AWARENESS 4, TRUST 4, CONVERSION 4, RETENTION 4, UNIT_ECONOMICS 5, DISTRIBUTION 3, SUPPLY 3이다.
- 무브가 가장 풍부한 병목은 TRUST(11건)다. 가장 적은 병목은 SUPPLY(5건)다.
- 커버리지는 "소재가 있다"는 뜻이지 "성과가 검증됐다"는 뜻이 아니다. 위 채점 결과와 연결해 읽으면 안 된다.

## 다음 앵글 후보 (3개)
무브 단위 이름은 원자료에 없어 병목과 케이스까지만 적는다. 구체 무브 선택은 케이스 목록을 열어야 한다. 이 후보 선정은 데이터에서 나온 결론이 아니라 판단이다. 성과 데이터가 전부 보류라 데이터로 고를 수 없다.
1. **TRUST (Everlane, Ritual, Seed Health, Tuft & Needle)**: 무브가 11건으로 가장 많다. 변수 하나만 바꿔 같은 병목에서 반복 발행할 수 있어, 지금 가장 필요한 규칙 표본을 빨리 쌓는다.
2. **DISTRIBUTION (Figma, Testimonial.to, Zapier)**: 케이스 3곳으로 가장 얇은 병목이다. 지금 글을 쓰면 실제 반응으로 소재 가치를 확인할 수 있다.
3. **SUPPLY (Fathom Analytics, Magic Spoon, Purple Innovation)**: 무브가 5건으로 가장 적다. 쓰기 전에 무브 수가 부족한지부터 확인해야 한다. 소재가 모자라면 케이스 조사를 먼저 늘리는 쪽이 낫다.

## 확인 못 한 것
- **h168 스냅샷이 없는 이유.**
  - 로그 날짜(09-06, 09-07) 기준이면 6주 넘게 지났다. "아직 시점이 안 됐다"로는 설명되지 않는다.
  - 다만 실제 발행일은 이 원자료에 없어, 6주 경과도 확인하지 못했다.
  - 수집 실패인지, 제외된 'catchup' 4건 때문인지 판단할 근거가 없다. 수집 로그와 발행일 대조가 필요하다.
- **LOG-20260907-02의 reply_rate와 like_rate가 둘 다 0.0315로 똑같다.** 우연일 수도 있고 같은 값을 두 항목에 채운 버그일 수도 있다. 원자료만으로는 구분할 수 없어 점검 대상으로 표시한다.
- 누적 발행 건수 (부트스트랩 기준 10건 대비)와 `threads-report.mjs` 발행 지표 요약은 이 원자료에 없다.
- 이 분석은 §0 절차를 따라 원자료 세 종류(채점·커버리지·스냅샷)를 대조했다. 개선점은 두 가지다. 하나는 측정 누락을 앵글 선정보다 먼저 두도록 순서를 바꾼 것이다. 다른 하나는 후보 선정이 판단이라는 점을 명시한 것이다.

## 다음 주 주목 지표

- `like_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `share_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.
- `reply_rate` — 지난 예측이 보류다(표본 부족). 다음 주 실측을 본다.

## 실행 기록

- 실행 키: `cmo-2026-10-20-cron` · 트리거 cron · 목표 조사 6 / 초안 2
- 기준 날짜 2026-10-20 — 예정 크론 `17 20 * * *` 의 UTC 날짜 (실행 시각 2026-10-20T23:10:18.527Z)
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
- ℹ️ Notion 푸시: l-before-audience-sold-3ff100b7ffb4811eafb4e57c4b1ad88a ✅ DISCOVERY-2026-10-20 → https://app.notion.com/p/DISCOVERY-2026-10-20-3ff100b7ffb48155bf5eded4af8ed61e 푸시 완료 — 초안 0건 · 신규케이스 1건 · 발굴 1건 · 스킵 0건
- ✅ `status_log` Notion 일일 상태 로그 — 2026-10-21-CMO 기록·재확인

_실행 키 `cmo-2026-10-20-cron` · 상세 상태는 reports/status/DASHBOARD.md_

⛔ 이 루프는 발행하지 않는다. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).
