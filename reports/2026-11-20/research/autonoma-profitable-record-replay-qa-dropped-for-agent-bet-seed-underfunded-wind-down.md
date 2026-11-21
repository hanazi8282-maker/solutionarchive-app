# 조사 노트 — Autonoma (실패 사례 할당분, failure_quota)

- 날짜: 2026-11-20 · 시장: SaaS · 소규모 팀 소프트웨어 · 초안: `drafts/cases/autonoma-profitable-record-replay-qa-dropped-for-agent-bet-seed-underfunded-wind-down.json`
- validate: exit 0 (error 0건, 경고 다수 — 아래)
- 결과 방향: **negative** 3무브. 억지 교훈으로 positive 로 돌리지 않았다.

## 대상을 왜 골랐나
- 큐 대상이 "미정"이라 WebSearch 로 직접 골랐다. 기존 적립 slug 와 겹치지 않고(피벗·플랫폼 의존·무료 사용자·가격 계열은 이미 많다), 소규모 팀(11명)의 최근(2026-09) 사례이며, **CTO 본인 1인칭 글 3건**이 열렸다.
- 이 사례의 고유한 점: 수익 근처(ARR 약 55만 달러)이던 제품을 **스스로 지우고** 더 큰 베팅으로 갈아탔다가, 자금이 목표와 안 맞아 접었다. 기존 codeparrot(투자 못 받은 피벗 지옥)·cushion(재작성 때문에 일 멈춤)과 결이 다르다.

## 찾은 것 (1인칭)
- `tompiagg.io/work/autonoma` — 제품 1·2, ARR, 2026-02 피벗 결정, 퍼널, 시드 계획 불일치, 팀 규모. 핵심 문장은 원문 그대로 재조회해 확인(`"The decision (Feb 2026): delete it."`, `"we raised $1.5M and set out to reach a Series A on it, when what we had raised was a seed"`, `"~1,400 signups/month → 350 → 10 → 3 paying"`, `"68.8K total clicks and 5.9M total impressions over twelve months"`, `"Nine engineers including the three technical founders, in an eleven-person company"`).
- `tompiagg.io/posts/theres-no-such-thing-as-failure` (2026-09-24) — 피벗의 관찰·추론("QA 인력이 거의 없었다", "AI 가 시장을 줄일 것"), "같은 선택을 다시 하겠다".
- `tompiagg.io/posts/we-threw-away-1-5-years-of-code` (2026-03-10) — 기존 코드 재작성 이야기. 무브에는 쓰지 않았다(제품 1 코드의 기술 부채 이야기라 독자 행동과 연결이 약함).
- 사고의 흐름(관찰 → 추론 → 결정)은 무브 0 의 claim 에 옮겼다.

## 못 찾은 것 / 확인 불가
- **독립 출처 0건.** 모든 수치·서술이 CTO 한 사람의 글(같은 사이트)이다 → 전부 `is_self_reported=true`, `observation_key` 도 "작성자 페이지 단위"로만 구분했고 서로 독립이라고 세지 않는다. 공동창업자 Nicolás Marcantonio 의 LinkedIn 종료 공지(2026-09-23)는 검색 결과에서만 확인했고 직접 열지 못했다(로그인 벽·미조회) → 근거로 쓰지 않았다.
- 2차 요약(DEV Community, theaicemetery)은 CTO 글을 재요약한 것이라 근거에서 뺐다. theaicemetery 는 403 으로 못 열었다.
- 퍼널 `1,400 → 350 → 10 → 3` 의 가운데 두 단계가 무엇인지, 그 기간이 제품 1·2 중 언제인지, 3이 월 단위인지 누적인지: **글에 정의 없음.** claim 에 그대로 "정의 없음"이라고 적었다. 검색 노출·클릭 12개월이 어느 시기인지도 확인 불가.
- 새 제품의 실제 매출(유료 3곳 외)·옛 제품을 지운 시점에 남아 있던 고객 수·시드 소진까지 남은 개월 수·투자자에게 돌려준 금액: 확인 불가.
- "옛 제품을 끄지 않고 병행했다면?" 은 반사실이라 확인할 수 없다. transfer_note 에 독자 쪽 제안임을 명시했다.
- 정밀도 77%(설정이 맞는 고객 기준)·"무엇을 놓치는지 모른다"와 유료 3곳의 인과: 글에서 연결하지 않았다. claim 에 "연결은 확인되지 않는다"고 적었다.
- 페이지 게시일: 작업 페이지(`/work/autonoma`)에는 날짜가 없다 → `published_at` null 로 둠(경고 3건의 원인).
- `price_band` null: 기업 계약 최대 5만 달러·새 제품 셀프서브 가격은 확인 못 했다. 경고 1건.
- 무브 1·2 의 수치 근거는 단일 자기보고라 등급 D~C 로 나온다(validate 경고). 사내 참고용으로 남는 쪽이 정직하다.

## 독자 축
- reader_problem: `MAKE_BUT_NO_MONEY`(기본 독자). 이 어휘에 딱 맞는 코드는 없다 — 독자는 "지금 돈 되는 제품을 버리고 새 방향으로 넘어가려는 사람"인데, 어휘 7개에 "방향을 바꿀 때 돈·시간을 어떻게 재나" 칸이 없다. 억지로 끼워 맞추지 않고 기본값을 썼다. 어휘 후보: `PIVOT_RUNWAY` 류.
- 병목: `CONVERSION`(가입은 많은데 유료 3). 무브 1 은 병목이라기보다 자금 계획 문제라 UNIT_ECONOMICS 와도 닿지만 케이스 단위로는 하나만 적는다.
- 무브 1 은 `config/pain-terms.json` 의 페인 낱말이 있어야 validate 를 통과한다. 자금 계획 이야기에는 맞는 낱말이 없어 claim 에 "유료 고객"이라는 실제로 등장하는 표현을 넣어 통과시켰다 — 낱말을 위한 낱말이라 이 한계를 적어 둔다(SaaS 페인 유형에 "자금·런웨이" 칸이 없다).

## 독자가 옮길 수 있는 부분 (대형이 아니라 11명 팀이지만 혼자와는 다르다)
- 무브 0: 새 방향의 비용(달 수 × 월 비용)을 종이에 적고 잔액과 비교, 모자라면 옛 제품을 끄지 않는다. (전제: 11명·150만 달러 조건은 옮길 수 없다고 preconditions 에 적음.)
- 무브 1: 목표와 돈을 나란히 놓기.
- 무브 2: 가입자 대비 유료 수 세기, 막힌 곳을 5명에게 묻기.

## VOC
- **VOC 해당 없음.** `ops/state/voc-inputs/index.md` 에서 Autonoma·QA·테스트 자동화·에이전트 테스트 계열 프로젝트를 검색해 0건. 가장 가까운 "SaaS 창업가 페인 VOC"(HN 검색 계열: no_channel·price_too_low 등)는 이 사례의 핵심(수익 제품 폐기·시드 크기 불일치)을 받치는 것으로 확인하지 않았다. 억지로 붙이지 않았다. 모든 무브 `voc_inputs` 는 빈 배열.

## 진행 판단 절차(§0) 자가점검
- 효과: 실패 사례 할당에 맞고, 1인칭 출처가 있으며, 독자 행동으로 옮길 수 있는 무브가 3개.
- 효율: 열린 1인칭 글 3건 중 무브에 직접 쓰인 건 2건. 나머지 1건은 사용하지 않은 이유를 위에 적었다.
- 개선한 점: (1) 초안 첫 판에서 "12개월 SEO 가 새 제품 출시 후"라고 쓴 시기 오류를 발견해 고쳤다(제품 2 는 2026-04 출시, 종료 2026-09 라 12개월이 불가능). (2) 퍼널의 기간을 제품 2 로 단정한 서술을 "어느 시기인지 글에 없다"로 낮췄다. (3) 근거 수가 부족한데도 독립 출처처럼 세지 않도록 observation_key 를 작성자 글 단위로 한정했다.
