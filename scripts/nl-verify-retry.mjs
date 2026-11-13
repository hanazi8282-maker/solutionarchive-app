#!/usr/bin/env node
// verify-pilot.json 중 "모르겠다: 파싱실패" 건만 추출 프롬프트 강화해 재검증.
// 사용: node --env-file=.env.local scripts/nl-verify-retry.mjs
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const PRICE_IN = 15, PRICE_OUT = 75

const SYSTEM = `당신은 뉴스레터 글 1편(원문)과 거기서 추출됐다고 주장하는 사례 1건(JSON)을 대조하는 검수자다.
${UNTRUSTED_INPUT_NOTICE}
원문에 실제로 그런 회사·결정·수치·결과가 있는지 확인한다. 과장·없는 수치 추가·다른 회사와 혼동이 있으면 틀리다.
원문이 애매해서 판단이 안 서면 모르겠다. "맞다"는 핵심 필드(company, key_decision, outcome_band, 근거 요약)가 원문과 부합할 때만.
절대 규칙: 출력의 첫 글자부터 바로 아래 두 줄만 쓴다. 인사말·분석과정·마크다운 금지.
VERDICT: 맞다 또는 틀리다 또는 모르겠다
REASON: 20자 이내 한국어 한 문장`

const verify = JSON.parse(await readFile(path.join(GROUND, 'verify-pilot.json'), 'utf8'))
const unresolved = verify.results.filter((r) => r.verdict === '모르겠다' && r.reason.includes('파싱실패'))
const cases = (await readFile(path.join(GROUND, 'cases-pilot.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l))

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
let inTok = 0, outTok = 0
const retried = []
for (const r of unresolved) {
  const c = cases.find((x) => x._source_file === r.file && x.company === r.company)
  if (!c) { console.error('[retry] 사례 못찾음', r.company, r.file); continue }
  const original = await readFile(r.file, 'utf8').catch(() => '(원문 읽기 실패)')
  const msg = await client.messages.create({
    model: 'claude-opus-5-5', max_tokens: 300, output_config: { effort: 'low' }, system: SYSTEM,
    messages: [{ role: 'user', content: `추출된 사례:\n${JSON.stringify(c, null, 2)}\n\n원문:\n${original.slice(0, 6000)}` }],
  })
  inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const vMatch = text.match(/VERDICT:\s*(맞다|틀리다|모르겠다)/)
  const rMatch = text.match(/REASON:\s*(.+)/)
  const verdict = vMatch ? { verdict: vMatch[1], reason: (rMatch?.[1] ?? '').trim() } : { verdict: '모르겠다', reason: '재시도도파싱실패: ' + text.slice(0, 80) }
  retried.push({ company: r.company, file: r.file, ...verdict })
  console.log(`[retry] ${r.company} -> ${verdict.verdict}: ${verdict.reason}`)
}

// 원래 29/0/11 중 11건을 retried 결과로 교체
const finalResults = verify.results.map((r) => retried.find((x) => x.file === r.file && x.company === r.company) ?? r)
const counts = { 맞다: 0, 틀리다: 0, 모르겠다: 0 }
for (const r of finalResults) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
const errRate = (counts['틀리다'] / finalResults.length) * 100
const retryCost = Math.round(((inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000) * 100000) / 100000

await writeFile(path.join(GROUND, 'verify-pilot.json'), JSON.stringify({ counts, errRate, cost: verify.cost + retryCost, results: finalResults }, null, 2), 'utf8')
console.log(`[retry] 완료 재검증 ${retried.length}건 최종 맞다 ${counts['맞다']} 틀리다 ${counts['틀리다']} 모르겠다 ${counts['모르겠다']} 오추출률 ${errRate.toFixed(1)}% 재검증비용 $${retryCost}`)
