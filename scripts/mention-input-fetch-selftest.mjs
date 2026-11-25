#!/usr/bin/env node
// 언급 루프 입력 추출(mention-input-fetch.mjs) 셀프테스트 — 서버에서 먼저 거른 결과가 전부 받아 거른 결과와 같은가(v71ek).
// 127.0.0.1 가짜 PostgREST 에 스크립트를 그대로 돌린다. DB·바깥 네트워크 없음.
// ⚠️ 가짜 서버의 imatch 는 JS 정규식이다 — Postgres 정규식 엔진 확인이 아니다.
//   node scripts/mention-input-fetch-selftest.mjs
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let pass = 0, fail = 0
const t = (name, ok, detail = '') => { if (ok) pass++; else { fail++; console.log(`✗ ${name} ${detail}`) } }

const TEXTS = ['I switched last week', '그냥 좋아요', '쓰던 것보다 낫네요', '대신\u00a0쓸\u3000만한 서비스', '갈아타게 다른 앱\n추천 받아요', 'LOOKING FOR AN ALTERNATIVE', 'Looking for a cheap alternative',
  '대체 어플 찾는 중', '갈아\t탈 만한 것', '대신 갑니다', 'Compared with before', 'any good alternatives?', 'nothing here', '']
const VERDICTS = [null, { verdict: 'relevant', human_verdict: null, auto_approved_at: null }, { verdict: 'irrelevant', human_verdict: 'relevant', auto_approved_at: null },
  { verdict: 'relevant', human_verdict: 'irrelevant', auto_approved_at: 'x' }, { verdict: 'irrelevant', human_verdict: null, auto_approved_at: null }, { verdict: 'relevant', human_verdict: null, auto_approved_at: 'x' }]
const inputs = [], verdicts = []
for (let i = 0; i < TEXTS.length * VERDICTS.length * 20; i++) {
  const id = `i${String(i).padStart(5, '0')}`
  const v = VERDICTS[Math.floor(i / TEXTS.length) % VERDICTS.length]
  inputs.push({ id, project_id: ['p1', 'hold', 'gone'][i % 41 === 0 ? 1 : i % 43 === 0 ? 2 : 0], source_key: 'appstore', raw_text: TEXTS[i % TEXTS.length], purged_at: i % 37 === 0 ? 'x' : null })
  if (v) verdicts.push({ input_id: id, ...v })
}
const byInput = new Map(verdicts.map((v) => [v.input_id, v]))
const TABLES = { analysis_projects: [{ id: 'p1', area_code: '1' }, { id: 'hold', area_code: 'hold' }], review_relevance_verdicts: verdicts, review_targets: [], review_sources: [], discovery_candidates: [] }

async function run(rejectImatch) {
  const seen = { inputRows: 0, verdictRows: 0 }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), table = u.pathname.split('/').pop(), p = u.searchParams
    const rx = p.getAll('raw_text').filter((x) => x.startsWith('imatch.')).map((x) => new RegExp(x.slice(7), 'i'))
    if (rx.length && rejectImatch) { res.writeHead(500); return res.end('{"code":"57014"}') }
    const key = p.get('order') ?? 'id'
    const after = p.get(key)?.slice(3) ?? ''
    let rows, total
    if (table === 'analysis_inputs') {
      const embed = /,v:review_relevance_verdicts(!inner)?\(/.exec(p.get('select'))
      rows = inputs.filter((r) => r.purged_at === null && rx.every((re) => re.test(r.raw_text)))
        .map((r) => {
          const row = { id: r.id, project_id: r.project_id, source_key: r.source_key, raw_text: r.raw_text }
          if (!embed) return row
          let v = byInput.get(r.id) ?? null
          if (p.has('v.or')) v = v && (v.human_verdict ?? v.verdict) === 'relevant' ? v : null
          return embed[1] && !v ? null : { ...row, v: v && { verdict: v.verdict, human_verdict: v.human_verdict, auto_approved_at: v.auto_approved_at } }
        }).filter(Boolean)
    } else rows = TABLES[table] ?? []
    total = rows.length
    rows = rows.filter((r) => String(r[key] ?? '') > after).slice(0, Number(p.get('limit') ?? 1000))
    if (table === 'analysis_inputs') seen.inputRows += p.get('select') === 'id' ? 0 : rows.length
    if (table === 'review_relevance_verdicts') seen.verdictRows += rows.length
    res.writeHead(200, { 'content-type': 'application/json', 'content-range': `0-0/${total}` })
    res.end(JSON.stringify(rows))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mention-fetch-')), 'in.json')
  const res = await new Promise((resolve) => execFile(process.execPath, [fileURLToPath(new URL('./mention-input-fetch.mjs', import.meta.url)), `--out=${out}`],
    { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'dummy' } },
    (err, stdout, stderr) => resolve({ code: err ? 1 : 0, stdout, stderr })))
  server.closeAllConnections(); server.close()
  const text = res.code === 0 ? fs.readFileSync(out, 'utf8') : null
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
  return { ...res, text, seen }
}

const filtered = await run(false), full = await run(true)
t('두 경로 정상 종료', filtered.code === 0 && full.code === 0, filtered.stderr + full.stderr)
t('서버 거르기 결과 = 전부 받아 거른 결과(바이트 동일)', filtered.text !== null && filtered.text === full.text)
const posts = JSON.parse(filtered.text ?? '{"posts":[]}').posts
t('세 종류 글이 모두 있다', ['approved', 'relevant', 'alt_seek'].every((k) => posts.some((p) => p.verdict_kind === k)))
t('특수 공백(NBSP·전각)·줄바꿈 ALT 도 남는다', posts.some((p) => p.raw_text.includes('\u00a0')) && posts.some((p) => p.raw_text.includes('\n')))
t('거르기 경로는 판정 표를 통째로 읽지 않는다', filtered.seen.verdictRows === 0 && full.seen.verdictRows === verdicts.length)
t('거르기 경로가 원문을 덜 받는다', filtered.seen.inputRows < full.seen.inputRows, `${filtered.seen.inputRows} vs ${full.seen.inputRows}`)
t('inputs 로그 수 동일', /inputs: (\d+)/.exec(filtered.stdout)?.[1] === /inputs: (\d+)/.exec(full.stdout)?.[1])
t('후퇴할 때만 경고', !filtered.stderr.includes('전부 받는 예전 방식') && full.stderr.includes('전부 받는 예전 방식'))

// 서버 정규식 변환: 모르는 문법이면 null(= 전부 받기)
const src = fs.readFileSync(new URL('./mention-input-fetch.mjs', import.meta.url), 'utf8')
const { SW, ALT, serverRegex } = new Function(`${/^const SW = .*$/m.exec(src)[0]}\n${/^const ALT = .*$/m.exec(src)[0]}\n${/^function serverRegex[\s\S]*?^}/m.exec(src)[0]}\nreturn { SW, ALT, serverRegex }`)()
t('지금의 SW·ALT 는 변환된다', serverRegex(SW) === SW.source && serverRegex(ALT) !== null && !serverRegex(ALT).includes('\\s'))
t('모르는 문법·플래그는 null', [/a\sb/i, /a.b/i, /a+/i, /[ab]/i, /^a/i, /(?=a)b/i, /a{2}/i, /a/, /a/iu].every((r) => serverRegex(r) === null))

console.log(`mention-input-fetch selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
