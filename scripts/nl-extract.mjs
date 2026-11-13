#!/usr/bin/env node
// 뉴스레터 아카이브 케이스 추출 2~3단계: Haiku 배치 추출 (사고 끔).
// 스키마 출처: Notion "뉴스레터 아카이브 케이스 추출 스키마 (Haiku 배치)" (claude/fable-prompt-2026-11-12-newsletter-archive-case-study.md 사본).
// 사용: node scripts/nl-extract.mjs --stage pilot   (300편 층화 샘플)
//      node scripts/nl-extract.mjs --stage full    (사전 필터 통과 전량, 체크포인트 재시작)
import { readFile, appendFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const GROUND = path.join(os.homedir(), 'sa-private', 'ground', 'newsletters')
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const STAGE = arg('stage', 'pilot') // pilot | full
const PILOT_N = 300
const MODEL = 'claude-haiku-5-5'
// 단가 출처: lib/consult/cost.ts PRICE_PER_M.haiku (추정, 정확한 청구는 Anthropic 콘솔이 정본)
const PRICE_IN = 0.8, PRICE_OUT = 4

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

function sampleStratified(perSource, n) {
  const total = Object.values(perSource).reduce((a, b) => a + b.length, 0)
  const picked = []
  for (const src of SOURCES) {
    const pool = perSource[src]
    if (!pool.length) continue
    const quota = Math.min(pool.length, Math.round((pool.length / total) * n))
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    picked.push(...shuffled.slice(0, quota).map((f) => ({ file: f, source: src })))
  }
  return picked
}

async function loadPool(src) {
  const f = path.join(GROUND, `${src}-prefilter-pass.txt`)
  if (!existsSync(f)) return []
  const text = await readFile(f, 'utf8')
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

async function main() {
  const perSource = {}
  for (const s of SOURCES) perSource[s] = await loadPool(s)

  const sampleFile = path.join(GROUND, `cases-${STAGE}.sample.json`)
  let targets
  if (STAGE === 'pilot') {
    if (existsSync(sampleFile)) targets = JSON.parse(await readFile(sampleFile, 'utf8'))
    else { targets = sampleStratified(perSource, PILOT_N); await writeFile(sampleFile, JSON.stringify(targets), 'utf8') }
  } else {
    targets = SOURCES.flatMap((s) => perSource[s].map((f) => ({ file: f, source: s })))
  }

  const outFile = path.join(GROUND, `cases-${STAGE}.jsonl`)
  const doneFile = path.join(GROUND, `cases-${STAGE}.done.txt`)
  const done = new Set(existsSync(doneFile) ? (await readFile(doneFile, 'utf8')).split('\n').filter(Boolean) : [])

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let inTok = 0, outTok = 0, nCases = 0, nEmpty = 0, nErr = 0, done_n = 0, consecErr = 0

  for (const t of targets) {
    if (done.has(t.file)) { done_n++; continue }
    const raw = await readFile(t.file, 'utf8')
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/)
    const meta = fm ? fm[1] : ''
    const body = (fm ? fm[2] : raw).slice(0, 6000) // 비용 절감: 앞부분만
    try {
      const msg = await client.messages.create({
        model: MODEL, max_tokens: 4000, system: SYSTEM,
        messages: [{ role: 'user', content: `source=${t.source}\n${meta}\n\n${body}` }],
      })
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"cases":[]}')
      const cases = Array.isArray(parsed.cases) ? parsed.cases : []
      if (cases.length === 0) nEmpty++
      nCases += cases.length
      for (const c of cases) c._source_file = t.file
      if (cases.length) await appendFile(outFile, cases.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8')
      await appendFile(doneFile, t.file + '\n', 'utf8')
      done_n++
      consecErr = 0
    } catch (e) {
      nErr++; consecErr++
      console.error('[extract] 오류', t.file, String(e?.message ?? e))
      if (consecErr >= 5) { console.error('[extract] 연속 오류 5건, 중단(인증·네트워크 의심)'); break }
    }
    if (done_n % 50 === 0) console.log(`[extract:${STAGE}] 진행 ${done_n}/${targets.length} 사례 ${nCases} 빈글 ${nEmpty} 오류 ${nErr}`)
  }

  const cost = Math.round(((inTok * PRICE_IN + outTok * PRICE_OUT) / 1_000_000) * 100000) / 100000
  console.log(`[extract:${STAGE}] 완료 대상 ${targets.length} 처리 ${done_n} 사례 ${nCases} 빈글 ${nEmpty} 오류 ${nErr} 비용 $${cost} (in=${inTok} out=${outTok})`)
}

await main()
