#!/usr/bin/env node
// 야간 extract 수동 측정용 대상 지정(남헌 v40 §4) 셀프테스트 — 입력 project_ids → env EXTRACT_PROJECT_IDS → scripts/extract-auto.mjs.
// 네트워크·실 DB·LLM 없음. 통합 케이스는 로컬 가짜 PostgREST(node:http)에 extract-auto.mjs 를 자식 프로세스로 붙여 실제로 돌린다
// (#457 extract-autotune-selftest 와 같은 방식). claimExtraction 의 단건 조회는 "없음"으로 돌려 LLM·잠금 경로를 타지 않게 한다.
//   node scripts/extract-project-ids-selftest.mjs
//   node scripts/extract-project-ids-selftest.mjs --baseline <옛 extract-auto.mjs>   # 회귀: 빈 입력 = 옛 스크립트와 같은 요청·기록
//
// 왜 있나: 지정이 조용히 틀리면 (1) 잘못 친 id 를 버리고 나머지만 돌거나, (2) 검수 이후 프로젝트를 다시 태워 사람 검수를 덮거나,
// (3) 빈 입력인데 평소 선별이 바뀐다. 셋 다 로그는 정상처럼 보인다(§7.1).

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EXTRACT_SLOTS, parseProjectIds, pickAutoTargets, scopeProjects } from '../lib/analysis/extract-auto.ts'
import { AUTO_EXTRACT_STATUSES } from '../lib/analysis/extract-gate.ts'
import { kstDate } from './notion-status-log.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'
const NONE = '99999999-9999-4999-8999-999999999999'

// ── 1. 파싱 ───────────────────────────────────────────────────
{
  const p = parseProjectIds(`${A},${B}`)
  t('정상: 쉼표 2개', p.ids.join() === `${A},${B}` && p.invalid.length === 0)
  const s = parseProjectIds(`  ${A} ,  ${B}\n${C}\t`)
  t('공백·줄바꿈·탭·쉼표 혼합 구분', s.ids.join() === `${A},${B},${C}` && s.invalid.length === 0)
  const d = parseProjectIds(`${A},${A.toUpperCase()}, ${B},${A}`)
  t('중복 제거(대소문자 무시, 첫 순서 유지, 소문자로)', d.ids.join() === `${A},${B}` && d.invalid.length === 0)
  const bad = parseProjectIds(`${A}, abc, ${B.slice(0, -1)}, ${B}x, ${B}`)
  t('잘못된 형식은 전부 invalid 로 돌려준다(버리지 않는다)', bad.invalid.join('|') === `abc|${B.slice(0, -1)}|${B}x` && bad.ids.join() === `${A},${B}`)
  t('빈 값·undefined·null·공백·쉼표뿐 = 지정 없음', [undefined, null, '', '   ', ',, ,'].every(v => { const r = parseProjectIds(v); return r.ids.length === 0 && r.invalid.length === 0 }))
  const inj = parseProjectIds(`${A}),status.eq.done`)
  t('괄호·따옴표가 붙은 값(필터 주입)은 invalid', inj.invalid.join('|') === `${A})|status.eq.done` && inj.ids.length === 0 && parseProjectIds(`"${A}"`).invalid.length === 1)
}

// ── 2. 선별 한정(상태 규칙 그대로) ───────────────────────────────
{
  const rows = [
    { id: A, status: 'collecting' }, { id: B, status: 'reviewed' }, { id: C, status: 'extracted' },
    { id: D, status: 'angled' },
  ]
  const s = scopeProjects(rows, [B, A, NONE])
  t('지정 2개 중 검수 이후(reviewed) 1개 거부 + 사유', s.kept.map(r => r.id).join() === A && s.rejected.length === 1 && s.rejected[0].id === B && /status=reviewed/.test(s.rejected[0].reason) && /collecting\/extracted\/failed/.test(s.rejected[0].reason))
  t('DB 에 없는 id 는 missing 으로 보고', s.missing.join() === NONE)
  for (const st of ['reviewed', 'angled', 'done', 'processing', '']) {
    t(`상태 '${st}' 는 거부`, scopeProjects([{ id: A, status: st }], [A]).rejected.length === 1)
  }
  for (const st of AUTO_EXTRACT_STATUSES) t(`상태 '${st}' 는 후보`, scopeProjects([{ id: A, status: st }], [A]).kept.length === 1)
  t('DB 가 대문자 id 를 돌려줘도 대조된다', scopeProjects([{ id: A.toUpperCase(), status: 'collecting' }], [A]).kept.length === 1)
  t('지정 없는 행은 무시(지정 순서대로만)', scopeProjects(rows, [C]).kept.map(r => r.id).join() === C)
}

// ── 3. 문턱 미적용(호출부가 minNew 0 을 넘긴다) · 재시도 상한은 그대로 ──
{
  const c = [
    { projectId: A, newInputs: 40, status: 'extracted' },
    { projectId: C, newInputs: 0, status: 'collecting' },
    { projectId: D, newInputs: 500, status: 'failed', attempts: 3 },
  ]
  t('평소(minNew 100)면 신규 40·0 은 대상 아님', pickAutoTargets(c, { minNew: 100, max: 10 }).targets.length === 0)
  const p = pickAutoTargets(c, { minNew: 0, max: 10 })
  t('지정(minNew 0)이면 신규 40·0 도 대상', p.targets.map(x => x.projectId).sort().join() === [A, C].sort().join())
  t('지정이어도 failed 재시도 상한(3회) 도달은 제외', p.retryExhausted === 1 && !p.targets.some(x => x.projectId === D))
  t('지정이어도 max 상한은 그대로', pickAutoTargets(c, { minNew: 0, max: 1 }).targets.length === 1)
}

// ── 4. 워크플로 정적 검사: 입력 1개 + env 1줄뿐 ─────────────────────
{
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'nightly-extract.yml'), 'utf8').replace(/\r\n/g, '\n')
  const inputsBlock = /\n {4}inputs:\n([\s\S]*?)\n\n/.exec(yml)?.[1] ?? ''
  const inputNames = [...inputsBlock.matchAll(/^ {6}([a-z_]+):$/gm)].map(m => m[1])
  t('dispatch 입력 = 기존 4개 + project_ids', inputNames.join() === 'dry_run,min_new,max_projects,slot,project_ids')
  t('project_ids: string · 기본 빈 값 · 설명 문구', inputsBlock.includes(
    "      project_ids:\n        description: '쉼표로 구분한 analysis_projects.id (uuid). 비우면 평소 선별. 지정하면 그 프로젝트만 대상(수동 측정용)'\n        type: string\n        default: ''",
  ))
  t('env 1줄: EXTRACT_PROJECT_IDS: ${{ inputs.project_ids }}', (yml.match(/^ {10}EXTRACT_PROJECT_IDS: \$\{\{ inputs\.project_ids \}\}$/gm) ?? []).length === 1)
  t('project_ids 는 env 한 자리에서만 쓴다(run 줄·if 등 다른 배선 없음)', (yml.match(/inputs\.project_ids/g) ?? []).length === 1 && (yml.match(/EXTRACT_PROJECT_IDS/g) ?? []).length === 1)
  const crons = [...yml.matchAll(/- cron: '([^']+)'/g)].map(m => m[1]).sort().join('|')
  t('schedule 크론 3개 그대로(EXTRACT_SLOTS 와 1:1)', crons === Object.keys(EXTRACT_SLOTS).sort().join('|'))
  const secrets = [...yml.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]).sort().join(',')
  t('시크릿 3개 그대로(새 시크릿 없음)', secrets === 'CLAUDE_CODE_OAUTH_TOKEN,NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY')
  t('permissions 는 contents: read 그대로', /\npermissions:\n  contents: read\n\n/.test(yml))
  t('concurrency 그대로', /\nconcurrency:\n  group: extract-auto\n  cancel-in-progress: false\n/.test(yml))
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'extract-auto.mjs'), 'utf8')
  t('스크립트는 EXTRACT_PROJECT_IDS 를 한 자리에서만 읽는다', (src.match(/process\.env\.EXTRACT_PROJECT_IDS/g) ?? []).length === 1)
}

// ── 5. 통합: 가짜 PostgREST + extract-auto.mjs 자식 프로세스 ────────
const H = 3_600_000
const realNow = Date.now()
const P = {
  [A]: { id: A, status: 'collecting', extract_finished_at: null, extract_attempts: 0, product_elevator_pitch: 'saas-new', business_model: 'SAAS' },
  [B]: { id: B, status: 'extracted', extract_finished_at: new Date(realNow - 48 * H).toISOString(), extract_attempts: 1, product_elevator_pitch: 'consumer-rerun', business_model: 'PHYSICAL' },
  [C]: { id: C, status: 'reviewed', extract_finished_at: new Date(realNow - 96 * H).toISOString(), extract_attempts: 1, product_elevator_pitch: 'human-reviewed', business_model: 'SAAS' },
  [D]: { id: D, status: 'failed', extract_finished_at: new Date(realNow - 24 * H).toISOString(), extract_attempts: 1, product_elevator_pitch: 'failed-once', business_model: null },
  [E]: { id: E, status: 'failed', extract_finished_at: new Date(realNow - 24 * H).toISOString(), extract_attempts: 3, product_elevator_pitch: 'failed-thrice', business_model: 'SAAS' },
}
const NEW = { [A]: 150, [B]: 40, [C]: 999, [D]: 120, [E]: 300 }
const inList = (v) => (v ?? '').replace(/^in\.\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))

function fakeDb(history = []) {
  const log = [] // 요청 순서(메서드 + 경로 + 쿼리) — 회귀 비교용
  const steps = []
  const posts = []
  const patches = []
  const unexpected = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const u = new URL(req.url, 'http://x')
      const table = u.pathname.replace('/rest/v1/', '')
      // 시각 인자(gte.<since> 등)는 실행마다 다르다 — 모양만 비교한다
      log.push(`${req.method} ${table}?${decodeURIComponent(u.searchParams.toString()).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<ts>')}`)
      const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json', connection: 'close' }); res.end(obj === undefined ? '' : JSON.stringify(obj)) }
      if (table === 'analysis_projects' && req.method === 'GET') {
        const id = u.searchParams.get('id')
        if (id?.startsWith('eq.')) return json(406, { code: 'PGRST116', message: 'no rows', details: null, hint: null })
        if (id?.startsWith('in.')) return json(200, inList(id).map(i => P[i]).filter(Boolean))
        const st = u.searchParams.get('status')
        if (st?.startsWith('in.')) return json(200, Object.values(P).filter(p => inList(st).includes(p.status)))
      }
      if (table === 'analysis_inputs' && req.method === 'HEAD') {
        const pid = (u.searchParams.get('project_id') ?? '').replace(/^eq\./, '')
        res.writeHead(200, { 'content-range': `*/${NEW[pid] ?? 0}`, connection: 'close' }); return res.end()
      }
      if (table === 'agent_runs' && req.method === 'GET') return json(200, history)
      if (table === 'agent_runs' && req.method === 'POST') { posts.push(JSON.parse(body)); return json(201, { id: 'run-fake' }) }
      if (table === 'agent_run_steps' && req.method === 'POST') { steps.push(JSON.parse(body)); return json(201) }
      if (table === 'agent_runs' && req.method === 'PATCH') { patches.push(JSON.parse(body)); return json(204) }
      unexpected.push(`${req.method} ${u.pathname}${u.search}`)
      return json(404, { code: 'X', message: 'unexpected' })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, log, steps, posts, patches, unexpected, url: `http://127.0.0.1:${server.address().port}` })))
}

// Windows 로컬 Node 24 는 fetch 핸들이 남은 채 process.exit 하면 libuv 단언으로 죽는다(#457 과 같은 처리). CI(ubuntu)는 종료코드를 그대로 단언한다.
const exitIs = (r, code) => r.code === code || (process.platform === 'win32' && /UV_HANDLE_CLOSING/.test(r.out))

function runChild(env, cwd, args = [], script = path.join(ROOT, 'scripts', 'extract-auto.mjs')) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(EXTRACT_|NOTION_|GITHUB_|LLM_|SUPABASE_|NEXT_PUBLIC_SUPABASE|CLAUDE_)/.test(k)))
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [script, ...args], { cwd, env: { ...clean, ...env } })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    const timer = setTimeout(() => p.kill(), 60_000)
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out }) })
  })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-project-ids-'))
fs.mkdirSync(path.join(tmp, 'config'))
fs.copyFileSync(path.join(ROOT, 'config', 'session-guard.json'), path.join(tmp, 'config', 'session-guard.json'))
const RUN_ID = '424242'
const manualEnv = (url) => ({
  NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'fake-key', LLM_PROVIDER: 'mock',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ID: RUN_ID, EXTRACT_SLOT_INPUT: 'm',
  EXTRACT_AUTO_MIN_NEW: '100', EXTRACT_AUTO_MAX_PROJECTS: '3', EXTRACT_AUTO_DAILY_MAX: '24',
})
const extractSteps = (db) => db.steps.filter(s => s.step_key.startsWith('extract-')).map(s => s.step_key.slice('extract-'.length))
const projectsGets = (db) => db.log.filter(l => l.startsWith('GET analysis_projects?') && !l.includes('id=eq.'))
const baselineIdx = process.argv.indexOf('--baseline')
const baseline = baselineIdx > 0 ? path.resolve(process.argv[baselineIdx + 1]) : null

try {
  // (a) 회귀 — 빈 입력('')과 미설정이 같은 요청·같은 기록·같은 대상이고, 평소 규칙(minNew 100, SaaS 우선)대로 고른다.
  {
    const runs = []
    for (const extra of [{}, { EXTRACT_PROJECT_IDS: '' }, { EXTRACT_PROJECT_IDS: ' , ' }]) {
      const db = await fakeDb()
      const r = await runChild({ ...manualEnv(db.url), ...extra }, tmp)
      db.server.close()
      runs.push({ r, db })
    }
    const [u, e, w] = runs
    const strip = (s) => { const { session, est_usd, ...rest } = s ?? {}; return JSON.stringify(rest) }
    t('[회귀] 종료코드 0(미설정·빈 값·쉼표뿐)', runs.every(x => exitIs(x.r, 0)))
    t('[회귀] 빈 값 = 미설정: 요청 순서 동일', JSON.stringify(e.db.log) === JSON.stringify(u.db.log) && JSON.stringify(w.db.log) === JSON.stringify(u.db.log))
    t('[회귀] 빈 값 = 미설정: 기록(summary) 동일', strip(e.db.patches.at(-1)?.summary) === strip(u.db.patches.at(-1)?.summary) && strip(w.db.patches.at(-1)?.summary) === strip(u.db.patches.at(-1)?.summary))
    t('[회귀] 프로젝트 조회는 status=in. (id 필터 없음)', projectsGets(u.db).length === 1 && /status=in\.\(collecting,extracted,failed\)/.test(projectsGets(u.db)[0]) && !/id=in\./.test(projectsGets(u.db)[0]))
    const expect = pickAutoTargets(Object.values(P).filter(p => AUTO_EXTRACT_STATUSES.includes(p.status)).map(p => ({ projectId: p.id, newInputs: NEW[p.id], businessModel: p.business_model, status: p.status, attempts: p.extract_attempts })), { minNew: 100, max: 3 })
    t('[회귀] 대상 = pickAutoTargets(minNew 100) 그대로: A(SaaS) → D(failed 재시도)', extractSteps(u.db).join() === expect.targets.map(x => x.projectId).join() && extractSteps(u.db).join() === `${A},${D}`)
    t('[회귀] summary 에 project_ids 키 없음(행 모양 그대로)', !('project_ids' in (u.db.patches.at(-1)?.summary ?? {})))
    t('[회귀] 로그에 신규 기준 100건', /신규 기준 100건/.test(u.r.out))
    t('[회귀] 예상 밖 요청 0', runs.every(x => x.db.unexpected.length === 0))
    if (!exitIs(u.r, 0)) console.log(u.r.out)
    if (baseline) {
      const db = await fakeDb()
      const r = await runChild(manualEnv(db.url), tmp, [], baseline)
      db.server.close()
      t('[회귀·baseline] 옛 스크립트와 요청 순서 동일', JSON.stringify(db.log) === JSON.stringify(u.db.log))
      t('[회귀·baseline] 옛 스크립트와 기록 동일', strip(db.patches.at(-1)?.summary) === strip(u.db.patches.at(-1)?.summary))
      t('[회귀·baseline] 옛 스크립트와 대상 동일', extractSteps(db).join() === extractSteps(u.db).join())
      if (!exitIs(r, 0)) console.log(r.out)
    }
  }
  // (b) 지정 실행 — B(extracted, 신규 40 < 100) + C(reviewed) + 없는 id. 문턱 미적용으로 B 만 돌고, C 는 거부, 없는 id 는 보고.
  {
    const db = await fakeDb()
    const r = await runChild({ ...manualEnv(db.url), EXTRACT_PROJECT_IDS: `${B}, ${C.toUpperCase()}\n${NONE},${B}` }, tmp)
    db.server.close()
    const s = db.patches.at(-1)?.summary ?? {}
    t('[지정] 종료코드 0', exitIs(r, 0))
    t('[지정] 프로젝트 조회는 id=in. 하나(상태 필터 없음)', projectsGets(db).length === 1 && projectsGets(db)[0].includes(`id=in.(${B},${C},${NONE})`) && !/status=in\./.test(projectsGets(db)[0]))
    t('[지정] 문턱 미적용: 신규 40 인 B 가 대상', extractSteps(db).join() === B)
    t('[지정] 재추출이라 force 로 표시', new RegExp(`지정 대상 ${B} \\[extracted\\] 재추출\\(force\\)`).test(r.out))
    t('[지정] 검수 이후 C 는 거부 + 사유(::warning 수준 로그)', new RegExp(`project_ids 제외 ${C} — status=reviewed`).test(r.out) && !extractSteps(db).includes(C))
    t('[지정] 없는 id 는 "없음"으로 보고', new RegExp(`project_ids 없음 ${NONE}`).test(r.out))
    t('[지정] 평소 대상 A·D 는 건드리지 않는다', !extractSteps(db).some(x => x === A || x === D))
    t('[지정] summary.project_ids 기록(요청·후보·거부·없음)', JSON.stringify(s.project_ids?.requested) === JSON.stringify([B, C, NONE]) && s.project_ids?.kept?.join() === B && s.project_ids?.rejected?.[0]?.id === C && s.project_ids?.missing?.join() === NONE)
    t('[지정] run_key 는 기존 규칙 m<run_id>', db.posts[0]?.run_key === `extract-auto-${kstDate()}-m${RUN_ID}`)
    t('[지정] 로그: 신규 기준 미적용', /신규 기준 미적용\(project_ids 3건 지정\)/.test(r.out))
    t('[지정] 예상 밖 요청 0', db.unexpected.length === 0)
    if (!exitIs(r, 0) || db.unexpected.length) console.log(r.out, db.unexpected)
  }
  // (c) dry_run — 지정 대상 목록·제외 사유를 보여 주고 DB 쓰기 없음
  {
    const db = await fakeDb()
    const r = await runChild({ ...manualEnv(db.url), EXTRACT_PROJECT_IDS: `${A},${C}` }, tmp, ['--dry'])
    db.server.close()
    t('[dry] 종료코드 0', exitIs(r, 0))
    t('[dry] 지정 대상 A 와 제외 C(사유) 출력', new RegExp(`지정 대상 ${A} \\[collecting\\] 첫 추출`).test(r.out) && new RegExp(`project_ids 제외 ${C} — status=reviewed`).test(r.out))
    t('[dry] 이번 실행 대상 줄에 A 만', new RegExp(`  · ${A} \\[SAAS\\]`).test(r.out) && !new RegExp(`  · ${C} `).test(r.out))
    t('[dry] DB 쓰기 0(POST·PATCH 없음)', !db.log.some(l => /^(POST|PATCH|DELETE)/.test(l)))
  }
  // (d) 잘못된 형식 — exit 2, 틀린 값을 그대로 보여 주고 DB 에 닿지 않는다
  {
    const db = await fakeDb()
    const r = await runChild({ ...manualEnv(db.url), EXTRACT_PROJECT_IDS: `${A}, abc,${B}-x` }, tmp)
    db.server.close()
    t('[형식 오류] exit 2', r.code === 2)
    t('[형식 오류] 틀린 값을 출력', /형식 오류 2건/.test(r.out) && /'abc'/.test(r.out) && r.out.includes(`'${B}-x'`))
    t('[형식 오류] DB 요청 0(아무것도 하지 않음)', db.log.length === 0)
  }
  // (e) 수동 slot=m 에서만 — 수동 slot=s2·스케줄은 exit 2
  {
    const db = await fakeDb()
    const r1 = await runChild({ ...manualEnv(db.url), EXTRACT_SLOT_INPUT: 's2', EXTRACT_PROJECT_IDS: A }, tmp)
    const cron = Object.keys(EXTRACT_SLOTS)[0]
    const r2 = await runChild({ ...manualEnv(db.url), GITHUB_EVENT_NAME: 'schedule', EXTRACT_SLOT_CRON: cron, EXTRACT_PROJECT_IDS: A }, tmp)
    db.server.close()
    t('[슬롯] 수동 slot=s2 + 지정 → exit 2', r1.code === 2 && /slot=m\)에서만/.test(r1.out))
    t('[슬롯] 스케줄 + 지정 → exit 2', r2.code === 2 && /지금 슬롯 s1/.test(r2.out))
    t('[슬롯] 둘 다 DB 요청 0', db.log.length === 0)
  }
  // (f) 안전 규칙 그대로 — 하루 상한·한도 쿨다운은 지정이어도 막는다
  {
    const today = kstDate()
    const capped = [{ run_key: `extract-auto-${today}-s1`, status: 'ok', started_at: new Date(realNow - 1 * H).toISOString(), finished_at: new Date(realNow - 0.5 * H).toISOString(), summary: { decision: 'run', done: 24, failed: 0 } }]
    const db1 = await fakeDb(capped)
    const r1 = await runChild({ ...manualEnv(db1.url), EXTRACT_PROJECT_IDS: A }, tmp)
    db1.server.close()
    const s1 = db1.patches.at(-1)?.summary ?? {}
    t('[안전] 하루 상한 도달이면 지정이어도 쉼', exitIs(r1, 0) && s1.decision === 'skip' && /하루 상한 도달/.test(s1.reason) && extractSteps(db1).length === 0)
    t('[안전] 쉼 기록에도 project_ids 가 남는다', s1.project_ids?.kept?.join() === A)
    const blocked = [{ run_key: `extract-auto-${today}-s1`, status: 'blocked', started_at: new Date(realNow - 1 * H).toISOString(), finished_at: new Date(realNow - 0.5 * H).toISOString(), summary: { decision: 'run', done: 0, failed: 0, stop_reason: 'quota' } }]
    const db2 = await fakeDb(blocked)
    const r2 = await runChild({ ...manualEnv(db2.url), EXTRACT_PROJECT_IDS: A }, tmp)
    db2.server.close()
    const s2 = db2.patches.at(-1)?.summary ?? {}
    t('[안전] 한도 쿨다운 중이면 지정이어도 쉼', exitIs(r2, 0) && s2.decision === 'skip' && /한도 쿨다운/.test(s2.reason) && extractSteps(db2).length === 0)
    // max_projects 상한도 그대로: 지정 3개(A·B·D 전부 후보) · 상한 2 → 2건만
    const db3 = await fakeDb()
    const r3 = await runChild({ ...manualEnv(db3.url), EXTRACT_AUTO_MAX_PROJECTS: '2', EXTRACT_PROJECT_IDS: `${A},${B},${D}` }, tmp)
    db3.server.close()
    const s3 = db3.patches.at(-1)?.summary ?? {}
    t('[안전] max_projects 상한 그대로: 지정 3 · 상한 2 → 2건 실행·남은 1', exitIs(r3, 0) && extractSteps(db3).length === 2 && s3.remaining === 1 && s3.max_this_run === 2)
    const left = [A, B, D].find(x => !extractSteps(db3).includes(x))
    t('[안전] 상한 밖 지정 id 도 사유를 남긴다', new RegExp(`project_ids ${left} 이번 실행 대상 아님 — 실행 상한 밖\\(이번 2건\\)`).test(r3.out))
    // failed 재시도 상한(3회) 도달 프로젝트는 지정이어도 안 돈다 + 사유
    const db4 = await fakeDb()
    const r4 = await runChild({ ...manualEnv(db4.url), EXTRACT_PROJECT_IDS: `${E},${A}` }, tmp)
    db4.server.close()
    t('[안전] failed 재시도 상한 도달은 지정이어도 제외 + 사유', exitIs(r4, 0) && extractSteps(db4).join() === A && new RegExp(`project_ids ${E} 이번 실행 대상 아님 — failed 자동 재시도 상한\\(3회\\) 도달`).test(r4.out))
  }
  // (g) EXTRACT_AUTOTUNE=on 이어도 수동 지정 run 은 평가하지 않는다(#457 isScheduledKey)
  {
    const db = await fakeDb()
    const r = await runChild({ ...manualEnv(db.url), EXTRACT_AUTOTUNE: 'on', EXTRACT_PROJECT_IDS: B }, tmp)
    db.server.close()
    const s = db.patches.at(-1)?.summary ?? {}
    t('[자동 조정 on] 수동 지정 run 은 평가 안 함(evaluated=false·action null)', exitIs(r, 0) && s.autotune?.evaluated === false && s.autotune?.action == null)
    t('[자동 조정 on] 슬롯 상한은 입력값(3) 그대로', s.slot_max === 3)
    if (!exitIs(r, 0)) console.log(r.out)
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${fail ? '❌' : '✅'} extract project_ids 셀프테스트: ${pass} pass / ${fail} fail${baseline ? ' (baseline 비교 포함)' : ''}`)
process.exit(fail ? 1 : 0)
