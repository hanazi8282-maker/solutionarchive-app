#!/usr/bin/env node
// card-candidates 셀프테스트 — 섹션 추출 3상태 · 제목 형식 · 이미 있으면 안 씀 · 조회 실패면 안 씀.
import assert from 'node:assert/strict'
import { extractCardCandidates, recordCardCandidates, cardTitle } from './card-candidates.mjs'

const doc = '# 해설\n- 유효 1\n\n## 카드 후보\n- A — 왜 지금\n2. B\n* C\n- D(넷째는 버림)\n## 다음\n- X'
assert.deepEqual(extractCardCandidates(doc), ['A — 왜 지금', 'B', 'C'])
assert.equal(extractCardCandidates('# 해설\n- 1'), null)
assert.deepEqual(extractCardCandidates('## 카드 후보\n\n## 끝'), [])
assert.equal(cardTitle('2026-11-02'), '[카드 후보 2026-11-02]')

const rec = []
const record = async (e) => { rec.push(e); return { ok: true } }
const base = { text: doc, date: '2026-11-02', token: 't', dbId: 'd', record }
assert.equal((await recordCardCandidates({ ...base, lookup: async () => ({ ok: true, titles: [] }) })).status, 'written')
assert.equal(rec[0].title, '[카드 후보 2026-11-02]')
assert.equal(rec[0].track, 'CMO')
assert.equal(rec[0].needsHuman, false)
assert.equal((await recordCardCandidates({ ...base, lookup: async () => ({ ok: true, titles: ['[카드 후보 2026-11-02]'] }) })).status, 'exists')
assert.equal((await recordCardCandidates({ ...base, lookup: async () => ({ ok: false, error: 'x' }) })).status, 'failed')
assert.equal((await recordCardCandidates({ ...base, text: 'no', lookup: async () => ({ ok: true, titles: [] }) })).status, 'no_section')
assert.equal(rec.length, 1)
console.log('card-candidates-selftest: ok')
