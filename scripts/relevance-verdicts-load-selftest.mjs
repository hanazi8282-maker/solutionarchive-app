#!/usr/bin/env node
// loadAllVerdicts 칸 줄이기(v71ek egress) 셀프테스트 — 묶음(pickBatch)·층 요약이 '*' 때와 같은가. 네트워크·DB 없음.
//   node scripts/relevance-verdicts-load-selftest.mjs
import fs from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { FEEDBACK_COLS, PICK_COLS, loadAllVerdicts } from '../lib/relevance-feedback/db.ts'
import { columnAvailability, pickBatch, stratumStats } from '../lib/relevance-feedback/sample.ts'

let pass = 0, fail = 0
const t = (name, ok) => { if (ok) pass++; else { fail++; console.log(`✗ ${name}`) } }

const V = ['relevant', 'irrelevant', 'unknown']
const ROWS = Array.from({ length: 2600 }, (_, i) => ({
  input_id: `id-${String(i).padStart(5, '0')}`, project_id: `p${i % 7}`, verdict: V[i % 3], second_verdict: i % 4 === 0 ? null : V[(i + (i % 5 === 0)) % 3],
  product_informative: i % 11 === 0 ? null : i % 2 === 0, second_product_informative: i % 3 !== 0, human_verdict: i % 50 === 0 ? V[i % 2] : null,
  human_product_informative: i % 100 === 0 ? true : null, human_graded_at: i % 50 === 0 ? (i % 100 === 0 ? '2026-11-25T01:00:00Z' : '2026-11-01T01:00:00Z') : null,
  model: 'm', reason: '긴 사유', judged_at: '2026-11-01T00:00:00Z',
}))

function fakeDb(missing = []) {
  const calls = []
  return {
    calls,
    from() {
      let cols = '*', secondOnly = false, from = 0, to = 999
      const b = {
        select(c) { cols = c; return b }, not(c) { secondOnly = c; return b }, order() { return b }, range(a, z) { from = a; to = z; return b },
        then(res, rej) {
          calls.push({ cols, secondOnly })
          const asked = cols === '*' ? [] : cols.split(', ')
          if ([...asked, secondOnly].some((c) => missing.includes(c))) return Promise.resolve({ data: null, error: { code: '42703', message: 'no column' } }).then(res, rej)
          const keys = cols === '*' ? Object.keys(ROWS[0]).filter((k) => !missing.includes(k)) : asked
          const data = ROWS.filter((r) => !secondOnly || r[secondOnly] != null).slice(from, to + 1).map((r) => Object.fromEntries(keys.map((k) => [k, r[k]])))
          return Promise.resolve({ data, error: null }).then(res, rej)
        },
      }
      return b
    },
  }
}

const screenDb = fakeDb(), batchDb = fakeDb()
const screen = (await loadAllVerdicts(screenDb)).rows
const batch = (await loadAllVerdicts(batchDb, { cols: PICK_COLS, secondOnly: true })).rows
t('화면: 행 전부 · 필요한 칸만', screen.length === 2600 && screenDb.calls.every((c) => c.cols === FEEDBACK_COLS && !c.secondOnly))
t('번역: 2차 있는 행만', batch.length === ROWS.filter((r) => r.second_verdict != null).length && batch.length < 2600)
t('층 요약 동일', isDeepStrictEqual(stratumStats(screen, columnAvailability(screen)), stratumStats(ROWS, columnAvailability(ROWS))))
for (const today of ['2026-11-25', '2026-11-26', '2026-12-31']) {
  const exclude = new Set()
  for (let r = 0; r < 3; r++) {
    const view = (rows) => { const x = pickBatch(rows, { today, exclude }); return { ids: x.items.map((i) => [i.row.input_id, i.stratum]), strata: x.strata } }
    const full = view(ROWS)
    t(`pickBatch 동일 ${today} r${r}`, full.ids.length === 15 && isDeepStrictEqual(full, view(screen)) && isDeepStrictEqual(full, view(batch)))
    for (const [id] of full.ids) exclude.add(id)
  }
}
for (const missing of [['product_informative', 'second_product_informative', 'human_product_informative'], ['second_verdict'], ['human_product_informative']]) {
  const db = fakeDb(missing)
  const got = await loadAllVerdicts(db)
  t(`컬럼 없음(${missing[0]}) → '*' 로 전 행`, got.rows?.length === 2600 && db.calls.at(-1).cols === '*' && !db.calls.at(-1).secondOnly && !(missing[0] in got.rows[0]))
}
const dead = { from: () => { const b = { select: () => b, not: () => b, order: () => b, range: () => b, then: (r) => r({ data: null, error: { code: '57014', message: 'timeout' } }) }; return b } }
t('다른 오류는 그대로 실패(§7.1)', 'error' in (await loadAllVerdicts(dead)))

// FeedbackRow 에 칸을 더했는데 조회에 안 넣으면 화면에서 조용히 '없음'이 된다.
const iface = /export interface FeedbackRow \{([\s\S]*?)\n\}/.exec(fs.readFileSync(new URL('../lib/relevance-feedback/sample.ts', import.meta.url), 'utf8'))[1]
const fields = [...iface.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])
t(`FEEDBACK_COLS = FeedbackRow 칸 ${fields.length}개`, fields.length >= 9 && isDeepStrictEqual([...fields].sort(), FEEDBACK_COLS.split(', ').sort()))
t('PICK_COLS ⊂ FEEDBACK_COLS', PICK_COLS.split(', ').every((c) => fields.includes(c)))

console.log(`relevance-verdicts-load selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
