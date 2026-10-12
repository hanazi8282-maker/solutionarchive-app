#!/usr/bin/env node
// T2 전량 판정 셀프테스트 — DB·LLM 없이. 페이지네이션(1,000행 상한 제거) · 덮어쓰기 금지(insert-only) · 소스 균등 순서 · 체인 종료 조건.
//   node scripts/relevance-judge-all-selftest.mjs     (종료코드 0 = 전부 통과)

import fs from 'node:fs'
import {
  CHAIN_STOP_REASONS, chainCarryOf, decideRelaunch, fetchAllPages, orderForJudge, parseSourceList, saveVerdictsInsertOnly,
} from '../lib/analysis/relevance-judge-all.ts'
import { createPendingFor } from '../lib/analysis/relevance-pending.ts'

let pass = 0
let fail = 0
const t = (name, ok) => { if (ok) pass += 1; else { fail += 1; console.log(`✗ ${name}`) } }

// ── 모의 PostgREST: 기본 1,000행 상한을 흉내낸다(range 없으면 앞 1,000행만). upsert 는 ON CONFLICT 동작까지 흉내낸다. ──
function mockDb({ tables, failPage = null }) {
  const calls = []
  return {
    calls,
    tables,
    from(table) {
      const st = { table, filters: [], range: null, op: 'select', payload: null, opts: null }
      const b = {
        select() { return b }, eq(c, v) { st.filters.push([c, v]); return b }, is(c, v) { st.filters.push([c, v]); return b },
        order(c) { st.order = c; return b }, range(a, z) { st.range = [a, z]; return b },
        upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o; return b },
        then(res, rej) {
          calls.push(st)
          if (st.op === 'upsert') {
            const rows = tables[table]
            const inserted = []
            for (const r of st.payload) {
              const i = rows.findIndex((x) => x.input_id === r.input_id)
              if (i < 0) { rows.push({ ...r }); inserted.push({ input_id: r.input_id }) }
              else if (!st.opts?.ignoreDuplicates) { rows[i] = { ...rows[i], ...r }; inserted.push({ input_id: r.input_id }) } // 옛 동작: 덮어쓴다
            }
            return Promise.resolve({ data: inserted, error: null }).then(res, rej)
          }
          let rows = (tables[table] ?? []).filter((r) => st.filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)))
          if (st.order) rows = [...rows].sort((a, b2) => String(a[st.order]).localeCompare(String(b2[st.order])))
          const [a, z] = st.range ?? [0, 999]
          if (failPage != null && st.range && a / 1000 === failPage) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej)
          return Promise.resolve({ data: rows.slice(a, Math.min(z, a + 999) + 1), error: null }).then(res, rej)
        },
      }
      return b
    },
  }
}

const pad = (i) => String(i).padStart(5, '0')
const day = (i) => new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString()
const SOURCES = ['danawa', 'appstore', 'googleplay', 'youtube', 'kakao_blog']
const inputs = Array.from({ length: 2500 }, (_, i) => ({
  id: `in-${pad(i)}`, project_id: 'p1', purged_at: null, raw_text: `리뷰 본문 ${i} 배터리가 너무 빨리 닳아서 불편합니다 정말로요`,
  created_at: day(i), collected_at: null, source_key: SOURCES[i % SOURCES.length], rating: (i % 5) + 1,
}))
// 앞 1,500건(정렬 기준 id 앞쪽)은 이미 판정됨 — 그중 하나는 사람 채점.
const judged = () => inputs.slice(0, 1500).map((r, i) => ({ input_id: r.id, project_id: 'p1', verdict: 'relevant', model: 'old', human_verdict: i === 0 ? 'irrelevant' : null }))

// ── 1. fetchAllPages ──
{
  const db = mockDb({ tables: { analysis_inputs: inputs } })
  const r = await fetchAllPages(() => db.from('analysis_inputs').select('id').eq('project_id', 'p1').order('id'))
  t('페이지로 2,500행 전부(1,000행 상한 넘음)', r.data?.length === 2500 && r.pages === 3 && !r.truncated && r.error === null)
  t('페이지가 겹치거나 빠지지 않는다', new Set(r.data.map((x) => x.id)).size === 2500)
  const bad = await fetchAllPages(() => mockDb({ tables: { analysis_inputs: inputs }, failPage: 1 }).from('analysis_inputs').select('id').order('id'))
  t('중간 페이지 실패 → 부분 결과 대신 error', bad.data === null && bad.error?.message === 'boom')
  const cut = await fetchAllPages(() => db.from('analysis_inputs').select('id').order('id'), { maxRows: 2000 })
  t('상한에 닿으면 truncated=true(조용히 자르지 않음)', cut.truncated === true && cut.data.length === 2000)
  const exact = await fetchAllPages(() => mockDb({ tables: { x: inputs.slice(0, 1000) } }).from('x').select('id').order('id'))
  t('정확히 1,000행이면 빈 다음 페이지로 끝을 확인', exact.data.length === 1000 && exact.pages === 2)
}

// ── 2. pendingFor — 1,000행 넘는 프로젝트에서 판정된 1,500건을 전부 거른다(예전엔 앞 1,000행만 보고 나머지를 재판정) ──
{
  const db = mockDb({ tables: { analysis_inputs: inputs, review_relevance_verdicts: judged() } })
  const { pendingFor } = createPendingFor({ supabase: db, sampleSize: 5000, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {} })
  const p = await pendingFor({ id: 'p1' })
  const judgedIds = new Set(judged().map((r) => r.input_id))
  t('이미 판정된 1,500건이 대상에 하나도 없다', p.reviews.every((r) => !judgedIds.has(r.input_id)))
  t('미판정 1,000건 중 youtube 200건 제외 → 800건', p.unjudged === 800 && p.reviews.length === 800 && p.excluded === 200)
  t('youtube 는 대상에 없다(제목 매핑 전 제외)', !p.reviews.some((r) => inputs.find((x) => x.id === r.input_id).source_key === 'youtube'))
  const srcOf = (r) => inputs.find((x) => x.id === r.input_id).source_key
  const firstKakao = p.reviews.findIndex((r) => srcOf(r) === 'kakao_blog')
  t('카카오 블로그는 맨 뒤(그 앞에 다른 소스 600건)', firstKakao === 600 && p.reviews.slice(firstKakao).every((r) => srcOf(r) === 'kakao_blog'))
  const head = p.reviews.slice(0, 6).map(srcOf)
  t('소스 라운드로빈(쏠림 없음)', new Set(head.slice(0, 3)).size === 3)
  const danawa = p.reviews.filter((r) => srcOf(r) === 'danawa').map((r) => r.input_id)
  t('소스 안은 최신 먼저', danawa[0] > danawa[danawa.length - 1])

  const capped = await createPendingFor({ supabase: db, sampleSize: 100, highRatingShare: 0.2, prefilterCfg: null, log: () => {}, warn: () => {} }).pendingFor({ id: 'p1' })
  t('프로젝트당 상한(100)만큼만 · 전체 남은 양(unjudged)은 그대로 보고', capped.reviews.length === 100 && capped.unjudged === 800)
  t('상한 안에서 카카오는 안 들어온다(다른 소스가 먼저)', !capped.reviews.some((r) => srcOf(r) === 'kakao_blog'))

  const noEx = await createPendingFor({ supabase: db, sampleSize: 5000, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {}, excludedSources: [] }).pendingFor({ id: 'p1' })
  t('제외 스위치 끄면 youtube 도 대상', noEx.unjudged === 1000)

  const brokenCache = mockDb({ tables: { analysis_inputs: inputs, review_relevance_verdicts: judged() }, failPage: 1 })
  // 원문 2페이지째 실패도 같은 경로 — 둘 중 하나라도 실패면 null(0건이 아니라 확인 불가)
  const nullRes = await createPendingFor({ supabase: brokenCache, sampleSize: 100, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {} }).pendingFor({ id: 'p1' })
  t('조회 실패 → null(확인 불가, 0건 아님)', nullRes === null)
}

// ── 3. 덮어쓰기 금지 — 사람 채점·기존 판정이 남는다 ──
{
  const db = mockDb({ tables: { review_relevance_verdicts: judged() } })
  const existing = { ...db.tables.review_relevance_verdicts[0] }
  const rows = [
    { input_id: existing.input_id, project_id: 'p1', verdict: 'irrelevant', model: 'new', prompt_version: 'v' }, // 이미 있는 행 — 덮으면 안 됨
    { input_id: 'in-02400', project_id: 'p1', verdict: 'unknown', model: 'new', prompt_version: 'v' },          // 빈 칸 — 채운다
  ]
  const { data, error } = await saveVerdictsInsertOnly(db, rows)
  const after = db.tables.review_relevance_verdicts.find((r) => r.input_id === existing.input_id)
  t('insert-only: 기존 판정 verdict·model·human_verdict 그대로', !error && after.verdict === existing.verdict && after.model === 'old' && after.human_verdict === 'irrelevant')
  t('insert-only: 빈 칸은 채운다 · 돌려받은 행 = 새로 들어간 1건', data.length === 1 && data[0].input_id === 'in-02400' && db.tables.review_relevance_verdicts.some((r) => r.input_id === 'in-02400' && r.prompt_version === 'v'))
  const st = db.calls.find((c) => c.op === 'upsert')
  t('PostgREST 옵션 = onConflict input_id + ignoreDuplicates(ON CONFLICT DO NOTHING)', st.opts?.onConflict === 'input_id' && st.opts?.ignoreDuplicates === true && st.table === 'review_relevance_verdicts')
  // 대조: 옛 저장(ignoreDuplicates 없음)이면 이 모의 DB 에서 실제로 덮인다 — 위 검사가 헛돌지 않는다는 증거.
  const old = mockDb({ tables: { review_relevance_verdicts: judged() } })
  await old.from('review_relevance_verdicts').upsert(rows, { onConflict: 'input_id' })
  t('대조: 옛 upsert 는 덮어썼다(모의 DB 가 차이를 본다)', old.tables.review_relevance_verdicts.find((r) => r.input_id === existing.input_id).verdict === 'irrelevant')
  const src = fs.readFileSync('scripts/relevance-judge-auto.mjs', 'utf8')
  t('판정 스크립트에 직접 upsert 가 없다(저장은 saveVerdictsInsertOnly 한 곳)', !/\.upsert\(/.test(src) && /saveVerdictsInsertOnly\(supabase, payload\)/.test(src))
  t('판정 행에 model·prompt_version 을 쓴다', /model: out\.model,/.test(src) && /prompt_version: RELEVANCE_CRITERIA_VERSION/.test(src))
  t('호출 오류 묶음은 저장하지 않는다(빈 칸으로 남김)', /if \(out\.error\) \{[\s\S]{0,200}continue/.test(src))
}

// ── 4. 소스 순서 ──
{
  const items = [['a', 1], ['a', 3], ['b', 2], ['youtube', 9], ['kakao_cafe', 5], ['c', 1], ['a', 2]].map(([s, ts], i) => ({ s, ts, i }))
  const o = orderForJudge(items, { sourceOf: (x) => x.s, tsOf: (x) => x.ts, excluded: ['youtube'], last: ['kakao_cafe'] })
  t('라운드로빈 a,b,c,a,a(소스 안 최신 먼저)', o.main.map((x) => `${x.s}${x.ts}`).join() === 'a3,b2,c1,a2,a1')
  t('맨 뒤 소스 분리 · 제외 1건', o.last.length === 1 && o.last[0].s === 'kakao_cafe' && o.excludedCount === 1)
  t('소스 목록: 빈 값 = 기본, none = 없음, 쉼표 목록', parseSourceList(undefined, ['youtube']).join() === 'youtube' && parseSourceList('', ['youtube']).join() === 'youtube' && parseSourceList('none', ['youtube']).length === 0 && parseSourceList(' a, b ,', []).join() === 'a,b')
}

// ── 5. 체인 종료 조건 ──
{
  const now = new Date('2026-10-12T00:00:00Z')
  const ok = {
    dry: false, enabled: true, now, untilMs: Date.parse('2026-10-26T00:00:00+09:00'), stopReason: null, attempted: 1000, errors: 0, judged: 1000,
    remaining: 5000, hop: 0, maxHops: 24, zeroStreak: 0, zeroLimit: 2, weeklyPct: 10, weeklyStopPct: 60, window5hPct: 10, window5hStopPct: 50,
  }
  const d = (o) => decideRelaunch({ ...ok, ...o })
  t('정상: 이어감 · hop+1 · 대기 0', d({}).relaunch && d({}).nextHop === 1 && d({}).waitMin === 0)
  t('session_cap·deadline 정지는 이어감', d({ stopReason: 'session_cap' }).relaunch && d({ stopReason: 'deadline' }).relaunch)
  for (const r of CHAIN_STOP_REASONS) t(`한도·오류 정지(${r}) → 멈춤`, !d({ stopReason: r }).relaunch)
  t('미판정 0 → 멈춤', !d({ remaining: 0 }).relaunch)
  t('미판정 확인 불가 → 멈춤', !d({ remaining: null }).relaunch)
  t('until 지남 → 멈춤', !d({ now: new Date(ok.untilMs) }).relaunch)
  t('until 없음 → 멈춤', !d({ untilMs: null }).relaunch)
  t('오류율 5% 정확히는 이어감, 넘으면 멈춤', d({ errors: 50 }).relaunch && !d({ errors: 51 }).relaunch)
  t('이번 0건이 연속 2회째 → 멈춤', !d({ judged: 0, zeroStreak: 1 }).relaunch && d({ judged: 0, zeroStreak: 0 }).relaunch && d({ judged: 0, zeroStreak: 0 }).nextZeroStreak === 1)
  t('처리하면 연속 0건 초기화', d({ judged: 5, zeroStreak: 1 }).nextZeroStreak === 0)
  t('hop 상한 → 멈춤(무한 루프 방지)', !d({ hop: 24 }).relaunch && d({ hop: 23 }).relaunch)
  t('주간 안전선 이상 → 멈춤 · 확인 불가도 멈춤', !d({ weeklyPct: 60 }).relaunch && !d({ weeklyPct: null }).relaunch && !d({ weeklyStopPct: null }).relaunch)
  t('5시간 창 안전선 이상 → 끊지 않고 90분 쉬고 이어감', d({ window5hPct: 55 }).relaunch && d({ window5hPct: 55 }).waitMin === 90)
  t('5시간 창 확인 불가 → 멈춤', !d({ window5hPct: null }).relaunch)
  t('드라이런·스위치 off → 멈춤', !d({ dry: true }).relaunch && !d({ enabled: false }).relaunch)
}

// ── 6. 체인 넘겨받기(대기 중이던 재시도 크론이 hop 을 잇는다) ──
{
  const now = new Date('2026-10-12T03:00:00Z')
  const row = (k, chain, finH, status = 'ok') => ({ run_key: k, status, summary: chain ? { chain } : {}, started_at: new Date(now - (finH + 1) * 3_600_000).toISOString(), finished_at: new Date(now - finH * 3_600_000).toISOString() })
  const c = chainCarryOf([row('relevance-judge-2026-10-12-m1', { relaunch: true, next_hop: 5, next_zero_streak: 0 }, 0.1)], now)
  t('직전 실행이 이어 가라 → hop 5 넘겨받음', c?.hop === 5 && c.zero === 0)
  t('직전이 멈춤이면 안 넘겨받음', chainCarryOf([row('relevance-judge-2026-10-12-m1', { relaunch: false, next_hop: 5, next_zero_streak: 0 }, 0.1)], now) === null)
  t('6시간 넘은 표시는 무시', chainCarryOf([row('relevance-judge-2026-10-11-m1', { relaunch: true, next_hop: 5, next_zero_streak: 0 }, 7)], now) === null)
  t('가장 최근 실행만 본다(그 뒤 멈춘 실행이 있으면 안 잇는다)', chainCarryOf([
    row('relevance-judge-2026-10-12-m1', { relaunch: true, next_hop: 5, next_zero_streak: 0 }, 2),
    row('relevance-judge-2026-10-12-m2', { relaunch: false, next_hop: 6, next_zero_streak: 0 }, 0.1),
  ], now) === null)
  t('진행 중 행은 건너뜀 · 다른 접두는 안 봄', chainCarryOf([row('extract-auto-2026-10-12-s1', { relaunch: true, next_hop: 1, next_zero_streak: 0 }, 0.1)], now) === null)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 전량 판정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
