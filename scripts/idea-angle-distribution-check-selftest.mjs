#!/usr/bin/env node
// 앵글 판정 분포 체크 회귀 — 네트워크·DB·토큰 없음. DB 는 주입한 loadRuns, Notion 은 가짜 fetch.
//
//   node scripts/idea-angle-distribution-check-selftest.mjs
//
// 고정하는 것: 분포 계산 · 50건/7일 창 닫힘 · 둘 다 미달이면 무동작 · 표본 부족 · 임계 이상 경보 페이로드 ·
// 임계 미만 행 0 · 같은 날/다음 날 재실행 행 1 · Notion 실패/토큰 없음 → 폴백 + ok:false · DB 못 읽음 → 확인 불가(종료 코드 1) ·
// 뮤테이션 3개(임계 방향 뒤집기 · 멱등 끄기 · 표본 부족 가드 끄기)를 실제로 돌려 이 스위트가 잡는지.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, 'idea-angle-distribution-check.mjs')
const DB = 'f57ae10b-4cc0-433b-9db6-20785216aebe'
const DAY = 86_400_000
const EPOCH = '2026-10-01T00:00:00Z'
const T0 = Date.parse(EPOCH)
const cfg = { runs: 50, days: 7, minRuns: 5, alert: 0.9, epoch: EPOCH }

const E = 'EXPERIENTIAL', S = 'SUBSTANTIATED', U = 'UNSUBSTANTIATED'
const run = (ms, verdicts) => ({ id: `r${ms}`, finished_at: new Date(ms).toISOString(), angles: verdicts.map((verdict) => ({ verdict })) })
/** n 실행, 앵글 3개씩, 전체 앵글 중 exp 개를 EXPERIENTIAL 로(앞에서부터), 나머지는 SUBSTANTIATED. start 부터 1분 간격. */
function batch(n, exp, start = T0 + 3600_000) {
  let left = exp
  return Array.from({ length: n }, (_, i) => run(start + i * 60_000, [0, 1, 2].map(() => (left-- > 0 ? E : S))))
}

// ── 가짜 Notion(일일 상태 로그 DB, 메모리) ─────────────────────────────
function fakeNotion({ createStatus = 200 } = {}) {
  const pages = []
  const calls = []
  const txt = (p, k) => (p.properties[k]?.rich_text ?? p.properties[k]?.title ?? []).map((t) => t.text?.content ?? t.plain_text).join('')
  const match = (p, c) => c.and ? c.and.every((x) => match(p, x))
    : c.date ? p.properties.날짜.date.start === c.date.equals
      : c.select ? p.properties.트랙.select.name === c.select.equals
        : c.rich_text ? txt(p, c.property).includes(c.rich_text.contains)
          : txt(p, '제목').startsWith(c.title.starts_with)
  const view = (p) => ({
    id: p.id, url: `https://notion.so/${p.id}`, parent: { database_id: DB.replace(/-/g, '') },
    properties: Object.fromEntries(Object.entries(p.properties).map(([k, v]) => {
      const type = Object.keys(v)[0]
      const val = type === 'title' || type === 'rich_text' ? v[type].map((t) => ({ plain_text: t.text?.content ?? t.plain_text })) : v[type]
      return [k, { type, [type]: val }]
    })),
  })
  const fn = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ method: init.method, url, body })
    const res = (status, data) => ({ ok: status < 300, status, json: async () => data })
    if (init.method === 'POST' && url.endsWith('/query')) return res(200, { results: pages.filter((p) => match(p, body.filter)).map(view), has_more: false })
    if (init.method === 'POST') {
      if (createStatus !== 200) return res(createStatus, { code: 'x', message: 'fake create fail' })
      const p = { id: `page-${pages.length + 1}`, properties: body.properties }
      pages.push(p)
      return res(200, { id: p.id, url: `https://notion.so/${p.id}` })
    }
    const p = pages.find((x) => x.id === url.split('/pages/')[1])
    if (!p) return res(404, { code: 'object_not_found', message: 'nope' })
    if (init.method === 'PATCH') { Object.assign(p.properties, body.properties); return res(200, {}) }
    return res(200, view(p))
  }
  Object.assign(fn, { pages, calls, txt })
  return fn
}

/** 스위트 — 실패 메시지 목록을 돌려준다(원본은 0개, 뮤턴트는 1개 이상이어야 한다). */
async function suite(m) {
  const fails = []
  let pass = 0
  const ok = (name, cond) => { if (cond) pass++; else fails.push(name) }
  const realFetch = globalThis.fetch
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-dist-'))
  const base = { cfg, token: 't', dbId: DB, pendingDir: tmp, runUrl: 'https://github.com/x/y/actions/runs/9' }
  const at = (ms) => new Date(ms)
  const date = (ms) => m.kstDateOf(at(ms))
  try {
    // 1) 분포 — 알려진 입력 → 알려진 출력
    const d = m.distribution([run(T0, [E, E, E]), run(T0, [S, E, U]), run(T0, [E, E, 'WEIRD']), run(T0, [])])
    ok('1 분포 개수', d.runs === 4 && d.angles === 9 && d.EXPERIENTIAL === 6 && d.SUBSTANTIATED === 1 && d.other === 2)
    ok('1 분포 비율', Math.abs(d.experientialRate - 6 / 9) < 1e-9 && Math.abs(d.substantiatedRate - 1 / 9) < 1e-9 && Math.abs(d.otherRate - 2 / 9) < 1e-9)
    ok('1 실행 단위: 전부 체험 기반 1/4(빈 앵글 실행은 세지 않는다)', d.allExperientialRuns === 1 && d.allExperientialRunRate === 0.25)

    // 2) 50건 조건 — 하루 만에 50건 → 실행 수로 닫힘
    const fifty = batch(50, 150)
    const w2 = m.windows(fifty, cfg, at(T0 + DAY))
    ok('2 50건이면 창이 닫힌다(count)', w2.closed.length === 1 && w2.closed[0].reason === 'count' && w2.closed[0].runs.length === 50)
    ok('2 49건이면 안 닫힌다', m.windows(fifty.slice(0, 49), cfg, at(T0 + DAY)).closed.length === 0)

    // 3) 7일 조건 — 10건, 8일째 → 경과 일수로 닫힘. 경계 시각 정각 실행은 다음 창.
    const ten = batch(10, 30)
    const w3 = m.windows([...ten, run(T0 + 7 * DAY, [E])], cfg, at(T0 + 8 * DAY))
    ok('3 7일이 지나면 창이 닫힌다(days)', w3.closed.length === 1 && w3.closed[0].reason === 'days' && w3.closed[0].runs.length === 10)
    ok('3 경계 정각 실행은 다음 창', w3.open.runs.length === 1)
    ok('3 EPOCH 이전 실행은 세지 않는다', m.windows([run(T0 - 1, [E]), ...ten], cfg, at(T0 + 8 * DAY)).closed[0].runs.length === 10)

    // 4) 둘 다 미달 → 아무것도 안 함
    let f = fakeNotion(); globalThis.fetch = f
    const r4 = await m.runCheck({ ...base, loadRuns: async () => ten, now: at(T0 + 3 * DAY) })
    ok(`4 둘 다 미달이면 waiting (${r4.status})`, r4.ok && r4.status === 'waiting' && /10\/50건/.test(r4.message))
    ok('4 Notion 호출 0회', f.calls.length === 0)

    // 5) 표본 부족 — 7일에 4건(전부 체험 기반이어도) → 경보 없음
    f = fakeNotion(); globalThis.fetch = f
    const r5 = await m.runCheck({ ...base, loadRuns: async () => batch(4, 12), now: at(T0 + 8 * DAY) })
    ok(`5 표본 부족 (${r5.status})`, r5.ok && r5.status === 'insufficient' && r5.message.includes('표본 부족 4건'))
    ok('5 표본 부족이면 Notion 호출 0회', f.calls.length === 0)

    // 6) 임계 이상 → 경보 행. 정확히 90%(135/150)도 경보다(>=).
    f = fakeNotion(); globalThis.fetch = f
    const now6 = T0 + DAY
    const r6 = await m.runCheck({ ...base, loadRuns: async () => batch(50, 135), now: at(now6) })
    ok(`6 90.0% 는 경보 (${r6.status}: ${r6.message})`, r6.ok && r6.status === 'alert')
    ok('6 행 1개', f.pages.length === 1)
    const p = f.pages[0]
    ok('6 사람판단필요=true', p.properties.사람판단필요.checkbox === true)
    ok('6 트랙 CTO · 제목 YYYY-MM-DD-CTO(KST)', p.properties.트랙.select.name === 'CTO' && f.txt(p, '제목') === `${date(now6)}-CTO`)
    const blocked = f.txt(p, '막힌것')
    ok('6 분포 수치', blocked.includes('체험 기반 135(90.0%)') && blocked.includes('선례 근거 있음 15(10.0%)') && blocked.includes('기타 0(0.0%)'))
    ok('6 실행 단위 참고치', blocked.includes('앵글 전부 체험 기반인 실행 45/50(90.0%)'))
    ok('6 실행 링크', blocked.includes('https://github.com/x/y/actions/runs/9'))
    ok('6 비고에 창 표지', f.txt(p, '비고').includes(`idea-angle-distribution@${new Date(T0).toISOString()}`))
    ok('6 알림완료를 쓰지 않는다', !('알림완료' in p.properties))

    // 7) 임계 미만(134/150 = 89.3%) → 행 0
    f = fakeNotion(); globalThis.fetch = f
    const r7 = await m.runCheck({ ...base, loadRuns: async () => batch(50, 134), now: at(T0 + DAY) })
    ok(`7 89.3% 는 정상 (${r7.status})`, r7.ok && r7.status === 'healthy')
    ok('7 정상이면 Notion 호출 0회', f.calls.length === 0)

    // 8) 멱등 — 같은 날 두 번, 다음 날 한 번 더 → 행 1개
    f = fakeNotion(); globalThis.fetch = f
    const all = async () => batch(50, 150)
    await m.runCheck({ ...base, loadRuns: all, now: at(T0 + DAY) })
    const r8b = await m.runCheck({ ...base, loadRuns: all, now: at(T0 + DAY + 3600_000) })
    ok(`8 같은 날 두 번째는 이미 알림 (${r8b.status})`, r8b.ok && r8b.status === 'already')
    ok('8 같은 날 두 번 → 행 1', f.pages.length === 1)
    await m.runCheck({ ...base, loadRuns: all, now: at(T0 + 2 * DAY) })
    ok('8 다음 날(같은 창) → 여전히 행 1', f.pages.length === 1)

    // 9) Notion 쓰기 실패 → 폴백 파일 + ok:false
    globalThis.fetch = fakeNotion({ createStatus: 500 })
    const r9 = await m.runCheck({ ...base, loadRuns: all, now: at(T0 + DAY) })
    ok('9 쓰기 실패는 ok:false', r9.ok === false && r9.status === 'alert')
    ok(`9 폴백 파일 (${r9.record?.pendingPath})`, !!r9.record?.pendingPath && fs.existsSync(r9.record.pendingPath))
    ok('9 폴백 파일에 사람판단필요·분포', !!r9.record?.pendingPath && /사람판단필요: true/.test(fs.readFileSync(r9.record.pendingPath, 'utf-8')) && fs.readFileSync(r9.record.pendingPath, 'utf-8').includes('체험 기반 150(100.0%)'))

    // 9b) 토큰 없음 → 호출 0 · 실패 · 폴백
    let called = 0
    globalThis.fetch = async () => { called++; throw new Error('토큰 없으면 호출하면 안 된다') }
    const r9b = await m.runCheck({ ...base, token: '', loadRuns: all, now: at(T0 + DAY) })
    ok('9b 토큰 없음은 실패(env)', r9b.ok === false && r9b.record?.stage === 'env' && called === 0)
    ok('9b 토큰 없음도 폴백 파일', !!r9b.record?.pendingPath && fs.existsSync(r9b.record.pendingPath))

    // 10) DB 를 못 읽음 → 확인 불가, Notion 호출 0
    f = fakeNotion(); globalThis.fetch = f
    const r10 = await m.runCheck({ ...base, loadRuns: async () => { throw new Error('db down') }, now: at(T0 + DAY) })
    ok('10 못 읽으면 확인 불가(ok:false)', r10.ok === false && r10.status === 'unknown' && r10.message.includes('확인 불가') && r10.message.includes('db down'))
    ok('10 확인 불가면 Notion 호출 0회', f.calls.length === 0)

    // 11) --dry → 경보 계산은 하되 Notion 호출 0
    f = fakeNotion(); globalThis.fetch = f
    const r11 = await m.runCheck({ ...base, dry: true, loadRuns: all, now: at(T0 + DAY) })
    ok('11 dry 는 페이로드만', r11.ok && r11.status === 'dry' && r11.entry?.needsHuman === true && f.calls.length === 0)

    // 12) 설정 한 곳 — env 로 덮는다, 이상한 값은 기본값
    const c = m.config({ IDEA_DIST_RUNS: '30', IDEA_DIST_ALERT: '0.93', IDEA_DIST_DAYS: 'x' })
    ok('12 env 덮기', c.runs === 30 && c.alert === 0.93 && c.days === 7 && c.minRuns === 15)
  } catch (e) {
    fails.push(`예외: ${e.message}`)
  } finally {
    globalThis.fetch = realFetch
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return { fails, pass }
}

// kstDate 는 notion-status-log.mjs 것을 쓴다 — 스위트가 모듈 경계 밖 날짜를 지어내지 않게.
const { kstDate } = await import('./notion-status-log.mjs')
const load = async (file) => ({ ...(await import(pathToFileURL(file).href + `?t=${Date.now()}`)), kstDateOf: kstDate })

// ── 원본 ──
const real = await suite(await load(SRC))
for (const f of real.fails) console.error(`  ✗ ${f}`)
assert.equal(real.fails.length, 0, `원본 스위트 실패 ${real.fails.length}건`)
console.log(`원본: ${real.pass}개 통과`)

// ── CLI 종료 코드 — DB 자격증명 없음 = 확인 불가 = 1 (실제 DB 에 닿지 않는다) ──
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', NOTION_API_TOKEN: '' }
const cli = spawnSync(process.execPath, [SRC], { env, encoding: 'utf-8', cwd: os.tmpdir() })
assert.equal(cli.status, 1, `CLI 종료 코드 기대 1, 실제 ${cli.status}\n${cli.stdout}${cli.stderr}`)
assert.match(cli.stderr, /확인 불가/, 'CLI 가 확인 불가를 출력해야 한다')
console.log('CLI: 자격증명 없음 → 종료 코드 1 · 확인 불가')

// ── 뮤테이션 — 원본 소스를 바꿔 같은 폴더에 쓰고(상대 import 유지) 스위트를 다시 돌린다. 하나라도 살아남으면 실패 ──
const src = fs.readFileSync(SRC, 'utf-8')
const MUTANTS = [
  ['임계 비교 방향 뒤집기', 'dist.experientialRate >= cfg.alert', 'dist.experientialRate < cfg.alert'],
  ['멱등 끄기(이미 알린 창 확인 무시)', 'if (seen.ok && seen.hit) return', 'if (false) return'],
  ['표본 부족 가드 끄기', 'dist.runs < cfg.minRuns || ', ''],
]
let killed = 0
for (const [name, from, to] of MUTANTS) {
  assert.ok(src.includes(from), `뮤턴트 "${name}" 의 원문이 소스에 없다 — 셀프테스트를 소스와 맞춰라`)
  const file = path.join(here, `.mutant-${killed}-idea-angle-distribution-check.mjs`)
  fs.writeFileSync(file, src.replace(from, to))
  try {
    const r = await suite(await load(file))
    assert.ok(r.fails.length > 0, `뮤턴트 "${name}" 가 살아남았다 — 스위트가 이 결함을 못 잡는다`)
    console.log(`뮤턴트 잡힘: ${name} — ${r.fails.length}건 실패 (예: ${r.fails[0]})`)
    killed++
  } finally {
    fs.rmSync(file, { force: true })
  }
}

// ── 워크플로 배선(연결했을 때만) ──
const wf = fs.readFileSync(path.join(here, '..', '.github', 'workflows', 'nightly-review-collect.yml'), 'utf-8')
if (wf.includes('idea-angle-distribution-check.mjs')) {
  assert.match(wf, /name: Idea angle distribution check\r?\n\s+if: always\(\)/, '배선: 수집이 실패해도 돈다(if: always())')
  assert.ok(wf.indexOf('idea-angle-distribution-check.mjs') < wf.indexOf('name: Detect pending status log'), '배선: 폴백 감지 스텝보다 앞이어야 폴백 파일이 main 으로 간다')
  assert.match(wf, /^permissions:\s*\n\s+contents: read\s*$/m, '배선: permissions 는 contents: read 그대로')
  console.log('워크플로: nightly-review-collect 에 연결 확인(if: always · 폴백 감지 앞 · permissions read)')
}

console.log(`✅ idea-angle-distribution-check selftest — 원본 ${real.pass}개 통과 · 뮤턴트 ${killed}/${MUTANTS.length} 잡음`)
