// consult_runs 접근 — 서버 전용(service_role). 모든 조회는 owner_email 로 거른다(RLS 는 정책 0 이라 앱이 경계다).
import { createClient } from '@/lib/supabase/server'

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
}

export async function db() {
  const sb = await createClient()
  if (!sb) throw new Error('SUPABASE 환경변수 없음')
  return sb
}

export async function createRun(
  owner: string,
  f: { kind: 'company' | 'idea'; name: string | null; url: string | null; oneLiner: string | null; scenario?: string | null },
): Promise<Run> {
  const { data, error } = await (await db())
    .from('consult_runs')
    .insert({ owner_email: owner, kind: f.kind, company_name: f.name, company_url: f.url, one_liner: f.oneLiner, scenario: f.scenario ?? null })
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
