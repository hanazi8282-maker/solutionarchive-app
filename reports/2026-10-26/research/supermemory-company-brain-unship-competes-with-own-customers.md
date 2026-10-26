# 조사 노트 — Supermemory Company Brain (실패·철수 할당분)

- 날짜: 2026-10-26 · 큐 사유: failure_quota · 대상은 "미정" 이라 직접 골랐다.
- 선정 경위: postmortem.io 목록(2026-10 기준)에서 이미 적립된 slug 를 뺀 SaaS 후보 중 Empiricast / Supermemory 를 비교.
  Empiricast(좋은 반응만 있고 결제 0)는 적립된 tract·quesma·level 과 같은 패턴이라 피했다.
  Supermemory 는 "반응이 좋았는데도 접은" 반대 방향이라 겹치지 않는다.

## 찾은 것
- 1인칭 출처 1건 직접 열람: 창업자 Dhravya Shah 의 공지 `supermemory.ai/blog/an-update-to-supermemory/` (2026-09-10).
  사고 흐름: 슬랙 AI 동료를 "할 수 있어서" 만들었다 → 출시 반응 좋음(조회 50만+, 수백 개 회사 사용) →
  제품이 늘수록 "Supermemory 가 뭐냐"에 답하기 어려워짐 → 이 시장에서 가장 잘할 회사인지 자문, "아마 아니다" →
  Notion·Cognition 같은 회사와 일하고 싶은데 겹치는 제품이라 이해충돌 → 접고 환불.
- 보조 1인칭: `supermemory.ai/blog/open-sourcing-company-brain/` (접은 뒤 코드 공개, "약 2주 전에 접었다"는 서술).
- 공개 종료일: 2026-09-09(공지 본문 기준), 공지 게시일 2026-09-10.

## 못 찾은 것 (확인 불가)
- 매출·유료 고객 수·가격·환불 총액·환불 건수 — 글에 없다. 그래서 세 무브 모두 수치 없음(등급 D), 이 상태가 정상이다.
- 출시 정확한 날짜(글은 "한 달쯤 전"; postmortem.io 요약 기준 8월 초) — period_start 는 비웠다.
- 이해충돌이 실제로 고객 이탈로 이어졌는지 — 창업자 서술만 있다.
- Hiten Shah 의 X 해설(경쟁 논리)은 접근이 막혀(HTTP 402) 직접 못 읽었다. 근거로 쓰지 않았다.
- 오픈소스 공개일 2026-09-25 는 검색 요약에만 있고 원문에서 날짜를 직접 확인 못 했다. 무브 3 의 observed_period_end 에 쓴 값이므로 약한 값이다.
- 인용 문구는 WebFetch 요약기를 거친 것이다. 원문 글자 그대로인지 사람이 한 번 대조해야 한다.

## 어휘 메모
- reader_problem: "두 번째 제품으로 초점을 잃었다 / 고객과 겹치는 제품을 냈다"에 맞는 코드가 없다. 기본값 MAKE_BUT_NO_MONEY 를 썼다 — 정확한 일치가 아니다.
- bottleneck: TRUST 는 가장 가까운 값이지 정확한 일치가 아니다(고객이 도구 공급자를 경쟁자로 볼 수 있다는 신뢰 문제).
- 규모: 외부 투자를 받은 소규모 팀이다. 1인 창업가가 아니다. transfer_note 는 "내 고객에게 경쟁자로 보일지 묻기", "두 번째 제품 전 한 문장 시험", "접을 때 문서 미리 쓰기"로 제한했다.
- outcome_status=pivoted: 제품 2개만 철수하고 회사는 핵심 API 로 집중했다. outcome_direction 은 무브 1·2 negative, 무브 3 mixed.

## 이식성 참고
- 적립된 buffer-reply-second-product-wrong-buyer-sunset 과 "두 번째 제품" 주제가 겹친다. 차이는 (a) 인수가 아니라 직접 만든 것, (b) 반응이 좋았는데도 접음, (c) 원인이 구매자 불일치가 아니라 고객-공급자 이해충돌이다. 중복으로 보이면 오케스트레이터가 걸러도 된다.

## VOC
- VOC 해당 없음. 색인에 Supermemory 프로젝트가 없다(기억 API·슬랙 AI 동료). `voc_inputs` 는 비워 뒀다.

## validate
- `node scripts/case-research.mjs validate --slug supermemory-company-brain-unship-competes-with-own-customers` → error 0건, 통과.
  경고: price_band 비어 있음, evidence[7] published_at 없음(오픈소스 글 게시일 확인 불가), 무브 수치 없음(등급 D).
