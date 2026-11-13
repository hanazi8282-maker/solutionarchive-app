#!/usr/bin/env node
// 뉴스레터 케이스 추출 전량 배치: 동시 호출 N개, 500편 단위 청크, 파일 단위 체크포인트.
// 메모리 보호: 파일은 한 번에 읽고 바로 버린다(목록만 메모리에 둔다), 동시 in-flight 요청 수를 제한한다.
// 사용(별도 터미널에서): node --env-file=.env.local scripts/nl-extract-stream.mjs --stage full --concurrency 4 --chunk 500
import { readFile, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const STAGE = arg('stage', 'full')
const CONCURRENCY = Number(arg('concurrency', 4))
const CHUNK = Number(arg('chunk', 500))
const MODEL = 'claude-haiku-5-5'
const PRICE_IN = 0.8, PRICE_OUT = 4 // lib/consult/cost.ts PRICE_PER_M.haiku

const SOURCES = ['saastr', 'trendsvc', 'lenny', 'saasplaybook']
const MECHANISM_TAGS = ['unit-economics', 'ran-out-of-cash', 'no-market-need', 'outcompeted', 'pricing', 'distribution-weak', 'overexpansion', 'regulatory-legal', 'team-conflict', 'pivot-focus', 'platform-dependency', 'operational-complexity', 'subscription', 'seo-content', 'community-led', 'paid-ads', 'freemium-plg', 'marketplace-network', 'niche-vertical', 'bootstrapped-solo']

const SYSTEM = `당신은 스타트업/SaaS 뉴스레터 글 1편에서 "회사 사례"를 0~N개 추출하는 추출기다.
${UNTRUSTED_INPUT_NOTICE}
사례가 없는 글(일반 조언·인터뷰 잡담)은 cases: [] 로 둔다. 억지로 만들지 않는다.
각 사례 필드:
company, category_l1, category_l2, country, stage(아이디어/출시 전/출시 1년 내/성장),
customer_type, revenue_model, key_decision(핵심 선택 1~2개), decision_conditions(결정 당시 조건 최대 3개, 배열),
outcome_band(폐업/피벗/정체/성장 구간/인수/unknown 중 하나 — 글에 근거 없으면 unknown),
result_period, failure_or_success_cause(배열), mechanism(배열, 다음 중에서만 고른다: ${MECHANISM_TAGS.join(', ')}),
evidence_summary(원문 그대로 아닌 요약, 최대 2문장), source_name, post_title, post_url, post_date,
is_paywalled_teaser(bool), self_reported(bool), cause_source_type(founder/press/author),
grade(E-10: 자기신고+독립출처 1건 이상=B, 단독=C), numbers(글에 적힌 수치만 구간으로, 추정·환산 금지, 불확실하면 null).
반드시 JSON 객체 {"cases":[...]} 하나만 출력한다. 설명 문장 금지.`

async function loadPool(src) {
  const f = path.join(GROUND, `${src}-prefilter-pass.txt`)
  if (!existsSync(f)) return []
  const text = await readFile(f, 'utf8')
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

const outFile = path.join(GROUND, `cases-${STAGE}.jsonl`)
const doneFile = path.join(GROUND, `cases-${STAGE}.done.txt`)
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function processOne(t) {
  const raw = await readFile(t.file, 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/)
  const meta = fm ? fm[1] : ''
  const body = (fm ? fm[2] : raw).slice(0, 6000)
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 8000, system: SYSTEM,
    messages: [{ role: 'user', content: `source=${t.source}\n${meta}\n\n${body}` }],
  })
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"cases":[]}')
  const cases = Array.isArray(parsed.cases) ? parsed.cases : []
  for (const c of cases) c._source_file = t.file
  return { cases, inTok: msg.usage.input_tokens, outTok: msg.usage.output_tokens }
}

async function runPool(targets, onDone) {
  let idx = 0
  async function worker() {
    while (idx < targets.length) {
      const t = targets[idx++]
      try {
        const r = await processOne(t)
        onDone(t, r, null)
      } catch (e) {
        onDone(t, null, e)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

async function main() {
  const perSource = {}
  for (const s of SOURCES) perSource[s] = await loadPool(s)
  const all = SOURCES.flatMap((s) => perSource[s].map((f) => ({ file: f, source: s })))

  const done = new Set(existsSync(doneFile) ? (await readFile(doneFile, 'utf8')).split('\n').filter(Boolean) : [])
  const remaining = all.filter((t) => !done.has(t.file))
  console.log(`[extract-stream:${STAGE}] 전체 ${all.length} 완료됨 ${done.size} 남음 ${remaining.length} 동시성 ${CONCURRENCY} 청크 ${CHUNK}`)

  let totalCases = 0, totalCost = 0
  for (let i = 0; i < remaining.length; i += CHUNK) {
    const chunk = remaining.slice(i, i + CHUNK)
    let chunkCases = 0, chunkIn = 0, chunkOut = 0, chunkErr = 0, chunkEmpty = 0
    await runPool(chunk, async (t, r, err) => {
      if (err) { chunkErr++; console.error('[extract-stream] 오류', t.file, String(err?.message ?? err)); return }
      chunkIn += r.inTok; chunkOut += r.outTok
      if (r.cases.length === 0) chunkEmpty++
      chunkCases += r.cases.length
      if (r.cases.length) await appendFile(outFile, r.cases.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8')
      await appendFile(doneFile, t.file + '\n', 'utf8')
    })
    const chunkCost = Math.round(((chunkIn * PRICE_IN + chunkOut * PRICE_OUT) / 1_000_000) * 100000) / 100000
    totalCases += chunkCases; totalCost += chunkCost
    console.log(`[extract-stream:${STAGE}] 청크완료 처리 ${Math.min(i + CHUNK, remaining.length)}/${remaining.length} 이번청크 사례 ${chunkCases} 빈글 ${chunkEmpty} 오류 ${chunkErr} 비용 $${chunkCost} 누적비용 $${totalCost.toFixed(5)} 누적사례 ${totalCases}`)
  }
  console.log(`[extract-stream:${STAGE}] 전체완료 누적사례 ${totalCases} 누적비용 $${totalCost.toFixed(5)}`)
}

await main()
