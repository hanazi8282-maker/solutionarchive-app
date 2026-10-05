// 옛 인용 입력 대조 백필 셀프테스트 — 가짜 Supabase, 네트워크·DB 없음.
//   node scripts/quote-backfill-selftest.mjs   (build-check.yml 등록)
import {
  BACKFILL_TAG, classifyQuote, planBackfill, planQuotes, planRollback, prepareInputs, rollbackQuotes, summaryLine, writeChanges,
} from '../lib/analysis/quote-backfill.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${g} want=${w}`) } }

// ── 매칭 경계 ───────────────────────────────────────────────────────
const RAW = '배터리가   금방\n닳아요. 하루도 못 가요. 충전 케이스도 헐거워서 자꾸 빠져요.'
const P = prepareInputs([{ source_key: 'danawa', raw_text: RAW }])
const PP = prepareInputs([{ source_key: 'danawa', raw_text: RAW }, { source_key: 'appstore', raw_text: null }])
t('full — 공백 차이는 눈감는다', classifyQuote('배터리가 금방 닳아요.', P).verified, 'full')
t('full — … 조각이 순서대로', classifyQuote('배터리가 금방 닳아요. … 자꾸 빠져요.', P).verified, 'full')
t('prefix — 뒤 조각이 원문에 없으면 전문 불일치, 앞 20자는 맞음', classifyQuote('배터리가 금방 닳아요. 하루도 못 가요. … 정말 최악이에요', P).verified, 'prefix')
t('조각 순서가 뒤집히면 full 아님', classifyQuote('하루도 못 가요. … 배터리가 금방', P).verified !== 'full', true)
t('prefix — 끝을 다듬은 인용(앞 20자 일치)', classifyQuote('배터리가 금방 닳아요. 하루도 못 가요!!', P).verified, 'prefix')
t('none — 원문에 없고 폐기 입력도 없음', classifyQuote('포장이 아주 꼼꼼했어요', P), { verified: 'none', input: null })
t('purged — 원문에 없고 폐기 입력이 있음', classifyQuote('포장이 아주 꼼꼼했어요', PP).verified, 'purged')
t('폐기 입력이 있어도 보존 원문에 맞으면 full', classifyQuote('하루도 못 가요.', PP).verified, 'full')
t('대소문자는 다르게 본다(전문·앞머리 모두 불일치)', classifyQuote('BATTERY dies', prepareInputs([{ raw_text: 'battery dies' }])).verified, 'none')
t('한 글자 인용은 매칭하지 않는다', classifyQuote('배', P).verified, 'none')
t('먼저 맞은 입력을 쓴다', classifyQuote('같은 문장', prepareInputs([{ source_key: 'a', raw_text: '같은 문장' }, { source_key: 'b', raw_text: '같은 문장' }])).input.source_key, 'a')

// ── 항목 단위 — 원본 보존·표식·되돌리기 ─────────────────────────────
const Q = [
  { text: '배터리가 금방 닳아요.', source_type: 'review' },                         // 옛 → full
  { text: '새 인용', source_type: 'review', source_key: 'danawa' },                 // 새 → 그대로
  { text: '지어낸 문장입니다', source_type: 'review' },                              // 옛 → none
  'string-item',                                                                    // 이상 → 그대로
]
const before = JSON.stringify(Q)
const pq = planQuotes(Q, P)
t('입력 배열을 변형하지 않는다', JSON.stringify(Q), before)
t('옛 항목에 verified·source_key·표식만 더한다(text 불변)', pq.next[0], { text: '배터리가 금방 닳아요.', source_type: 'review', verified: 'full', source_key: 'danawa', backfill: BACKFILL_TAG })
t('새 항목·이상 항목은 그대로', [pq.next[1], pq.next[3]], [Q[1], Q[3]])
t('none 은 지우지 않고 표시만, source_key 없음', pq.next[2], { text: '지어낸 문장입니다', source_type: 'review', verified: 'none', backfill: BACKFILL_TAG })
t('배열 길이·순서 유지(evidence_quotes_ko 짝)', pq.next.length, Q.length)
t('두 번째 실행은 할 일 없음(멱등)', planQuotes(pq.next, P).changed, false)
t('되돌리기 = 원값 그대로', JSON.stringify(rollbackQuotes(pq.next).next), before)
t('되돌리기는 뒤에 붙은 summary 를 남긴다', rollbackQuotes([{ ...pq.next[0], summary: '요약' }]).next, [{ text: '배터리가 금방 닳아요.', source_type: 'review', summary: '요약' }])
t('입력에 source_key 가 없으면 키 없이 full', planQuotes([{ text: '같은 문장', source_type: 'review' }], prepareInputs([{ raw_text: '같은 문장' }])).next[0].source_key, undefined)

// ── 가짜 DB ─────────────────────────────────────────────────────────
function fakeDb(tables, { failUpdateAt = -1 } = {}) {
  const calls = { updates: 0 }
  const from = (name) => {
    const st = { filters: [], patch: null, range: null, orders: [] }
    const exec = () => {
      let rows = tables[name].filter((r) => st.filters.every(([c, v]) => r[c] === v))
      if (st.patch) {
        if (calls.updates++ === failUpdateAt) return { data: null, error: { code: 'XX', message: 'boom' } }
        rows.forEach((r) => Object.assign(r, structuredClone(st.patch)))
        return { data: rows.map((r) => ({ id: r.id })), error: null }
      }
      for (const o of [...st.orders].reverse()) rows = [...rows].sort((a, b) => String(a[o]).localeCompare(String(b[o])))
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      return { data: structuredClone(rows), error: null }
    }
    const b = {
      select: () => b, eq: (c, v) => (st.filters.push([c, v]), b), order: (c) => (st.orders.push(c), b),
      range: (a, z) => (st.range = [a, z], b), update: (p) => (st.patch = p, b),
      then: (res, rej) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  return { from, calls }
}
const mkTables = () => ({
  analysis_aspects: [
    { id: 'a1', project_id: 'p1', evidence_quotes: [{ text: '배터리가 금방 닳아요.', source_type: 'review' }, { text: '포장이 꼼꼼했어요', source_type: 'review' }] },
    { id: 'a2', project_id: 'p1', evidence_quotes: [{ text: '새 것', source_type: 'review', source_key: 'danawa' }] },
    { id: 'a3', project_id: 'p2', evidence_quotes: [{ text: '배송이 빨라요 정말 좋아요', source_type: 'review' }] },
    { id: 'a4', project_id: 'p2', evidence_quotes: [] },
    { id: 'a5', project_id: 'p3', evidence_quotes: [{ text: 'Too heavy to carry around all day', source_type: 'review' }] },
  ],
  analysis_inputs: [
    { id: 'i1', project_id: 'p1', source_key: 'danawa', source_type: 'review', raw_text: RAW, created_at: '1' },
    { id: 'i2', project_id: 'p1', source_key: 'appstore_kr', source_type: 'review', raw_text: null, created_at: '2' },
    { id: 'i3', project_id: 'p2', source_key: 'hn', source_type: 'comment', raw_text: '배송이 빨라요 정말 좋아요. 다음에도 살게요', created_at: '1' },
    { id: 'i4', project_id: 'p3', source_key: null, source_type: 'manual', raw_text: 'Too heavy to carry around, honestly.', created_at: '1' },
  ],
})

// measure / apply 드라이런 — 쓰기 0
const tb = mkTables(), db = fakeDb(tb), snap = JSON.stringify(tb)
const plan = await planBackfill(db)
t('measure 요약', plan.summary, {
  aspects: 5, quotes: 5, with_key: 1, malformed: 0, legacy: 4, full: 2, prefix: 1, none: 0, purged: 1,
  matched_no_key: 1, already: 0, aspects_to_update: 3, projects: 3,
  by_source: { danawa: 1, '(purged)': 1, hn: 1, '(matched:no-key)': 1 },
})
t('measure·드라이런은 DB 를 안 바꾼다', JSON.stringify(tb) === snap && db.calls.updates === 0, true)
t('요약 한 줄', summaryLine(plan.summary).startsWith('quote-backfill legacy=4/5 full=2 prefix=1 none=0 purged=1'), true)

// apply --run — 백업이 UPDATE 보다 먼저, 행 단위
const backups = []
const w = await writeChanges(db, plan.changes, { batch: 2, pauseMs: 0, backup: (c) => backups.push({ id: c.id, before: c.before, updatesSoFar: db.calls.updates }) })
t('apply 결과', w, { updated: 3, gone: 0, error: null })
t('백업은 각 UPDATE 전에', backups.map((b) => b.updatesSoFar), [0, 1, 2])
t('a1 — full 은 키, purged 는 표시만', tb.analysis_aspects[0].evidence_quotes.map((q) => [q.verified, q.source_key ?? null]), [['full', 'danawa'], ['purged', null]])
t('새 인용 행(a2)·빈 행(a4)은 안 건드린다', [tb.analysis_aspects[1], tb.analysis_aspects[3]], [mkTables().analysis_aspects[1], mkTables().analysis_aspects[3]])
t('재측정 — 남은 옛 인용 0, already 4', [(await planBackfill(db)).summary.legacy, (await planBackfill(db)).summary.already], [0, 4])

// 사라진 행(재추출) = gone, 오류 = 중단
const tg = mkTables(), dg = fakeDb(tg), pg = await planBackfill(dg)
tg.analysis_aspects.splice(0, 1)
t('그 사이 지워진 행은 gone', await writeChanges(dg, pg.changes, { batch: 100, pauseMs: 0 }), { updated: 2, gone: 1, error: null })
const te = mkTables(), de = fakeDb(te, { failUpdateAt: 1 }), pe = await planBackfill(de)
const we = await writeChanges(de, pe.changes, { batch: 100, pauseMs: 0 })
t('쓰기 오류면 거기서 멈춘다', [we.updated, we.error?.includes('boom')], [1, true])

// rollback — 드라이런 0쓰기, 실행 후 원값과 같다
const rb = await planRollback(db)
t('rollback 대상 3행', rb.map((c) => c.id), ['a1', 'a3', 'a5'])
const n0 = db.calls.updates
t('rollback 드라이런(계획만)은 쓰기 0', db.calls.updates, n0)
await writeChanges(db, rb, { batch: 100, pauseMs: 0 })
t('rollback 뒤 원값 복원(전 행)', JSON.stringify(tb.analysis_aspects), JSON.stringify(mkTables().analysis_aspects))
t('rollback 두 번째는 할 일 없음', (await planRollback(db)).length, 0)

// 조회 실패는 던진다(반쯤 읽은 것을 전부로 접지 않는다)
const broken = { from: () => { const b = { select: () => b, order: () => b, eq: () => b, range: () => b, then: (r) => r({ data: null, error: { code: '42P01', message: 'no table' } }) }; return b } }
t('조회 실패 → 예외', await planBackfill(broken).then(() => 'ok', (e) => e.message.includes('42P01')), true)

console.log(`quote-backfill selftest: ${pass} pass, ${fail} fail`)
if (fail) process.exit(1)
