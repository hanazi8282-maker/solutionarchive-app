// [v71cu B1·B2] story flow 진단 칸 채우기 + 사업 설명 ↔ 카드 주제 신호. 순수 함수, 모델·DB 호출 없음, 형태소 분석기 없음.
// B1 enrichDiagnosis: 사업 설명·URL·진단 글에서 손님·과금·값대·팀 크기를 "글에 단서가 있을 때만" 채운다(없으면 칸을 비워 둔다 = 모름 0.5 감점 그대로).
//   원리(mechanism)는 채우지 않는다 — 카드 원리 어휘(자유 snake_case 1,600종+)와 진단 쪽 어휘가 달라 정확 일치(mechanismScore)를 지어낼 수 없다. 대신 주제 신호의 개념으로만 쓴다.
// B2 topicMatch: 진단 주제(개념 + 낱말) ↔ 카드(domain·sub_topic·mechanism(_norm)·adversity_ko·action_ko) 겹침 0~1. 신호가 없으면 0.5(모름).
//   점수식 상수는 그대로다 — selectStoryFlow(opts.topic) 가 이 값을 상황 일치 항의 6번째 칸으로 넣는다(story-flow-select.ts situationWithTopic).
import type { Diagnosis, FlowCard } from './story-flow.ts'
import { chapterEps } from './story-flow.ts'
import { hasWord, inferStructure } from './discover.ts'

/** 한·영 다리 — 개념마다 한국어·영어 낱말. 진단 글(대개 한국어)과 카드(domain·sub_topic·mechanism 은 영어, 요약은 한국어)를 같은 개념으로 묶는다.
 * ponytail: 손으로 만든 개념 사전(21개) — 어휘 밖 주제는 낱말 겹침만 남는다. 부족하면 임베딩 유사도로 바꾼다. */
export const TOPIC_LEXICON: Record<string, string[]> = {
  seo: [' seo ', '검색', '노출', '구글', '네이버', '키워드', '백링크', ' search', 'google', 'organic', 'keyword', 'backlink', 'guest post', 'guest_post', 'domain authority', 'domain_authority', 'serp'],
  review: ['리뷰', '후기', '평점', '별점', ' review', ' rating', 'testimonial'],
  writing: ['글쓰기', '콘텐츠', '블로그', '카피', '원고', 'writing', 'content', 'blog', 'article', 'copywriting', ' copy'],
  social: ['인스타', '인스타그램', 'sns', '소셜', '틱톡', '유튜브', '인플루언서', '기브어웨이', 'instagram', 'tiktok', 'youtube', 'social', 'influencer', 'giveaway', 'twitter'],
  email: ['이메일', '메일', '뉴스레터', '콜드메일', 'email', 'newsletter', 'cold email', 'cold_email', 'mailing'],
  sales: ['영업', '세일즈', '리드', '고객 발굴', '미팅', 'sales', ' lead', 'prospect', 'outreach', 'crm', 'pipeline', 'cold call'],
  pricing: ['가격', '요금', '유료', '결제', '과금', '체험', '무료', '전환', 'pricing', 'price', 'paid', ' trial', 'freemium', 'upgrade', 'checkout', 'paywall'],
  ads: ['광고', '퍼포먼스', ' ads ', 'advertising', 'ppc', 'facebook ads', 'google ads', 'paid_ads'],
  community: ['커뮤니티', '카페', '포럼', 'community', 'reddit', 'forum', 'discord'],
  booking: ['예약', '일정', '스케줄', '노쇼', '예약금', 'booking', 'appointment', 'schedule', 'calendar', 'no-show', 'no_show', 'deposit'],
  ecommerce: ['쇼핑몰', '스마트스토어', '셀러', '이커머스', '상품', 'ecommerce', 'e-commerce', 'shopify', 'amazon', 'seller', 'dtc', ' store'],
  hr: ['근태', '급여', '인사팀', '인사 관리', '인사 담당', '채용', 'payroll', 'hiring', 'attendance', 'timesheet', 'recruit'],
  meeting: ['회의', '통화', '녹음', '회의록', 'meeting', 'transcript', 'note-taking', 'call recording'],
  design: ['디자인', '템플릿', 'design', 'template', 'canva', 'figma'],
  referral: ['제휴', '파트너', '추천인', '리퍼럴', 'affiliate', 'partner', 'referral'],
  retention: ['이탈', '해지', '재방문', '리텐션', '온보딩', 'churn', 'retention', 'onboarding', 'activation'],
  ai: ['인공지능', '챗봇', 'gpt', 'llm', 'chatbot', ' ai '],
  local_smb: ['소상공인', '자영업', '가게', '매장', '식당', '미용실', 'local business', 'local_business', 'restaurant', 'salon'],
  accounting: ['세금계산서', '정산', '회계', '장부', 'invoice', 'invoicing', 'accounting', 'bookkeeping', 'billing'],
  dev: ['개발자', ' api ', 'developer', 'sdk', 'open source', 'open_source', 'github'],
  launch: ['런칭', '출시', 'product hunt', 'producthunt', 'launch', 'waitlist', '대기자'],
}

export type TopicProfile = { concepts: string[]; tokens: string[] }

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'our', 'are', 'was', 'you', 'they', 'their', 'into', 'more', 'than', 'have', 'has', 'not', 'but', 'via', 'www', 'com', 'http', 'https',
  '있다', '없다', '한다', '하는', '위한', '대한', '그리고', '하지만', '통해', '우리', '사람', '고객', '서비스', '사업', '회사', '제품'])
/** 낱말 — 영어 3자 이상·한글 2자 이상, snake_case·URL 은 쪼갠다. 불용어 제외. */
export function topicTokens(text: string): string[] {
  const t = ` ${text} `.toLowerCase().replace(/https?:\/\//g, ' ').replace(/[_./\-:]+/g, ' ')
  return [...new Set((t.match(/[a-z0-9]{3,}|[가-힣]{2,}/g) ?? []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)))]
}
/** 개념 적중 — 2글자 한글은 discover.hasWord(조사 규칙), 그 밖은 부분 일치. 글자·숫자 밖은 공백으로 바꾸고 앞뒤에 공백을 붙여, 앞 공백이 붙은 영어 낱말(' seo')은 낱말 처음에서만 맞는다(seoul·preview·leads 오적중 방지). */
const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ')
export function topicConcepts(text: string): string[] {
  const low = ` ${flat(text)} `
  return Object.entries(TOPIC_LEXICON).filter(([, ws]) => ws.some((w) => { const f = flat(w); return hasWord(low, /^[가-힣]{2}$/.test(f) ? f : (w.startsWith(' ') ? ' ' : '') + f.trim() + (w.endsWith(' ') ? ' ' : '')) })).map(([k]) => k)
}
export const topicProfile = (text: string): TopicProfile => ({ concepts: topicConcepts(text), tokens: topicTokens(text) })

/** 카드 쪽 글: domain + 그 장 에피소드의 sub_topic·mechanism·mechanism_norm·adversity_ko·action_ko. */
export function cardTopicText(card: FlowCard): string {
  const eps = chapterEps(card) as (ReturnType<typeof chapterEps>[number] & { mechanism_norm?: string | null })[]
  return [card.domain, ...eps.flatMap((e) => [e.sub_topic, e.mechanism, e.mechanism_norm, e.adversity_ko, e.action_ko])].filter(Boolean).join(' ')
}
const tokHit = (a: string, b: string) => a === b || (a.length >= 2 && b.length >= 2 && /[가-힣]/.test(a) && (a.startsWith(b) || b.startsWith(a))) // 한글은 조사 붙은 꼴(리뷰를↔리뷰)도 같은 낱말
/**
 * 주제 일치(0~1). 진단 신호가 없거나 카드 글이 없으면 0.5(모름 — 감점도 가점도 아님).
 * = 개념이 있으면 0.7×(진단 개념 중 카드에 있는 비율) + 0.3×낱말 겹침, 개념이 없으면 낱말 겹침만. 낱말 겹침 = 겹친 수 / min(진단 낱말 수, 카드 낱말 수).
 */
export function topicMatch(card: FlowCard, p: TopicProfile | undefined): number {
  if (!p || (!p.concepts.length && !p.tokens.length)) return 0.5
  const text = cardTopicText(card)
  if (!text.trim()) return 0.5
  const cc = new Set(topicConcepts(text)), ct = topicTokens(text)
  const t = p.tokens.length && ct.length ? Math.min(1, p.tokens.filter((a) => ct.some((b) => tokHit(a, b))).length / Math.min(p.tokens.length, ct.length)) : 0
  if (!p.concepts.length) return Number(t.toFixed(4))
  const c = p.concepts.filter((x) => cc.has(x)).length / p.concepts.length
  return Number((0.7 * c + 0.3 * t).toFixed(4))
}

// ── B1 진단 칸 채우기 ──────────────────────────────────────────────────────
const BUYER_TO_CUSTOMER: Record<string, string> = { smb_owner: 'smb', enterprise: 'enterprise', dev: 'dev', consumer: 'consumer' } // team_lead 는 smb/enterprise 어느 쪽인지 몰라 채우지 않는다
const PRICING_TO_MODEL: Record<string, string> = { subscription: 'subscription', usage: 'usage', one_time: 'one_time' }   // freemium 은 카드 어휘에 없다 → 채우지 않는다
const CREATOR = /크리에이터|유튜버|인플루언서|creator|youtuber/i
const SOLO = /1인 ?(창업|개발|기업|운영)|혼자 (만든|운영|개발)|solo ?founder|indie ?hacker|solopreneur/i
const KRW_PER_USD = 1350 // ponytail: 고정 환율 — 값대 경계(10·50·250 달러) 판정용으로만 쓴다.
/** 글 속 "월 값" → 값대. 단위가 월로 명시된 것만(연·일회 값은 쓰지 않는다). */
export function priceBandFromText(text: string): string | undefined {
  const usd = text.match(/\$\s?(\d+(?:\.\d+)?)\s?(?:\/|per |a )\s?(?:mo|month)/i) ?? text.match(/월\s?\$\s?(\d+(?:\.\d+)?)/)
  const krw = text.match(/월\s?(\d{1,3}(?:,\d{3})+|\d+)\s?(만)?\s?원/) ?? text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s?(만)?\s?원\s?\/\s?월/)
  const v = usd ? Number(usd[1]) : krw ? (Number(krw[1].replace(/,/g, '')) * (krw[2] ? 10_000 : 1)) / KRW_PER_USD : NaN
  if (!Number.isFinite(v) || v <= 0) return undefined
  return v < 10 ? '<10' : v < 50 ? '10-49' : v < 250 ? '50-249' : '250+'
}
const URL_WORDS = (u?: string | null) => (u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/\.(com|io|co|kr|net|app|ai|so|me|org)(\.[a-z]{2})?$/i, '').replace(/[.\-]/g, ' ')

export type EnrichInput = { oneLiner?: string | null; url?: string | null; category?: string | null; detail?: string | null; segment?: 'P' | 'S' | 'M' | 'E' | null }
export type Enriched<D extends Diagnosis> = D & { topic: TopicProfile; enrich_basis: Record<string, string> }

/**
 * [B1] 진단 칸 채우기. 이미 있는 칸(예: diagnosisFromReport 의 stage)은 덮지 않는다. 단서가 없으면 그 칸은 비운다(모름 = 0.5, 지어내지 않는다).
 * - customer: discover.inferStructure 의 buyer_type(smb_owner→smb 등) 또는 크리에이터 낱말
 * - pricing_model: inferStructure 의 과금(구독·사용량·일회. freemium 은 비움)
 * - price_band: 글 속 월 값(달러·원) → 없으면 세그먼트 M·E 만 250+(P·S 는 경계가 값대 둘 이상에 걸쳐 비움)
 * - team_size: "1인 창업·solo founder" 같은 명시만 solo
 * - topic: 사업 설명 + URL 낱말 + 카테고리 + 진단 글의 개념·낱말(B2 주제 신호)
 * enrich_basis 에 칸마다 무엇을 근거로 채웠는지 남긴다(화면 비노출, payload 검토용).
 */
export function enrichDiagnosis<D extends Diagnosis>(base: D, i: EnrichInput): Enriched<D> {
  const biz = [i.oneLiner, URL_WORDS(i.url), i.category].filter(Boolean).join(' ')
  const all = [biz, i.detail].filter(Boolean).join(' ')
  const s = { ...base.situation }, basis: Record<string, string> = {}
  const st = inferStructure(biz)
  const set = (k: keyof Diagnosis['situation'], v: string | undefined, why: string) => { if (v && !s[k]) { s[k] = v; basis[k] = why } }
  set('customer', st.buyer_type ? BUYER_TO_CUSTOMER[st.buyer_type] : CREATOR.test(biz) ? 'creator' : undefined, st.buyer_type ? `inferStructure:${st.buyer_type}` : 'creator 낱말')
  set('pricing_model', st.pricing_model ? PRICING_TO_MODEL[st.pricing_model] : undefined, `inferStructure:${st.pricing_model}`)
  const pb = priceBandFromText(biz)
  set('price_band', pb ?? (i.segment === 'M' || i.segment === 'E' ? '250+' : undefined), pb ? '글 속 월 값' : `segment:${i.segment}`)
  set('team_size', SOLO.test(all) ? 'solo' : undefined, '1인 명시')
  return { ...base, situation: s, topic: topicProfile(all), enrich_basis: basis }
}
