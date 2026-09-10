#!/usr/bin/env node
// docs/failed-angles.md 표 → failed_angles 테이블 동기화 (§13-2 / §17-3).
//
//   node --env-file=.env.local scripts/failed-angles-sync.mjs           # 동기화
//   node --env-file=.env.local scripts/failed-angles-sync.mjs --dry-run # 파싱만
//
// 정본은 md 표다. 표에 행이 추가될 때마다 이 스크립트를 재실행하면 case_key
// 기준 upsert 로 반영된다(재실행 가능). scripts/strategy-principles-sync.mjs 와
// 같은 패턴 — 표는 구조가 고정돼 있어 파이프 구분 파서면 충분하다.
//
// 종료 코드: 0 성공 / 1 파싱·검증 실패 / 2 DB 조회·쓰기 실패(확인 불가)

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const MD_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'failed-angles.md')

/**
 * md 표 텍스트 → 실패 앵글 행 배열. 순수 함수 — 셀프테스트가 이걸 쓴다.
 * 표 헤더(`| case_key | ...`)와 구분선(`|---|`)은 건너뛴다.
 * 행 형식이 어긋나면 throw — 조용히 건너뛰지 않는다(§7.1: 확인 불가를 정상으로 접지 않는다).
 */
export function parseFailedAnglesTable(md) {
  const rows = []
  const seen = new Set()
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim())
    if (cells.length < 7) continue
    const [caseKey, productCategory, claimedAngle, outcome, evidenceSource, sourceTier, isEstimateRaw] = cells

    // 헤더·구분선(`---`)·설명행은 건너뛴다. 구분선은 하이픈만으로 이뤄지므로
    // "하이픈만 있는 건 안 됨"을 형식에 넣어 case_key 형식과 동시에 걸러낸다.
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(caseKey)) continue

    if (seen.has(caseKey)) throw new Error(`중복 case_key: ${caseKey}`)
    seen.add(caseKey)

    if (!productCategory) throw new Error(`${caseKey}: product_category 가 비었다`)
    if (!claimedAngle) throw new Error(`${caseKey}: claimed_angle 이 비었다`)
    if (!outcome) throw new Error(`${caseKey}: outcome 이 비었다`)
    if (!evidenceSource) throw new Error(`${caseKey}: evidence_source 가 비었다`)
    if (!sourceTier) throw new Error(`${caseKey}: source_tier 가 비었다`)

    const isEstimateNorm = isEstimateRaw.trim().toLowerCase()
    if (isEstimateNorm !== 'true' && isEstimateNorm !== 'false') {
      throw new Error(`${caseKey}: is_estimate 는 true/false 여야 한다 ("${isEstimateRaw}")`)
    }

    rows.push({
      case_key: caseKey,
      product_category: productCategory,
      claimed_angle: claimedAngle,
      outcome,
      evidence_source: evidenceSource,
      source_tier: sourceTier,
      is_estimate: isEstimateNorm === 'true',
    })
  }
  if (rows.length === 0) throw new Error('표에서 실패 앵글 행을 하나도 못 읽었다 — md 형식이 바뀌었나')
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
    rows = parseFailedAnglesTable(md)
  } catch (e) {
    console.error(`❌ 파싱 실패: ${e.message}`)
    process.exit(1)
  }
  console.log(`## failed-angles 동기화 ${dryRun ? '(dry-run)' : ''}`)
  console.log(`- 파싱 ${rows.length}건: ${rows.map((r) => r.case_key).join(', ')}`)

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
    .from('failed_angles')
    .upsert(rows, { onConflict: 'case_key' })
  if (error) {
    console.error(`⚠️ upsert 실패 — ${error.code ?? ''} ${error.message}`)
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.error('   마이그레이션 20260911000003_failed_angles 미적용. 대시보드에서 적용 (§10.1).')
    }
    process.exit(2)
  }

  // 실제로 들어갔는지 되읽어 확인한다 (§7.1: 에러 없음 != 반영됨).
  const { data: check, error: readErr } = await supabase
    .from('failed_angles')
    .select('case_key')
    .order('case_key')
  if (readErr) {
    console.error(`⚠️ 재조회 실패 — ${readErr.message}`)
    process.exit(2)
  }
  const got = new Set((check ?? []).map((r) => r.case_key))
  const missing = rows.filter((r) => !got.has(r.case_key)).map((r) => r.case_key)
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
