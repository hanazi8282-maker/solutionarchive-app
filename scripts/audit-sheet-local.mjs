// v71br — 감사 표본 시트(로컬 전용). 공개 리포 Actions 아티팩트로는 올리지 않는다(원문 발췌가 외부에 읽힌다).
//   node --env-file=.env.local scripts/audit-sheet-local.mjs --n 12 --tag 2026-11-06
//   쓰는 곳: ~/sa-private/grades/ 만. stdout 에는 건수·소스 분포만 찍는다. 채점 페이지는 이 md 를 Notion 비공개 페이지로 옮긴다.
// v71bn 감사 표본: 최근 14일 자동 승인 행 중 소스×영역 층화 24건. 모델 판정은 key 파일에만.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { loadScope } from '../lib/analysis/approval-scope.ts'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const N = Number(arg('n', 12)), SEED = Number(arg('seed', 1030)), TAG = arg('tag', new Date().toISOString().slice(0, 10))
if (!Number.isInteger(N) || N < 1) { console.error('사용법: --n 12 [--seed 1030] [--tag YYYY-MM-DD]'); process.exit(64) }
const sb = await createClient(); if (!sb) { console.error('DB 연결 실패'); process.exit(2) }
const since = new Date(Date.now() - 14 * 864e5).toISOString()
const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('review_relevance_verdicts').select('input_id, project_id, verdict, auto_approved_at, human_verdict').not('auto_approved_at', 'is', null).gte('auto_approved_at', since).order('input_id').range(from, from + 999)
  if (error) { console.error(error.message); process.exit(2) }
  rows.push(...data); if (data.length < 1000) break
}
console.log('최근14일 자동승인', rows.length)
const sc = await loadScope(sb, rows.map(r => r.input_id)); if (!sc.ok) { console.error(sc.error); process.exit(2) }
const pool = rows.filter(r => !sc.excluded.has(r.input_id) && r.human_verdict == null)
console.log('영역외·소비재 제외 후', pool.length)
const meta = new Map()
for (let i = 0; i < pool.length; i += 200) {
  const { data, error } = await sb.from('analysis_inputs').select('id, source_key, raw_text').in('id', pool.slice(i, i + 200).map(r => r.input_id))
  if (error) { console.error(error.message); process.exit(2) }
  for (const d of data) meta.set(d.id, d)
}
const pids = [...new Set(pool.map(r => r.project_id))], area = new Map()
for (let i = 0; i < pids.length; i += 100) {
  const { data, error } = await sb.from('analysis_projects').select('id, area_code').in('id', pids.slice(i, i + 100))
  if (error) { console.error(error.message); process.exit(2) }
  for (const d of data) area.set(d.id, d.area_code ?? '미부여')
}
const items = pool.map(r => ({ id: r.input_id, src: meta.get(r.input_id)?.source_key ?? '?', area: area.get(r.project_id) ?? '?', text: (meta.get(r.input_id)?.raw_text ?? '').trim() })).filter(x => x.text.length >= 40)
// 셀(소스×영역) 라운드로빈 — 결정적 해시 순
const h = s => { let x = SEED; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x }
const cells = new Map()
for (const it of items) { const k = it.src + '|' + it.area; (cells.get(k) ?? cells.set(k, []).get(k)).push(it) }
for (const l of cells.values()) l.sort((a, b) => h(a.id) - h(b.id))
const order = [...cells.keys()].sort((a, b) => h(a) - h(b)), pick = []
while (pick.length < N && order.some(k => cells.get(k).length)) for (const k of order) { const it = cells.get(k).shift(); if (it && pick.length < N) pick.push(it) }
pick.sort((a, b) => h(a.id + 'x') - h(b.id + 'x'))
const dist = {}; for (const p of pick) dist[p.src] = (dist[p.src] ?? 0) + 1
console.log('소스 분포', JSON.stringify(dist), '셀 수', cells.size)
const cut = (s, n) => s.replace(/\s+/g, ' ').slice(0, n) + (s.length > n ? '…' : '')
const md = [`# [남헌 채점] T2 감사 표본 ${TAG}`, '', '각 건에 한 글자로 답하세요: **예 / 아니오 / 애매**', '질문: 이 글은 영역 ①~⑤ 안에서 쓸모 있는 정보인가? (제품·경쟁/대체재를 판단할 구체 정보가 있으면 예)', '', ...pick.map((p, i) => `### ${i + 1}. ${p.src} · 영역 ${p.area}\n${cut(p.text, 400)}\n\n답: `)].join('\n')
const dir = (process.env.HOME ?? process.env.USERPROFILE) + '/sa-private/grades/'
mkdirSync(dir, { recursive: true })
writeFileSync(dir + `${TAG}-t2-audit-sheet.md`, md, 'utf8')
writeFileSync(dir + `${TAG}-t2-audit-key.json`, JSON.stringify(pick.map((p, i) => ({ n: i + 1, input_id: p.id, src: p.src, area: p.area })), null, 1), 'utf8')
console.log('쓴 곳', dir)
