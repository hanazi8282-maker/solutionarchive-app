# 붙여넣기 대기 판정 로그 — 2026-10-04

_실행 `cmo-2026-10-04-cron` 이 스테이징한 초안 2건. DIGEST 최상단 "붙여넣기 대기: N건" 과 수가 같아야 한다._

## CS-20261004-01 — juttu-nice-to-have-pricing-collapse

- 무브: `350494df-b943-4e3b-a58f-02d07066017b`
- 판정 로그: (미기재 — stage.json 에 log_code 가 없다. gate_note 에서 추측하지 않는다)
- 판정 전문: `drafts/threads/2026-10-04-juttu-nice-to-have-pricing-collapse.md`
- 게이트: Ⅰ~Ⅲ 통과, U-3 확인 불가, G-0 예외통과. 등급 인사이트 C·사실확인 D: 본문 숫자 0(CG-2). CG-1 대상 등급 불분명이라 자기답글 첫 줄에 '자사 공시에 해당하는 본인 기록, 제3자 검증 없음' 표기(창업자 본인 회고라 사실에 가깝지만 증권 공시는 아님 — 게이트가 의미까지 보면 사람 판단 필요). 한계: claim 의 '자체 엔진 대신 … 영리하게 가려 한 선택'은 근거 snippet 에 없음(본문은 연동으로 시작했다는 사실만), '통째로 막혔다'의 범위 불명이라 '그 기능이 막혔다'로 축소, 문제된 약관 조항은 근거에 없어 마지막 문단은 transfer_note 의 독자 쪽 번역이며 Calendly 가 그 조항으로 막았다고 단정하지 않음, 폐업 직접 원인이 이 막힘이라고도 쓰지 않음. 제품 설명(채용·일정관리 자동화)은 케이스 market/summary 필드에서 가져옴. 본문 글자수는 Bash 부재로 기계 계수 못 함(약 340자 추정), 오케스트레이터 column-check 재확인 필요.
- posts.status: pending_review (붙여넣기 대기) — 발행은 사람이 앱에서 (§10)

## CS-20261004-02 — kite-individual-dev-pricing-collapse

- 무브: `ba7ecc6b-84a5-4689-94b3-045d1519316a`
- 판정 로그: (미기재 — stage.json 에 log_code 가 없다. gate_note 에서 추측하지 않는다)
- 판정 전문: `drafts/threads/2026-10-04-kite-individual-dev-pricing-collapse.md`
- 게이트: Ⅰ~Ⅲ 통과, U-3 확인 불가, G-4 경고, G-0 예외통과. 등급 인사이트 C·사실확인 D(프롬프트 값, 재확인 불가): CG-2 대상이라 본문 숫자 0개(연도·기간도 '몇 해'·'그다음 해'로 풀어 뺌), 자기답글에도 숫자 없음. 자기답글에 'Kite 자사 발표'·'제3자 검증을 받지 않은 자체 기록' 표기(CG-1 대상은 아니나 방어적으로 남김). 확인 불가: drafts/cases/kite-individual-dev-pricing-collapse.json 이 작업 트리에 없어 evidence·transfer_note·preconditions·원문 링크를 못 읽음 — 사실은 프롬프트 claim 에서만 가져왔고 근거 대조는 미실시(스테이징 전 확인 필요). 마무리 행동은 claim 논리에서 도출한 것이라 transfer_note 와 다를 수 있고 자기답글 한계 문장은 preconditions 를 못 읽은 채 짐작한 것. column-check.mjs 는 이 세션에서 권한 승인이 없어 실행 못 함(오케스트레이터가 돌릴 것). 본문 361자(wc -m, 개행 포함), 자기답글 186자. 같은 회사 PRICING 무브 초안(2026-09-30, 각이 다름: 쓰는 사람 대 돈 내는 사람)과 발행 간격 확인 필요.
- posts.status: pending_review (붙여넣기 대기) — 발행은 사람이 앱에서 (§10)

