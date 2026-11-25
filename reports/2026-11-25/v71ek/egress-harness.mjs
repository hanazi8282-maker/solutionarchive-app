#!/usr/bin/env node
// v71ek 동치·전송량 검사 — 원본(기준 커밋)과 새 코드(작업 트리)를 같은 합성 데이터에 돌려 결과를 대조하고 응답 바이트를 센다.
//   리포 루트에서: node reports/2026-11-25/v71ek/egress-harness.mjs     (node_modules 필요, DB·바깥 네트워크 없음)
// 임시 폴더 .v71ek-orig/ · .v71ek-new/ 를 만들고 끝에 지운다.
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { startMock } from './mock-postgrest.mjs'
import { buildDataset, rngOf } from './dataset.mjs'

const BASE_COMMIT = 'df540298'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const ORIG = path.join(root, '.v71ek-orig')
const NEW = path.join(root, '.v71ek-new')

let pass = 0, fail = 0
const failures = []
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; failures.push(name); console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`) } }
const same = (name, a, b) => check(name, isDeepStrictEqual(a, b), isDeepStrictEqual(a, b) ? '' : `원본 ${JSON.stringify(a)?.slice(0, 600)}\n    새   ${JSON.stringify(b)?.slice(0, 600)}`)
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const bytesLine = (label, a, b) => console.log(`  ${label.padEnd(44)} 원본 ${kb(a.bytes).padStart(11)} / ${String(a.requests).padStart(5)}회   새 ${kb(b.bytes).padStart(11)} / ${String(b.requests).padStart(5)}회   ${a.bytes ? `-${(100 - (b.bytes / a.bytes) * 100).toFixed(1)}%` : ''}`)
const tableLine = (a, b) => { for (const t of new Set([...Object.keys(a.byTable), ...Object.keys(b.byTable)])) { const x = a.byTable[t] ?? { bytes: 0, requests: 0, rows: 0 }, y = b.byTable[t] ?? { bytes: 0, requests: 0, rows: 0 }; if (x.bytes + y.bytes > 2048) console.log(`      ${t.padEnd(32)} ${kb(x.bytes).padStart(11)} (${x.rows}행) → ${kb(y.bytes).padStart(11)} (${y.rows}행)`) } }

function setup() {
  for (const d of [ORIG, NEW]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d) }
  const tar = path.join(ORIG, 'base.tar')
  execFileSync('git', ['archive', '-o', tar, BASE_COMMIT, 'lib', 'scripts', 'config', 'package.json'], { cwd: root })
  execFileSync('tar', ['-xf', 'base.tar'], { cwd: ORIG })
  fs.rmSync(tar)
  for (const d of ['lib', 'scripts', 'config']) fs.cpSync(path.join(root, d), path.join(NEW, d), { recursive: true })
  fs.copyFileSync(path.join(root, 'package.json'), path.join(NEW, 'package.json'))
}

const load = (dir, rel) => import(pathToFileURL(path.join(dir, rel)).href)

/** 자식 스크립트 실행 — 비밀값 없는 최소 env, 바깥 네트워크 차단. */
function runScript(dir, script, args, mockUrl, env = {}) {
  const min = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', pathToFileURL(path.join(here, 'net-stub.mjs')).href, path.join('scripts', script), ...args],
      { cwd: dir, env: { ...min, NEXT_PUBLIC_SUPABASE_URL: mockUrl, SUPABASE_SERVICE_ROLE_KEY: 'dummy-key', ...env }, maxBuffer: 64 * 1024 * 1024, timeout: 240_000 },
      (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr }))
  })
}
/** 시각·메모리·새 경로 안내 로그를 지운 비교용 줄. */
const norm = (s) => s.split(/\r?\n/)
  .filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings|type": "module"|MODULE_TYPELESS|나눠 읽기 불가|판정 수 서버 세기 불가/.test(l))
  .map((l) => l.replace(/^\[\d{4}-[^\]]+\] /, '').replace(/rss \d+MB/g, 'rss N').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TIME').replace(/메모리 피크 \d+MB/g, '메모리 피크 N'))
const normWrites = (writes) => JSON.parse(JSON.stringify(writes, (k, v) => (['judged_at', 'second_judged_at', 'started_at', 'finished_at', 'updated_at', 'created_at', 'mem_peak_mb', 'run_url', 'git_sha', 'duration_ms'].includes(k) ? undefined : typeof v === 'string' ? v.replace(/\d{4}-\d\d-\d\dT[\d:.]+(Z|\+00:00)/g, 'TIME') : v)))

/** 같은 데이터 두 벌에 두 코드를 돌린다. */
async function both(script, args, env, { data = () => buildDataset(), mockOpts = {} } = {}) {
  const out = []
  for (const [dir, opts] of [[ORIG, {}], [NEW, mockOpts]]) {
    const mock = await startMock(data(), opts)
    const res = await runScript(dir, script, args, mock.url, env)
    out.push({ ...res, stats: mock.stats, writes: mock.writes, mock })
    await mock.close()
  }
  return out
}

async function libraryChecks() {
  console.log('\n[A1] createPendingFor · loadAreaContext — 함수 단위 대조')
  const { createClient } = await load(root, 'node_modules/@supabase/supabase-js/dist/index.mjs').catch(() => import('@supabase/supabase-js'))
  const oldP = await load(ORIG, 'lib/analysis/relevance-pending.ts'), newP = await load(NEW, 'lib/analysis/relevance-pending.ts')
  const oldA = await load(ORIG, 'lib/analysis/area-priority.ts'), newA = await load(NEW, 'lib/analysis/area-priority.ts')
  const { loadPrefilterConfig } = await load(ORIG, 'lib/analysis/prefilter.ts')
  const { cfg } = loadPrefilterConfig(path.join(ORIG, 'config/prefilter-rules.json'), {})
  const configs = [
    { name: '운영(shadow·hn on·제외 없음)', excludedSources: [], prefilterCfg: cfg, sampleSize: 200 },
    { name: '표본 작게·youtube 제외', excludedSources: ['youtube'], prefilterCfg: cfg, sampleSize: 7 },
    { name: 'enforce', excludedSources: [], prefilterCfg: { ...cfg, mode: 'enforce' }, sampleSize: 1000 },
    { name: '사전필터 없음·스위치 off', excludedSources: [], prefilterCfg: null, sampleSize: 50, skipConsumer: false, skipQuality: false },
    { name: '추가 제외 소스(예전 방식으로 후퇴)', excludedSources: ['youtube', 'danawa', 'nope'], prefilterCfg: cfg, sampleSize: 200 },
    { name: 'rating 컬럼 없음', excludedSources: [], prefilterCfg: cfg, sampleSize: 200, dropRating: true },
    { name: '임베드 미지원 서버(전부 후퇴)', excludedSources: [], prefilterCfg: cfg, sampleSize: 200, mockOpts: { noEmbed: true } },
    { name: '1,000행 넘는 표본·다른 시드', excludedSources: [], prefilterCfg: cfg, sampleSize: 5000, seed: 99 },
  ]
  for (const c of configs) {
    const data = () => { const d = buildDataset({ seed: c.seed ?? 7 }); if (c.dropRating) for (const r of d.analysis_inputs) delete r.rating; return d }
    const runs = []
    for (const [P, A, opts] of [[oldP, oldA, {}], [newP, newA, c.mockOpts ?? {}]]) {
      const tables = data()
      const mock = await startMock(tables, opts)
      const sb = createClient(mock.url, 'dummy-key', { auth: { persistSession: false, autoRefreshToken: false } })
      const logs = [], warns = []
      const errs = console.error; console.error = (m) => logs.push(String(m))
      const out = console.log; console.log = (m) => logs.push(String(m))
      const pf = P.createPendingFor({ supabase: sb, sampleSize: c.sampleSize, highRatingShare: 0.2, prefilterCfg: c.prefilterCfg, log: (m) => logs.push(m), warn: (m) => warns.push(m), excludedSources: c.excludedSources, lastSources: ['kakao_blog'], skipConsumer: c.skipConsumer ?? true, skipQuality: c.skipQuality ?? true, allowIds: new Set() })
      const counts = {}, pend = {}, bytes = {}
      const snap = () => ({ bytes: mock.stats.bytes, requests: mock.stats.requests })
      const since = (a) => ({ bytes: mock.stats.bytes - a.bytes, requests: mock.stats.requests - a.requests })
      let a = snap()
      for (const p of tables.analysis_projects) counts[p.id] = await pf.countFor(p)
      bytes.count = since(a); a = snap()
      for (const p of tables.analysis_projects) if (counts[p.id] === null || counts[p.id].unjudged > 0) pend[p.id] = await pf.pendingFor(p)
      bytes.pending = since(a); a = snap()
      // 호출부가 안 부르는 프로젝트(미판정 0)도 결과를 본다. 원문 0건 프로젝트는 반환 모양이 달라 따로 센다.
      const extra = {}
      for (const p of tables.analysis_projects) if (!(p.id in pend) && tables.analysis_inputs.some((r) => r.project_id === p.id && r.purged_at == null)) extra[p.id] = await pf.pendingFor(p)
      a = snap()
      const area = await A.loadAreaContext(sb, (m) => warns.push(m))
      bytes.area = since(a)
      console.error = errs; console.log = out
      runs.push({ counts, pend, extra, area, pf, warns, bytes, tables })
      await mock.close()
    }
    const [o, n] = runs
    // sources 는 "후보 원문에 없는 제외 소스" 경고에만 쓴다 — 스크립트가 계산하는 그 값으로 대조한다.
    const unknownExcluded = (r) => { const seen = new Set(Object.values(r.counts).flatMap((x) => x?.sources ?? [])); return c.excludedSources.filter((s) => !seen.has(s) && s !== 'youtube') }
    const noSources = (counts) => Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v && { ...v, sources: undefined }]))
    same(`${c.name}: countFor 수`, noSources(o.counts), noSources(n.counts))
    same(`${c.name}: 제외 소스 오타 경고 값`, unknownExcluded(o), unknownExcluded(n))
    same(`${c.name}: pendingFor 결과(표본 순서·본문 포함)`, o.pend, n.pend)
    same(`${c.name}: pendingFor 결과(미판정 0 프로젝트)`, o.extra, n.extra)
    const targets = Object.keys(o.pend).filter((id) => o.pend[id]?.reviews.length)
    same(`${c.name}: 대상 프로젝트의 사전필터 기록`, targets.map((id) => o.pf.prefilterByProject[id]), targets.map((id) => n.pf.prefilterByProject[id]))
    same(`${c.name}: 영역 맥락`, o.area && { ...o.area, byProject: [...o.area.byProject] }, n.area && { ...n.area, byProject: [...n.area.byProject] })
    same(`${c.name}: 경고`, o.warns, n.warns)
    const total = Object.values(o.pend).reduce((s, x) => s + (x?.reviews.length ?? 0), 0)
    const zero = Object.values(o.pend).filter((x) => x && x.reviews.length === 0).length
    console.log(`  ${c.name}: 판정 표본 ${total}건 · pendingFor ${Object.keys(o.pend).length}개 중 표본 0 ${zero}개`)
    check(`${c.name}: 검사가 비어 있지 않다`, total > 0 && Object.keys(o.pend).length > 3)
    for (const k of ['count', 'pending', 'area']) bytesLine(`    ${k}`, o.bytes[k], n.bytes[k])
    if (c.name.startsWith('운영')) {
      check('운영: countFor 전송 감소', n.bytes.count.bytes < o.bytes.count.bytes * 0.8)
      check('운영: 표본 0 프로젝트가 있어 검사됨', zero > 0)
      check('운영: area 전송 99% 감소', n.bytes.area.bytes < o.bytes.area.bytes * 0.3)
    }
  }
}

async function judgeChecks() {
  console.log('\n[A2] relevance-judge-auto.mjs 끝에서 끝까지(LLM_PROVIDER=mock, 쓰기는 모의 DB)')
  const env = { LLM_PROVIDER: 'mock', RELEVANCE_EXCLUDE_SOURCES: 'none', RELEVANCE_SAMPLE: '60', RELEVANCE_MAX_PROJECTS: '6', RELEVANCE_SKIP_CONSUMER: 'on', RELEVANCE_CAPACITY_GUARD: 'off', RELEVANCE_CRITERIA: 'v22' }
  for (const [name, args, extra, opts] of [['--dry', ['--dry'], {}, {}], ['쓰기', [], {}, {}], ['쓰기·기본 제외(youtube)', [], { RELEVANCE_EXCLUDE_SOURCES: '' }, {}], ['쓰기·임베드 미지원', [], {}, { mockOpts: { noEmbed: true } }]]) {
    const [o, n] = await both('relevance-judge-auto.mjs', args, { ...env, ...extra }, opts)
    check(`judge ${name}: 원본 정상 종료`, o.code === 0, o.stderr.slice(-800))
    same(`judge ${name}: 종료 코드`, o.code, n.code)
    same(`judge ${name}: 로그`, norm(o.stdout), norm(n.stdout))
    same(`judge ${name}: DB 쓰기(판정 행·실행 기록)`, normWrites(o.writes), normWrites(n.writes))
    const verdicts = o.writes.filter((w) => w.table === 'review_relevance_verdicts').flatMap((w) => w.payload)
    if (name !== '--dry') check(`judge ${name}: 저장된 판정이 있다`, verdicts.length > 0)
    console.log(`  ${name}: 저장 판정 ${verdicts.length}건 · 로그 ${norm(o.stdout).length}줄`)
    bytesLine(`    합계`, o.stats, n.stats)
    if (name === '--dry') tableLine(o.stats, n.stats)
  }
}

function secondData() {
  const d = buildDataset()
  // 주제 라벨 경로: 영역 밖 판정 행 일부에 라벨
  const out = new Set(d.analysis_projects.filter((p) => /out-/i.test(p.area_code ?? '')).map((p) => p.id))
  d.review_relevance_verdicts.filter((v) => out.has(v.project_id) && !v.second_verdict).slice(0, 20)
    .forEach((v, i) => d.review_topic_labels.push({ input_id: v.input_id, area_guess: ['work', '2', '5'][i % 3], reason_quality: 'reason', prompt_version: 'topic-v1-2026-10-26' }))
  return d
}
async function secondChecks() {
  console.log('\n[A3] relevance-second-judge-auto.mjs (Gemini 는 결정적 가짜 응답)')
  const env = { GEMINI_API_KEY: 'dummy', AUTO_APPROVAL_SINCE: '2026-09-01', RELEVANCE_SECOND_MAX: '300', RELEVANCE_CAPACITY_GUARD: 'off', RELEVANCE_SECOND_TOPIC_DAILY: '8', LLM_DAILY_BUDGET_USD: '50' }
  for (const [name, args, extra] of [['--dry', ['--dry'], {}], ['쓰기', [], {}], ['쓰기·legacy 순서', [], { RELEVANCE_SECOND_ORDER: 'legacy' }], ['쓰기·영역 밖 포함', [], { RELEVANCE_SECOND_SKIP_OUT_OF_AREA: 'off' }]]) {
    const [o, n] = await both('relevance-second-judge-auto.mjs', args, { ...env, ...extra }, { data: secondData })
    check(`second ${name}: 원본 정상 종료`, o.code === 0, o.stderr.slice(-800))
    same(`second ${name}: 종료 코드`, o.code, n.code)
    same(`second ${name}: 로그`, norm(o.stdout), norm(n.stdout))
    same(`second ${name}: DB 쓰기(2차 판정)`, normWrites(o.writes), normWrites(n.writes))
    const patches = o.writes.filter((w) => w.method === 'PATCH' && w.table === 'review_relevance_verdicts').length
    if (name !== '--dry') check(`second ${name}: 2차 기록이 있다`, patches > 0)
    console.log(`  ${name}: 2차 기록 ${patches}건`)
    bytesLine(`    합계`, o.stats, n.stats)
  }
}

async function mentionChecks() {
  console.log('\n[B] mention-input-fetch.mjs — 출력 JSON 바이트 대조')
  const tmp = path.join(NEW, 'out'); fs.mkdirSync(tmp, { recursive: true })
  for (const [name, seed, mockOpts] of [['seed 7', 7, {}], ['seed 99', 99, {}], ['seed 2024 ×1.6', 2024, {}], ['imatch 실패 → 전부 받기', 7, { noImatch: true }], ['임베드 미지원', 7, { noEmbed: true }]]) {
    const outs = [path.join(tmp, 'o.json'), path.join(tmp, 'n.json')]
    const runs = []
    for (const [i, dir] of [ORIG, NEW].entries()) {
      fs.rmSync(outs[i], { force: true })
      const data = buildDataset({ seed, scale: seed === 2024 ? 1.6 : 1 })
      // 사람 relevant / 사람 무관+자동승인 / 판정 없음 ∧ ALT 가 반드시 섞이게
      const mock = await startMock(data, i ? mockOpts : {})
      const res = await runScript(dir, 'mention-input-fetch.mjs', [`--out=${outs[i]}`], mock.url)
      runs.push({ ...res, stats: mock.stats, text: fs.existsSync(outs[i]) ? fs.readFileSync(outs[i], 'utf8') : null })
      await mock.close()
    }
    const [o, n] = runs
    // 임베드 미지원이면 새 코드도 원본 질의만 써야 한다 — 원본 질의에는 임베드가 없다.
    check(`mention ${name}: 두 실행 정상`, o.code === 0 && n.code === 0, o.stderr + n.stderr)
    check(`mention ${name}: 출력 파일 바이트 동일`, o.text !== null && o.text === n.text)
    const j = JSON.parse(o.text)
    const kinds = j.posts.reduce((m, p) => ((m[p.verdict_kind] = (m[p.verdict_kind] ?? 0) + 1), m), {})
    check(`mention ${name}: 세 종류 글이 모두 있다`, kinds.approved > 0 && kinds.relevant > 0 && kinds.alt_seek > 0, JSON.stringify(kinds))
    const inputs = (s) => /inputs: (\d+)/.exec(s)?.[1]
    check(`mention ${name}: 로그 inputs 수 동일`, inputs(o.stdout) === inputs(n.stdout), `${o.stdout}\n${n.stdout}`)
    check(`mention ${name}: 후퇴 경고`, Object.keys(mockOpts).length ? /전부 받는 예전 방식/.test(n.stderr) : !/전부 받는 예전 방식/.test(n.stderr), n.stderr)
    console.log(`  ${name}: posts ${j.posts.length} ${JSON.stringify(kinds)} · ${n.stdout.replace(/\s+/g, ' ').trim()}`)
    bytesLine('    합계', o.stats, n.stats)
    if (name === 'seed 7') tableLine(o.stats, n.stats)
  }

  // 상위집합 퍼징: JS 가 맞는 글은 서버 정규식(여기선 JS 로 해석)도 맞아야 한다. 공백류 전부·대소문자·조각 조합.
  const src = fs.readFileSync(path.join(NEW, 'scripts/mention-input-fetch.mjs'), 'utf8')
  const grab = (re) => re.exec(src)?.[0]
  const { SW, ALT, serverRegex } = new Function(`${grab(/^const SW = .*$/m)}\n${grab(/^const ALT = .*$/m)}\n${grab(/^function serverRegex[\s\S]*?^}/m)}\nreturn { SW, ALT, serverRegex }`)()
  const sw = new RegExp(serverRegex(SW), 'i'), alt = new RegExp(serverRegex(ALT), 'i')
  const spaces = [' ', '', '  ', '\t', '\n', '\r\n', '\u000b', '\u000c', '\u00a0', '\u1680', '\u2000', '\u2007', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']
  const words = ['looking', 'for', 'an', 'a', 'any', 'good', 'better', 'alternative', 'alternatives', 'to', 'recommend', 'recommended', 'replacement', 'cheap', 'x_1', '갈아', '탈', '만한', '대신', '쓸', '대안', '앱', '어플', '을', '이', '찾', '추천', '없', '대체', '다른', 'SWITCH', 'Compared', 'with', '보다', 'ſ', 'K', 'İ', '.', '-']
  const rnd = rngOf(1)
  let alts = 0, sws = 0, missed = []
  for (let i = 0; i < 400_000; i++) {
    const n = 1 + Math.floor(rnd() * 6)
    let s = ''
    for (let k = 0; k < n; k++) { let w = words[Math.floor(rnd() * words.length)]; if (rnd() < 0.2) w = w.toUpperCase(); s += w + (rnd() < 0.7 ? ' ' : spaces[Math.floor(rnd() * spaces.length)]) }
    if (SW.test(s)) { sws++; if (!sw.test(s)) missed.push(['SW', s]) }
    if (ALT.test(s)) { alts++; if (!alt.test(s)) missed.push(['ALT', s]) }
  }
  check(`상위집합 퍼징(JS 해석) 40만 건: SW 적중 ${sws} · ALT 적중 ${alts} · 누락 0`, sws > 1000 && alts > 1000 && missed.length === 0, JSON.stringify(missed.slice(0, 5)))
  check('serverRegex: 모르는 문법·플래그는 null', [/a\sb/i, /a.b/i, /a+/i, /[ab]/i, /^a/i, /(?=a)b/i, /a{2}/i, /a/, /a/iu].every((r) => serverRegex(r) === null))
  console.log(`  서버 SW = ${serverRegex(SW)}\n  서버 ALT = ${serverRegex(ALT)}`)
}

async function translateChecks() {
  console.log('\n[C] relevance-translate.mjs --dry · loadAllVerdicts(화면 두 곳)')
  const data = () => { const d = buildDataset(); return d }
  const [o, n] = await both('relevance-translate.mjs', ['--dry', '--rounds', '3'], { LLM_PROVIDER: 'mock' }, { data })
  check('translate --dry: 원본 정상', o.code === 0, o.stderr.slice(-600))
  const ids = (s) => norm(s).filter((l) => /^ +- [0-9a-f-]{36}/.test(l))
  same('translate: 번역 대상 id·순서', ids(o.stdout), ids(n.stdout))
  check('translate: 대상이 있다', ids(o.stdout).length >= 20)
  same('translate: 묶음 뒤 로그', norm(o.stdout).filter((l) => !/→ 묶음/.test(l)), norm(n.stdout).filter((l) => !/→ 묶음/.test(l)))
  console.log(`  대상 ${ids(o.stdout).length}건`)
  bytesLine('    합계', o.stats, n.stats)
  tableLine(o.stats, n.stats)

  const { createClient } = await import('@supabase/supabase-js')
  const oldDb = await load(ORIG, 'lib/relevance-feedback/db.ts'), newDb = await load(NEW, 'lib/relevance-feedback/db.ts')
  const S = await load(NEW, 'lib/relevance-feedback/sample.ts')
  const cases = [['전 컬럼', {}], ['000031 없음', { drop: ['product_informative', 'second_product_informative', 'human_product_informative'] }], ['000027 없음', { drop: ['second_verdict', 'second_model', 'second_judged_at', 'auto_approved_at', 'product_informative', 'second_product_informative', 'human_product_informative'] }], ['human_product_informative 만 없음', { drop: ['human_product_informative'] }], ['2차 판정 0행', { noSecond: true }], ['표 비어 있음', { empty: true }]]
  for (const [name, c] of cases) {
    const make = () => { const d = buildDataset(); if (c.empty) d.review_relevance_verdicts = []; for (const r of d.review_relevance_verdicts) { for (const k of c.drop ?? []) delete r[k]; if (c.noSecond) r.second_verdict = null } return d }
    const run = async (db, opts) => { const mock = await startMock(make()); const r = await db.loadAllVerdicts(createClient(mock.url, 'k', { auth: { persistSession: false } }), opts); await mock.close(); return { r, stats: mock.stats } }
    const full = await run(oldDb)
    const screens = await run(newDb)
    const batch = await run(newDb, { cols: newDb.PICK_COLS, secondOnly: true })
    check(`${name}: 세 조회 성공`, !full.r.error && !screens.r.error && !batch.r.error, JSON.stringify([full.r.error, screens.r.error, batch.r.error]))
    const cols = newDb.FEEDBACK_COLS.split(', ')
    const project = (rows) => rows.map((r) => Object.fromEntries(cols.filter((k) => k in r).map((k) => [k, r[k]])))
    same(`${name}: 화면용 행 = 원본 행의 FeedbackRow 칸`, project(full.r.rows), project(screens.r.rows))
    let batches = 0
    for (let day = 0; day < 60; day++) {
      const today = day === 0 ? S.kstDate(new Date().toISOString()) : `2026-${String(9 + (day % 3)).padStart(2, '0')}-${String(1 + (day % 28)).padStart(2, '0')}`
      const excl = new Set()
      for (let round = 0; round < 3; round++) {
        const view = (rows) => { const b = S.pickBatch(rows, { today, exclude: excl }); return { ids: b.items.map((i) => [i.row.input_id, i.stratum]), strata: b.strata } }
        const f = view(full.r.rows), s = view(screens.r.rows), p = view(batch.r.rows)
        // 행이 0 이면 컬럼 유무가 '모름'이 된다 — 묶음(빈 것)만 같으면 된다.
        const emptyBatch = batch.r.rows.length === 0
        if (!isDeepStrictEqual(f, s) || !isDeepStrictEqual(f.ids, p.ids) || (!emptyBatch && !isDeepStrictEqual(f.strata, p.strata))) { check(`${name}: pickBatch ${today} r${round}`, false, JSON.stringify([f, s, p]).slice(0, 600)); day = 99; break }
        batches += f.ids.length
        for (const [id] of f.ids) excl.add(id)
      }
    }
    check(`${name}: pickBatch 60일×3회 동일(뽑힌 ${batches})`, true)
    const graded = (rows) => rows.filter((r) => r.human_verdict != null)
    const screen = (rows) => { const a = S.columnAvailability(rows); return { a, stats: S.stratumStats(graded(rows), a), dis: S.disagreements(graded(rows), a).map((d) => [d.row.input_id, d.stratum]), trend: S.dailyTrend(graded(rows), { today: '2026-09-04', days: 30 }, a), n: rows.length } }
    same(`${name}: /relevance/feedback 숫자`, screen(full.r.rows), screen(screens.r.rows))
    console.log(`  ${name}: 원본 ${full.r.rows.length}행 · 번역용 ${batch.r.rows.length}행`)
    bytesLine('    화면(grade·feedback)', full.stats, screens.stats)
    bytesLine('    번역 배치', full.stats, batch.stats)
  }
}

setup()
try {
  const only = process.argv[2]
  for (const [k, f] of [['A1', libraryChecks], ['A2', judgeChecks], ['A3', secondChecks], ['B', mentionChecks], ['C', translateChecks]]) if (!only || only === k) await f()
} finally {
  for (const d of [ORIG, NEW]) fs.rmSync(d, { recursive: true, force: true })
}
console.log(`\negress-harness: ${pass} pass · ${fail} fail${fail ? `\n  실패: ${failures.join(' / ')}` : ''}`)
process.exit(fail ? 1 : 0)
