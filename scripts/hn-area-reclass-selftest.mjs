#!/usr/bin/env node
// lib/analysis/area-reclass.ts · scripts/hn-area-reclass.mjs 셀프테스트 — 네트워크·DB·모델 없음(가짜 call 주입).
// 보는 것: 응답 검증(요청 밖·어휘 밖·fit 범위·버전), 영역 병합 우선순위(뷰와 같은 상수), 정밀도·Wilson 구간·적용 중단 규칙(60%),
//          하루 상한·이어 돌리기·멈춤 신호, 라벨 시트 눈가림, SQL 은 게이트 pass 일 때만·insert-only, 정적 DB 접근 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  FIT_MIN, PRECISION_MIN, RECLASS_PROMPT_VERSION, effectiveArea, parseLabelCsv, precisionReport, renderVerdictSql, validateReclass, wilson,
} from '../lib/analysis/area-reclass.ts'
import { judge, main, readInput } from './hn-area-reclass.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── 검증 ──
const v = validateReclass({ prompt_version: RECLASS_PROMPT_VERSION, rows: [
  { input_id: id(1), area_code: '1', fit: 0.9, label: '회의록 요약' },
  { input_id: id(2), area_code: '6', fit: 0.9 },
  { input_id: id(3), area_code: 'none', fit: 1.4 },
  { input_id: id(9), area_code: '2', fit: 0.5 },
  { input_id: id(1), area_code: '2', fit: 0.5 },
] }, [id(1), id(2), id(3), id(4)])
t('검증: 통과 1', v.ok.map((r) => r.input_id), [id(1)])
t('검증: 거부 4(어휘·fit·요청 밖·중복)', v.rejected.length, 4)
t('검증: 빠진 id 는 missing(무관으로 접지 않음)', v.missing, [id(2), id(3), id(4)])
t('검증: 버전 다르면 전부 거부', validateReclass({ prompt_version: 'old', rows: [] }, [id(1)]).missing, [id(1)])

// ── 병합 우선순위 ──
t('병합: 프로젝트 ①~⑤ 우선', effectiveArea('5', { area_code: '1', fit: 1 }), { area: '5', via: 'project' })
t('병합: out-founder → 글 판정', effectiveArea('out-founder', { area_code: '2', fit: FIT_MIN }), { area: '2', via: 'input' })
t('병합: NULL → 글 판정', effectiveArea(null, { area_code: '3', fit: 0.8 }).area, '3')
t('병합: hold 는 안 올림', effectiveArea('hold', { area_code: '3', fit: 0.9 }).area, 'hold')
t('병합: fit 미달·none 은 그대로', [effectiveArea('out-founder', { area_code: '3', fit: 0.69 }).area, effectiveArea('out-founder', { area_code: 'none', fit: 1 }).area], ['out-founder', 'out-founder'])
{
  const f = 'supabase/migrations/20261017000090_review_area_verdicts.sql'
  if (fs.existsSync(f)) {
    const sql = fs.readFileSync(f, 'utf8')
    t('뷰와 같은 fit 하한', (sql.match(/l\.fit >= ([\d.]+)/g) ?? []).every((m) => Number(m.split('>= ')[1]) === FIT_MIN), true)
    t('뷰: hold 제외 규칙이 있다', /<> 'hold'/.test(sql), true)
  }
}

// ── 정밀도 ──
t('Wilson: 0 표본 null', wilson(0, 0), null)
t('Wilson: 24/30', wilson(24, 30), { lo: 0.627, hi: 0.905 })
const VR = (n, area, fit = 0.9, ver = RECLASS_PROMPT_VERSION) => ({ input_id: id(n), area_code: area, fit, label: null, model: 'm', prompt_version: ver, judged_at: '2026-10-17T00:00:00Z' })
const mk = (good, bad) => {
  const vs = []
  const lab = new Map()
  for (let i = 0; i < good + bad; i++) {
    vs.push(VR(i + 1, '1'))
    lab.set(id(i + 1), i < good ? '1' : 'none')
  }
  return [vs, lab]
}
t('정밀도: 18/30 = 0.6 → pass(경계)', precisionReport(...mk(18, 12)).decision, 'pass')
t('정밀도: 17/30 < 0.6 → stop(적용 중단)', precisionReport(...mk(17, 13)).decision, 'stop')
t('정밀도: 20건뿐 → 확인 불가', precisionReport(...mk(20, 0)).decision, 'unverified')
{
  const [vs, lab] = mk(30, 0)
  vs.push(VR(99, '1', 0.9, 'arv-0'))
  t('정밀도: 버전 섞이면 확인 불가', precisionReport(vs, lab).decision, 'unverified')
}
t('PRECISION_MIN = 0.6(지시값)', PRECISION_MIN, 0.6)
t('라벨 CSV', [...parseLabelCsv(`input_id,human_area,text\n${id(1)},2,"a,b"\n${id(2)},,x\n`)], [[id(1), '2']])
let badLab = false
try { parseLabelCsv(`${id(1)},7`) } catch { badLab = true }
t('라벨 CSV: 어휘 밖이면 중단', badLab, true)

// ── SQL ──
let blocked = false
try { renderVerdictSql([VR(1, '1')], { decision: 'stop', prompt_version: RECLASS_PROMPT_VERSION, precision: 0.5 }) } catch { blocked = true }
t('SQL: 게이트 stop 이면 안 만듦', blocked, true)
const sql = renderVerdictSql([VR(1, '1')], { decision: 'pass', prompt_version: RECLASS_PROMPT_VERSION, precision: 0.8 })
t('SQL: insert-only(ON CONFLICT DO NOTHING, UPDATE 없음)', [/ON CONFLICT \(input_id, prompt_version\) DO NOTHING/.test(sql), /\bUPDATE\b/.test(sql)], [true, false])

// ── judge: 하루 상한·이어 돌리기·멈춤 ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arv-'))
  const out = path.join(tmp, 'v.jsonl')
  const rows = Array.from({ length: 5 }, (_, i) => ({ input_id: id(i + 1), text: `post ${i}` }))
  let calls = 0
  const fake = async (_sys, user) => {
    calls++
    const ids = JSON.parse(user.slice(user.indexOf('['))).map((r) => r.input_id)
    return { ok: true, model: 'fake', text: JSON.stringify({ prompt_version: RECLASS_PROMPT_VERSION, rows: ids.map((x) => ({ input_id: x, area_code: '1', fit: 0.9, label: 'x' })) }) }
  }
  const now = () => new Date('2026-10-17T03:00:00Z')
  const s1 = await judge(rows, { out, max: 3, batch: 2, dailyMax: 4, call: fake, now, log: () => {} })
  t('judge: --max 3 → 3건 기록·2묶음', [s1.recorded, calls], [3, 2])
  const s2 = await judge(rows, { out, max: 10, batch: 2, dailyMax: 4, call: fake, now, log: () => {} })
  t('judge: 이어 돌리기 + 하루 상한 4 → 1건만 더', [s2.skipped_done, s2.recorded], [3, 1])
  const s3 = await judge(rows, { out, max: 10, dailyMax: 4, call: fake, now, log: () => {} })
  t('judge: 하루 상한 도달 → 멈춤 사유', [s3.recorded, /하루 상한/.test(s3.stopped)], [0, true])
  const out2 = path.join(tmp, 'v2.jsonl')
  const s4 = await judge(rows, { out: out2, max: 10, batch: 2, call: async () => ({ ok: false, stop: true, reason: 'budget' }), now, log: () => {} })
  t('judge: 예산·429 멈춤 → 기록 0·즉시 정지', [s4.recorded, s4.calls, s4.stopped], [0, 1, 'budget'])
  const s5 = await judge(rows, { out: out2, max: 10, batch: 5, call: async () => ({ ok: true, model: 'f', text: 'not json' }), now, log: () => {} })
  t('judge: 파싱 실패는 기록 안 함(다음 실행이 다시)', [s5.recorded, s5.missing], [0, 5])

  // CLI: sheet 눈가림 · precision · sql
  const inp = path.join(tmp, 'in.json')
  fs.writeFileSync(inp, JSON.stringify([{ input: rows }]))
  t('readInput: supabase 래핑 벗김', readInput(JSON.parse(fs.readFileSync(inp, 'utf8'))).length, 5)
  const sheet = path.join(tmp, 'sheet.csv')
  await main(['sheet', `--input=${inp}`, `--verdicts=${out}`, `--out=${sheet}`], { log: () => {} })
  const sh = fs.readFileSync(sheet, 'utf8')
  t('sheet: 모델 답 없음(눈가림)·4행', [sh.split('\n')[0], sh.trim().split('\n').length - 1, /fake|area_code/.test(sh)], ['input_id,human_area,text', 4, false])
  const labels = path.join(tmp, 'lab.csv')
  fs.writeFileSync(labels, `input_id,human_area\n${[1, 2, 3, 4].map((n) => `${id(n)},1`).join('\n')}\n`)
  const rep = await main(['precision', `--verdicts=${out}`, `--labels=${labels}`, `--write=${path.join(tmp, 'gate.json')}`], { log: () => {} })
  t('precision: 4건은 확인 불가(30 미만)', rep.decision, 'unverified')
  let e = null
  await main(['sql', `--verdicts=${out}`, `--gate=${path.join(tmp, 'gate.json')}`, `--out=${path.join(tmp, 'o.sql')}`], { log: () => {} }).catch((x) => (e = x))
  t('sql: 게이트 미통과면 파일 없음', [!!e, fs.existsSync(path.join(tmp, 'o.sql'))], [true, false])
  let e2 = null
  delete process.env.GEMINI_API_KEY
  await main(['judge', `--input=${inp}`, `--out=${path.join(tmp, 'z.jsonl')}`], { log: () => {} }).catch((x) => (e2 = x))
  t('judge CLI: 키 없으면 시작 안 함', /GEMINI_API_KEY/.test(e2?.message ?? ''), true)
}

// ── 정적: DB 접근 없음 ──
{
  const code = (fs.readFileSync('scripts/hn-area-reclass.mjs', 'utf8') + fs.readFileSync('lib/analysis/area-reclass.ts', 'utf8')).replace(/\/\/.*$/gm, '')
  t('정적: supabase import 없음', /from\s+['"][^'"]*supabase/i.test(code), false)
  t('정적: .insert/.update/.upsert/.delete 호출 없음', /\.(insert|update|upsert|delete)\s*\(/i.test(code), false)
}

console.log(`hn-area-reclass selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
