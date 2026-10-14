#!/usr/bin/env node
// v71f e) 1·2차 불일치 행 30건 표본(남헌 채점용) — shadow-rejudge-v71c-post.json 에서 완전 동의가 아닌 행을 B(1차 관련·2차 무관/모름) 11 · C(1차 무관/모름) 10 · D(정보 불일치) 9 로 뽑는다.
// 모델 판정은 숨기고 번호·프로젝트·원문만 낸다. 원문이라 공개 리포에 쓰지 않는다: --out 은 리포 밖 경로여야 한다. 읽기 전용(DB 쓰기 0).
//   node --env-file=.env.local scripts/disagree-sample-v71f.mjs <json> --out=<리포 밖 경로.txt> [--seed=71312]
import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { rng, shuffle } from '../lib/analysis/relevance-judge.ts'

const arg = process.argv.slice(2)
const file = arg.find((a) => !a.startsWith('--'))
const opt = (k, d) => arg.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const out = opt('out', null)
if (!file || !out) { console.error('사용법: <json> --out=<경로> [--seed=71312]'); process.exit(64) }
if (/(^|[\/])reports[\/]/.test(out)) { console.error('✗ 원문이 든 파일을 리포 안(reports/)에 쓰지 않는다'); process.exit(64) }
const rows = JSON.parse(fs.readFileSync(file, 'utf8')).rows.filter((r) => r.new_first && r.new_second)
const full = (r) => r.new_first === 'relevant' && r.new_first_info === true && r.new_second === 'relevant' && r.new_second_info === true
const cls = (r) => (full(r) ? 'A' : r.new_first !== 'relevant' ? 'C' : r.new_second !== 'relevant' ? 'B' : 'D')
const random = rng(Number(opt('seed', 71312)))
const take = { B: 11, C: 10, D: 9 }
const picked = []
for (const [k, n] of Object.entries(take)) picked.push(...shuffle(rows.filter((r) => cls(r) === k).sort((a, b) => (a.input_id < b.input_id ? -1 : 1)), random).slice(0, n))
const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }
const { data, error } = await sb.from('analysis_inputs').select('id, raw_text').in('id', picked.map((r) => r.input_id))
if (error) { console.error(`✗ 원문 조회 실패: ${error.message}`); process.exit(2) }
const text = new Map(data.map((x) => [x.id, x.raw_text ?? '']))
const { data: pr } = await sb.from('analysis_projects').select('id, product_elevator_pitch').in('id', [...new Set(picked.map((r) => r.project_id))])
const pitch = new Map((pr ?? []).map((p) => [p.id, (p.product_elevator_pitch ?? '').split(/[—-]/)[0].trim().slice(0, 24)]))
const cut = (s) => { const t = String(s).replace(/\s+/g, ' ').replace(/\[SRC: [^\]]*\]\s*/g, '').trim(); return t.length > 420 ? `${t.slice(0, 420)}…` : t }
const order = shuffle(picked, rng(Number(opt('seed', 71312)) + 1)) // 유형이 번호 순서로 드러나지 않게 섞는다
fs.writeFileSync(out, order.map((r, i) => `${i + 1}. [${pitch.get(r.project_id) ?? '?'}] ${cut(text.get(r.input_id) ?? '(원문 없음)')}  {${r.input_id.slice(0, 8)}}`).join('\n'), 'utf8')
const key = order.map((r, i) => `${i + 1}\t${r.input_id}\t${cls(r)}\t1차=${r.new_first}/${r.new_first_info}\t2차=${r.new_second}/${r.new_second_info}\t${r.area}`).join('\n')
fs.writeFileSync(out.replace(/\.txt$/, '') + '-key.tsv', key, 'utf8')
console.log(`표본 ${order.length}건 → ${out} (정답 키는 -key.tsv, 채점 뒤에 본다)`)
