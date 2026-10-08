# Staffjoy — 조사 노트 (실패/철수 할당분, 2026-10-07)

## 선정
- 큐 대상이 "미정"이라 직접 골랐다. 실패 사례, SaaS, 창업자 1인칭 출처(HN 댓글) 있음.
- 기적립 slug 와 겹치지 않는다. 가장 가까운 college-conductor(기술 먼저·고객 나중)와 달리 "같은 팀이 대상 시장을 바꿔 제품을 통째로 다시 만들고도 전환이 안 난" 경로다.
- 처음 후보였던 Voiczy(1인, 고객 11명 전원 이탈)는 원문(substack)이 403 이라 열지 못해 버렸다. 검색 요약만으로 쓰지 않았다.

## 찾은 것 (확인)
- 창업자 philip1209(Philip Thomas)의 HN 종료 스레드(2017-02-15 UTC) 댓글: V1 은 회사마다 알고리즘 요구가 달라 "컨설팅 회사" 같았다 / 식당 대상 3단계 아웃바운드 이메일 전환율 ~0.1% / 방문→가입, 가입→유료 모두 낮음 / "핵심적으로 아픈 문제"를 못 풂.
- 2017-01-10 Show HN(V2) 댓글: 근로자 이메일 없음·선불폰, 관리자가 근무표 사진을 문자로 보냄 → 그 일을 자동화.
- V2 일정: 2016-11 기능 완성, 12월 첫 사용자(HN 댓글), 2017-01-10 공개, 2017-02 종료 발표, 2017-03-15 종료.
- 시드 덱(2016-05): V1 지표 주당 1,741 근무, 주간 23% 성장, 근로자 1인당 월 $8 가정, 시드 $1.2M.

## 못 찾은 것 (확인 불가)
- **종료 공지 원문(Medium, blog.staffjoy.com)** — WebFetch 가 "Command failed" / 403 으로 3회 실패. 1인칭 출처는 HN 댓글로 대체했다. 공지 문장("18 months… failed to achieve product/market fit")은 VentureBeat 인용(2차)으로만 근거를 둔다.
- 0.1% 의 분모(발송 수)와 "전환"의 정의(가입/유료) — 댓글에 없음.
- 유료 고객 수·MRR·가격 실제값 — 어느 출처에도 없음. 덱의 $8/인·월은 TAM 가정이지 실제 청구가가 아니다.
- 투자 총액: 덱·VentureBeat 는 시드 $1.2M, 사이트 문구는 누적 $1.7M, HN 은 반환 약 $1M(약 60%). 초안 summary 에 불일치를 그대로 적었다. 투자금 숫자는 무브 수치로 쓰지 않았다.
- VentureBeat·GitHub suite README 의 published_at (validate 경고 2건).

## 근거 품질 주의 (WebFetch 요약 의존)
- HN 댓글 3건(0.1% / 핵심 문제 / 사진 문자)의 snippet 은 WebFetch 가 돌려준 문구다. 0.1% 문장은 서로 다른 두 번의 호출에서 같게 나왔지만, 나머지 둘은 요약기 경유라 **원문 대조 필요**. evidence.supports_claim 에 그 사실을 적어 뒀다. 승인 전에 사람이 HN 스레드를 한 번 열어 대조할 것.
- 덱 지표 snippet 은 요약이며 원문 인용이 아니다(근거 행에 명시).

## 어휘 판단
- reader_problem: MAKE_BUT_NO_MONEY 로 뒀다. 어휘에 "새 시장으로 옮길 때 수요를 검증 못 한다"에 정확히 맞는 코드는 없다(NO_FIRST_CUSTOMER 는 제품 출시 후 첫 고객 문제라 약간 어긋남).
- bottleneck: CONVERSION. lever: 무브0 PRODUCT_FEATURE, 무브1 CHANNEL(측정값이 아웃바운드 전환율이라서; 세그먼트 전환 자체는 POSITIONING 에 가깝다 — 맞는 칸이 둘이라 지표가 있는 쪽을 골랐다).
- 모든 무브 outcome_direction=negative. 억지 교훈 없음 — transfer_note 는 Staffjoy 가 한 행동이 아니라 "독자가 이 실패에서 피할 수 있는 점검"이며, 창업자가 그렇게 말했다고 쓰지 않았다.
- 이식성(transferability) 판정은 쓰지 않았다. 사람 몫. 참고로 Staffjoy 는 VC 투자 팀이라 사람이 LOW/MEDIUM 으로 볼 여지가 있어 preconditions 에 "투자금 불필요"를 확인해 적었다.

## VOC
- VOC 해당 없음. `ops/state/voc-inputs/index.md` 에 Staffjoy·근무표 스케줄링 프로젝트가 없다. `voc_inputs` 비움.

## 지금 살아 있나
- outcome_status=shutdown. 종료 발표·코드 공개(MIT) 확인. 상태 변화 없음 확인은 따로 안 했다(2017년 종료 건).

## 자가검증 (원칙 §0)
- 효과: 독자가 내일 3명·5명에게 물어볼 수 있는 크기로 transfer_note 를 줄였다.
- 개선한 점: 처음 claim 에 "대기업 계약을 따낼 자원 부족"과 "소매/명품 매장 인력 선호 차이"를 넣으려 했으나 열지 못한 Medium 글·요약기 문장 기반이라 뺐다.
- validate: error 0, 경고 5(무브0 수치 없음 D, 무브1 사실확인 C, published_at 2건, 부정 사례 발행 불가 안내).
