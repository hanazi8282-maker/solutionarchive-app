#!/usr/bin/env node
// docs/strategy-principles.md §22 표 → strategy_principles 테이블 동기화 (결정 C).
//
//   node --env-file=.env.local scripts/strategy-principles-sync.mjs           # 동기화
//   node --env-file=.env.local scripts/strategy-principles-sync.mjs --dry-run # 파싱만
//
// 정본은 md 표다. 표에 행이 추가될 때마다 이 스크립트를 재실행하면 sp_id 기준
// upsert 로 반영된다 (재실행 가능). 표는 구조가 고정돼 있어 자유 텍스트 NLP 가
// 필요 없다 — 파이프 구분 파서면 충분하다.
//
// 종료 코드: 0 성공 / 1 파싱·검증 실패 / 2 DB 조회·쓰기 실패(확인 불가)

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MD_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'strategy-principles.md')
const GRADES = new Set(['A', 'B', 'C', 'D'])

/**
 * md 표 텍스트 → 원칙 행 배열. 순수 함수 — 셀프테스트가 이걸 쓴다.
 * 표 헤더(`| ID | 태그 | ...`)와 구분선(`|---|`)은 건너뛴다.
 * 행 형식이 어긋나면 throw — 조용히 건너뛰지 않는다(§7.1: 확인 불가를 정상으로 접지 않는다).
 */
export function parseStrategyTable(md) {
  const rows = []
  const seen = new Set()
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim())
    if (cells.length < 5) continue
    const [id, tagsRaw, statement, gradeRaw, sourceRef] = cells

    if (!/^SP-\d{3}$/.test(id)) continue // 헤더·구분선·설명행

    if (seen.has(id)) throw new Error(`중복 ID: ${id}`)
    seen.add(id)

    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    if (tags.length === 0) throw new Error(`${id}: 태그가 비었다`)
    if (!statement) throw new Error(`${id}: 진술이 비었다`)

    const grade = (gradeRaw.match(/^([ABCD])\b/) ?? [])[1]
    if (!grade || !GRADES.has(grade)) throw new Error(`${id}: evidence_grade 가 A/B/C/D 로 시작하지 않는다 ("${gradeRaw}")`)
    const noteMatch = gradeRaw.match(/\(([^)]*)\)/)
    const evidence_grade_note = noteMatch ? noteMatch[1].trim() : null

    if (!sourceRef) throw new Error(`${id}: 출처가 비었다`)

    rows.push({ sp_id: id, tags, statement, evidence_grade: grade, evidence_grade_note, source_ref: sourceRef })
  }
  if (rows.length === 0) throw new Error('표에서 SP 행을 하나도 못 읽었다 — md 형식이 바뀌었나')
  return rows
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  let md
  try {
    md = fs.readFileSync(MD_PATH, 'utf8')
  } catch (e) {
    console.error(`❌ ${MD_PATH} 읽기 실패: ${e.message}`)
    process.exit(1)
  }

  let rows
  try {
    rows = parseStrategyTable(md)
  } catch (e) {
    console.error(`❌ 파싱 실패: ${e.message}`)
    process.exit(1)
  }
  console.log(`## strategy-principles 동기화 ${dryRun ? '(dry-run)' : ''}`)
  console.log(`- 파싱 ${rows.length}건: ${rows.map((r) => r.sp_id).join(', ')}`)

  if (dryRun) {
    console.log('\n' + JSON.stringify(rows, null, 2))
    return
  }

  const { createClient } = await import('../lib/supabase/server.ts')
  let supabase
  try {
    supabase = await createClient()
  } catch (e) {
    console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`)
    process.exit(2)
  }
  if (!supabase) {
    console.error('⚠️ 확인 불가: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    process.exit(2)
  }

  const { error } = await supabase
    .from('strategy_principles')
    .upsert(rows, { onConflict: 'sp_id' })
  if (error) {
    console.error(`⚠️ upsert 실패 — ${error.code ?? ''} ${error.message}`)
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.error('   마이그레이션 20260910000005_strategy_principles 미적용. 대시보드에서 적용 (§10.1).')
    }
    process.exit(2)
  }

  // 실제로 들어갔는지 되읽어 확인한다 (§7.1: 에러 없음 != 반영됨).
  const { data: check, error: readErr } = await supabase
    .from('strategy_principles')
    .select('sp_id')
    .order('sp_id')
  if (readErr) {
    console.error(`⚠️ 재조회 실패 — ${readErr.message}`)
    process.exit(2)
  }
  const got = new Set((check ?? []).map((r) => r.sp_id))
  const missing = rows.filter((r) => !got.has(r.sp_id)).map((r) => r.sp_id)
  if (missing.length) {
    console.error(`❌ upsert 후에도 없는 행: ${missing.join(', ')}`)
    process.exit(2)
  }
  console.log(`- 반영 확인: DB 에 ${got.size}건 (표 ${rows.length}건 전부 포함)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
