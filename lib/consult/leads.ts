// v71co 개정 §2-2~4 — 로그인 없는 무료 초안 신청(리드). 접수 → 초안 생성 → 비공개 열람(/d/<token>) → 완성본 입력.
// 모든 DB 접근은 service_role(RLS 로 anon 차단). 열람 주소의 token 은 32자리 hex(추측 불가) — 그 자체가 열쇠다.
// 순수 함수(parse*·mailDraft·funnel)는 scripts/lead-selftest.mjs 가 바로 불러 검사한다.
import { createHash } from 'node:crypto'
import { db, createRun, getRun, setStatus } from './runs.ts'
import { collectAndStore } from './pipeline.ts'
import { composeReport, type ReportPayload } from './report/compose.ts'
import { normalizeCompanyUrl } from './url.ts'
import { capExceeded } from './usage.ts'
import { consultLlmJson } from './llm.ts'

export const TOKEN_RE = /^[0-9a-f]{32}$/
/** 하루 신규 접수 상한(CTO 판단 2026-11-17): 초안 1건 ≈ $1.2(2026-11-17 실측 $1.18) → 8건 ≈ $9.5, 전체 일 비용 상한 $10 안에 든다. 값은 env 로 조정. */
export const LEAD_DAILY_CAP = Number(process.env.LEAD_DAILY_CAP ?? 8)
export const LEAD_IP_DAILY = 3
const STALE_GEN_MIN = 8

export type LeadRow = {
  id: string; token: string; email: string; url: string; run_id: string | null; report_token: string | null
  status: 'queued' | 'generating' | 'ready' | 'failed'; error: string | null; gen_started_at: string | null
  views: number; max_depth: number; completion: Completion | null; completion_status: 'generating' | 'ready' | 'failed' | null
  completion_result: CompletionResult | null; completion_at: string | null; situation: Record<string, unknown> | null; created_at: string
}

// ---------- 접수 검증(순수) ----------
const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i
export function parseLeadForm(f: { url?: unknown; email?: unknown; consent?: unknown; website?: unknown; v?: unknown }):
  { ok: true; url: string; email: string; variant: string } | { ok: false; code: 'url' | 'email' | 'consent' | 'bot' } {
  if (String(f.website ?? '').trim()) return { ok: false, code: 'bot' } // 숨김 칸(사람은 비워 둔다)
  const u = normalizeCompanyUrl(String(f.url ?? ''))
  if (!u) return { ok: false, code: 'url' }
  const email = String(f.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.endsWith('@solutionarch.internal')) return { ok: false, code: 'email' }
  if (f.consent !== 'on' && f.consent !== '1') return { ok: false, code: 'consent' }
  const v = String(f.v ?? '').toLowerCase()
  return { ok: true, url: u.origin + (u.pathname === '/' ? '' : u.pathname), email, variant: ['a', 'b', 'c'].includes(v) ? v : 'a' }
}

/** 경과 분(서버 렌더 중 시계는 이 함수로만 읽는다 — 컴포넌트 안 Date.now 는 린트 금지). */
export const ageMin = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity)
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
export const leadOwner = (token: string) => `lead-${token.slice(0, 12)}@solutionarch.internal`
export const hashIp = (ip: string) => createHash('sha256').update(`${ip}|${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`).digest('hex').slice(0, 24)

export function mailDraft(i: { host: string; token: string; base: string }): string {
  return [
    `제목: ${i.host} 결론서 초안이 준비됐습니다`,
    '',
    '안녕하세요, 솔루션아카이브입니다.',
    `요청하신 ${i.host} 결론서 초안을 만들었습니다. 아래 주소에서 로그인 없이 읽으실 수 있고, 화면 위쪽 [PDF로 저장]으로 내려받을 수 있습니다.`,
    `${i.base}/d/${i.token}`,
    '이 주소는 받으신 분만 아는 주소입니다. 다른 분께 전달하지 않으시면 됩니다.',
    '읽어 보시고 한 달 방문·가입·유료 손님 숫자 3개와 질문 3개에 답해 주시면, 그 숫자로 다시 계산한 완성본을 무료로 드립니다(1분).',
    '',
    '이 메일은 무료 초안을 신청하신 분께만 보냅니다.',
    `수신 거부: ${i.base}/unsubscribe (또는 이 메일에 "수신 거부"라고 답장) · 개인정보 안내: ${i.base}/privacy`,
  ].join('\n')
}

// ---------- 완성본 입력(순수) ----------
export const SOURCES = ['검색(구글·네이버)', '광고', '소개·입소문', '커뮤니티·SNS', '직접 영업·메일', '잘 모르겠다'] as const
export const PAINS = ['방문하는 사람이 적다', '와서 가입을 안 한다', '가입하고 쓰다 만다', '써 보고 돈은 안 낸다', '어디가 문제인지 모르겠다'] as const
export const TRIED = ['광고', '블로그·콘텐츠', '커뮤니티·제휴', '값 조정', '기능 추가', '아직 없다'] as const
export type Completion = { visits: number; signups: number; paid: number; source: string; pain: string; tried: string[] }

export function parseCompletion(f: Record<string, unknown> & { tried?: unknown }): { ok: true; c: Completion } | { ok: false; code: 'nums' | 'order' | 'choice' } {
  const n = (v: unknown) => { const x = Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isInteger(x) && x >= 0 && x <= 1e9 ? x : null }
  const visits = n(f.visits), signups = n(f.signups), paid = n(f.paid)
  if (visits === null || signups === null || paid === null || visits < 1) return { ok: false, code: 'nums' }
  if (signups > visits || paid > signups) return { ok: false, code: 'order' } // 방문 ≥ 가입 ≥ 유료
  const source = String(f.source ?? ''), pain = String(f.pain ?? '')
  const triedArr = (Array.isArray(f.tried) ? f.tried : f.tried ? [f.tried] : []).map(String)
  if (!(SOURCES as readonly string[]).includes(source) || !(PAINS as readonly string[]).includes(pain)) return { ok: false, code: 'choice' }
  if (triedArr.length === 0 || !triedArr.every((t) => (TRIED as readonly string[]).includes(t))) return { ok: false, code: 'choice' }
  return { ok: true, c: { visits, signups, paid, source, pain, tried: triedArr } }
}

/** 사용자가 준 숫자로만 계산한다(외부 평균·확률 없음). 0 으로 나누지 않는다. */
export function funnel(c: Pick<Completion, 'visits' | 'signups' | 'paid'>) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
  return { visitToSignup: pct(c.signups, c.visits), signupToPaid: pct(c.paid, c.signups), visitToPaid: pct(c.paid, c.visits) }
}

// ---------- DB ----------
const sbx = () => db()

export async function getLead(token: string): Promise<LeadRow | null> {
  if (!TOKEN_RE.test(token)) return null
  const { data, error } = await (await sbx()).from('consult_leads').select('*').eq('token', token).maybeSingle()
  if (error) throw new Error(`리드 조회 실패: ${error.message}`) // 못 읽은 것을 "없음"으로 접지 않는다
  return (data as LeadRow) ?? null
}

export async function leadCounts(ipHash: string, now = new Date()): Promise<{ today: number; ip: number }> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const sb = await sbx()
  const a = await sb.from('consult_leads').select('id', { count: 'exact', head: true }).gte('created_at', since)
  const b = await sb.from('consult_leads').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('ip_hash', ipHash)
  if (a.error || b.error || a.count === null || b.count === null) throw new Error('리드 집계 실패') // 못 센 상한은 열지 않는다
  return { today: a.count, ip: b.count }
}

/** 같은 메일·같은 주소로 24시간 안에 이미 받았으면 그 열람 주소를 돌려준다(중복 생성·비용 방지). */
export async function createLead(i: { email: string; url: string; variant: string; ipHash: string }): Promise<{ token: string; reused: boolean }> {
  const sb = await sbx()
  const since = new Date(Date.now() - 86400000).toISOString()
  const { data: dup } = await sb.from('consult_leads').select('token').eq('email', i.email).eq('url', i.url).neq('status', 'failed').gte('created_at', since).limit(1)
  if (dup?.[0]) return { token: dup[0].token as string, reused: true }
  const { data, error } = await sb.from('consult_leads')
    .insert({ email: i.email, url: i.url, consent_at: new Date().toISOString(), copy_variant: i.variant, ip_hash: i.ipHash })
    .select('token').single()
  if (error || !data) throw new Error(`리드 저장 실패: ${error?.message}`)
  return { token: data.token as string, reused: false }
}

/** 생성 시작 권리를 한 번만 준다(queued 이거나 오래 멈춘 generating). 못 얻으면 false. */
export async function claimGeneration(token: string): Promise<LeadRow | null> {
  const sb = await sbx()
  const stale = new Date(Date.now() - STALE_GEN_MIN * 60000).toISOString()
  const { data, error } = await sb.from('consult_leads')
    .update({ status: 'generating', gen_started_at: new Date().toISOString(), error: null })
    .eq('token', token).or(`status.eq.queued,and(status.eq.generating,gen_started_at.lt.${stale})`).select('*')
  if (error) throw new Error(`생성 선점 실패: ${error.message}`)
  return (data?.[0] as LeadRow) ?? null
}

export async function runDraft(lead: LeadRow, base: string): Promise<void> {
  const sb = await sbx()
  const fail = async (msg: string) => { await sb.from('consult_leads').update({ status: 'failed', error: msg.slice(0, 300) }).eq('token', lead.token) }
  try {
    if (await capExceeded()) return await fail('cost_cap')
    const host = hostOf(lead.url)
    const run = await createRun(leadOwner(lead.token), { kind: 'company', name: host, url: lead.url, oneLiner: `${host} 서비스(주소만 입력됨)` })
    await sb.from('consult_leads').update({ run_id: run.id }).eq('token', lead.token)
    await collectAndStore(run).catch(async (e) => { await setStatus(run.id, 'failed', e instanceof Error ? e.message.slice(0, 300) : 'collect failed'); throw e })
    const fresh = (await getRun(run.id, run.owner_email)) ?? run
    const { token: reportToken } = await composeReport(fresh, 'cold', 'lead')
    await sb.from('consult_leads').update({ status: 'ready', report_token: reportToken, mail_draft: mailDraft({ host, token: lead.token, base }) }).eq('token', lead.token)
  } catch (e) {
    await fail(e instanceof Error ? e.message : 'draft failed')
  }
}

export async function recordEvent(token: string, ev: { type: 'view' | 'depth'; depth?: number }): Promise<void> {
  const sb = await sbx()
  const { data } = await sb.from('consult_leads').select('views,max_depth,first_viewed_at').eq('token', token).maybeSingle()
  if (!data) return
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_viewed_at: now }
  if (ev.type === 'view') { patch.views = (data.views as number) + 1; if (!data.first_viewed_at) patch.first_viewed_at = now }
  else patch.max_depth = Math.max(data.max_depth as number, Math.min(100, Math.max(0, Math.round(ev.depth ?? 0))))
  await sb.from('consult_leads').update(patch).eq('token', token)
}

// ---------- 완성본 ----------
export type CompletionResult = {
  stage: 'arrive' | 'signup' | 'use' | 'pay'; reason: string
  paths: { title: string; why: string; first_step: string }[]
}
const STAGE_LABEL: Record<CompletionResult['stage'], string> = { arrive: '손님이 오지 않는 곳', signup: '와서 가입하지 않는 곳', use: '가입하고 쓰다 마는 곳', pay: '써 보고 돈을 내지 않는 곳' }
export const stageLabel = (s: CompletionResult['stage']) => STAGE_LABEL[s]

export function validateCompletionResult(raw: Record<string, unknown>, nCand: number): CompletionResult {
  const stage = raw.stage as CompletionResult['stage']
  if (!(stage in STAGE_LABEL)) throw new Error('완성본 형식 오류: stage')
  const s = (v: unknown, max: number) => { if (typeof v !== 'string' || !v.trim()) throw new Error('완성본 형식 오류: 빈 문장'); return v.trim().slice(0, max) }
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).slice(0, 3).map((p) => {
    const o = (p ?? {}) as Record<string, unknown>
    return { title: s(o.title, 80), why: s(o.why, 300), first_step: s(o.first_step, 300) }
  })
  if (paths.length < (nCand >= 3 ? 3 : 1)) throw new Error('완성본 형식 오류: 길 개수')
  return { stage, reason: s(raw.reason, 400), paths }
}

const SYS = `당신은 작은 SaaS 팀의 성장 컨설턴트입니다. 쉬운 말로, 짧은 문장으로 씁니다.
입력: 회사 결론서 초안의 요약·"발전 방향 후보", 그리고 대표가 직접 준 숫자(한 달 방문·가입·유료 손님)와 고른 답.
할 일: ① 손님이 새는 곳 하나를 판정(stage: arrive=오지 않음 | signup=와서 가입 안 함 | use=가입 뒤 쓰다 마는 | pay=써 보고 돈 안 냄). 대표가 준 숫자와 "가장 큰 고민"을 근거로 한다.
② 새 손님을 데려올 길 3개를 이 회사의 "손님이 주로 오는 곳"과 "이미 해 본 것"에 맞춰 순서대로(1순위부터) 쓴다. 후보 목록이 있으면 그 안에서 고르고 이미 해 본 것은 뒤로 미루거나 다른 방식으로 바꾼다.
규칙: 대표가 준 숫자 외의 숫자·평균·확률·업계 통계를 만들지 않는다. 숫자를 쓸 때는 대표가 준 숫자나 그 나눗셈만 쓴다. 모르면 모른다고 쓴다. 광고 문구체 금지.
출력은 JSON 하나만: {"stage":"arrive|signup|use|pay","reason":"왜 여기인지 2문장 이내","paths":[{"title":"길 이름","why":"이 회사에 맞는 이유 1~2문장","first_step":"이번 주에 할 첫 일 1문장"}, ... 3개]}`

export async function generateCompletion(lead: LeadRow, c: Completion): Promise<void> {
  const sb = await sbx()
  const fail = async (msg: string) => { await sb.from('consult_leads').update({ completion_status: 'failed' }).eq('token', lead.token); console.error('[lead] completion failed:', msg) }
  try {
    if (await capExceeded()) return await fail('cost_cap')
    const { data: rep } = await sb.from('consult_reports').select('payload').eq('token', lead.report_token ?? '').maybeSingle()
    const p = rep?.payload as ReportPayload | undefined
    const cands = p?.ch3to6?.candidates ?? []
    const f = funnel(c)
    const user = [
      `회사: ${hostOf(lead.url)}`, `초안 한 줄 진단: ${p?.ch1.headline ?? '(없음)'}`,
      `초안의 누수·미개척: ${p?.ch1.leak_or_gap.title ?? ''} — ${p?.ch1.leak_or_gap.detail ?? ''}`,
      `발전 방향 후보:\n${cands.map((x, i) => `${i + 1}. ${x.title} — ${x.what}`).join('\n') || '(없음)'}`,
      `대표가 준 숫자: 한 달 방문 ${c.visits}, 가입 ${c.signups}, 유료 손님 ${c.paid} (방문→가입 ${f.visitToSignup ?? '-'}%, 가입→유료 ${f.signupToPaid ?? '-'}%)`,
      `손님이 주로 오는 곳: ${c.source}`, `가장 큰 고민: ${c.pain}`, `이미 해 본 것: ${c.tried.join(', ')}`,
    ].join('\n')
    const r = await consultLlmJson({ runId: lead.run_id, owner: leadOwner(lead.token), purpose: 'report', tag: 'sonnet', system: SYS, user, maxTokens: 1800 })
    const result = validateCompletionResult(r.data, cands.length)
    await sb.from('consult_leads').update({ completion_result: result, completion_status: 'ready' }).eq('token', lead.token)
  } catch (e) {
    await fail(e instanceof Error ? e.message : 'completion failed')
  }
}

export async function saveCompletion(token: string, c: Completion): Promise<LeadRow | null> {
  const sb = await sbx()
  // 이미 만들었거나 만드는 중이면 덮어쓰지 않는다(재제출로 비용이 반복되지 않게). 실패한 경우만 다시 받는다.
  const { data, error } = await sb.from('consult_leads')
    .update({ completion: c, completion_at: new Date().toISOString(), completion_status: 'generating' })
    .eq('token', token).eq('status', 'ready').or(`completion_status.is.null,completion_status.eq.failed,and(completion_status.eq.generating,completion_at.lt.${new Date(Date.now() - 5 * 60000).toISOString()})`).select('*')
  if (error) throw new Error(`완성본 입력 저장 실패: ${error.message}`)
  return (data?.[0] as LeadRow) ?? null
}
