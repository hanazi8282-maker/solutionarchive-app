// T2 "관련 있다"의 기준 — 1차 판정(relevance-judge.ts)과 2차 판정(second-opinion.ts → export 지시문)이
// **같은 상수를 import 한다.** 여기서만 고친다. 한쪽에 복사해 두면 다시 갈라진다 —
// 09-27 SaaS 일치율 49.8% 의 절반가량이 두 판정자의 기준 차이였다(reports/2026-09-27/approval-automation-design.md §3-5).
//
// 사람용 설명·근거 사례는 docs/t2-relevance-criteria.md. 문구를 바꾸면 버전을 올린다 —
// 자동 승인(auto-approval.ts)은 2차 판정 파일의 criteria_version 이 이 값과 같을 때만 2차 판정을 받아들인다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

export const RELEVANCE_CRITERIA_VERSION = 't2c-2026-09-28'

/** analysis_projects.business_model → 기준 묶음. 미기재는 모델이 원문으로 고르게 둔다(추측해 채우지 않는다). */
export function criteriaKindOf(businessModel: string | null | undefined): 'saas' | 'consumer' | 'unspecified' {
  const bm = String(businessModel ?? '').trim().toUpperCase()
  if (!bm) return 'unspecified'
  return bm === 'SAAS' ? 'saas' : 'consumer'
}

const KIND_LABEL = {
  saas: 'SaaS·소프트웨어 도구',
  consumer: '소비재(실물 제품)',
  unspecified: '미기재 — 프로젝트 소개와 원문을 보고 두 정의 중 맞는 쪽을 써라',
} as const

/** 프롬프트에 실을 사업유형 한 줄. */
export function describeBusinessModel(businessModel: string | null | undefined): string {
  const kind = criteriaKindOf(businessModel)
  return `${KIND_LABEL[kind]}${businessModel ? ` (business_model=${businessModel})` : ''}`
}

/** 판정 기준 본문. 1차 SYSTEM 과 2차 지시문에 글자 그대로 들어간다. */
export const RELEVANCE_CRITERIA = [
  `## "관련(relevant)"의 기준 — 사업유형별 (기준 버전 ${RELEVANCE_CRITERIA_VERSION})`,
  '질문은 하나다: 이 글이 이 프로젝트의 분석 재료(사용자·구매자의 목소리)가 되는가.',
  '',
  '[SaaS·소프트웨어 도구]',
  'relevant = 그 도구 또는 같은 일을 하는 대체재를 쓰거나·고르거나·떠나는 사람의 목소리이고, 아래 중 하나 이상이 원문에 있다.',
  '  (a) 페인: 쓰면서 겪는 문제·불편·비용 부담',
  '  (b) 요구: 원하는 기능·조건, 고를 때 따지는 기준 — 왜 이걸(또는 대체재를) 골랐나·계속 쓰나도 여기다.',
  '      칭찬이어도 이유가 구체적이면(가격·기능·통제권 비교 등) relevant 다.',
  '  (c) 반대 이유: 안 쓰는·떠난·망설이는 이유 (가격 인상·정책 변화로 떠나는 이야기 포함)',
  '  누구의 목소리인지는 넓게 본다:',
  '  · 직접 쓴 사람이 아니어도, 고르는 사람에게 구체적 이유(가격·기능·세금 처리 등)를 들어 권하거나 말리는 글은 relevant 다.',
  '  · 글의 주제가 다른 제품(홍보글·다른 도구 스레드)이어도, 그 도구를 쓰며 겪은 구체적 페인·비용·요구가 한 문장이라도 있으면 relevant 다.',
  '  · 지불 금액을 밝힌 사용 목록("ConvertKit $49/월")은 relevant 다(wtp=true) — 실제로 돈을 낸다는 증거다.',
  'irrelevant = 사용·선택 경험도, 선택 기준도 없는 글.',
  '  · 이름만 나온다: 가격·경험 없는 목록 나열, 링크만, 결제 체크아웃 URL 로만 등장, 연동 목록, 예시로 한 번 언급',
  '  · 회사 이야기: 창업기·매출·인수·채용·투자, 창업자·직원이 자사 설계·정책을 설명하는 글(사용자 목소리가 아니다)',
  '  · 다른 주제: 같은 스레드의 다른 제품·일반 창업 조언·기술 잡담 (그 도구 경험이 한 문장도 없을 때)',
  '  · 내용 없는 한 줄: "써봤다", 이유 없는 추천·감탄',
  'unknown = 사용자 목소리는 맞는데 핵심이 잘렸거나(질문·링크만 있고 답이 없다) 이유가 드러나지 않아 판단이 서지 않는다.',
  '',
  '[소비재(실물 제품)]',
  'relevant = 그 제품 또는 같은 카테고리 경쟁 제품의 구매자·사용자가 겪은 제품 경험(효과·품질·사용감·가격·AS·구매·렌탈 결정 이유).',
  'irrelevant = 제품 경험이 없는 글: 회사·경영진·광고비 잡담, 영상·리뷰어에 대한 반응, 배송·포장만, 다른 카테고리,',
  '  일반 건강·생활 조언, 제휴 링크·홍보글, 무의미한 반복 문구.',
  'unknown = 경험인지 판단할 내용이 모자란다(한두 단어).',
  '',
  '[공통]',
  '- 불만이 없다는 이유만으로 irrelevant 로 두지 않는다. 신호의 종류(pain/demand/objection)는 signal 라벨이 따로 가른다 —',
  '  구체적 칭찬·선택 이유는 relevant 이고 signal 은 demand 또는 null 이다.',
  '- 제품 이름이 나온다는 이유만으로 relevant 로 두지 않는다.',
  '- irrelevant 는 확실할 때만 쓴다. 버려진 원문은 다시 읽히지 않는다 — 애매하면 unknown 이다.',
  '',
  '경계 사례 (R=relevant · I=irrelevant · U=unknown):',
  'R "This is why we stick with ConvertKit. Other providers make you jump through hoops to send a newsletter that looks like it came from a person." — 계속 쓰는 이유(b)',
  'R "I use ConvertKit for the newsletter. Its pricing is far more reasonable than MailChimp." — 가격 비교 선택 이유(b)',
  'R "Stripe is the easiest way for me. Tried lemonsqueezy but stripe still was the most straightforward." — 대체재로 떠난 이유(c)',
  'I "Added a lifetime license option. https://superwhisperapp.lemonsqueezy.com/checkout?..." — 결제 링크로만 등장',
  'I "Software Engineer @ Baremetrics // Remote. Baremetrics is the leading analytics tool for Stripe." — 채용 공고',
  'I "hey, peer here, cofounder of cal.com. ... subsidising the free plan" — 창업자의 자사 설명',
  'I "I\'ve used https://convertkit.com/ for this in the past." — 이유 없는 한 줄',
  'U "I\'m also curious as to why you moved from Baremetrics to ChartMogul." — 전환은 있으나 이유가 없다',
  'I "여기 회장이 개 돌아이임 ... 공정위에서 제재먹음" (안마의자) — 회사 잡담, 제품 경험 없음',
  'I "좋아요 주문후 배송까지 5일 걸린거 같네요. 포장 꼼꼼" (전동칫솔) — 배송·포장만',
].join('\n')
