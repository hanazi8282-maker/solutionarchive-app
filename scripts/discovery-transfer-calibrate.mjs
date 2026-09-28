#!/usr/bin/env node
// 이식성 판정자 교정 — 사람 라벨 9건과 대조하고, 대기 중 14건의 판정을 뽑는다. DB 없음.
//
// 라벨(2026-09-29 오케스트레이터가 prod 에서 확인한 사람 결정, SaaS · VOC 통과분):
//   kept   Pinboard · Loom · Typeform · Roam Research
//   killed Metabase · Retool · Superhuman · Tailscale · Fly.io  (Fly.io 는 이름 충돌로 죽였을 수 있다 — 약한 라벨)
//
// 출시 규칙: 9건 중 ≥7 정답 **그리고** kept 4건 중 fail ≤1 → DEFAULT_GATE_MODE='on', 아니면 'shadow'.
// 확인 불가(unverified)는 **정답으로 세지 않는다**(§7.1) — kept 에 대한 unverified 는 on 모드에서 적재를
// 막으므로 "kept 기각" 쪽으로도 센다.
//
// 사용법: node scripts/discovery-transfer-calibrate.mjs [--only=labels|pending] [--runs=N]
//   로컬: CLAUDE_CLI_PATH 에 claude 경로를 주거나 PATH 의 claude 를 쓴다. 토큰이 없으면 로그인된 설정을 쓴다.

import { execFileSync } from 'node:child_process'
import { judgeTransfer } from './discovery-run.mjs'
import { resolveClaudeBinary } from '../lib/insight/claude-cli.ts'

const LABELED = [
  ['Pinboard', 'kept'], ['Loom', 'kept'], ['Typeform', 'kept'], ['Roam Research', 'kept'],
  ['Metabase', 'killed'], ['Retool', 'killed'], ['Superhuman', 'killed'], ['Tailscale', 'killed'], ['Fly.io', 'killed'],
]
const PENDING = ['PostHog', 'Buffer', 'Ghost', 'Cal.com', 'Sentry', 'Baremetrics', 'Postmark', 'Gumroad',
  'Basecamp', 'ConvertKit', 'Stripe', 'Figma', '1Password', 'Datadog']

const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'all'
const runs = Number(args.find((a) => a.startsWith('--runs='))?.slice(7) ?? 1)

async function bin() {
  if (process.env.CLAUDE_CLI_PATH) return (await resolveClaudeBinary()).path
  const which = process.platform === 'win32' ? 'where' : 'which'
  return execFileSync(which, ['claude'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
}

/** 동시 4개. 23건을 한 줄로 돌리면 몇 분 걸린다. */
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

const b = await bin()
console.log(`claude: ${b} / runs=${runs}`)

const names = [
  ...(only !== 'pending' ? LABELED.map(([n]) => n) : []),
  ...(only !== 'labels' ? PENDING : []),
]
const jobs = names.flatMap((name) => Array.from({ length: runs }, (_, r) => ({ name, r })))
const res = await pool(jobs, 4, async ({ name, r }) => ({ name, r, t: await judgeTransfer({ name, categoryHint: null, homepageUrl: null }, { bin: b }) }))
const byName = (n) => res.filter((x) => x.name === n).map((x) => x.t)

if (only !== 'pending') {
  console.log('\n── 라벨 대조 ──')
  let correct = 0, keptBlocked = 0, total = 0
  const cm = { 'kept→pass': 0, 'kept→fail': 0, 'kept→unverified': 0, 'killed→pass': 0, 'killed→fail': 0, 'killed→unverified': 0 }
  for (const [n, label] of LABELED) {
    for (const t of byName(n)) {
      total++
      cm[`${label}→${t.state}`]++
      if ((label === 'kept' && t.state === 'pass') || (label === 'killed' && t.state === 'fail')) correct++
      if (label === 'kept' && t.state !== 'pass') keptBlocked++
      console.log(`${label === 'kept' ? '유지' : '무효'} ${n}: ${t.state} [${t.foundingScale}] — ${t.lesson ?? t.reason}`)
    }
  }
  for (const [k, v] of Object.entries(cm)) console.log(`  ${k}: ${v}`)
  const need = Math.ceil((7 / 9) * total)
  const keptMax = runs // kept 4건 × runs 중 1건분
  const on = correct >= need && keptBlocked <= keptMax
  console.log(`정답 ${correct}/${total} (기준 ≥${need}) · kept 차단 ${keptBlocked} (기준 ≤${keptMax}) → 권고 모드: ${on ? 'on' : 'shadow'}`)
}

if (only !== 'labels') {
  console.log('\n── 대기 14건 ──')
  for (const n of PENDING) {
    for (const t of byName(n)) console.log(`${n}: ${t.state} [${t.foundingScale}] — ${t.lesson ?? ''}${t.lesson ? ' / ' : ''}${t.reason}`)
  }
}
