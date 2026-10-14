// L-20b(남헌 v71f 2026-10-14) — 자동 승인 후보와 감사 표본 추출에서 "영역 외(out-*)"·"소비재 태그" 행을 뺀다.
//
// 왜: 감사 21건 중 오류 3건이 전부 영역 외 버킷(out-founder 2·out-consumer 1)이었다. 영역 안 14/14. 소비재 태그(consumer_material_tags)는
//   판정 대기열과 하위 사용처만 읽고 자동 승인·감사 표본 추출은 읽지 않았다(17번 필립스 에어프라이어).
// 하는 것: 후보·감사 풀에서 제외할 input_id 와 사유를 돌려준다. 이미 승인된 행의 승인 표시·킬스위치 창은 건드리지 않는다(남헌 결정 3).
// 읽지 못하면 "제외 없음"이 아니라 실패다(§7.1) — 호출부가 승인 0건·표본 중단으로 처리한다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/approval-scope-selftest.mjs.

export const OUT_AREA_PREFIX = 'out-'
export const SCOPE_IN_CHUNK = 200

export type ScopeReason = 'out-area' | 'consumer-tag'

/** 제외 사유(순수). 영역 외가 우선. 영역 NULL 은 영역 외가 아니다 — 영역 미부여일 뿐이다. */
export function outOfScopeReason(areaCode: string | null | undefined, consumerTagged: boolean): ScopeReason | null {
  if (typeof areaCode === 'string' && areaCode.startsWith(OUT_AREA_PREFIX)) return 'out-area'
  if (consumerTagged) return 'consumer-tag'
  return null
}

// 최소 쿼리 빌더 모양 — 실제 supabase 클라이언트와 셀프테스트 가짜가 같은 모양을 쓴다.
interface Sb {
  from: (table: string) => any
}

export type ScopeResult =
  | { ok: true; excluded: Map<string, ScopeReason> }
  | { ok: false; error: string }

/** input_id 목록 → 제외할 것과 사유. 못 읽은 단계가 하나라도 있으면 ok:false. */
export async function loadScope(sb: Sb, inputIds: readonly string[]): Promise<ScopeResult> {
  const ids = [...new Set(inputIds)]
  const projectOf = new Map<string, string>()
  for (let i = 0; i < ids.length; i += SCOPE_IN_CHUNK) {
    const { data, error } = await sb.from('analysis_inputs').select('id, project_id').in('id', ids.slice(i, i + SCOPE_IN_CHUNK))
    if (error) return { ok: false, error: `analysis_inputs 조회 실패: ${error.code ?? ''} ${error.message}` }
    for (const r of data ?? []) projectOf.set(r.id, r.project_id)
  }
  const unread = ids.filter((id) => !projectOf.has(id))
  if (unread.length) return { ok: false, error: `원문 행을 못 읽은 input ${unread.length}건(예 ${unread.slice(0, 3).join(', ')}) — 영역을 모른다` }

  const areaOf = new Map<string, string | null>()
  const pids = [...new Set(projectOf.values())]
  for (let i = 0; i < pids.length; i += 100) {
    const { data, error } = await sb.from('analysis_projects').select('id, area_code').in('id', pids.slice(i, i + 100))
    if (error) return { ok: false, error: `analysis_projects 조회 실패: ${error.code ?? ''} ${error.message}` }
    for (const r of data ?? []) areaOf.set(r.id, r.area_code ?? null)
  }
  const unreadProjects = pids.filter((p) => !areaOf.has(p))
  if (unreadProjects.length) return { ok: false, error: `프로젝트 ${unreadProjects.length}건을 못 읽었다 — 영역을 모른다` }

  const tagged = new Set<string>()
  for (let i = 0; i < ids.length; i += SCOPE_IN_CHUNK) {
    const { data, error } = await sb.from('consumer_material_tags').select('input_id').in('input_id', ids.slice(i, i + SCOPE_IN_CHUNK))
    if (error) return { ok: false, error: `consumer_material_tags 조회 실패: ${error.code ?? ''} ${error.message}` }
    for (const r of data ?? []) tagged.add(r.input_id)
  }

  const excluded = new Map<string, ScopeReason>()
  for (const id of ids) {
    const reason = outOfScopeReason(areaOf.get(projectOf.get(id) as string) ?? null, tagged.has(id))
    if (reason) excluded.set(id, reason)
  }
  return { ok: true, excluded }
}
