#!/usr/bin/env node
// B레인 ① — 제품 후보 → 임시(provisional) 등록 대상 선별. 남헌 v69(2026-10-13). **꺼진 상태로 출하**, DB 쓰기 없음.
//
// 후보 추출은 기존 scripts/product-name-candidates.mjs(규칙 기반 추출·제외 6갈래·대장)를 그대로 쓴다 — 이 스크립트는 그 결과 행을 받아
// lib/review/provisional.ts 로 고르기만 한다. 등록(INSERT)·승격·폐기는 ② 단계다(이 PR 범위 밖).
//
// 사용법:
//   node scripts/provisional-register.mjs                # --dry(기본): 선별 결과·건너뜀 사유만 콘솔에. 파일 안 씀
//   node scripts/provisional-register.mjs --run          # 리포 변수 PROVISIONAL_REGISTER_ENABLED=true 일 때만 reports/<KST>/provisional-approved.json 을 쓴다. 꺼져 있으면 아무것도 안 쓰고 사유를 낸다
//   --already=1:3,2:10   오늘 이미 임시 등록한 수(영역별) — 상한에서 뺀다(② 단계는 DB 에서 읽어 넘긴다)
//   --date=YYYY-MM-DD    출력 폴더(기본 오늘 KST)
// env: PROVISIONAL_REGISTER_ENABLED=true(--run 에 필요) · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY(후보 추출이 SELECT 만 한다)
//
// 출력 approved 항목은 candidate-register-draft.mjs 의 approved.json 과 같은 모양 + provisional·rule_ver. anchors 는 null(리뷰 속 링크가 공식 앱이라는 보장이 없다 —
// 검증은 ② 단계 몫). 그래서 이 단계의 출력만으로는 수집 타깃이 생기지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PROV_AREA_CAP, PROV_RULE_VER, selectProvisional } from '../lib/review/provisional.ts'
import { kstDate, main as candidatesMain, REPORTS_DIR } from './product-name-candidates.mjs'

export const FLAG = 'PROVISIONAL_REGISTER_ENABLED'

export function parseAlready(s) {
  const out = {}
  if (!s) return out
  for (const part of s.split(',')) {
    const m = /^([1-5]):(\d+)$/.exec(part.trim())
    if (!m) throw new Error(`--already 형식은 영역:수(예: 1:3,2:10): ${part}`)
    out[m[1]] = Number(m[2])
  }
  return out
}

export function toApproved(picked, { date }) {
  return picked.map((r) => ({
    name: r.name,
    norm_key: r.key,
    area: r.area,
    anchors: { appstore_id: null, appstore_country: null, play_pkg: null, domain: null },
    evidence_count: r.posts ?? null,
    provisional: true,
    rule_ver: PROV_RULE_VER,
    proposed_on: date,
  }))
}

/** 후보 행을 주입할 수 있게 둔다(셀프테스트). 못 읽으면 던진다 — 후보 0건을 "선별 0건"으로 접지 않는다(§7.1). */
export async function main(argv, { candidates = candidatesMain, env = process.env, now = new Date(), reportsDir = REPORTS_DIR, log = console.log } = {}) {
  const run = argv.includes('--run')
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const date = opt('date') ?? kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  const alreadyToday = parseAlready(opt('already'))

  const { rows } = await candidates(['--dry'], { now, log: () => {} })
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('후보 행을 못 읽었거나 0건 — 선별하지 않는다')
  const sel = selectProvisional(rows, { areaCap: PROV_AREA_CAP, alreadyToday })

  const enabled = env[FLAG] === 'true'
  log(`${run ? 'RUN' : 'DRY'} ${date} 규칙 ${PROV_RULE_VER} · 후보 ${rows.length} → 임시 등록 대상 ${sel.picked.length}(영역별 ${JSON.stringify(sel.byArea)}) · 상한 ${PROV_AREA_CAP}/영역/일`)
  log(`건너뜀 사유: ${Object.entries(sel.skipped).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(' · ') || '없음'}`)
  for (const r of sel.picked) log(`  - [${r.area}] ${r.name} (${r.key}) · 글 ${r.posts ?? '?'} · 영역 비율 ${Math.round((r.areaShare ?? 0) * 100)}% · 부류 ${r.tier}`)

  if (!run) return { ...sel, written: null, enabled }
  if (!enabled) {
    log(`⏸ ${FLAG} 가 true 가 아니라 파일을 쓰지 않는다(꺼진 상태). 켜는 것은 남헌·역할 세션이 후보 검수를 마친 뒤.`)
    return { ...sel, written: null, enabled }
  }
  if (sel.picked.length === 0) {
    log('선별 0건 — 파일을 쓰지 않는다.')
    return { ...sel, written: null, enabled }
  }
  const file = path.join(reportsDir, date, 'provisional-approved.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = JSON.stringify(toApproved(sel.picked, { date }), null, 2) + '\n'
  fs.writeFileSync(file, body)
  if (fs.readFileSync(file, 'utf8') !== body) throw new Error(`파일 되읽기 불일치: ${file}`) // §7.1 — 썼다고 믿지 않는다
  log(`파일: ${file}`)
  return { ...sel, written: file, enabled }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ provisional-register: ${e.message}`)
    process.exit(1)
  })
}
