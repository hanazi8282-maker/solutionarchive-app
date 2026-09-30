#!/usr/bin/env node
// 속성 원문 인용 한국어 번역 백필 — evidence_quotes 는 있고 evidence_quotes_ko 가 NULL 인 속성을 채운다.
//
//   node --env-file=.env.local scripts/aspect-quotes-ko-backfill.mjs                  # 기본 드라이런: 대상 건수·예상 호출 수만. LLM·DB 쓰기 없음
//   node --env-file=.env.local scripts/aspect-quotes-ko-backfill.mjs --run --limit 5  # 프로젝트 5개까지 실제 번역·저장
//
// 묶음 = 프로젝트 1개당 claude-cli 호출 1회(lib/analysis/quote-translate.ts). 이미 한국어인 인용만 있는 프로젝트는 호출 0.
// --limit N = 이번에 처리할 **프로젝트** 수(기본 20). 이미 채운 행은 조회 단계에서 빠진다(evidence_quotes_ko IS NULL 만).
// 프로바이더는 'claude-cli' 고정(LLM_PROVIDER 무시). claude-cli 한도(429 등)를 만나면 멈추고 남은 건수를 보고한다.
// 종료코드: 0 정상(대상 0건 포함) · 1 한도로 중단 · 2 설정/조회 실패(마이그 000047 미적용 포함) · 3 실패 1건 이상
//
// ⚠️ 서브에이전트에 서비스키를 넘기지 않는다(CLAUDE.md §10.1) — 오케스트레이터가 직접 돌린다.

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor } from '../lib/analysis/llm.ts'
import { QUOTE_TRANSLATE_PROVIDER, QUOTES_KO_MIGRATION, planQuoteTranslation, translateProjectQuotes } from '../lib/analysis/quote-translate.ts'

const args = process.argv.slice(2)
const run = args.includes('--run')
const li = args.indexOf('--limit')
const limit = li >= 0 ? Number(args[li + 1]) : 20
if (!Number.isInteger(limit) || limit < 1) { console.error('--limit 는 1 이상 정수'); process.exit(64) }
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

const key = requiredKeyFor(QUOTE_TRANSLATE_PROVIDER)
if (run && key && !process.env[key]) { console.error(`✗ ${key} 가 없다(provider=${QUOTE_TRANSLATE_PROVIDER}). 시작하지 않는다.`); process.exit(2) }
const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

// ── 1. 대상 — 1000행씩 끝까지 ─────────────────────────────────────
const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('analysis_aspects').select('id, project_id, evidence_quotes')
    .is('evidence_quotes_ko', null).not('evidence_quotes', 'is', null).order('id').range(from, from + 999)
  if (error) {
    console.error(`✗ 조회 실패(${error.code ?? ''}): ${error.message}${error.code === '42703' ? ` — 마이그 ${QUOTES_KO_MIGRATION} 미적용` : ''}`)
    process.exit(2)
  }
  rows.push(...(data ?? []))
  if (!data || data.length < 1000) break
}
const byProject = new Map()
for (const r of rows) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r])
const plans = [...byProject].map(([pid, rs]) => ({ pid, aspects: rs.length, quotes: planQuoteTranslation(rs).flat.length }))
const needCall = plans.filter((p) => p.quotes > 0)
log(`대상 속성 ${rows.length}건 · 프로젝트 ${plans.length}개 · 예상 호출 ${needCall.length}회(번역할 인용 ${needCall.reduce((s, p) => s + p.quotes, 0)}건, 한국어뿐인 프로젝트 ${plans.length - needCall.length}개는 호출 0)`)
if (!run) { log(`드라이런 — 호출·저장 없음. --run --limit N 으로 실행(이번 상한이면 프로젝트 ${Math.min(limit, plans.length)}개).`); process.exit(0) }

// ── 2. 실행 ────────────────────────────────────────────────────────
let done = 0, failed = 0, updated = 0, calls = 0
for (const p of plans.slice(0, limit)) {
  const o = await translateProjectQuotes(sb, p.pid)
  done++; calls += o.calls; updated += o.updated
  log(`  · project=${p.pid} ${o.status} 속성 ${o.aspects} 저장 ${o.updated} 호출 ${o.calls}${o.model ? ` model=${o.model}` : ''}${o.reason ? ` (${o.reason})` : ''}`)
  if (o.status === 'failed' || o.status === 'partial') failed++
  if (o.quotaExhausted) {
    log(`✗ claude-cli 한도 — 중단. 처리 ${done}/${Math.min(limit, plans.length)} · 남은 프로젝트 ${plans.length - done}개(속성 ${plans.slice(done).reduce((s, x) => s + x.aspects, 0)}건)`)
    process.exit(1)
  }
}
log(`끝 — 프로젝트 ${done}개 · 저장 ${updated}건 · 호출 ${calls}회 · 실패/부분 ${failed}개 · 남은 프로젝트 ${plans.length - done}개`)
process.exit(failed ? 3 : 0)
