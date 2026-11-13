// v71cm §4 모드 C2 "임시 후보 풀 쿼리" — case_bank_labels(v71ck) 적재 전까지 쓰는 임시 구현.
// yc_companies(subindustry 기저율) × ss_businesses(매출 공개 성공 사례) × failure_ledger(실패 사례)를 느슨하게 묶는다.
// 영구 뷰로 만들지 않는다(임시 — v71ck 완료 후 case_bank_labels 기반으로 교체).
import type { SupabaseClient } from '@supabase/supabase-js'

export type SubindustryBaseRate = { subindustry: string; n: number; inactivePct: number }
export type SuccessCase = { name: string; category: string | null; monthlyRevenue: number | null }
export type FailureCase = { company: string; category: string | null; causePrimary: string | null; lesson: string | null }

/** subindustry 별 기저율(Inactive 비율). n>=30 인 것만(표본 부족 제외). 낮은 순. */
export async function getSubindustryBaseRates(sb: SupabaseClient, maxInactivePct = 25): Promise<SubindustryBaseRate[]> {
  const { data, error } = await sb.rpc('c2_subindustry_base_rates')
  if (error) throw new Error(`기저율 조회 실패: ${error.message}`)
  return ((data ?? []) as { subindustry: string; n: number; inactive_pct: number }[])
    .filter((r) => r.n >= 30 && r.inactive_pct <= maxInactivePct)
    .map((r) => ({ subindustry: r.subindustry, n: r.n, inactivePct: r.inactive_pct }))
}

/** 매출이 공개된 ss_businesses 성공 사례(최대 limit건), 카테고리 키워드로 느슨하게 필터. */
export async function getSuccessCases(sb: SupabaseClient, categoryKeyword: string, limit = 5): Promise<SuccessCase[]> {
  const { data, error } = await sb.from('ss_businesses').select('name,category,est_monthly_revenue_num').not('est_monthly_revenue_num', 'is', null).ilike('category', `%${categoryKeyword}%`).order('est_monthly_revenue_num', { ascending: false }).limit(limit)
  if (error) throw new Error(`성공 사례 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ name: r.name as string, category: r.category as string | null, monthlyRevenue: r.est_monthly_revenue_num as number | null }))
}

/** failure_ledger 실패 사례(최대 limit건), 카테고리 키워드로 느슨하게 필터. */
export async function getFailureCases(sb: SupabaseClient, categoryKeyword: string, limit = 3): Promise<FailureCase[]> {
  const { data, error } = await sb.from('failure_ledger').select('company,category,cause_primary,lesson_one_line').ilike('category', `%${categoryKeyword}%`).limit(limit)
  if (error) throw new Error(`실패 사례 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ company: r.company as string, category: r.category as string | null, causePrimary: r.cause_primary as string | null, lesson: r.lesson_one_line as string | null }))
}

export type C2Pool = { baseRates: SubindustryBaseRate[]; successByCategory: Record<string, SuccessCase[]>; failureByCategory: Record<string, FailureCase[]> }

/** 후보 풀 — 관심 분야 키워드 목록을 받아 기저율 + 성공/실패 사례를 한 번에 모은다. 킬 조건(다리2·4) 적용은 모델 쪽에서 한다(§4-2). */
export async function buildC2Pool(sb: SupabaseClient, categoryKeywords: string[]): Promise<C2Pool> {
  const baseRates = await getSubindustryBaseRates(sb)
  const successByCategory: Record<string, SuccessCase[]> = {}
  const failureByCategory: Record<string, FailureCase[]> = {}
  for (const kw of categoryKeywords) {
    successByCategory[kw] = await getSuccessCases(sb, kw)
    failureByCategory[kw] = await getFailureCases(sb, kw)
  }
  return { baseRates, successByCategory, failureByCategory }
}
