// consult_runs 접근 — 서버 전용(service_role). 모든 조회는 owner_email 로 거른다(RLS 는 정책 0 이라 앱이 경계다).
import { createClient } from '../supabase/server.ts'

export type Run = {
  id: string
  owner_email: string
  kind: 'company' | 'idea'
  company_name: string | null
  company_url: string | null
  one_liner: string | null
  scenario: string | null
  status: 'new' | 'collecting' | 'diagnosing' | 'done' | 'failed'
  tier: 'free' | 'l1' | 'paid'
  error: string | null
  created_at: string
  // H3(2026-11-14): 무료 진단 입력. null = 옛 run(단계 판단 불가 — full 로 간주, computeStage 참고).
  user_count_band: '0' | '1-50' | '50-500' | '500+' | null
  revenue_band: '0' | '소액' | '중간' | '충분' | null
  launched: boolean | null
}

/** 손실 범위를 그대로 낼지(full), 입력값 기반으로만 낼지(low), 생략하고 고객 확보 블록으로 대체할지(none).
 * 순수 함수 — H3. 사용자 수 0명이면 항상 none(출시 여부와 무관 — "실제 서비스 사용자가 0명인데 1500명을 가정"한다는
 * 지적의 핵심이 바로 이 경우다: 이미 출시했어도 사용자가 0명이면 역시 손실 숫자를 지어낼 근거가 없다).
 * 사용자 1~50명이거나 매출이 0·소액이면 low. 그 외(500명 이상이거나 매출이 충분)는 full.
 * 옛 run(필드가 null)은 입력이 없었던 거라 기존 동작 그대로 full. */
export function computeStage(f: { user_count_band: Run['user_count_band']; revenue_band: Run['revenue_band']; launched: Run['launched'] }): 'none' | 'low' | 'full' {
  if (f.user_count_band == null && f.revenue_band == null && f.launched == null) return 'full'
  if (f.user_count_band === '0') return 'none'
  if (f.user_count_band === '1-50' || f.revenue_band === '0' || f.revenue_band === '소액') return 'low'
  return 'full'
}

export async function db() {
  const sb = await createClient()
  if (!sb) throw new Error('SUPABASE 환경변수 없음')
  return sb
}

export async function createRun(
  owner: string,
  f: {
    kind: 'company' | 'idea'; name: string | null; url: string | null; oneLiner: string | null; scenario?: string | null
    userCountBand?: Run['user_count_band']; revenueBand?: Run['revenue_band']; launched?: Run['launched']
  },
): Promise<Run> {
  const { data, error } = await (await db())
    .from('consult_runs')
    .insert({
      owner_email: owner, kind: f.kind, company_name: f.name, company_url: f.url, one_liner: f.oneLiner, scenario: f.scenario ?? null,
      user_count_band: f.userCountBand ?? null, revenue_band: f.revenueBand ?? null, launched: f.launched ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`run 생성 실패: ${error?.message}`)
  return data as Run
}

export async function getRun(id: string, owner: string): Promise<Run | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await (await db()).from('consult_runs').select('*').eq('id', id).eq('owner_email', owner).maybeSingle()
  if (error) throw new Error(`run 조회 실패: ${error.message}`)
  return (data as Run) ?? null
}

export async function setStatus(id: string, status: Run['status'], error: string | null = null, tier?: Run['tier']) {
  const { error: e } = await (await db())
    .from('consult_runs')
    .update({ status, error, updated_at: new Date().toISOString(), ...(tier ? { tier } : {}) })
    .eq('id', id)
  if (e) throw new Error(`status 갱신 실패: ${e.message}`)
}
