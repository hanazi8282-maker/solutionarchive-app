# MechanicalQuill — 조사 노트 (2026-10-16, 실패 사례 할당 failure_quota)

## 대상 선정
- 큐 대상 "미정". WebSearch 로 1인·소규모 SaaS 종료 회고를 훑어 접근 가능한 1인칭 글이 있는 것을 골랐다.
- 탈락: Spivey(AI 텔레프롬프터) — 제품명·수치 없음, 핵심이 공동창업자 문제라 독자가 옮길 부분이 약함 / Voiczy·RecoverFlow·IH "2.8k→340 MRR" — 원문이 403 으로 열리지 않음(확인 불가) / Frobocode — 교육 코스 플랫폼이라 SaaS 아님.
- 기존 slug 와 겹침 점검: college-conductor(기술 먼저)와 비슷한 축이나, 여기는 "보여 준 반응이 호감이지 구매가 아님" · "대상 전환이 제품 준비와 안 이어짐" · "지원금에 생존을 걸었다"가 다르다.

## 1인칭 출처 (3.5)
- Fabian Dietrich 본인 블로그 "Shutting Down My Baby" (게시 2021-07, 페이지 표기 `07-2021`). 일(日)은 확인 불가 → published_at 비움.
- 인용 7개는 페이지에서 verbatim 재확인했다(2차 WebFetch). 한 번 더 열 때 원문 대조 권장.

## 사고의 흐름
- 관찰: 기술에 밝은 작가들에게 보여 주니 "cool gadget"이라 여겼고, 작가들은 직접 쓰는 걸 좋아함 → 추론: 당시 기술 수준이 부족 → 결정: 더 넓은 취미 작가로 대상 이동 → 그러나 제품이 그 층에는 접근성이 부족 → 돈 문제는 지원금·투자로 풀려 했고, 거절 통지로 종료.

## 못 찾은 것 (확인 불가)
- 매출·사용자 수·가격·가입자 수: 글에 없음. 인터뷰한 작가 수도 없음.
- 정확한 시작·종료일. summarizer 가 "10개월"이라 했으나 verbatim 확인은 안 함 → 초안 summary 에만 근사치로 적었고 period_* 는 null.
- "돈을 내지 않겠다"는 직접 발언은 글에 없다(최초 요약이 그렇게 말했으나 verbatim 에서 확인 안 됨) → 초안은 "유료 전환 사례가 글에 없다"로만 적었다.
- 지금 서비스 상태: 종료로 보이나 사이트 생존 여부는 직접 확인 안 함. outcome_status=shutdown 은 창업자 본인의 "baby was dead" 서술에 근거.
- purchase_frequency / price_band: 근거 없어 비움(검색 매칭 경고).

## 어휘
- reader_problem: NO_FIRST_CUSTOMER (맞음). 병목 CONVERSION. 이 어휘에 안 맞는 부분 없음.
- pain-terms 규칙 때문에 claim 에 "유료 전환/온보딩" 낱말을 넣었다. 둘 다 글의 사실을 바꾸지 않는 선에서 "글에 없다(확인 불가)" 문구로 썼다.

## 무브 (모두 outcome_direction=negative, 등급 D → 사내 참고용)
1. PRODUCT_FEATURE — 만든 뒤에야 보여 줌 / 반응이 호감 수준. transfer: 5명에게 "소액 먼저 내시겠어요?" 묻고 '좋다'와 '내겠다' 따로 세기.
2. POSITIONING — 대상을 넓혔지만 제품이 접근하기 어려움. transfer: 새 대상 1명에게 설명 없이 5분 쓰게 하기.
3. OPERATIONS — 지원금에 생존을 걸고 한 달+몇 달 대기. transfer: 외부 돈이 안 들어올 때 할 일을 날짜와 함께 적고 매주 하루는 돈 낼 사람 찾기.

## VOC
- VOC 해당 없음. 색인의 SaaS 창업가 VOC(hn.algolia no_first_customer 등)는 일반 창업 고민이라 이 무브의 주장을 직접 받치지 않는다고 판단해 `voc_inputs` 를 비웠다(억지로 붙이지 않음).

## 자가검증(원칙 0)
- 개선: ① 요약이 말한 "안 낸다" 단정을 verbatim 과 대조해 제거 ② 지어낸 시작·종료일 제거 ③ slug 의 "wont-pay" 를 사실에 맞게 "grant-bet" 으로 교체.
- 한계: 근거가 1인 자기보고 글 1건뿐 → 모든 무브가 등급 C/D. 발행 대상은 아니고 사내 참고용.

## validate
- `node scripts/case-research.mjs validate --slug mechanicalquill-built-first-asked-later-cool-gadget-grant-bet-shutdown` → exit 0 (error 0, 경고: purchase_frequency·price_band·published_at 공란, 수치 없음 D)
