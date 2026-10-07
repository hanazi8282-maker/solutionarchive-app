#!/usr/bin/env node
// 비활성 타깃 되살리기(남헌 v32 §5 D8) — `consecutive_empty=0` 인 exhausted 만 active 로.
//
// ⚠️ 사람·역할 세션 전용(대량 UPDATE — §10.2 예외 2 / 09-24 4조건: 드라이런·롤백·무중단·Notion). 무인 루프에 배선하지 않는다.
//    서브에이전트는 돌리지 않는다(DB 금지). 오케스트레이터가 --dry 로 건수·해시를 보고한 뒤 --run.
// ⚠️ 수집 슬롯(UTC 01:43·05:37·09:29·13:19·17:37·20:47, lib/review/ramp.ts COLLECT_SLOTS)을 피해 슬롯 사이에 실행하고,
//    무엇을 몇 건 되살렸는지·롤백 파일 경로는 Notion 일일 상태 로그에 남긴다(§10.2 4조건).
//
// 대상 = exhausted ∧ consecutive_empty=0 ∧ enabled 소스 ∧ producthunt·danawa·todayhumor 아님.
//   consecutive_empty=0 인데 닫힌 것은 증분형 소스에서는 옛 로직이 "끝까지 읽어서" 닫은 것(20260930000006 와 같은 판단).
//   ⚠️ 비증분형(appstore·youtube 등, NON_INCREMENTAL_SOURCES)은 그게 정상 종료다 — 피드 전체를 다시 읽어 중복만 나온다(v37, 2026-10-08 실측).
//      그래서 last_run_at + max(1/v, 7)일이 지난 것만 되살린다. 덜 지났으면 revisit_not_due, last_run_at 이 없으면 revisit_unknown.
//   연속 0건으로 닫힌 `url:` 글(댓글이 더 안 붙는 글)은 두고, 그 소스는 board: 등록 처방으로 간다(target-supply remedies).
//   소스별 상한 = min(gap, 30% 게이트 여유, googleplay 80 동결). 순서 board: → 그 밖 → url: — lib/review/target-supply.ts planRevive.
//   법적 게이트로 빼지 않는다(남헌 2026-10-07: devto·disquiet·indiehackers·tumblbug·youtube enabled 유지 — 현행 enabled 만 본다).
//   review_source_ramp 를 못 읽으면(ramp_read=unavailable) 상한 B 가 폴백값이 되므로 거부한다(§7.1).
//
// 사용법:
//   node scripts/target-revive.mjs                                   # --dry(기본): 대상 건수·id 해시·소스별 분포·롤백 SQL. 쓰기 0건
//   node scripts/target-revive.mjs --run --expect=N --expect-hash=H  # 드라이런의 N·H 와 같을 때만. 계획·롤백 파일을 먼저 쓰고 UPDATE
//   --rollback-out=<경로>  기본 reports/<KST 날짜>/target-revive-rollback-<시각>.sql (계획 전체는 같은 이름 -plan.sql 로 따로 남는다)
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { computeSupply, idSetHash, planRevive, revisitDays, rollbackSql } from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 파일을 쓰고 되읽어 같은지 본다(§7.1 — 썼다고 믿지 않는다). */
function writeVerified(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
  if (fs.readFileSync(file, 'utf8') !== body) throw new Error(`파일 되읽기 불일치: ${file} — UPDATE 하지 않았다`)
}

export async function main(argv, { db, now = new Date() } = {}) {
  const run = argv.includes('--run')
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const expectN = opt('expect')
  const expectHash = opt('expect-hash')
  if (run && (expectN === undefined || !expectHash)) throw new Error('--run 은 --expect=<드라이런 건수> --expect-hash=<드라이런 해시> 가 필요하다')
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const out = opt('rollback-out') ?? path.join(repoRoot, 'reports', kst, `target-revive-rollback-${stamp}.sql`)
  const planOut = out.replace(/\.sql$/i, '') + '-plan.sql'

  const sb = db ?? (await openDb())
  const input = await loadSupplyInputs(sb, now)
  const report = computeSupply(input)
  if (report.ramp_read !== 'ok') throw new Error('review_source_ramp 확인 불가(ramp_read=unavailable) — 상한이 폴백값이라 되살리지 않는다')
  const plan = planRevive(input.targets, report)
  const n = plan.revive.length
  const hash = idSetHash(plan.revive.map((r) => r.id))
  const sql = rollbackSql(plan.revive, stamp)

  const log = (s) => console.log(s)
  log(`${run ? 'RUN' : 'DRY'} 되살리기 대상 ${n}건 · 해시 ${hash} (exhausted ∧ consecutive_empty=0 ∧ enabled ∧ 제외소스 아님 ∧ min(gap, 게이트 여유))`)
  for (const [k, b] of Object.entries(plan.bySource).sort()) {
    const sk = Object.entries(b.skipped).map(([r, c]) => `${r} ${c}`).join(', ')
    log(`  ${k}: 후보 ${b.candidates} → 되살림 ${b.revive}${sk ? ` (건너뜀: ${sk})` : ''}`)
    if (b.skipped.revisit_not_due) {
      log(`    재방문 간격 미경과로 건너뜀 ${b.skipped.revisit_not_due}건 · 다음 자격 ${b.next_due} (last_run_at + ${revisitDays(k)}일)`)
    }
  }

  if (!run) {
    log(`\n실행: node scripts/target-revive.mjs --run --expect=${n} --expect-hash=${hash}`)
    log(`\n-- 롤백 SQL(--run 때 ${path.relative(repoRoot, out)} 에 먼저 쓴다) --\n${sql}`)
    return { n, hash, plan, applied: null, out: null, planOut: null }
  }

  if (Number(expectN) !== n || expectHash !== hash) {
    throw new Error(`--expect=${expectN}/${expectHash} 인데 지금 대상은 ${n}건/${hash} — 드라이런 뒤 DB 가 바뀌었다. 다시 드라이런하라`)
  }
  if (n === 0) {
    log('대상 0건 — 쓰지 않는다.')
    return { n, hash, plan, applied: { updated: 0 }, out: null, planOut: null }
  }

  // 1) 계획 전체(보존용)와 롤백 파일을 먼저 쓴다. 못 쓰면 UPDATE 하지 않는다.
  writeVerified(planOut, sql)
  writeVerified(out, sql)
  log(`계획 파일: ${planOut}\n롤백 파일: ${out}`)

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
    // 3) 롤백 파일은 실제 바뀐 행만 — 계획엔 있었는데 안 바뀐 행을 롤백이 exhausted 로 되돌리지 않게. 계획 파일은 그대로 남는다.
    if (updated.length !== n) {
      const done = new Set(updated)
      fs.writeFileSync(out, rollbackSql(plan.revive.filter((r) => done.has(r.id)), stamp))
      log(`⚠️ 계획 ${n}건 중 실제 ${updated.length}건 — 롤백 파일을 실제 행으로 다시 썼다(계획 전체는 ${planOut})`)
    }
  }
  log(`UPDATE 완료: ${updated.length}건 active. 롤백: ${out}`)
  return { n, hash, plan, applied: { updated: updated.length }, out, planOut }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ target-revive: ${e.message}`)
    process.exit(1)
  })
}
