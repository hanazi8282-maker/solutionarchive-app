// 재시험 표본 100건 + 1차/2차 역할 프롬프트 파일을 만든다(리포 밖 스크래치).
import fs from 'node:fs'
import path from 'node:path'
const REPO = process.argv[2]
const OUT = process.argv[3]
const { pathToFileURL } = await import('node:url')
const { buildRelevancePrompt, chunkReviews } = await import(pathToFileURL(path.join(REPO, 'lib/analysis/relevance-judge.ts')).href)
const { SECOND_OPINION_INSTRUCTIONS } = await import(pathToFileURL(path.join(REPO, 'lib/analysis/second-opinion.ts')).href)
const exp = JSON.parse(fs.readFileSync(path.join(REPO, 'ops/state/relevance-export-2026-09-27.json'), 'utf8')).rows
const SAAS = new Set(['277fe82e-d930-4cc7-9d27-ccdb376784e4', '8207483a-3995-4a28-8d47-2411b067e4d6', '40512422-fe34-4f95-a899-e33c23823f7c', '156e6610-5ca1-43b2-92ff-f94ca502a3bd', '24deadfc-7d7e-41cd-807f-2ea63dbc4080'])
// 기준 문구의 경계 사례로 인용한 행은 뺀다(정답 누설).
const LEAK = ['034443d9', '5b338170', '002849a7', 'a84b2a5e', '9f9de0b9', '5e7fd3ef', 'a3f7d2ec']
const EXCLUDE = new Set(process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')).map((r) => r.input_id) : [])
const pool = exp.filter((r) => SAAS.has(r.project_id) && !EXCLUDE.has(r.input_id) && !LEAK.some((p) => r.input_id.startsWith(p)) && !r.text.includes('superwhisperapp.lemonsqueezy.com'))
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const rand = rng(20260928)
const byP = new Map()
for (const r of pool) byP.set(r.project_id, [...(byP.get(r.project_id) ?? []), r])
const N = 100
const quotas = [...byP].map(([p, rows]) => ({ p, rows, q: (rows.length / pool.length) * N }))
quotas.forEach((x) => (x.n = Math.floor(x.q)))
let left = N - quotas.reduce((a, x) => a + x.n, 0)
quotas.sort((a, b) => (b.q - b.n) - (a.q - a.n)).forEach((x) => { if (left > 0) { x.n++; left-- } })
const sample = []
for (const x of quotas) {
  const rows = x.rows.slice()
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]] }
  sample.push(...rows.slice(0, x.n))
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'sample.json'), JSON.stringify(sample.map((r) => ({ input_id: r.input_id, project_id: r.project_id, pitch: r.project_pitch })), null, 1))
// 1차 역할: 실제 buildRelevancePrompt 로 프로젝트별 20건 묶음
const first = []
for (const x of quotas) {
  const rows = sample.filter((r) => r.project_id === x.p)
  for (const batch of chunkReviews(rows, 20)) {
    const { system, user, labels } = buildRelevancePrompt({ product_elevator_pitch: batch[0].project_pitch, business_model: 'SAAS' }, batch.map((r) => ({ input_id: r.input_id, text: r.text })))
    first.push({ system, user, label_to_id: Object.fromEntries(labels.map((l, i) => [l, batch[i].input_id])) })
  }
}
fs.writeFileSync(path.join(OUT, 'first-prompts.json'), JSON.stringify(first, null, 1))
// 2차 역할: export 파일 모양 그대로(판정 없음), 순서는 섞는다
const second = sample.slice().sort((a, b) => a.input_id.localeCompare(b.input_id)).map((r) => ({ input_id: r.input_id, project_pitch: r.project_pitch, business_model: 'SAAS', text: r.text }))
fs.writeFileSync(path.join(OUT, 'second-export.json'), JSON.stringify({ instructions: SECOND_OPINION_INSTRUCTIONS, rows: second }, null, 1))
console.log('pool', pool.length, 'sample', sample.length, quotas.map((x) => `${x.rows[0].project_pitch}:${x.n}`).join(' '), 'first batches', first.length)
