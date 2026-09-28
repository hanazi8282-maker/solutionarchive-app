# T2 "관련 있다"의 기준 — 1차·2차 판정 공통 (관련 기준 본문 `t2c-2026-09-28` · 현재 버전 `t2d-2026-09-28`, §5)

작성 2026-09-28 · 남헌 지시 A(판정 기준 통일) · 사람용 설명과 근거 사례 문서

- **프롬프트에 들어가는 문구의 정본은 코드다** — `lib/analysis/relevance-criteria.ts` 의 `RELEVANCE_CRITERIA`.
  1차(`lib/analysis/relevance-judge.ts` SYSTEM)와 2차(`lib/analysis/second-opinion.ts` `SECOND_OPINION_INSTRUCTIONS` → `scripts/relevance-export.mjs` 의 `instructions`)가 **같은 상수를 import** 한다. 이 문서를 고쳐도 프롬프트는 바뀌지 않는다. 기준을 바꾸려면 상수를 고치고 `RELEVANCE_CRITERIA_VERSION` 을 올린 뒤 이 문서를 맞춘다.
- 셀프테스트 `scripts/auto-approval-selftest.mjs` 가 "두 프롬프트가 같은 상수를 싣는다"와 "1차에 옛 문구가 남아 있지 않다"를 CI 에서 고정한다.
- 사람 채점(채점표 `관련/무관/모름`)도 이 기준을 쓴다.

## 1. 왜 만들었나

- 09-27 SaaS 5개 282건에서 1차·2차 일치율이 49.8% 였다. 소비재 4개 537건은 93.3% 였다.
- 불일치는 전부 한 방향이었다 — 1차 "관련" → 2차 "무관".
- 원인은 두 판정자의 **정의가 달랐던 것**이다.
  - 1차 프롬프트(옛 `relevance-judge.ts:97`): "이 목적이 말하는 사용자·문제·제품 맥락을 다룬다. 불만이든 칭찬이든 상관없다."
  - 2차는 export 파일의 한 줄 지시만 받았다. 그래서 스스로 "실사용자의 불만·요구가 있어야 관련"이라는 기준을 세웠다.
  - 2차 무관 139건의 사유는 대부분 "불만이 아니다", "불만·요구 없음", "긍정 코멘트"였다(`reports/2026-09-27/approval-automation-design.md` §3-5, 65건 = 46.8%).
- 양쪽 다 틀린 곳이 있었다.
  - 1차는 이름만 나오는 글까지 넓게 관련으로 잡았다. 결제 링크, 채용 공고, 매각 이야기가 여기에 들어갔다.
  - 2차는 **선택 이유를 담은 칭찬**까지 무관으로 버렸다. 예: "그래서 ConvertKit 을 계속 쓴다", "가격이 MailChimp 보다 합리적".
  - 1인 창업가에게 선택 이유는 "사람들이 이 도구에서 무엇을 보고 돈을 내는가"다. 불만만큼 쓸모 있는 재료다.

## 2. 정의

### SaaS·소프트웨어 도구 (`business_model = 'SAAS'`)

**관련**: 그 도구, 또는 같은 일을 하는 대체재를 쓰거나 고르거나 떠나는 사람의 목소리여야 한다. 그리고 원문에 아래 중 하나 이상이 있어야 한다.

- (a) **페인**: 쓰면서 겪는 문제, 불편, 비용 부담
- (b) **요구**: 원하는 기능이나 조건, 고를 때 따지는 기준
  - "왜 이걸(또는 대체재를) 골랐나", "왜 계속 쓰나"도 여기에 든다.
  - 칭찬이라도 이유가 구체적이면 관련이다(가격·기능·통제권 비교 등).
- (c) **반대 이유**: 안 쓰는 이유, 떠난 이유, 망설이는 이유(가격 인상이나 정책 변화로 떠나는 이야기 포함)

**누구의 목소리인지는 넓게 본다** — 재시험 1회차 불일치에서 추가했다(`reports/2026-09-28/t2-criteria-retest.md` §2).

- 직접 쓴 사람이 아니어도 된다. 고르는 사람에게 구체적 이유(가격·기능·세금 처리 등)를 들어 권하거나 말리면 관련이다.
- 글의 주제가 다른 제품이어도 된다(홍보글, 다른 도구 스레드). 그 도구를 쓰며 겪은 구체적 페인·비용·요구가 한 문장이라도 있으면 관련이다.
- 지불 금액을 밝힌 사용 목록("ConvertKit $49/월")은 관련이다(wtp=true). 실제로 돈을 낸다는 증거다.

**무관**: 사용·선택 경험도 없고 선택 기준도 없는 글이다.

- 이름만 나온다: 가격·경험 없는 목록 나열, 링크만 있음, 결제 체크아웃 URL 로만 등장, 연동 목록, 예시로 한 번 언급
- 회사 이야기다: 창업기, 매출, 인수, 채용, 투자, 창업자·직원이 자사 설계나 정책을 설명하는 글
- 다른 주제다: 같은 스레드에 달린 다른 제품 이야기, 일반 창업 조언, 기술 잡담
- 내용 없는 한 줄이다: "써봤다", "추천한다", 이유 없는 감탄

**모름(unknown)**: 사용자 목소리는 맞지만 판단이 서지 않는 글이다.

- 핵심이 잘렸다(질문이나 링크만 있고 답이 없다).
- 이유가 드러나지 않는다.

### 소비재 (그 밖의 `business_model`)

- **관련**: 그 제품이나 같은 카테고리 경쟁 제품을 산 사람, 쓰는 사람이 겪은 제품 경험이다.
  - 효과, 품질, 사용감, 가격, AS, 구매나 렌탈을 정한 이유가 여기에 든다.
  - 불만이든 칭찬이든 상관없다.
- **무관**: 제품 경험이 없는 글이다.
  - 회사·경영진·광고비 잡담
  - 영상이나 리뷰어에 대한 반응
  - 배송·포장 이야기만 있는 글
  - 다른 카테고리 이야기
  - 일반 건강·생활 조언
  - 제휴 링크, 홍보글
  - 무의미한 반복 문구
- **모름**: 경험인지 판단할 내용이 모자란다(한두 단어).

### 사업유형 미기재

- 프로젝트 소개와 원문을 보고 둘 중 맞는 정의를 쓴다.
- 1차는 user 프롬프트 `## 사업유형` 줄로, 2차는 export 행의 `business_model` 로 받는다.

### 공통 규칙

- **불만이 없다는 이유만으로 무관으로 두지 않는다.** 신호가 페인인지 요구인지 반대 이유인지는 `community_signal` 라벨이 따로 가른다. 공개 화면 필터도 그 라벨을 쓴다.
  - 구체적 칭찬이나 선택 이유는 관련이다. 이때 signal 은 `demand` 또는 null 이다.
- **제품 이름이 나온다는 이유만으로 관련으로 두지 않는다.**
- **무관은 확실할 때만 쓴다.** 애매하면 모름이다. 무관으로 빠진 원문은 extract 에서 제외되고, 30일 뒤 purge 되면 되돌릴 수 없다(`relevance-judge.ts` 머리 주석).

### 이 기준에서 해석으로 정한 것 (남헌 확인 권장)

- 지시에 적힌 SaaS 정의는 "페인·요구·반대 이유"다. 여기서 **"선택·유지 이유"는 (b) 요구에 넣었다.**
  - 근거 1: 고를 때 따지는 기준이 드러나는 말이다.
  - 근거 2: 09-27 설계 문서 결정 2 권고 A와 맞춘 것이다("맥락이면 relevant, 신호는 라벨로 거른다").
- 이 해석을 빼면 SaaS 에서 긍정 선택 이유가 전부 무관이 된다. 그러면 2차 판정의 옛 기준으로 돌아간다.

## 3. 경계 사례 — 09-27·09-28 실제 불일치 건에서

- 모든 행은 1차 "관련", 옛 2차 판정 표시 순서다.
- 원문은 export 파일(`ops/state/relevance-export-2026-09-27.json`)을 앞부분만 옮긴 것이다.
- 2차 판정은 `ops/state/relevance-second-opinion-2026-09-27.json`(PR #296)과 `-2026-09-28-consumer.json`(PR #304)에서 가져왔다.

### 관련 — 옛 2차는 "불만이 없다"며 무관으로 뒀지만, 새 기준에서는 관련이다

- `034443d9` ConvertKit
  - 원문: "This is why we stick with ConvertKit. Other email providers make you jump through hoops to send an email newsletter that looks like it came from a person."
  - 옛 2차: "긍정적 코멘트로 CK 에 대한 불만이 아니다"
  - 새 판정: 계속 쓰는 이유 (b)
- `5b338170` ConvertKit
  - 원문: "I use ConvertKit for the newsletter. Its pricing is far more reasonable than MailChimp and the like."
  - 옛 2차: 무관
  - 새 판정: 가격 비교 선택 이유 (b)
- `6cc0ef62` ConvertKit
  - 원문: "Go get convertkit. It's bloody awesome, cheap, and they even have an address of their own … The sequenced auto responders … boost my open and click rates as much as 300%"
  - 옛 2차: "순수 칭찬일 뿐"
  - 새 판정: 가격·주소 대행·오토리스폰더라는 구체 이유 (b)
- `3a543c11` Plausible
  - 원문: "I've been using Plausible … for 2 weeks now and will be paying once the trial ends. The UI is very straightforward … We really don't need anything else"
  - 옛 2차: 무관
  - 새 판정: 지불 의사와 선택 이유. wtp=true
- `2ce83fe9` Plausible
  - 원문: "main reason i choose Plausible is because it is made by a EU-based company honouring EU privacy values, meaning no cookies"
  - 옛 2차: 무관
  - 새 판정: 선택 이유 (b)
- `a69c376d` Cal.com
  - 원문: "I'm personally using Cal.com, it's free and I'm very happy."
  - 옛 2차: 무관
  - 새 판정: 무료라는 선택 이유 (b). 이유가 한 단어라 경계에 가장 가깝다.

### 무관 — 1차가 이름만 보고 관련으로 뒀지만, 새 기준에서는 무관이다

- `4c0dded5` Lemon Squeezy
  - 원문: "Based on this feedback added a lifetime license option. https://superwhisperapp.lemonsqueezy.com/checkout?…"
  - 새 판정: 결제 링크로만 등장한다.
- `a84b2a5e` Baremetrics
  - 원문: "Software Engineer @ Baremetrics // Remote. Baremetrics is the leading analytics tool for Stripe."
  - 새 판정: 채용 공고다.
- `12c0cc97` Baremetrics
  - 원문: "Baremetrics spent almost 8-10 years working on their product for a $4 million exit."
  - 새 판정: 매각 이야기다.
- `9f9de0b9` Cal.com
  - 원문: "hey, peer here, cofounder of cal.com. We are quite fortunate to have a growing enterprise business that is subsidising the free plan."
  - 새 판정: 창업자가 자사를 설명하는 글이다.
- `1075b9ec` Baremetrics
  - 원문: "Revenue details of Buffer : https://buffer.baremetrics.com/"
  - 새 판정: 링크만 있다.
- `98bfa3e6` 바디프랜드 안마의자
  - 원문: "여기 회장이 개 돌아이임 … 공정위에서 제재먹음"
  - 새 판정: 회사 잡담이고 제품 경험이 없다.
- `60b66360` 오랄비 전동칫솔
  - 원문: "주문후 배송까지 5일 걸린거 같네요 … 제품 포장 꼼꼼하고 튼튼하게"
  - 새 판정: 배송·포장 이야기뿐이다.
- `63a4962e` 코웨이 정수기
  - 원문: "노써치에서 한 번에 끝내보세요 👉https://linkyvicky.com/…"
  - 새 판정: 제휴 링크 홍보글이다.

### 모름 — 사용자 목소리지만 판단할 내용이 없다

- `a3f7d2ec` Baremetrics
  - 원문: "I'm also curious as to why you moved from Baremetrics to ChartMogul."
  - 전환 사실은 있지만 이유가 없다.
- `6ba74bb4` Cal.com
  - 원문: "You already have my issue: https://github.com/calcom/cal.com/issues/9533"
  - 이슈 내용이 원문에 없다.
- `bed313df` Cal.com
  - 원문: "can you send me an email to peer@cal.com, can i look into your 2FA issue?"
  - 창업자의 응답이다. 사용자 문제의 내용이 없다.
- `98c4b70d` ConvertKit
  - 원문: "I've tried Substack, Buttondown, ConvertKit but I overall prefer Ghost(Pro)."
  - 떠났다는 사실만 있고 이유가 없다.
- `9d4ad991` ConvertKit
  - 원문: "I recently converged from Substack, Convertkit and Wordpress down to just Ghost. It's not perfect but…"
  - 이유가 잘렸다.
- `4923ea42` 코웨이 정수기
  - 원문: "전기사용량은..."
  - 한 단어뿐이다.

- 이 중 `034443d9` · `5b338170` · `4c0dded5` 류 · `a84b2a5e` · `9f9de0b9` · `a3f7d2ec` 와 `5e7fd3ef` · `002849a7` 은 코드 상수의 짧은 예시로도 들어갔다.
- 그래서 SaaS 재시험 표본에서는 이 행들을 뺐다(정답 누설 방지, `reports/2026-09-28/t2-criteria-retest.md`).

## 4. 바뀐 코드 자리

- `lib/analysis/relevance-criteria.ts` — 기준 상수, 버전, 사업유형 분류
- `lib/analysis/relevance-judge.ts`
  - SYSTEM 이 기준 상수를 싣는다(옛 정의 3줄은 삭제했다).
  - user 프롬프트에 `## 사업유형` 줄이 들어간다(`RelevancePurpose.business_model`).
  - `relevance-judge-auto.mjs` 는 이미 `business_model` 을 조회하고 있어서 추가 배선이 없다.
- `lib/analysis/second-opinion.ts`
  - `SECOND_OPINION_INSTRUCTIONS` 가 같은 기준 상수를 싣는다.
  - `isCurrentCriteria` 가 결과 파일의 `criteria_version` 을 대조한다.
  - export 행에 `business_model` 을 더했다.
- `scripts/relevance-export.mjs` — export 파일에 `criteria_version` 을 기록하고, `instructions` 를 공유 지시문으로 쓴다.

## 5. 자동승인 추가 질문 — "정보 있음" (기준 버전 `t2d-2026-09-28`, 규칙 `rr-v2`)

남헌 2026-09-28 정정. rr39(두 판정자가 모두 관련이라 한 39건) 사람 채점에서 무관이 8건 나왔다. 대부분 "관련 기준"은 넘지만 **독자가 제품을 판단할 정보가 없는** 글이었다(정보 없는 질문, 도구로 지나가는 남의 이야기, 자기소개). 관련 기준(§2)은 분석 재료를 넓게 모으는 자리라 좁히지 않는다. 대신 자동 승인에만 질문 하나를 더한다.

- **정본은 코드다** — `lib/analysis/relevance-criteria.ts` 의 `PRODUCT_INFORMATIVE_CRITERIA`. 1차 SYSTEM 과 2차 지시문이 같은 상수를 import 한다. `RELEVANCE_CRITERIA` 본문은 **바이트 단위로 그대로다**(셀프테스트가 sha256 으로 고정) — 버전만 `t2d` 로 올렸다. t2c 로 판정한 2차 파일은 정보 판정이 없어서 rr-v2 승인 입력이 아니다.
- **질문**: 이 글에 독자가 이 제품을 판단하는 데 쓸 수 있는 구체 정보가 있는가. relevant 와 **따로** 답한다(1차 출력 키 `info`, 2차 행 `product_informative`, 값 true·false·null).
- **true**: (1) 글이 이 제품, 또는 그 경쟁·대체재(같은 선택지)에 관한 것이고 (2) 원문에 구체 정보가 있다. 장단점, 비교, 비용, 수수료, 요금제 조건, 기능 유무, 문제와 해결, 쓰는 이유나 떠난 이유가 여기에 든다.
  - 직접 써 본 경험일 필요는 없다.
  - **경쟁사의 장점·단점도 true 다.** 그걸로 이 제품의 장단을 찾을 수 있다.
- **false**: 정보 없는 질문 한 줄("Can you support Apple Pay?"), 이름·링크만, 제품이 도구로 지나가는 남의 이야기("LS 에 올려 지불의사 테스트", 자기 인프라 비용 목록 속 한 항목), 자기소개("나는 타깃 고객"), 선택지와 무관한 주제.
- **null**: 원문이 잘려 판단할 수 없다. false 로 접지 않는다(§7.1).

경계 사례 — rr39 번호, 원문은 `reports/2026-09-28/relevance-grading-rr39.md`:

- F #18 Apple Pay 지원 질문 — 정보 없는 질문 한 줄
- T #13 가격 페이지에 없는 추가 수수료 — 질문 형태지만 사실이 있다(#18 과 대조)
- F #35 LS 에 올려 지불의사 테스트 — 도구로 지나감
- F #27 Baremetrics — 자기 인프라 비용 나열 속 한 항목
- F #8 "나는 타깃 고객" — 자기소개
- T #36 Mailchimp 고객지원 불만 — 경쟁사 단점
- T #12 NeetoCal 기능 평 — 경쟁 대안의 장단
- T #19 Substack vs ConvertKit — 대안 비교
- T #28 LS 숨은 수수료 vs Paddle — 요금 비교
- #29(WordPress.com 비즈니스 요금제)는 예시로 쓰지 않는다. 재확인 목록 몫이다.

위 9건의 input_id 는 `INFORMATIVE_EXAMPLE_INPUT_IDS` 에 있다. 프롬프트에 실렸으므로 평가에서 뺀다(정답 누설).

### 규칙 rr-v2 — 무엇이 달라지나

- **승인 대상**(`isFullAgreement`): 1차·2차 둘 다 `relevant` **그리고** `product_informative`·`second_product_informative` 둘 다 `true`. null 이 하나라도 있으면 대상이 아니다.
- **감사 오류**(`scoreApproval`): 사람이 무관이라 했거나 `human_product_informative=false`. 감사 창에는 `human_verdict`(관련·무관)와 `human_product_informative` 가 **둘 다 채워진 행만** 들어간다. 창도 `auto_approval_rule='rr-v2'` 행만 센다.
- 컬럼(마이그 `20260930000031`, 비파괴): `product_informative`·`second_product_informative`·`human_product_informative`. 채점표는 `정보있음`/`정보없음` 두 칸을 머리글 이름으로 읽는다. 정보 칸만 체크한 줄은 `human_verdict`·`human_graded_at` 을 바꾸지 않는다.

### 평가와 가동 문턱 — 문서로만 둔다

- 하네스: `scripts/t2-approval-eval.mjs`(순수 부품 `lib/analysis/t2-approval-eval.ts`). 사람 채점 행과 `--sample` 행을 현재 기준으로 다시 판정한다. 산출물은 `n_A`·오류·정밀도·재현율, 그리고 **옛 프롬프트 대비 1차 verdict 일치율**이다. 추가 질문이 관련성 분포를 흔드는지 보는 숫자다.
- 재확인 목록: `a` = 정답을 못 정한 행(사람 정보 열이 비었거나 관련 모름). `b` = 09-28 에 좁은 감각(직접 써 본 경험)으로 무관을 매긴 SaaS 8건(#8·#12·#18·#19·#27·#35·#36·#37). **b 는 항상 들어가고, 관련 열까지 다시 받는다.** 표는 `relevance-grading-sample.mjs --recheck <eval.json>` 으로 만든다.
- **가동 문턱**: n_A ≥ 40 · 오류 ≤ 2 · 재현율 ≥ 50%. 판정이 빠진 행이 하나라도 있으면 판단하지 않는다. 문턱을 넘어도 코드는 플래그를 켜지 않는다. `AUTO_APPROVAL_ENABLED` 는 사람이나 역할 세션이 켠다(§10.1 조건 2).
