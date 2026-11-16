// v71cp P2-F: 아이디어(모드 C1/C2 입력) → 경쟁사·참조군 후보 자동 발견. 라이브 웹검색·외부 스크래핑 없음.
// 분야 = config/areas_v2.json + community_keywords_v2.json 낱말 매칭, 후보 = 사례 은행(case_bank_labels) 조회(주입). 모델 호출 없음.
// 근거 3규칙(refgroup.ts 재사용): ① CEM 매칭 n≥10(nTier≠hidden) ② 실패 사례 포함 ③ 구조 매칭(고객 유형·과금 중 1개 이상을 CEM 키로 씀).
// 하나라도 못 맞추면 '근거 부족'을 먼저 낸다. 조회 실패는 '확인 불가'(not_run) — 근거 부족으로 접지 않는다(§7.1).
// 확률·성공률 숫자는 내지 않는다(R10 전 — refgroup.gateOpen 이 열리기 전에는 목록과 건수만).
import type { SupabaseClient } from '@supabase/supabase-js'
import { nTier, type Case } from './refgroup.ts'

export type Area = { key: string; name_ko: string; ko?: string[]; en?: string[] }
export type LabelRow = { case_id: string; buyer_type: string | null; pricing_model: string | null; outcome: string | null }
export type FetchLabels = (domain: string) => Promise<LabelRow[]>

export type RuleCheck = { n10: boolean; hasFailure: boolean; structureMatch: boolean }
export type RefCandidate = {
  domain: string
  name_ko: string
  status: 'ok' | 'insufficient' | 'not_run'
  n: number
  failures: number
  structure: Record<string, string>
  rules: RuleCheck
  examples: { name: string; outcome: 'success' | 'failure' }[]
  note: string // 화면 한 줄 — insufficient 면 '근거 부족'으로 시작한다
}
export type Discovery = { status: 'ok' | 'insufficient' | 'not_run' | 'no_domain'; structure: Record<string, string>; candidates: RefCandidate[] }

const BUYER: [RegExp, string][] = [
  [/소상공인|자영업|사장님|가게|매장|식당|미용실|학원|small business|\bsmb\b/i, 'smb_owner'],
  [/대기업|엔터프라이즈|enterprise/i, 'enterprise'],
  [/개발자|developer/i, 'dev'],
  [/팀장|부서|팀 단위/i, 'team_lead'],
  [/소비자|개인 사용자|b2c|consumer/i, 'consumer'],
]
const PRICING: [RegExp, string][] = [
  [/프리미엄|freemium|무료로 쓰다|기본 무료/i, 'freemium'],
  [/구독|월정액|월 구독|subscription/i, 'subscription'],
  [/사용량|건당|종량|usage[- ]based/i, 'usage'],
  [/일회|단건|평생 이용|one[- ]time/i, 'one_time'],
]
const first = (t: string, rules: [RegExp, string][]) => rules.find(([re]) => re.test(t))?.[1]

/** 입력 글 → 구조 키(고객 유형·과금). 글에 단서가 없으면 그 키는 넣지 않는다(추정 금지). */
export function inferStructure(text: string): Record<string, string> {
  const s: Record<string, string> = {}
  const b = first(text, BUYER), p = first(text, PRICING)
  if (b) s.buyer_type = b
  if (p) s.pricing_model = p
  return s
}

/** 입력 글 → 분야 후보(낱말 적중 수 내림차순, 최대 max). 이름(근태·HR·급여 → 근태/HR/급여)도 낱말로 쓴다. */
export function matchDomains(text: string, areas: Area[], max = 3): Area[] {
  const low = text.toLowerCase()
  return areas
    .map((a) => ({ a, hits: [...a.name_ko.split(/[·\s]+/), ...(a.ko ?? []), ...(a.en ?? [])].filter((w) => w.length >= 2 && low.includes(w.toLowerCase())).length }))
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits)
    .slice(0, max)
    .map((x) => x.a)
}

const OUT: Record<string, 0 | 1> = { success: 1, acquired: 1, failure: 0, zombie: 0 }
const nameOf = (caseId: string) => caseId.slice(caseId.indexOf(':') + 1) || caseId

/** 순수 — 한 분야의 사례 행 + 구조 키 → 후보 1개(3규칙 판정). */
export function judgeCandidate(area: Area, rows: LabelRow[], structure: Record<string, string>): RefCandidate {
  const pool: (Case & { id: string })[] = rows
    .filter((r) => r.outcome != null && r.outcome in OUT)
    .map((r) => ({ id: r.case_id, structure: { buyer_type: r.buyer_type ?? 'unknown', pricing_model: r.pricing_model ?? 'unknown' }, surface: [], outcome: OUT[r.outcome as string], year: 0 }))
  const keys = Object.keys(structure)
  const matched = pool.filter((c) => keys.every((k) => c.structure[k] === structure[k])) // CEM — refgroup.estimate 와 같은 규칙
  const failures = matched.filter((c) => c.outcome === 0).length
  const rules: RuleCheck = { n10: nTier(matched.length) !== 'hidden', hasFailure: failures > 0, structureMatch: keys.length > 0 }
  const ok = rules.n10 && rules.hasFailure && rules.structureMatch
  const miss = [!rules.n10 && `확인된 사례 ${matched.length}건(10건 미만)`, !rules.hasFailure && '실패 사례 없음', !rules.structureMatch && '고객 유형·과금 방식을 입력에서 찾지 못해 구조 비교 불가'].filter(Boolean)
  const examples = [...matched.filter((c) => c.outcome === 1).slice(0, 3), ...matched.filter((c) => c.outcome === 0).slice(0, 2)]
    .map((c) => ({ name: nameOf(c.id), outcome: c.outcome === 1 ? ('success' as const) : ('failure' as const) }))
  return {
    domain: area.key, name_ko: area.name_ko, status: ok ? 'ok' : 'insufficient', n: matched.length, failures, structure, rules, examples,
    note: ok ? `구조가 같은 사례 ${matched.length}건(실패 ${failures}건 포함)` : `근거 부족 — ${miss.join(', ')}`,
  }
}

/** 아이디어 글 → 참조군 후보. load 는 주입(테스트는 가짜, 앱은 dbFetchLabels). 던지지 않는다. */
export async function discoverRefGroups(text: string, areas: Area[], load: FetchLabels): Promise<Discovery> {
  const structure = inferStructure(text)
  const domains = matchDomains(text, areas)
  if (!domains.length) return { status: 'no_domain', structure, candidates: [] }
  const candidates: RefCandidate[] = []
  for (const a of domains) {
    try {
      candidates.push(judgeCandidate(a, await load(a.key), structure))
    } catch (e) {
      console.error(`refgroup fetch failed (${a.key}): ${e instanceof Error ? e.message : e}`)
      candidates.push({ domain: a.key, name_ko: a.name_ko, status: 'not_run', n: 0, failures: 0, structure, rules: { n10: false, hasFailure: false, structureMatch: false }, examples: [], note: '확인 불가 — 사례 은행을 조회하지 못했습니다' })
    }
  }
  // 근거 부족을 먼저 낸다: insufficient → not_run → ok 순.
  const order = { insufficient: 0, not_run: 1, ok: 2 }
  candidates.sort((x, y) => order[x.status] - order[y.status])
  const status = candidates.some((c) => c.status === 'ok') ? 'ok' : candidates.every((c) => c.status === 'not_run') ? 'not_run' : 'insufficient'
  return { status, structure, candidates }
}

/** 화면·모델 입력용 줄 — 근거 부족이 먼저. */
export function discoveryLines(d: Discovery): string[] {
  if (d.status === 'no_domain') return ['- [참조군] 근거 부족 — 입력에서 분야(areas_v2)를 특정하지 못했습니다']
  return d.candidates.map((c) => `- [참조군·${c.name_ko}] ${c.note}${c.examples.length ? ` (예: ${c.examples.map((e) => `${e.name}${e.outcome === 'failure' ? '·실패' : ''}`).join(', ')})` : ''}`)
}

/** areas_v2 + community_keywords_v2 JSON → Area[] (호출자가 읽어서 넘긴다 — 이 파일은 fs 를 쓰지 않는다). */
export function areasFrom(areasV2: { domains: { key: string; name_ko: string }[] }, keywords: { areas: Record<string, { ko?: string[]; en?: string[] }> }): Area[] {
  return areasV2.domains.map((d) => ({ key: d.key, name_ko: d.name_ko, ko: keywords.areas[d.key]?.ko, en: keywords.areas[d.key]?.en }))
}

// areas_v2 는 marketing_automation(PR #646)인데 case_bank_labels CHECK(20261113000001)는 email_marketing_automation — 둘 다 조회한다.
const ALIAS: Record<string, string[]> = { marketing_automation: ['marketing_automation', 'email_marketing_automation'] }

/** 실제 조회 — case_bank_labels(service_role). 오류는 던진다(discoverRefGroups 가 not_run 으로 접는다). */
export const dbFetchLabels = (sb: Pick<SupabaseClient, 'from'>): FetchLabels => async (domain) => {
  const { data, error } = await sb.from('case_bank_labels').select('case_id,buyer_type,pricing_model,outcome').in('domain', ALIAS[domain] ?? [domain]).neq('outcome', 'unknown').limit(1000)
  if (error) throw new Error(error.message)
  return (data ?? []) as LabelRow[]
}
