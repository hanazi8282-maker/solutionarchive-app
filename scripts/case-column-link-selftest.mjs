#!/usr/bin/env node
// 케이스 → 칼럼 "더 알아보기" 셀프테스트 — 네트워크·DB·env 없음. 가짜 Supabase 체인만 쓴다.
//   node scripts/case-column-link-selftest.mjs
//
// 고정하는 것:
//   1. columnsForCase 3상태 — none(0편) / error(조회 실패) / some(최근 1 + 나머지 ≤3). 실패를 none 으로 접지 않는다(§7.1).
//   2. 공개 조건 — 조회가 review_status='approved' 와 case_study_slug 로 거른다(미승인 칼럼 미노출).
//   3. 적재 경로 — md 의 `case_slug:` 가 행에 실리고, resolveCaseSlug 가 없는/확인 불가 slug 를 **뺀다**(깨진 링크 금지).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { columnsForCase, APPROVED, MORE_LIMIT } from '../lib/columns/for-case.ts'
import { buildRow, resolveCaseSlug } from './column-stage.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}

/** 가짜 content_columns: eq 조건을 실제로 적용해 미승인 행이 걸러지는지까지 본다. */
function fakeSb(rows, { error = null } = {}) {
  const calls = []
  const q = {
    filters: [], lim: Infinity,
    select() { return q },
    eq(col, val) { calls.push(['eq', col, val]); q.filters.push([col, val]); return q },
    order() { return q },
    limit(n) { q.lim = n; return q },
    maybeSingle() { return Promise.resolve(q.run(true)) },
    then(res, rej) { return Promise.resolve(q.run(false)).then(res, rej) },
    run(single) {
      if (error) return { data: null, error }
      const hit = rows.filter((r) => q.filters.every(([c, v]) => r[c] === v)).slice(0, q.lim)
      return { data: single ? (hit[0] ?? null) : hit, error: null }
    },
  }
  return { calls, from() { q.filters = []; q.lim = Infinity; return q } }
}

// ── 1·2. columnsForCase ─────────────────────────────────────────
const cols = [
  { slug: 'c-new', title: '최근', review_status: 'approved', case_study_slug: 'kase' },
  { slug: 'c-2', title: '둘', review_status: 'approved', case_study_slug: 'kase' },
  { slug: 'c-draft', title: '초안(새면 안 됨)', review_status: 'draft', case_study_slug: 'kase' },
  { slug: 'c-rej', title: '기각', review_status: 'rejected', case_study_slug: 'kase' },
  { slug: 'c-other', title: '다른 케이스', review_status: 'approved', case_study_slug: 'other' },
]
{
  const sb = fakeSb(cols)
  const v = await columnsForCase(sb, 'kase')
  t('있음 — kind some', v.kind, 'some')
  t('있음 — 최근 1편이 버튼', v.lead?.slug, 'c-new')
  t('있음 — 나머지는 링크', v.more?.map((c) => c.slug).join(','), 'c-2')
  t('미승인·기각 미노출', JSON.stringify(v).includes('c-draft') || JSON.stringify(v).includes('c-rej'), false)
  t('공개 조건 approved 로 거른다', sb.calls.some(([, c, val]) => c === 'review_status' && val === APPROVED), true)
  t('APPROVED 값', APPROVED, 'approved')
}
t('없음 — kind none', (await columnsForCase(fakeSb(cols), 'nobody')).kind, 'none')
{
  const v = await columnsForCase(fakeSb(cols, { error: { message: 'column case_study_slug does not exist' } }), 'kase')
  t('조회 실패 — kind error(none 으로 접지 않음)', v.kind, 'error')
  t('조회 실패 — 사유 보존', v.reason, 'column case_study_slug does not exist')
}
{
  const many = Array.from({ length: 8 }, (_, i) => ({ slug: `m${i}`, title: `${i}`, review_status: 'approved', case_study_slug: 'k' }))
  const v = await columnsForCase(fakeSb(many), 'k')
  t('링크 상한 3', v.more.length, MORE_LIMIT)
}

// ── 3. 적재 경로 ────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caselink-'))
try {
  const body = `독자: 창업자\ncase_slug: kase\n\n# 제목\n\n${'가'.repeat(3100)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검 (가이드 §10)\n0. 예\n`
  const md = path.join(tmp, '2026-10-01-demo.md')
  fs.writeFileSync(md, body)
  const built = buildRow(md)
  t('md case_slug → 행 case_study_slug', built.row?.case_study_slug, 'kase')

  const cases = [{ slug: 'kase' }]
  const ok = await resolveCaseSlug(fakeSb(cases), built.row)
  t('실제 케이스 slug — 유지', ok.row.case_study_slug, 'kase')
  t('실제 케이스 slug — 경고 없음', ok.warn, null)

  const missing = await resolveCaseSlug(fakeSb([]), built.row)
  t('없는 slug — 필드를 뺀다(NULL 로 덮지도 않음)', 'case_study_slug' in missing.row, false)
  t('없는 slug — 경고', /없는 slug/.test(missing.warn ?? ''), true)

  const broken = await resolveCaseSlug(fakeSb(cases, { error: { message: 'boom' } }), built.row)
  t('확인 불가 — 필드를 뺀다', 'case_study_slug' in broken.row, false)
  t('확인 불가 — "없음"과 다른 경고', /확인 불가\(boom\)/.test(broken.warn ?? ''), true)

  const bare = { slug: 'x', title: 'y' }
  t('case_slug 없으면 DB 안 부름·그대로', (await resolveCaseSlug(null, bare)).row, bare)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`case-column-link-selftest: ${pass} 통과 · ${fail} 실패`)
process.exit(fail ? 1 : 0)
