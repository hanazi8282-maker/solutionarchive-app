#!/usr/bin/env node
// 뉴스레터 케이스 추출 품질 검수: 무작위 N건을 Opus가 원문과 대조(맞다/틀리다/모르겠다).
// 사용: node --env-file=.env.local scripts/nl-verify.mjs --stage pilot [--n 40]
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const STAGE = arg('stage', 'pilot')
const N = Number(arg('n', 40))
const PRICE_IN = 15, PRICE_OUT = 75 // lib/consult/cost.ts PRICE_PER_M.opus

const SYSTEM = `당신은 뉴스레터 글 1편(원문)과 거기서 추출됐다고 주장하는 사례 1건(JSON)을 대조하는 검수자다.
${UNTRUSTED_INPUT_NOTICE}
원문에 실제로 그런 회사·결정·수치·결과가 있는지 확인한다. 과장·없는 수치 추가·다른 회사와 혼동이 있으면 틀리다.
원문이 애매해서 판단이 안 서면 모르겠다. "맞다"는 핵심 필드(company, key_decision, outcome_band, 근거 요약)가 원문과 부합할 때만.
출력은 정확히 두 줄, 다른 말 없이:
VERDICT: 맞다 또는 틀리다 또는 모르겠다
REASON: 30자 이내 한국어 한 문장`

const lines = (await readFile(path.join(GROUND, `cases-${STAGE}.jsonl`), 'utf8')).trim().split('\n').filter(Boolean)
const cases = lines.map((l) => JSON.parse(l))
const sample = [...cases].sort(() => Math.random() - 0.5).slice(0, Math.min(N, cases.length))

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
let inTok = 0, outTok = 0
const results = []
for (const c of sample) {
  const original = await readFile(c._source_file, 'utf8').catch(() => '(원문 읽기 실패)')
  const msg = await client.messages.create({
    model: 'claude-opus-5-5', max_tokens: 300, system: SYSTEM,
    messages: [{ role: 'user', content: `추출된 사례:\n${JSON.stringify(c, null, 2)}\n\n원문:\n${original.slice(0, 8000)}` }],
  })
  inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const vMatch = text.match(/VERDICT:\s*(맞다|틀리다|모르겠다)/)
  const rMatch = text.match(/REASON:\s*(.+)/)
  const verdict = vMatch ? { verdict: vMatch[1], reason: (rMatch?.[1] ?? '').trim() } : { verdict: '모르겠다', reason: '파싱실패: ' + text.slice(0, 100) }
  results.push({ company: c.company, file: c._source_file, ...verdict })
  console.log(`[verify] ${c.company ?? '(무제)'} -> ${verdict.verdict}: ${verdict.reason}`)
}

const counts = { 맞다: 0, 틀리다: 0, 모르겠다: 0 }
for (const r of results) counts[r.verdict ?? '모르겠다'] = (counts[r.verdict ?? '모르겠다'] ?? 0) + 1
const errRate = results.length ? (counts['틀리다'] / results.length) * 100 : 0
const cost = Math.round(((inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000) * 100000) / 100000

await writeFile(path.join(GROUND, `verify-${STAGE}.json`), JSON.stringify({ counts, errRate, cost, results }, null, 2), 'utf8')
console.log(`[verify:${STAGE}] 표본 ${results.length} 맞다 ${counts['맞다']} 틀리다 ${counts['틀리다']} 모르겠다 ${counts['모르겠다']} 오추출률 ${errRate.toFixed(1)}% 비용 $${cost}`)
