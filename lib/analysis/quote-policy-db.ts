// 고객 화면 인용의 조회 두 가지 — 소스별 인용 정책 맵 · 인용 원문 대조용 입력 원문(설계 v22 §3-2).
// 거르는 규칙은 evidence-quotes.ts publicLines 한 벌이다. 여기는 읽기만 한다.
//
// ★ 둘 다 "못 읽음 = null" 이다. null 을 받은 publicLines 는 인용을 0건 낸다(§7.1 — 확인 불가를 허용으로 접지 않는다).
// ★ 정책 맵은 QUOTE_POLICY_COLUMN_READY(lib/signals/feed.ts) 한 스위치를 /voc 와 같이 따른다. false 면 읽지 않고 null
//   — 고객 화면 인용 전체를 한 손잡이로 켜고 끈다(컬럼 적용 확인 뒤 오케스트레이터가 켠다).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { QUOTE_POLICY_COLUMN_READY } from '../signals/feed.ts'
import { quoteProbeTokens, type EvidenceQuote } from './evidence-quotes.ts'

/** review_sources.key → quote_policy 원값. null = 못 읽음(플래그 꺼짐·컬럼 없음·조회 실패). 행은 수십 개라 캐시 없이 요청당 1회. */
export async function loadQuotePolicies(
  sb: SupabaseClient,
  where: string,
  ready: boolean = QUOTE_POLICY_COLUMN_READY,
): Promise<Map<string, unknown> | null> {
  if (!ready) return null
  const r = await sb.from('review_sources').select('key, quote_policy')
  if (r.error) {
    console.error(`[${where}] review_sources quote_policy select error:`, r.error.code ?? '', r.error.message)
    return null
  }
  return new Map(((r.data ?? []) as { key: string; quote_policy: unknown }[]).map((s) => [s.key, s.quote_policy]))
}

/** 원문 묶음 키 — 같은 프로젝트·같은 소스의 입력 원문끼리만 대조한다(다른 소스 원문으로 정책을 갈아타지 못하게). */
export const sourceGroupKey = (projectId: string, sourceKey: string) => `${projectId} ${sourceKey}`

/** 한 요청에 담는 검색 패턴 수 — URL 길이(한글은 글자당 9바이트로 인코딩된다) 안에 들게. */
const PROBES_PER_QUERY = 20
/** 요청당 행 상한(PostgREST max-rows 와 같다). 차면 일부 인용이 대조 실패로 빠질 수 있다 — 로그로 남긴다(§7.2). */
const ROWS_PER_QUERY = 1000

/**
 * 인용들의 원문 후보를 읽는다 → sourceGroupKey(project, source) → raw_text[].
 * 인용 앞머리 낱말로 ilike 검색해 후보만 받는다(프로젝트 원문 전체를 받지 않는다). 후보가 많이 걸려도 괜찮다 —
 * 원문 일치 판정은 checkQuote 가 JS 에서 다시 한다. 정책 맵이 없거나 대조할 인용이 없으면 조회하지 않는다.
 * null = 조회 실패(한 묶음이라도) — 일부만 읽은 원문으로 대조하지 않는다.
 */
export async function loadQuoteSources(
  sb: SupabaseClient,
  items: readonly { project_id: string; quotes: readonly (EvidenceQuote | { text?: string | null; source_key?: string | null } | null | undefined)[] | null | undefined }[],
  policies: ReadonlyMap<string, unknown> | null,
  where: string,
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>()
  if (!policies) return out
  const probes = new Set<string>()
  const projectIds = new Set<string>()
  const keys = new Set<string>()
  for (const it of items) {
    for (const q of it.quotes ?? []) {
      const key = typeof q?.source_key === 'string' ? q.source_key : null
      // 정책이 none·모름인 소스는 어차피 인용을 못 낸다 — 원문을 읽지 않는다.
      if (!key || !['full', 'short_only'].includes(String(policies.get(key)))) continue
      const tokens = quoteProbeTokens(q?.text)
      if (tokens.length === 0) continue
      probes.add(`%${tokens.join('%')}%`)
      projectIds.add(it.project_id)
      keys.add(key)
    }
  }
  if (probes.size === 0) return out
  const all = [...probes]
  const chunks: string[][] = []
  for (let i = 0; i < all.length; i += PROBES_PER_QUERY) chunks.push(all.slice(i, i + PROBES_PER_QUERY))
  const results = await Promise.all(chunks.map((c) => sb
    .from('analysis_inputs')
    .select('project_id, source_key, raw_text')
    .in('project_id', [...projectIds])
    .in('source_key', [...keys])
    .or(c.map((p) => `raw_text.ilike."${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(','))
    .limit(ROWS_PER_QUERY)))
  for (const r of results) {
    if (r.error) {
      console.error(`[${where}] analysis_inputs quote-source select error:`, r.error.code ?? '', r.error.message)
      return null
    }
    const rows = (r.data ?? []) as { project_id: string; source_key: string | null; raw_text: string | null }[]
    if (rows.length >= ROWS_PER_QUERY) console.warn(`[${where}] quote-source rows hit cap ${ROWS_PER_QUERY} — some quotes may fail verbatim check`)
    for (const row of rows) {
      if (!row.source_key || typeof row.raw_text !== 'string') continue
      const k = sourceGroupKey(row.project_id, row.source_key)
      out.set(k, [...(out.get(k) ?? []), row.raw_text])
    }
  }
  return out
}
