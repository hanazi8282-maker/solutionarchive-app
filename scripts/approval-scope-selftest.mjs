#!/usr/bin/env node
// lib/analysis/approval-scope.ts — 영역 외·소비재 태그 제외(L-20b). 가짜 supabase 로 실행 검사. DB·LLM 없음.
import assert from 'node:assert/strict'
import { loadScope, outOfScopeReason } from '../lib/analysis/approval-scope.ts'

let pass = 0
const t = async (name, fn) => { await fn(); pass++; console.log(`✓ ${name}`) }

/** tables: { 표이름: 행 배열 }, fail: 실패시킬 표이름 */
const fake = (tables, fail = null) => ({
  from: (table) => ({
    select: () => ({
      in: async (col, vals) => {
        if (fail === table) return { data: null, error: { code: 'X', message: 'boom' } }
        return { data: (tables[table] ?? []).filter((r) => vals.includes(r[col])), error: null }
      },
    }),
  }),
})

const tables = {
  analysis_inputs: [{ id: 'a', project_id: 'p1' }, { id: 'b', project_id: 'p2' }, { id: 'c', project_id: 'p3' }, { id: 'd', project_id: 'p4' }],
  analysis_projects: [{ id: 'p1', area_code: '5' }, { id: 'p2', area_code: 'out-founder' }, { id: 'p3', area_code: 'out-consumer' }, { id: 'p4', area_code: null }],
  consumer_material_tags: [{ input_id: 'a' }],
}

await t('순수: out-* 가 우선, 태그는 그다음, 영역 NULL 은 영역 외가 아니다', () => {
  assert.equal(outOfScopeReason('out-founder', true), 'out-area')
  assert.equal(outOfScopeReason('5', true), 'consumer-tag')
  assert.equal(outOfScopeReason(null, false), null)
  assert.equal(outOfScopeReason('design', false), null)
})
await t('loadScope: 영역 외·태그만 제외하고 사유를 돌려준다', async () => {
  const r = await loadScope(fake(tables), ['a', 'b', 'c', 'd'])
  assert.equal(r.ok, true)
  assert.deepEqual([...r.excluded].sort(), [['a', 'consumer-tag'], ['b', 'out-area'], ['c', 'out-area']])
})
await t('loadScope: 표 하나라도 못 읽으면 ok:false (제외 없음으로 접지 않는다)', async () => {
  for (const f of ['analysis_inputs', 'analysis_projects', 'consumer_material_tags']) {
    const r = await loadScope(fake(tables, f), ['a'])
    assert.equal(r.ok, false, f)
  }
})
await t('loadScope: 원문 행을 못 찾은 input 은 실패다', async () => {
  const r = await loadScope(fake(tables), ['a', 'zzz'])
  assert.equal(r.ok, false)
})
await t('loadScope: 200개 넘는 목록도 끊어 읽는다', async () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ id: `i${i}`, project_id: 'p1' }))
  const r = await loadScope(fake({ ...tables, analysis_inputs: many }), many.map((x) => x.id))
  assert.equal(r.ok, true)
  assert.equal(r.excluded.size, 0)
})

console.log(`\n${pass} pass`)
