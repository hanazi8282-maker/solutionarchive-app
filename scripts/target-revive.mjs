#!/usr/bin/env node
// 비활성 타깃 되살리기 — 두 갈래.
//
// (1) 수동 D8(남헌 v32 §5) — `--run --expect=N --expect-hash=H`. 사람·역할 세션 전용(대량 UPDATE — §10.2 예외 2 / 09-24 4조건).
//     서브에이전트는 돌리지 않는다(DB 금지). 오케스트레이터가 --dry 로 건수·해시를 보고한 뒤 --run.
//     수집 슬롯(UTC 01:43·05:37·09:29·13:19·17:37·20:47, lib/review/ramp.ts COLLECT_SLOTS)을 피해 슬롯 사이에 실행하고,
//     무엇을 몇 건 되살렸는지·롤백 파일 경로는 Notion 일일 상태 로그에 남긴다.
// (2) 재방문 시계(남헌 v48 §2-A, 2026-10-11) — `--auto`. nightly-review-collect 의 수집 직전 pre-step 이 돌린다(CLAUDE.md §10.1 "재방문 시계 되살리기").
//     비증분형(appstore·youtube·naver_blog_post)의 exhausted 중 재방문 간격(revisitDays: 3~14일, 속도 근거)이 지난 것만,
//     소스별 실행당 REVIVE_PER_RUN(6)개 · 회당 타깃 수(tpr) − 현재 active 이내로 active 로 되돌린다. 쓰는 칸은 status 하나(롤백은 status·consecutive_empty).
//     러너는 그 타깃을 "재점검"(첫 페이지부터, 이미 본 지문 5연속이면 다시 닫음)으로 읽는다 — lib/review/runner.ts RECHECK_SEEN_STREAK.
//     롤백·계획 파일을 UPDATE 전에 reports/<KST 날짜>/ 에 쓴다(못 쓰면 UPDATE 안 함). 워크플로가 그 파일을 main 에 올린다.
//
// 대상 공통 = exhausted ∧ enabled 소스 ∧ SUPPLY_EXCLUDED(producthunt·danawa·todayhumor) 아님 ∧ robots 금지 확정 아님.
//   증분형은 consecutive_empty=0 만(D8 — 옛 로직이 "끝까지 읽어서" 닫은 것). 비증분형은 재방문 간격이 지난 것만.
//   소스별 상한 = min(gap, 30% 게이트 여유, googleplay 80 동결). 순서 board: → 그 밖 → url:, 같은 등급은 오래 안 간 순 — lib/review/target-supply.ts planRevive.
//   review_source_ramp 를 못 읽으면(ramp_read=unavailable) 상한 B 가 폴백값이 되므로 거부한다(§7.1).
//
// 사용법:
//   node scripts/target-revive.mjs                                   # --dry(기본): 대상 건수·id 해시·소스별 분포·롤백 SQL. 쓰기 0건
//   node scripts/target-revive.mjs --run --expect=N --expect-hash=H  # 드라이런의 N·H 와 같을 때만. 계획·롤백 파일을 먼저 쓰고 UPDATE
//   node scripts/target-revive.mjs --auto [--dry]                    # 재방문 시계(무인). --dry 면 계획·요약만
//   --rollback-out=<경로>  기본 reports/<KST 날짜>/target-revive-rollback-<시각>.sql (계획 전체는 같은 이름 -plan.sql 로 따로 남는다)
// env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · (선택) GITHUB_STEP_SUMMARY

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  computeSupply, idSetHash, inventoryGauge, NON_INCREMENTAL_SOURCES, planRevive, REVIVE_MIN_EXPECTED_NEW, REVIVE_PER_RUN, REVIVE_TOTAL_PER_RUN,
  revisitRate, rollbackSql,
} from '../lib/review/target-supply.ts'
import { loadSupplyInputs, openDb } from './target-supply.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 파일을 쓰고 되읽어 같은지 본다(§7.1 — 썼다고 믿지 않는다). */
function writeVerified(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
  if (fs.readFileSync(file, 'utf8') !== body) throw new Error(`파일 되읽기 불일치: ${file} — UPDATE 하지 않았다`)
}

/** 소스별 revived/skipped(사유 코드) 마크다운 — 실행 요약용. 요청 0 소스의 사유가 여기 남는다. */
export function reviveSummary(plan, { mode, applied }) {
  const rows = Object.entries(plan.bySource).sort()
  const lines = [
    `## 재방문 시계 되살리기 (${mode}${applied === null ? ' · 쓰기 없음' : ` · 실제 active ${applied}건`})`,
    '',
    ...(rows.length === 0 ? ['- exhausted 후보 없음'] : []),
    ...rows.map(([k, b]) => {
      const sk = Object.entries(b.skipped).map(([r, c]) => `${r} ${c}`).join(', ')
      return `- ${k}: 후보 ${b.candidates} · revived ${b.revive}${sk ? ` · skipped(${sk})` : ''}${b.next_due ? ` · 다음 자격 ${b.next_due}` : ''}`
    }),
    '',
  ]
  return lines.join('\n')
}

/** [자율 공급] 블록 — 브리핑 맨 위 "수집 연료계" 한 줄(fuel_line)과 소스별 재고. 필드를 분리해 둔다(v69 §5). */
export function gaugeMd(g, obs) {
  const lv = { ok: '정상', warn: '경고', urgent: '긴급' }
  return [
    '## [자율 공급]',
    '',
    `- ${g.fuel_line}`,
    ...g.sources.map((x) => `- ${x.source_key}: 즉시 재고 ${x.immediate_days === null ? '순환형(활성 ' + x.active + ')' : x.immediate_days + '일'} · 예약 ${x.reserved_due_now}개 즉시 가능/${x.reserved_waiting}개 대기${x.reserved_next_due ? ` (다음 ${x.reserved_next_due.slice(0, 16)}Z)` : ''} · ${lv[x.level]}`),
    ...(obs === null ? [] : [`- 관찰 모드(증분형 시계, 쓰기 0): 되살렸을 타깃 ${obs.length}개 — 예상 신규 합 ${Math.round(obs.reduce((n, o) => n + o.expected_new, 0))}건. 3일 뒤 실제와 대조`]),
    '',
  ].join('\n')
}

export async function main(argv, { db, now = new Date() } = {}) {
  const auto = argv.includes('--auto')
  const run = argv.includes('--run')
  if (auto && run) throw new Error('--auto 와 --run 은 같이 쓰지 않는다')
  const apply = run || (auto && !argv.includes('--dry'))
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
  // v69 A레인 — 증분형 시계는 기본 관찰 모드(쓰기 0). TARGET_CLOCK_INCREMENTAL=on 일 때만 실제로 되살린다(남헌·역할 세션이 3일 대조 뒤 켠다).
  const incOn = process.env.TARGET_CLOCK_INCREMENTAL === 'on'
  const autoOpts = { perRunCap: REVIVE_PER_RUN, clockOnly: true, minExpectedNew: REVIVE_MIN_EXPECTED_NEW, totalCap: REVIVE_TOTAL_PER_RUN }
  const plan = planRevive(input.targets, report, auto ? { ...autoOpts, clockAll: incOn } : {})
  const observe = argv.includes('--observe') || (auto && !incOn)
  const byId = new Map(input.targets.map((t) => [t.id, t]))
  const obs = observe
    ? planRevive(input.targets, report, { ...autoOpts, clockAll: true }).revive
        .filter((r) => !NON_INCREMENTAL_SOURCES.has(r.source_key))
        .map((r) => {
          const t = byId.get(r.id)
          const lam = revisitRate(t)
          const days = (now.getTime() - Date.parse(t.last_run_at)) / 86_400_000
          return { id: r.id, source_key: r.source_key, product_ref: r.product_ref, total_collected: t.total_collected ?? 0, expected_new: lam === null ? 0 : Math.round(lam * days * 10) / 10 }
        })
    : null
  const gauge = inventoryGauge(report, input.targets, now)
  const obsOut = out.replace(/.sql$/i, '') + '-observe.sql'
  const writeObs = () => {
    if (obs === null || obs.length === 0 || argv.includes('--dry')) return // 관찰 대상 0건이면 파일을 만들지 않는다 — 매 슬롯 빈 커밋 방지
    writeVerified(obsOut, [`-- target-revive 관찰 기록 ${stamp} — 증분형 시계가 켜졌다면 되살렸을 ${obs.length}개. DB 쓰기 0건(롤백 대상 아님).`, '-- 3일 뒤 각 id 의 total_collected 증가분 = 실제 신규. 기록 줄: OBS {json}', ...obs.map((o) => `-- OBS ${JSON.stringify(o)}`), ''].join('\n'))
    log(`관찰 기록: ${obsOut}`)
  }
  const n = plan.revive.length
  const hash = idSetHash(plan.revive.map((r) => r.id))
  const sql = rollbackSql(plan.revive, stamp)
  const mode = auto ? 'auto' : run ? 'run' : 'dry'

  const log = (s) => console.log(s)
  const summarize = (applied) => {
    const md = reviveSummary(plan, { mode, applied }) + '\n' + gaugeMd(gauge, obs)
    log(md)
    log(`GAUGE_JSON ${JSON.stringify({ at: now.toISOString(), below14: gauge.below14, urgent: gauge.urgent, sources: gauge.sources.map((x) => [x.source_key, x.immediate_days, x.level]) })}`)
    if (auto && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
  }
  log(`${mode.toUpperCase()} 되살리기 대상 ${n}건 · 해시 ${hash}${auto ? ` (재방문 시계 · 소스별 실행당 ≤${REVIVE_PER_RUN})` : ' (exhausted ∧ enabled ∧ 제외소스 아님 ∧ min(gap, 게이트 여유))'}`)

  if (!apply) {
    writeObs()
    summarize(null)
    if (!auto) log(`\n실행: node scripts/target-revive.mjs --run --expect=${n} --expect-hash=${hash}`)
    log(`\n-- 롤백 SQL(적용 때 ${path.relative(repoRoot, out)} 에 먼저 쓴다) --\n${sql}`)
    return { n, hash, plan, applied: null, out: null, planOut: null }
  }

  if (run && (Number(expectN) !== n || expectHash !== hash)) {
    throw new Error(`--expect=${expectN}/${expectHash} 인데 지금 대상은 ${n}건/${hash} — 드라이런 뒤 DB 가 바뀌었다. 다시 드라이런하라`)
  }
  if (n === 0) {
    log('대상 0건 — 쓰지 않는다.')
    writeObs()
    summarize(0)
    return { n, hash, plan, applied: { updated: 0 }, out: null, planOut: null }
  }

  // 1) 계획 전체(보존용)와 롤백 파일을 먼저 쓴다. 못 쓰면 UPDATE 하지 않는다.
  writeVerified(planOut, sql)
  writeVerified(out, sql)
  log(`계획 파일: ${planOut}\n롤백 파일: ${out}`)

  // 2) UPDATE — 조건을 다시 건다(그새 바뀐 행은 안 건드린다): status 가 아직 exhausted ∧ consecutive_empty 가 계획 때 값. 실제 바뀐 id 만 센다.
  const updated = []
  try {
    const byCe = new Map()
    for (const r of plan.revive) (byCe.get(r.prev_consecutive_empty) ?? byCe.set(r.prev_consecutive_empty, []).get(r.prev_consecutive_empty)).push(r.id)
    for (const [ce, allIds] of byCe) {
      for (let i = 0; i < allIds.length; i += 100) {
        const ids = allIds.slice(i, i + 100)
        const { data, error } = await sb
          .from('review_targets')
          .update({ status: 'active' })
          .in('id', ids)
          .eq('status', 'exhausted')
          .eq('consecutive_empty', ce)
          .select('id')
        if (error) throw new Error(`UPDATE 실패(ce=${ce}, ${i}~): ${error.message}`)
        updated.push(...data.map((r) => r.id))
      }
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
  writeObs()
  summarize(updated.length)
  return { n, hash, plan, applied: { updated: updated.length }, out, planOut }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ target-revive: ${e.message}`)
    process.exit(1)
  })
}
