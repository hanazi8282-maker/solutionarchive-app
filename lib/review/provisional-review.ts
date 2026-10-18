// ⑨ 임시 등록 → 정식 승격·폐기 판정(순수 함수). v71au. DB·파일을 건드리지 않는다.
// 관련성 판정이 PROMOTE_MIN_JUDGED 건 이상 쌓인 임시 프로젝트만 본다: 관련 비율 ≥ PROMOTE_MIN_RATIO → 승격, 미만 → 폐기.
// 아직 덜 쌓인 것은 wait — 판정 못 한 것을 폐기로 접지 않는다(§7.1). 정지: 최근 결정 STOP_MIN_DECIDED 건 이상이고 폐기 비율이 STOP_DISCARD_RATE 초과.
export const PROMOTE_MIN_JUDGED = 20
export const PROMOTE_MIN_RATIO = 0.5
export const STOP_MIN_DECIDED = 20
export const STOP_DISCARD_RATE = 0.2

export type ProvProject = { id: string; name: string; judged: number; relevant: number }
export type ProvAction = 'promote' | 'discard' | 'wait'
export type ProvDecision = ProvProject & { action: ProvAction; ratio: number | null; reason: string }

export function decideProvisional(projects: ProvProject[], recentDecided: { promoted: number; discarded: number } = { promoted: 0, discarded: 0 }) {
  const n = recentDecided.promoted + recentDecided.discarded
  const stopped = n >= STOP_MIN_DECIDED && recentDecided.discarded / n > STOP_DISCARD_RATE
  const decisions: ProvDecision[] = projects.map((p) => {
    if (p.judged < PROMOTE_MIN_JUDGED) return { ...p, action: 'wait', ratio: null, reason: `판정 ${p.judged}건 < ${PROMOTE_MIN_JUDGED} — 더 쌓인 뒤` }
    const ratio = p.relevant / p.judged
    if (stopped) return { ...p, action: 'wait', ratio, reason: '자동 정지(최근 폐기 비율 초과) — 사람 확인 전까지 결정 보류' }
    return ratio >= PROMOTE_MIN_RATIO
      ? { ...p, action: 'promote', ratio, reason: `관련 ${(ratio * 100).toFixed(0)}% ≥ ${PROMOTE_MIN_RATIO * 100}%` }
      : { ...p, action: 'discard', ratio, reason: `관련 ${(ratio * 100).toFixed(0)}% < ${PROMOTE_MIN_RATIO * 100}%` }
  })
  return { decisions, stopped, counts: { promote: decisions.filter((d) => d.action === 'promote').length, discard: decisions.filter((d) => d.action === 'discard').length, wait: decisions.filter((d) => d.action === 'wait').length } }
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
/** 결정 → 적용 SQL + 롤백 SQL. 승격 = analysis_projects.area_rule_ver 'prov-v1'→'prov-v1:promoted', 폐기 = 그 프로젝트의 active 타깃을 exhausted 로(되돌림 가능). */
export function renderReviewSql(decisions: ProvDecision[]) {
  const pro = decisions.filter((d) => d.action === 'promote').map((d) => q(d.id))
  const dis = decisions.filter((d) => d.action === 'discard').map((d) => q(d.id))
  const apply: string[] = []
  const rollback: string[] = []
  if (pro.length) {
    apply.push(`UPDATE public.analysis_projects SET area_rule_ver = 'prov-v1:promoted' WHERE area_rule_ver = 'prov-v1' AND id IN (${pro.join(', ')});`)
    rollback.push(`UPDATE public.analysis_projects SET area_rule_ver = 'prov-v1' WHERE area_rule_ver = 'prov-v1:promoted' AND id IN (${pro.join(', ')});`)
  }
  if (dis.length) {
    apply.push(`UPDATE public.review_targets SET status = 'exhausted' WHERE status = 'active' AND project_id IN (${dis.join(', ')});`)
    rollback.push(`UPDATE public.review_targets SET status = 'active' WHERE status = 'exhausted' AND project_id IN (${dis.join(', ')});  -- 폐기 직전 active 였던 타깃만 해당(롤백 전 total_collected 변화 확인)`)
  }
  return { apply: apply.join('\n'), rollback: rollback.join('\n') }
}
