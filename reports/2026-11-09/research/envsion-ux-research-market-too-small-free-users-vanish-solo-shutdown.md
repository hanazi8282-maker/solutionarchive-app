# EnVsion — 조사 노트 (2026-11-09, failure_quota)

대상은 큐가 "미정"이라 WebSearch 로 직접 골랐다. 실패 사례 할당분이라 성공 사례로 바꾸지 않았다.
선정 이유: 적립 목록에 없음 · 창업자 1인칭 포스트모템이 있음 · 기존 `level-slack-alternative…`·`juttu…` 와 달리
"좁은 직군(시장 크기) + 무료 플랜 사용자가 사라짐 + 채널 부재" 조합.

## 찾은 것
- 1인칭 출처 1건 직접 열람: Eddie Forson, "Adieu, EnVsion" (Substack, 2024-01-06). 사고의 흐름은 이 글에서 꺼냈다.
  - 시장이 작다 → 만나 본 리서처가 가격에 민감 + "hair-on-fire" 문제 아님 → 채널(SEO·콜드메일·SNS) 전부 실패 → 마지막 남은 사람이 자기 돈 약 £30,000 투입 후 폐업 결정.
  - 돌아본 교훈 3개: 아픈 문제 / 돈 있는 큰 시장 / 첫날부터 영업·마케팅(출시 전 선판매).
- 스니펫 6개는 위 글에서 두 번 이상 조회해 문장을 대조한 것이다(요약 모델 경유라 글자 단위 일치는 보증하지 못함 — 아래 확인 불가 참조).
- 제품 설명(영상 저장소·인사이트 조각)은 Insight Platforms 목록에서 확인.

## 못 찾은 것 / 확인 불가
- 매출·유료 고객 수·무료 가입자 수: 글에 없음 → 모든 무브 metric 비움(등급 D).
- 실제 폐업 완료 여부: 글은 "폐업 진행 중". Insight Platforms 목록은 사이트를 아직 "active" 로 표시. → outcome_status=shutdown 으로 적되 summary 에 완료 미확인을 명시.
- 원문 페이지는 WebFetch 직접 접근이 403 이라 r.jina.ai 프록시 경유로 읽었다. 요약 모델이 거치므로 인용 문구의 글자 단위 일치는 사람이 원문(substack 링크)으로 한 번 대조해야 한다.
- 창업 연도(2020, 런던)는 검색 결과 요약에서만 봤다 → period_start 비움.
- 제2의 독립 출처(제3자 보도·창업자 외 증언) 없음. 모든 근거가 같은 observation_key(1건).
- 이식성은 판정하지 않았다(사람 몫). 주의: 3개 무브 모두 "넓히면 된다/무료를 줄이면 된다"를 증명하지 않는다 — 실패 쪽 기록이다.

## 독자 축
- reader_problem: MAKE_BUT_NO_MONEY (만들었고 무료 사용자는 있었으나 결제로 못 넘어갔다). 어휘에 더 맞는 코드(예: "시장이 너무 작다")는 없음 — 억지로 끼워 맞추지 않고 기본값 사용.
- bottleneck: DISTRIBUTION.
- 가장 가까운 기존 케이스와의 차이: juttu(가격이 nice-to-have 대비 큼)는 가격 문제, level(관심만 있고 행동 없음)은 대체재 문제, EnVsion 은 "고객 직군 크기 + 무료 사용 ≠ 수요" 문제.

## VOC
- 사용 프로젝트: `f6900c17…`(SaaS 창업가 페인 VOC — NO_CHANNEL, 전체 599건 중 상위 30 노출분).
- move[1](PACKAGING) ← `97d32a1c-5105-468f-88ce-9abe341b03b7` (초기 유입은 있었으나 사용자에게 말을 걸지 않아 결제로 못 넘긴 다른 창업자의 경험 — 같은 패턴).
- move[2](CHANNEL) ← `b781156d-4de9-4840-abf7-8505eeea2f9d` (블로그·Twitter·PH 같은 흔한 채널만 쓰고 영업 역량이 없던 팀에 대한 댓글 — 같은 패턴). 간접 지지라 약하다. 자동 승인에 불리하게 읽히면 이 id 는 떼도 된다.
- move[0] 은 맞는 VOC 가 없어 비움. 원문은 옮기지 않았다.

## validate
`node scripts/case-research.mjs validate --slug envsion-ux-research-market-too-small-free-users-vanish-solo-shutdown` → error 0건(무브 3 · 근거 6 · 등급 C×3, 사실확인 D 경고만).
