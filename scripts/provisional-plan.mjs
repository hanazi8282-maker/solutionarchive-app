#!/usr/bin/env node
// B레인 ② 관찰 모드 — 임시 등록 후보를 앵커 검증하고 안전장치 계획(provisional-plan.ts)으로 "오늘 무엇을 등록할지"를 낸다. DB 쓰기 0건.
//   node --env-file=.env.local scripts/provisional-plan.mjs            # 콘솔 + reports/<KST>/provisional-plan.md
//   node --env-file=.env.local scripts/provisional-plan.mjs --dry      # 파일도 쓰지 않는다
//   --max=20                                                          # 앵커 조회할 후보 수 상한(iTunes 호출, 후보 사이 3초)
// 처음엔 관찰 모드: 쓰기(등록)는 이 스크립트가 하지 않는다. 결과를 보고 대화형 세션이 candidate-register 경로(마이그레이션)로 등록한다.
// 임시 표식: analysis_projects.area_rule_ver = 'prov-v1'(등록) / 'prov-v1:verified'(사람 검증 끝). 상태 판독은 그 표식뿐이다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { PROV_RULE_VER, selectProvisional } from '../lib/review/provisional.ts'
import { planRegistration } from '../lib/review/provisional-plan.ts'
import { lookup } from './anchor-verify.mjs'
import { kstDate, main as candidatesMain, REPORTS_DIR } from './product-name-candidates.mjs'

export const VERIFIED_VER = `${PROV_RULE_VER}:verified`

/** DB → 계획 상태. 읽지 못하면 { error } — 0건으로 접지 않는다(§7.1). */
export async function loadPlanState(sb, today) {
  const { data, error } = await sb.from('analysis_projects').select('area_code, area_rule_ver, created_at').in('area_rule_ver', [PROV_RULE_VER, VERIFIED_VER]).limit(5000)
  if (error) return { error: `${error.code ?? ''} ${error.message}`.trim() }
  if (!Array.isArray(data)) return { error: '응답이 배열이 아니다' }
  const registeredToday = {}
  for (const r of data) {
    const kst = kstDate(new Date(r.created_at))
    if (kst === today && r.area_code) registeredToday[r.area_code] = (registeredToday[r.area_code] ?? 0) + 1
  }
  return {
    state: {
      registeredToday,
      registeredTotal: data.length,
      humanVerifiedTotal: data.filter((r) => r.area_rule_ver === VERIFIED_VER).length,
      audit: null, // 임시 등록분 감사 표본이 아직 없다 — 확인 불가(자동 등록 0)
    },
  }
}

export function renderPlan({ date, state, plan, picked }) {
  const L = [
    `# 임시 등록 계획(관찰 모드) — ${date}`,
    '',
    `규칙 ${PROV_RULE_VER} · 쓰기 0건. 상태: 등록 누계 ${state.registeredTotal} · 사람 검증 ${state.humanVerifiedTotal} · 오늘 등록 ${JSON.stringify(state.registeredToday)} · 킬스위치 ${plan.kill.state}(${plan.kill.reason})`,
    `결과: 자동 등록 ${plan.counts.register} · 사람 확인 대기 ${plan.counts.human_verify} · 제외 ${plan.counts.skip} (선별 ${picked}건 중)`,
    '',
    '| 영역 | 후보 | 판정 | 사유 |',
    '|---|---|---|---|',
    ...plan.decisions.map((d) => `| ${d.area} | ${d.name} | ${d.action} | ${d.reason.replace(/\|/g, '/')} |`),
    '',
  ]
  return L.join('\n')
}

export async function main(argv, { sb, lookupFn = lookup, candidates = candidatesMain, now = new Date(), reportsDir = REPORTS_DIR, log = console.log, sleepMs = 3000 } = {}) {
  const dry = argv.includes('--dry')
  const max = Number(argv.find((a) => a.startsWith('--max='))?.slice(6) ?? 20)
  const date = kstDate(now)
  const { rows } = await candidates(['--dry'], { now, log: () => {} })
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('후보 행을 못 읽었거나 0건 — 계획하지 않는다')
  const sel = selectProvisional(rows)
  const picked = sel.picked.slice(0, max)

  const st = await loadPlanState(sb, date)
  if (st.error) throw new Error(`임시 등록 상태 조회 실패(${st.error}) — 계획하지 않는다(확인 불가를 0건으로 접지 않는다)`)

  const cands = []
  for (const r of picked) {
    const anchor = await lookupFn(r.name)
    cands.push({ ...r, anchor })
    if (sleepMs) await new Promise((res) => setTimeout(res, sleepMs))
  }
  const plan = planRegistration(cands, st.state)
  const md = renderPlan({ date, state: st.state, plan, picked: picked.length })
  log(md)
  let file = null
  if (!dry) {
    file = path.join(reportsDir, date, 'provisional-plan.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, md)
    if (fs.readFileSync(file, 'utf8') !== md) throw new Error(`파일 되읽기 불일치: ${file}`)
  }
  return { plan, state: st.state, picked: picked.length, selected: sel, file }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) {
    console.error('❌ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
    process.exit(2)
  }
  main(process.argv.slice(2), { sb }).catch((e) => {
    console.error(`❌ provisional-plan: ${e.message}`)
    process.exit(1)
  })
}
