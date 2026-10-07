#!/usr/bin/env node
// 비활성 타깃 되살리기(남헌 v32 §5 D8) — `consecutive_empty=0` 인 exhausted 만 active 로.
//
// ⚠️ 사람·역할 세션 전용(대량 UPDATE — §10.2 예외 2 / 09-24 4조건: 드라이런·롤백·무중단·Notion). 무인 루프에 배선하지 않는다.
//    서브에이전트는 돌리지 않는다(DB 금지). 오케스트레이터가 --dry 로 건수를 보고한 뒤 --run.
//
// 대상 = exhausted ∧ consecutive_empty=0 ∧ enabled 소스 ∧ producthunt·danawa·todayhumor 아님.
//   consecutive_empty=0 인데 닫힌 것은 "더 볼 게 없어서"가 아니라 옛 로직이 "끝까지 읽어서" 닫은 것(20260930000006 와 같은 판단).
//   연속 0건으로 닫힌 `url:` 글(댓글이 더 안 붙는 글)은 두고, 그 소스는 board: 등록 처방으로 간다(target-supply remedies).
//   소스별 상한 = min(gap, 30% 게이트 여유, googleplay 80 동결) — lib/review/target-supply.ts planRevive.
//   법적 게이트로 빼지 않는다(남헌 2026-10-07: devto·disquiet·indiehackers·tumblbug·youtube enabled 유지 — 현행 enabled 만 본다).
//
// 사용법:
//   node scripts/target-revive.mjs                     # --dry(기본): 대상 건수·소스별 분포·롤백 SQL 을 출력. 쓰기 0건
//   node scripts/target-revive.mjs --run --expect=N    # 롤백 파일을 먼저 쓰고(되읽어 확인) UPDATE. N 은 드라이런 건수와 같아야 한다
//   --rollback-out=<경로>  기본 reports/<KST 날짜>/target-revive-rollback-<시각>.sql
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { computeSupply, planRevive, rollbackSql } from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function main(argv, { db, now = new Date() } = {}) {
  const run = argv.includes('--run')
  const expectRaw = argv.find((a) => a.startsWith('--expect='))?.slice(9)
  if (run && expectRaw === undefined) throw new Error('--run 은 --expect=<드라이런 건수> 가 필요하다')
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const out =
    argv.find((a) => a.startsWith('--rollback-out='))?.slice(15) ?? path.join(repoRoot, 'reports', kst, `target-revive-rollback-${stamp}.sql`)

  const sb = db ?? (await openDb())
  const input = await loadSupplyInputs(sb, now)
  const report = computeSupply(input)
  const plan = planRevive(input.targets, report)
  const n = plan.revive.length
  const sql = rollbackSql(plan.revive, stamp)

  const log = (s) => console.log(s)
  log(`${run ? 'RUN' : 'DRY'} 되살리기 대상 ${n}건 (exhausted ∧ consecutive_empty=0 ∧ enabled ∧ 제외소스 아님 ∧ min(gap, 게이트 여유))`)
  for (const [k, b] of Object.entries(plan.bySource).sort()) {
    const sk = Object.entries(b.skipped).map(([r, c]) => `${r} ${c}`).join(', ')
    log(`  ${k}: 후보 ${b.candidates} → 되살림 ${b.revive}${sk ? ` (건너뜀: ${sk})` : ''}`)
  }

  if (!run) {
    log(`\n-- 롤백 SQL(--run 때 ${path.relative(repoRoot, out)} 에 먼저 쓴다) --\n${sql}`)
    return { n, plan, applied: null, out: null }
  }

  if (Number(expectRaw) !== n) throw new Error(`--expect=${expectRaw} 인데 지금 대상은 ${n}건 — 드라이런 뒤 DB 가 바뀌었다. 다시 드라이런하라`)
  if (n === 0) {
    log('대상 0건 — 쓰지 않는다.')
    return { n, plan, applied: { updated: 0 }, out: null }
  }

  // 1) 롤백 파일 먼저. 되읽어 같은지 본다(§7.1 — 썼다고 믿지 않는다). 못 쓰면 UPDATE 하지 않는다.
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, sql)
  if (fs.readFileSync(out, 'utf8') !== sql) throw new Error(`롤백 파일 되읽기 불일치: ${out} — UPDATE 하지 않았다`)
  log(`롤백 파일: ${out}`)

  // 2) UPDATE — 조건을 다시 건다(그새 바뀐 행은 안 건드린다). 실제 바뀐 id 만 센다.
  const updated = []
  try {
    for (let i = 0; i < n; i += 100) {
      const ids = plan.revive.slice(i, i + 100).map((r) => r.id)
      const { data, error } = await sb
        .from('review_targets')
        .update({ status: 'active' })
        .in('id', ids)
        .eq('status', 'exhausted')
        .eq('consecutive_empty', 0)
        .select('id')
      if (error) throw new Error(`UPDATE 실패(${i}~): ${error.message}`)
      updated.push(...data.map((r) => r.id))
    }
  } finally {
    // 3) 실제 바뀐 행만 담아 롤백 파일을 다시 쓴다 — 계획엔 있었는데 안 바뀐 행을 롤백이 exhausted 로 되돌리지 않게.
    if (updated.length !== n) {
      const done = new Set(updated)
      fs.writeFileSync(out, rollbackSql(plan.revive.filter((r) => done.has(r.id)), stamp))
      log(`⚠️ 계획 ${n}건 중 실제 ${updated.length}건 — 롤백 파일을 실제 행으로 다시 썼다`)
    }
  }
  log(`UPDATE 완료: ${updated.length}건 active. 롤백: ${out}`)
  return { n, plan, applied: { updated: updated.length }, out }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ target-revive: ${e.message}`)
    process.exit(1)
  })
}
