// R5 사례 검색 질의 검증 — 순수 함수(import 없음). 모델이 고른 카테고리·메커니즘을 허용 목록으로만 통과시킨다(없는 태그로 검색하지 않는다).
export const CATEGORIES = ['SaaS', 'Education', 'HR·인사', 'Marketing', 'Finance', 'Content', 'Health', 'Productivity', 'SEO', 'Writing', 'Design', 'Technology'] as const
export const MECHANISMS = [
  'subscription', 'seo-content', 'distribution-weak', 'community-led', 'marketplace-network', 'niche-vertical', 'freemium-plg', 'paid-ads',
  'regulatory-legal', 'operational-complexity', 'bootstrapped-solo', 'overexpansion', 'outcompeted', 'pricing', 'ran-out-of-cash',
  'platform-dependency', 'team-conflict', 'unit-economics', 'pivot-focus', 'no-market-need',
] as const

export type CaseQuery = { category: string | null; mechanisms: string[] }

export function sanitizeCaseQuery(raw: Record<string, unknown>): CaseQuery {
  const cat = typeof raw.category === 'string' ? raw.category.trim() : ''
  const category = (CATEGORIES as readonly string[]).includes(cat) ? cat : null
  const mech = Array.isArray(raw.mechanisms) ? raw.mechanisms : []
  const mechanisms = [...new Set(mech.filter((m): m is string => typeof m === 'string' && (MECHANISMS as readonly string[]).includes(m.trim())).map((m) => m.trim()))].slice(0, 2)
  return { category, mechanisms }
}

export type CaseRow = { company: string | null; key_decision: string | null; outcome: string | null; grade: string | null }

/** 화면에 내는 한 줄. 이름이 없거나 결정 내용이 없는 행은 버린다. 130자 이하(인용 규칙). */
export function caseLine(r: CaseRow): { name: string; what: string } | null {
  const name = (r.company ?? '').trim()
  const what = (r.key_decision ?? '').replace(/\s+/g, ' ').trim()
  if (!name || !what) return null
  return { name: name.slice(0, 60), what: (r.outcome ? `[${r.outcome}] ` : '') + what.slice(0, 110) }
}
