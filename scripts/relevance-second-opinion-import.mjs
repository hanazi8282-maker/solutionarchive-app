#!/usr/bin/env node
// T2 2차 판정 import — 클라우드 세션이 만든 결과 파일을 DB 판정과 비교해 리포트를 쓰고, 조건에 맞는 행에만 라벨을 채운다.
//
//   node --env-file=.env.local scripts/relevance-second-opinion-import.mjs ops/state/relevance-second-opinion-<날짜>.json            # 드라이런(리포트만)
//   node --env-file=.env.local scripts/relevance-second-opinion-import.mjs <파일> --apply                                            # 라벨 채우기
//
// ⛔ 서비스키가 있는 환경(로컬 .env.local / Actions)에서만. 클라우드 세션은 이 스크립트를 돌리지 않는다(키가 없다).
// 규칙: verdict·human_verdict·기존 라벨은 **절대 덮지 않는다.** --apply 는 라벨 4개 전부 NULL·불가 표시 없음·세션 판정 relevant·라벨 1개 이상 인 행만.
//       UPDATE 조건에 "라벨 4개 전부 NULL" 을 다시 걸어 그사이 야간 판정이 채운 행을 덮지 않는다.
// 리포트: reports/<KST 날짜>/relevance-second-opinion.md (DB 판정 대비·사람 채점 대비 일치, 채운 행, 거부된 행).
// 종료코드: 0 정상 · 2 파일/조회 실패 · 3 저장 실패 1건 이상

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { validateOpinions, compare, summarize } from '../lib/analysis/second-opinion.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const apply = args.includes('--apply')
if (!file || !fs.existsSync(file)) { console.error('사용: relevance-second-opinion-import.mjs <결과.json> [--apply]'); process.exit(2) }

let raw
try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { console.error(`✗ JSON 파싱 실패: ${e.message}`); process.exit(2) }
const { ok: opinions, rejected } = validateOpinions(raw)
console.log(`결과 행 ${opinions.length} · 거부 ${rejected.length}${rejected.length ? ' — ' + rejected.slice(0, 5).map((r) => `#${r.index} ${r.reason}`).join(' / ') : ''}`)
if (opinions.length === 0) { console.error('✗ 유효한 행이 0 — 리포트도 쓰지 않는다'); process.exit(2) }

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }
const db = new Map()
for (let i = 0; i < opinions.length; i += 500) {
  const ids = opinions.slice(i, i + 500).map((o) => o.input_id)
  const { data, error } = await sb.from('review_relevance_verdicts')
    .select('input_id, verdict, human_verdict, impact, frequency, community_signal, wtp_mentioned, labels_unavailable_reason').in('input_id', ids)
  if (error) { console.error(`✗ 조회 실패: ${error.message}`); process.exit(2) }
  for (const r of data) db.set(r.input_id, r)
}
const { rows, missing } = compare(opinions, db)
const s = summarize(rows)
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')

let filled = 0, raced = 0, failed = 0
if (apply) {
  const byId = new Map(opinions.map((o) => [o.input_id, o]))
  for (const r of rows.filter((x) => x.fillable)) {
    const o = byId.get(r.input_id)
    const { data, error } = await sb.from('review_relevance_verdicts')
      .update({ impact: o.impact, frequency: o.frequency, community_signal: o.community_signal, wtp_mentioned: o.wtp_mentioned })
      .eq('input_id', r.input_id)
      .is('impact', null).is('frequency', null).is('community_signal', null).is('wtp_mentioned', null).is('labels_unavailable_reason', null)
      .select('input_id')
    if (error) { failed++; console.error(`✗ ${r.input_id} 저장 실패: ${error.message}`); continue }
    if (!data || data.length === 0) raced++; else filled++
  }
}

const date = kstDate()
const outDir = path.join('reports', date)
fs.mkdirSync(outDir, { recursive: true })
const L = [
  `## T2 2차 판정 비교 (${date}, 입력 ${path.basename(file)})`,
  '',
  `- 세션 판정 ${s.n}행 (unknown ${s.unknown}) · DB 에 없는 id ${missing.length} · 형식 거부 ${rejected.length}`,
  `- DB(1차 LLM) 판정 대비 일치: ${s.vs_db.agree}/${s.vs_db.compared} (${pct(s.vs_db.agree, s.vs_db.compared)})`,
  `- 사람 채점 대비 일치: ${s.vs_human.agree}/${s.vs_human.compared} (${pct(s.vs_human.agree, s.vs_human.compared)}) — 기준은 이쪽`,
  `- 라벨 채울 수 있는 행(라벨 NULL·불가 표시 없음·relevant·라벨 있음): ${s.fillable}${apply ? ` → 채움 ${filled} · 그사이 채워져 건너뜀 ${raced} · 실패 ${failed}` : ' (드라이런 — --apply 로 채움)'}`,
  '',
  '### 불일치 (DB 판정 ≠ 세션 판정, 최대 30)',
  ...rows.filter((r) => r.agrees_with_db === false).slice(0, 30).map((r) => `- ${r.input_id.slice(0, 8)} · DB=${r.db_verdict} · 세션=${r.opinion_verdict}${r.human_verdict ? ` · 사람=${r.human_verdict}` : ''}`),
  '',
  '판정(verdict)·사람 채점·기존 라벨은 이 스크립트가 바꾸지 않는다. 불일치의 처리(재판정·채점 표본 추가)는 사람이 정한다.',
]
const md = L.join('\n') + '\n'
const outPath = path.join(outDir, 'relevance-second-opinion.md')
fs.writeFileSync(outPath, md)
console.log(md)
console.log(`✅ ${outPath}`)
process.exit(failed > 0 ? 3 : 0)
