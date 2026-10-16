#!/usr/bin/env node
// HN 1차 relevant 글 단위 영역 재판정(남헌 v71aj §5-3, D-37/45) — 파일 입출력만. DB 를 import 하지 않는다(셀프테스트가 정적으로 검사).
// 설계 reports/2026-10-17/mention-loop-v71aj.md §6 · 순수 함수 lib/analysis/area-reclass.ts · 결과 표 마이그 20261017000090(미적용).
//
// 순서(CEO-staff 가 표본 100건에 먼저 돌린다):
//   1) 입력 파일: 보고서 §6-1 읽기 SQL 결과([{input_id, text, project_area}] 또는 `supabase db query` 의 [{input:[…]}])
//   2) judge   --input=<json> --out=<jsonl> [--max=100] [--batch=20]
//              Gemini(기존 2차 판정과 같은 callGeminiRotating — 모델 순환·백오프·일일 달러 예산 budget.ts). --max 는 이번 실행 상한,
//              하루 상한은 HN_RECLASS_DAILY_MAX(기본 2000) — out 파일의 오늘(KST) 행 수로 센다. 이미 out 에 있는 id 는 건너뛴다(이어 돌리기).
//              예산·402/403·전 모델 429 → 즉시 멈춤(쓴 데까지는 남는다). 검증 실패 행은 기록하지 않는다(다음 실행이 다시 고른다, §7.1).
//   3) sheet   --input=<json> --verdicts=<jsonl> --out=<csv>  → 사람 라벨 시트(input_id,human_area,text). **모델 답은 싣지 않는다**(눈가림).
//              원문이 들어간다 — 리포에 커밋하지 말고 scratchpad 에 둔다(리포는 공개).
//   4) precision --verdicts=<jsonl> --labels=<csv> [--write=<json>]  → 정밀도·95% 구간·판정(pass/stop/unverified). 종료 0 pass · 3 stop · 4 unverified
//   5) sql     --verdicts=<jsonl> --gate=<precision json> --out=<sql>  → insert-only SQL. 게이트가 pass 가 아니면 만들지 않는다(적용 중단 규칙).
// 종료 코드: 0 · 1(입력 실패) · 3(정밀도 미달 — 적용 중단) · 4(확인 불가)

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  BATCH, RECLASS_INSTRUCTIONS, RECLASS_PROMPT_VERSION, parseLabelCsv, precisionReport, reclassUserPrompt, renderVerdictSql, validateReclass,
} from '../lib/analysis/area-reclass.ts'

export const DAILY_MAX_DEFAULT = 2000
const kstDate = (d) => new Date(new Date(d).getTime() + 9 * 3600_000).toISOString().slice(0, 10)

/** 입력 파일 → [{input_id, text, project_area}]. supabase db query 래핑을 벗긴다. 배열이 아니면 던진다(0건으로 접지 않는다). */
export function readInput(j) {
  if (Array.isArray(j) && j.length === 1 && j[0] && typeof j[0] === 'object' && Object.keys(j[0]).length === 1 && !('input_id' in j[0])) j = Object.values(j[0])[0]
  if (typeof j === 'string') j = JSON.parse(j)
  if (!Array.isArray(j)) throw new Error('입력이 배열이 아니다')
  return j.filter((r) => r && typeof r.input_id === 'string').map((r) => ({ input_id: r.input_id, text: String(r.text ?? r.raw_text ?? ''), project_area: r.project_area ?? null }))
}
export const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

/** 판정. call(system, user) → {ok,text,model} | {ok:false, stop, reason}. 주입점이라 셀프테스트는 가짜를 넘긴다. */
export async function judge(rows, { out, max = 100, batch = BATCH, dailyMax = DAILY_MAX_DEFAULT, call, now = () => new Date(), log = console.log }) {
  const prev = readJsonl(out)
  const done = new Set(prev.map((r) => r.input_id))
  const today = kstDate(now())
  const usedToday = prev.filter((r) => kstDate(r.judged_at) === today).length
  const room = Math.max(0, Math.min(max, dailyMax - usedToday))
  const todo = rows.filter((r) => !done.has(r.input_id)).slice(0, room)
  const stat = { asked: todo.length, recorded: 0, rejected: 0, missing: 0, calls: 0, stopped: null, skipped_done: rows.length - rows.filter((r) => !done.has(r.input_id)).length, daily_room: room }
  if (!room) stat.stopped = `하루 상한 ${dailyMax} 도달(오늘 ${usedToday}건)`
  for (let i = 0; i < todo.length; i += batch) {
    const chunk = todo.slice(i, i + batch)
    stat.calls++
    const res = await call(RECLASS_INSTRUCTIONS, reclassUserPrompt(chunk))
    if (!res.ok) {
      if (res.stop) { stat.stopped = res.reason; break }
      stat.missing += chunk.length
      log(`묶음 ${stat.calls} 실패(이 묶음만, 다음 실행이 다시): ${res.reason}`)
      continue
    }
    let parsed
    try { parsed = JSON.parse(String(res.text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')) } catch { parsed = null }
    const v = validateReclass(parsed, chunk.map((r) => r.input_id))
    stat.rejected += v.rejected.length
    stat.missing += v.missing.length
    const at = now().toISOString()
    fs.appendFileSync(out, v.ok.map((r) => JSON.stringify({ ...r, model: res.model, prompt_version: RECLASS_PROMPT_VERSION, judged_at: at }) + '\n').join(''))
    stat.recorded += v.ok.length
  }
  log(`[HN 영역 재판정] 대상 ${stat.asked}(이미 판정 ${stat.skipped_done} 건너뜀, 오늘 남은 자리 ${room}) · 기록 ${stat.recorded} · 거부 ${stat.rejected} · 빠짐 ${stat.missing} · 호출 ${stat.calls}${stat.stopped ? ` · 멈춤: ${stat.stopped}` : ''}`)
  return stat
}

const csvCell = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').slice(0, 600)}"`

export async function main(argv, { log = console.log, call = null, now = () => new Date() } = {}) {
  const cmd = argv[0]
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const need = (n) => opt(n) ?? (() => { throw new Error(`--${n}= 필요`) })()
  const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
  if (cmd === 'judge') {
    const rows = readInput(readJson(need('input')))
    const max = Number(opt('max') ?? 100)
    if (!Number.isInteger(max) || max < 1) throw new Error(`--max 는 1 이상 정수: ${opt('max')}`)
    const dailyMax = Number(process.env.HN_RECLASS_DAILY_MAX ?? DAILY_MAX_DEFAULT)
    if (!call) {
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 가 없다 — 재판정을 시작하지 않는다')
      const { callGeminiRotating } = await import('../lib/analysis/llm.ts')
      const exhausted = new Set()
      call = async (sys, user) => {
        const r = await callGeminiRotating(sys, user, 'hn-area-reclass', { exhausted })
        return r.ok ? { ok: true, text: r.text, model: r.model } : r
      }
    }
    return judge(rows, { out: need('out'), max, batch: Number(opt('batch') ?? BATCH), dailyMax, call, now, log })
  }
  if (cmd === 'sheet') {
    const rows = readInput(readJson(need('input')))
    const judged = new Set(readJsonl(need('verdicts')).map((r) => r.input_id))
    const sel = rows.filter((r) => judged.has(r.input_id))
    fs.writeFileSync(need('out'), 'input_id,human_area,text\n' + sel.map((r) => `${r.input_id},,${csvCell(r.text)}`).join('\n') + '\n')
    log(`라벨 시트 ${sel.length}행 → ${opt('out')} (human_area 칸에 1~5 또는 none. 모델 답은 싣지 않았다. 원문 포함 — 커밋 금지)`)
    return { rows: sel.length }
  }
  if (cmd === 'precision') {
    const rep = precisionReport(readJsonl(need('verdicts')), parseLabelCsv(fs.readFileSync(need('labels'), 'utf8')))
    log(`[정밀도] ${rep.prompt_version} · 채점 ${rep.labeled} · 영역 예측 ${rep.n} · 맞음 ${rep.correct} · 정밀도 ${rep.precision ?? '확인 불가'} (95% ${rep.ci95 ? `${rep.ci95.lo}~${rep.ci95.hi}` : '-'}) · 재현율 ${rep.recall ?? '-'} → ${rep.decision}: ${rep.why}`)
    if (opt('write')) fs.writeFileSync(opt('write'), JSON.stringify(rep, null, 2) + '\n')
    return rep
  }
  if (cmd === 'sql') {
    const gate = readJson(need('gate'))
    const rows = readJsonl(need('verdicts'))
    fs.writeFileSync(need('out'), renderVerdictSql(rows, gate))
    log(`insert-only SQL ${rows.length}행 → ${opt('out')} (마이그 20261017000090 적용 뒤 CEO-staff 가 실행)`)
    return { rows: rows.length }
  }
  throw new Error('usage: hn-area-reclass.mjs judge|sheet|precision|sql …(머리 주석)')
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .then((r) => process.exit(r?.decision === 'stop' ? 3 : r?.decision === 'unverified' ? 4 : 0))
    .catch((e) => {
      console.error(`❌ hn-area-reclass: ${e.message}`)
      process.exit(1)
    })
}
