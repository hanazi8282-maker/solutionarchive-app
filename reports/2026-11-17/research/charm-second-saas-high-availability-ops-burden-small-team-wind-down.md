# 조사 노트 — Charm (Amy Hoy / Thomas Fuchs) · 실패 사례 할당분

- 큐: failure_quota · 대상 미정 → 직접 선정 · 시장 SaaS 1인/소규모 팀
- 초안: `drafts/cases/charm-second-saas-high-availability-ops-burden-small-team-wind-down.json`
- validate: error 0건 · 경고 5건(price_band 비어 있음, 수치 없음·사실확인 D x2) → 통과 출력 확인

## 왜 이 케이스인가
- 이미 적립된 slug 와 겹치지 않는 1인칭 철수 글을 찾았다. 소비재가 아니라 SaaS 이고 3명 팀이다.
- 후보에서 뺀 것: Voiczy(polder.substack.com)·Justin Butlion "autopsy of a failed SaaS"·RecoverFlow(Indie Hackers)·startupstrategies.substack — 전부 HTTP 403 으로 원문을 못 열었다. 검색 스니펫만으로는 1인칭 출처를 열었다고 할 수 없어 쓰지 않았다. EnrichLead 는 보안 사고 이야기라 독자 문제(SOLO_CEILING 류)와 거리가 멀고 수치가 없어 뺐다.
- 이 케이스는 '팔리는 제품을 접은' 기록이라 억지 교훈 없이 outcome_direction=negative 로 둔다.

## 독자 축
- reader_problem: SOLO_CEILING (config/reader-problems.json 어휘 안에 있음)
- 병목: SUPPLY(감당할 손·서버 용량). UNIT_ECONOMICS 도 검토했으나 월 매출 4,000달러 대 서버 3,000달러는 '고객 수백 곳일 때'의 필요액이라 현재 손익으로 단정하기 어려워 SUPPLY 로 뒀다.
- 무브 0 transfer_note: 제품 하나를 골라 '고객 100곳일 때 월 운영비'와 '내가 쉬는 주에 누가 고치나'를 적고, 내 이름밖에 없으면 가입 상한부터 정하라.
- 무브 1 transfer_note: '사람을 뽑으면 된다'가 계획에 있으면 그 사람 없이 6개월 굴릴 수 있는지 적고, 안 되면 맡길 곳 두 곳에 문의 메일을 보내라.

## 사고의 흐름 (1인칭 출처 — 직접 열었다)
- 출처: Amy Hoy, 「Why We Shut Down Charm on the Eve of Public Launch, at $48k/Year and Growing」(stackingthebricks.com, 2013-02-07, unicornfree.com 에서 301 이동) + HN 토론(item 5183828, Hoy 댓글).
- 관찰 → 추론 순서: (1) 10월 기준 월 약 4,000달러로 서버비를 감당 → (2) 고객 수백 곳으로 키우려면 월 3,000달러 서버가 필요하고 Noko 보다 훨씬 손이 많이 간다 → (3) 항상 켜 있어야 하는 제품이라 멈추면 고객이 자기 고객을 잃는다 → (4) 원인 불명 커널 패닉·Rails 3 속도 문제 → (5) 외부 협력은 무산, 전에 뽑은 두 명은 해고 → (6) 두 제품을 돌리느라 Noko 가 정지 → (7) 판매 타진은 팀 없이 사려는 곳이 없음 → 접기. 접은 뒤 고객에게 약 8주 전 통지·마지막 결제 환불.
- 방법 메모: WebFetch 는 페이지를 요약 모델로 거쳐 오므로, 초안 snippet 에 따옴표로 넣은 문장은 별도 호출로 'PRESENT-VERBATIM' 확인을 받은 것만 썼다(월 4,000달러·서버 3,000달러·high availability·lose customers·grow by hiring·refund·8 weeks·해고 2명·Noko 정지·매각). HN 댓글의 'didn't have enough staff…' 한 문장은 요약기 결과이고 별도 검색 결과(제3자 요약)와 취지가 일치하지만 원문 대조는 못 했다 — 확인 불가 쪽으로 읽어라.

## 못 찾은 것 (확인 불가)
- Charm 의 가격(요금제)·유료 고객 수: 글에 없음. 가입 대기자 3,800명 수치는 요약기 출력에만 나와 verbatim 확인을 못 해 초안에 넣지 않았다.
- 가입 인원 제한·가격 인상·소규모 공개를 고려했는지: 글에서 NOT MENTIONED. 무브 0 의 '상한 설정'은 그들이 한 일이 아니라 독자용 점검이라고 preconditions 에 적었다.
- 정확한 서비스 시작 시점(period_start): 글에서 확인 못 함(Founders Talk #6 에 2010년 가을 예고가 보이나 본 사례 시작일로 쓰기엔 근거 부족) → null.
- 접은 날짜: 글은 '12월 15일부터 운영 중단'을 적었다. 요약기 출력에서 '10월 결정' 과 '11월 3시 중단' 이 엇갈려 period_end 는 글에 명시된 2012-12-15 로만 뒀다. 결정 월은 확인 불가.
- 협력 상대·해고된 두 사람의 사정, 채용 실패 원인: 글에 없음.
- 생존 확인: Charm 은 서비스 종료(outcome_status=shutdown). 현재 되살아났는지는 확인 안 했다 — 글은 인재를 만나면 되살리겠다고만 한다.
- 독립 제3자 근거: 없음. 모든 수치·서술이 창업자 자기보고(primary + is_self_reported).

## VOC
- VOC 해당 없음. 색인의 SOLO_CEILING 프로젝트(`cd0a1a19-…`)를 읽었으나 HN 일반 댓글이라 '높은 가용성 제품의 운영 부담' 또는 '채용·협력·매각이 다 막힘' 이라는 이 무브의 주장을 직접 받치는 목소리가 없었다. 억지로 붙이지 않았다(`voc_inputs` 비움).

## 진행 판단 절차(_principles §0) 기록
- 기획: 독자(SOLO_CEILING)가 내일 할 행동 → 무브 2개로 한정.
- 자가검증에서 찾은 개선점: (1) 요약기 인용을 그대로 따옴표에 넣을 뻔함 → verbatim 재확인 후에만 사용, (2) 상한 설정을 당사자의 행동처럼 쓸 뻔함 → preconditions 에 '그들이 한 일 아님' 명기, (3) 종료 날짜 충돌 → 글에 명시된 값만 사용, (4) 가입 대기자 수 미확인 → 제외.
