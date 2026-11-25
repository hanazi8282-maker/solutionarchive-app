#!/usr/bin/env node
// v71ek 실제 API 대조 — 머지 전에 한 번. 읽기만 한다(readonly-guard 가 GET·HEAD 밖 요청을 막는다).
//   리포 루트에서: node --env-file=<.env.local 경로> reports/2026-11-25/v71ek/real-api-compare.mjs
//   세 벌을 같은 실 DB 에 돌린다: 원본(BASE) · 절감(PIN, 시간 초과 프로젝트는 예전 방식) · 절감+고정 해제(HEAD).
//   전송량이 든다(원본 쪽이 대부분, 압축 전 약 400MB) — 402 해제(Pro) 뒤에만 돌린다.
//   야간 크론(19:03·02:03·06:03 UTC)이 도는 시간은 피한다. 도중에 판정이 늘면 차이가 난다.
// 끝 코드: 0 통과 · 1 불합격 · 2 확인 불가(통과 아님).
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const REFS = { BASE: 'a157d963', PIN: 'ec70361c', HEAD: 'HEAD' }
const PINNED = '55d574a2'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const unknown = (m) => { console.log(`확인 불가: ${m}`); process.exit(2) }
if (!url || !key) unknown('NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 없다(--env-file)')
const ping = await fetch(`${url}/rest/v1/analysis_projects?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch((e) => unknown(e.message))
if (!ping.ok) unknown(`앱 API HTTP ${ping.status} — ${(await ping.text()).slice(0, 200)}`)

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'v71ek-real-'))
const dirs = {}
for (const [name, ref] of Object.entries(REFS)) {
  const dir = (dirs[name] = path.join(work, name))
  fs.mkdirSync(dir)
  execFileSync('git', ['archive', '-o', path.join(dir, 'a.tar'), ref, 'lib', 'scripts', 'config', 'package.json'], { cwd: root })
  execFileSync('tar', ['-xf', 'a.tar'], { cwd: dir })
  fs.rmSync(path.join(dir, 'a.tar'))
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
}
// 운영 워크플로와 같은 값(2026-11-26 확인한 리포 변수). 바뀌었으면 환경변수로 덮어쓴다.
const env = {
  RELEVANCE_EXCLUDE_SOURCES: 'none', RELEVANCE_CRITERIA: 'v24', RELEVANCE_CAPACITY_GUARD: 'off', RELEVANCE_SECOND_MAX: '1500',
  RELEVANCE_SECOND_TOPIC_DAILY: '400', RELEVANCE_SAMPLE: '1000', RELEVANCE_MAX_PROJECTS: '30', AUTO_APPROVAL_ENABLED: 'true',
  AUTO_APPROVAL_SINCE: '2026-09-28T12:30:00Z', LLM_PROVIDER: 'mock', ...process.env,
}
function run(name, script, args) {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(here, 'readonly-guard.mjs')).href, path.join('scripts', script), ...args],
    { cwd: dirs[name], env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900_000 })
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  fs.writeFileSync(path.join(work, `${name}-${script}.log`), log)
  return { code: r.status, out: r.stdout ?? '', log }
}
const norm = (s) => s.split(/\r?\n/)
  .filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings|MODULE_TYPELESS|나눠 읽기 불가|판정 수 서버 세기 불가/.test(l))
  .map((l) => l.replace(/^\[\d{4}-[^\]]+\] /, '').replace(/rss \d+MB/g, 'rss N').replace(/메모리 피크 \d+MB/g, '메모리 피크 N').replace(/run_key=\S+/g, 'run_key=X').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'TIME'))
const diff = (a, b) => { const A = new Set(a), B = new Set(b); return [...a.filter((l) => !B.has(l)).map((l) => `  - ${l}`), ...b.filter((l) => !A.has(l)).map((l) => `  + ${l}`)] }
let fail = 0
const check = (name, ok, detail = []) => { console.log(`${ok ? '통과' : '불합격'} · ${name}`); if (!ok) { fail++; for (const l of detail.slice(0, 40)) console.log(l) } }
const FALLBACK = /나눠 읽기 불가|판정 수 서버 세기 불가|전부 받는 예전 방식/

// 1) 관련성 1차·2차·번역 — 대상 선정까지(--dry)
for (const [script, args] of [['relevance-judge-auto.mjs', ['--dry']], ['relevance-second-judge-auto.mjs', ['--dry']], ['relevance-translate.mjs', ['--dry', '--rounds', '3']]]) {
  const r = { BASE: run('BASE', script, args), PIN: run('PIN', script, args), HEAD: run('HEAD', script, args) }
  // 종료 코드만 보지 않는다(§7.1): 끝까지 간 표지를 확인한다. Windows Node 는 정상 종료 직후 libuv 단언(UV_HANDLE_CLOSING)으로 죽기도 해 그때는 표지를 본다.
  const done = script === 'relevance-translate.mjs' ? /번역 대상 \d+건/ : /--dry: 여기서 끝낸다/
  for (const n of Object.keys(r)) check(`${script} ${n}: 끝까지 실행·쓰기 시도 없음`, done.test(r[n].out) && (r[n].code === 0 || r[n].log.includes('UV_HANDLE_CLOSING')) && !r[n].log.includes('readonly-guard'), r[n].log.split('\n').slice(-15))
  if (script === 'relevance-translate.mjs') {
    const ids = (s) => norm(s).filter((l) => /^ +- [0-9a-f-]{36}/.test(l))
    check('번역 대상 id·순서 원본=절감', isDeepStrictEqual(ids(r.BASE.out), ids(r.PIN.out)), diff(ids(r.BASE.out), ids(r.PIN.out)))
    check('번역 대상 id·순서 절감=HEAD', isDeepStrictEqual(ids(r.PIN.out), ids(r.HEAD.out)), diff(ids(r.PIN.out), ids(r.HEAD.out)))
  } else {
    // 원본=절감: 모든 줄이 같아야 한다.
    const a = norm(r.BASE.out), b = norm(r.PIN.out), c = norm(r.HEAD.out)
    check(`${script} 원본=절감: 로그 동일`, isDeepStrictEqual(a, b), diff(a, b))
    // 고정 해제: 그 프로젝트 줄, 품질·소비재 보류 건수 줄, 그 때문에 바뀌는 합계 줄만 달라도 된다. 대상 프로젝트 줄은 같아야 한다.
    const allowed = new RegExp(`${PINNED}|품질 표시|소비재 태그|미판정 전체`)
    const rest = (x) => x.filter((l) => !allowed.test(l))
    check(`${script} 절감→HEAD: 허용한 줄 밖 차이 없음`, isDeepStrictEqual(rest(b), rest(c)), diff(rest(b), rest(c)))
    for (const l of diff(b, c)) console.log(`    (고정 해제 차이) ${l}`)
  }
  const bad = r.HEAD.log.split('\n').filter((l) => FALLBACK.test(l))
  check(`${script} HEAD: 예전 방식 후퇴 안내 없음`, bad.length === 0, bad)
}

// 2) 언급·새 출시 입력 추출 — 출력 파일 비교
const files = {}
for (const n of ['BASE', 'HEAD']) {
  const out = path.join(work, `${n}-mention.json`)
  const r = run(n, 'mention-input-fetch.mjs', [`--out=${out}`])
  check(`mention-input-fetch ${n}: 정상 종료`, r.code === 0, r.log.split('\n').slice(-15))
  if (r.code === 0) files[n] = fs.readFileSync(out)
  if (n === 'HEAD') check('mention-input-fetch HEAD: 예전 방식 후퇴 안내 없음', !FALLBACK.test(r.log), r.log.split('\n').filter((l) => FALLBACK.test(l)))
}
if (files.BASE && files.HEAD) {
  const same = files.BASE.equals(files.HEAD)
  const sizes = Object.entries(files).map(([n, b]) => { const j = JSON.parse(b); return `  ${n}: ${b.length}바이트 · ${Object.entries(j).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : '-'}`).join(' · ')}` })
  check('mention 출력 바이트 동일', same, sizes)
}
// 임시 폴더를 지울 때 링크를 따라가 진짜 node_modules 가 지워지지 않게 링크부터 끊는다.
for (const d of Object.values(dirs)) fs.unlinkSync(path.join(d, 'node_modules'))
console.log(`\n불합격 ${fail}건 · 로그·출력: ${work} (원문이 들어 있다 — 확인 뒤 지운다, 커밋 금지)`)
process.exit(fail ? 1 : 0)
