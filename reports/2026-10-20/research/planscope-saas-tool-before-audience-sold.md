# 조사 노트 — Planscope (planscope-saas-tool-before-audience-sold)

큐 사유: failure_quota (실패·피벗·철수 사례 할당분, 성공 사례로 대체 금지)
대상 시장: SaaS · 1인/소규모 팀 소프트웨어
조사일: 2026-10-20

## 대상 선정

WebSearch 로 "indie SaaS 폐업·매각·피벗 창업자 1인칭 회고"를 여러 각도로 훑었다. 검색 결과는 대부분
모음 기사·익명 이야기·합성 사례였다. 후보를 다음 이유로 버렸다.

- Standard Notes — 종료가 확인되지 않음.
- Voiczy, LeaderBird, Vivra — 1차 출처 접속 403(읽지 못한 출처는 근거로 쓰지 않음). Vivra 는 검색 요약이
  "포스트모템 없음"과 "있음"을 오락가락해서 확인 불가로 접었다.
- Gravity.fast — 서술이 모호.
- HackerNoon $18K MRR 글 — 제3자 합성 글.
- App.net — 1인/소규모 SaaS 가 아님.
- 익명 Indie Hackers 헬스장 SaaS, FeedbackWise — 익명·검증 불가.
- Juttu, Cydoc — 이미 적립된 슬러그.

**Planscope 를 고른 이유**: 창업자 Brennan Dunn 본인의 1인칭 글 2편을 실제로 읽을 수 있었고, 1인 SaaS 이며,
기존 슬러그와 겹치지 않는다. 한계는 아래 "못 찾은 것"에 모두 적었다.

## 확인한 것

- 출처 1 (1차, 자기보고): doubleyourfreelancing.com/doubling-down-on-doubleyourfreelancing/
  - "I coded Planscope, launched it at LessConf, and a few customers hopped onboard."
  - "our sales funnel started to spin down because there was no ongoing client acquisition effort."
  - "And I ended up bringing in $2,213 in pre-sales almost immediately." — 전자책 'Double Your Freelancing
    Rate In 14 Days'($29)를 Planscope 고객·체험 사용자에게 메일로 알린 직후의 선주문(전후 문맥은 요약 확인).
  - "I've always said that Planscope would be a million dollar a year business if I could clone myself and strip
    the love of teaching from that clone."
  - FE International 중개로 Josiah Johnson(1인 부트스트랩 창업가)에게 매각.
- 출처 2 (1차, 자기보고): doubleyourfreelancing.com/2016-year-review/
  - "Two sets of customers, two separate support inboxes ... Planscope customers were getting a bit miffed."
  - "I wasn't really shipping any new features."
  - "Lesson learned: If you want to build a business that you could one day sell, silo its finances once it
    gains a bit of traction."
  - 매각은 2016년 1분기, 실사에 12개월치 명세를 찾아야 했다.
- 출처 3 (2차 전언): howtokicksaas.com/appraisement-pricing-your-saas/storytime-with-brennan
  - "I built a tool when I should have built an audience." — 글쓴이가 Dunn 과의 대화를 옮긴 것. 작성자·날짜 미표기.

인용 문구는 WebFetch 도구가 돌려준 텍스트이고 원문 HTML 과 기계 대조(diff)는 하지 못했다(원문 직접 내려받기
도구 승인 없음). 따라서 스니펫이 원문과 글자 단위로 같다는 확인은 **확인 불가**다.

## 못 찾은 것 (확인 불가로 남긴 것)

- **Planscope 의 매출·고객 수·가격**: 어디에도 공개되지 않았다. 유일한 숫자는 $2,213 선주문이고 이는 전자책 매출이지
  Planscope 매출이 아니다. `price_band` 는 비웠다.
- **글 발행일**: 두 글 모두 발행일을 못 찾았다(추정만 가능). 추정으로 채우지 않고 `published_at` 을 전부 null 로 뒀다.
- **period_start / period_end**: 출시 시점·종료 시점을 일 단위로 확인하지 못해 null. 무브 2 의 관측기간은 매각이
  있었다고 확인된 2016 Q1 로만 잡았다.
- **현재 상태**: planscope.io 접속 결과가 비어 있어 지금 서비스가 살아 있는지 확인 불가. "망가졌다"는 2차 전언이 있었으나
  출처가 불분명해 어떤 필드에도 반영하지 않았다.
- **독립 제3자 출처**: 없다. 세 출처가 모두 Dunn 본인 또는 그의 말을 옮긴 글이라 높은 등급은 기대하지 않는다.
- **실패 여부 자체**: 문 닫은 사업이 아니라 매각·피벗이다. `outcome_status=pivoted` 로 기록했고 성공/실패를 단정하지 않았다.
- **reader_problem 어휘**: `NO_CHANNEL` 은 임시 매핑이다. 창업자가 일을 둘로 쪼갠 문제(무브 2)는 이 어휘에 딱 맞는 값이 없다.
- **VOC 해당 없음**: `ops/state/voc-inputs/index.md` 에 Planscope·프리랜서용 PM 도구 프로젝트가 없다.
  일반 HN 통증 프로젝트들은 이 케이스에 특정되지 않아 `voc_inputs` 를 비웠다.

## 무브·등급 요약

- **무브 0 (CHANNEL, negative)** — 독자 인사이트 C / 사실확인 D(수치 없음). transfer_note: 최근 30일 가입자의
  유입 경로를 적고, 사람 노력 없이 도는 유입 길 한 가지를 달력에 박아라.
- **무브 1 (OFFER, mixed)** — 독자 인사이트 A / 사실확인 C(자기보고 1차뿐). 수치: 선주문 0 → $2,213(USD).
  transfer_note: 가입자·체험자에게 아직 안 만든 작은 상품을 선주문 제안으로 보내고 48시간 결제 수를 세라.
- **무브 2 (OPERATIONS, negative)** — 독자 인사이트 C / 사실확인 D(수치 없음). transfer_note: 일이 둘 이상이면
  각 지난 30일 수입·지출을 따로 표로 만들고 계좌를 분리하라.

부정 사례 무브 중 사실확인 D 인 둘(0, 2)은 발행 게이트에서 발행 불가, 사내 참고용이다. 억지로 수치를 만들지 않았다.
`transferability` 는 JSON 에 쓰지 않았다.

## validate 결과

`node scripts/case-research.mjs validate --slug planscope-saas-tool-before-audience-sold`
→ 무브 3건 · 근거 7건 · 등급 A1 C2 · **error 0건, ✅ 전부 통과**. warn 은 예상된 것: price_band 비움,
published_at 없음(위 사유), 수치 없는 무브의 D 등급, 부정 사례의 사실확인 D 안내.
