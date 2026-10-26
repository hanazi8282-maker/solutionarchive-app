#!/usr/bin/env node
// T2 전량 판정 셀프테스트 — DB·LLM 없이. 페이지네이션(1,000행 상한 제거) · 덮어쓰기 금지(insert-only) · 소스 균등 순서 · 체인 종료 조건.
//   node scripts/relevance-judge-all-selftest.mjs     (종료코드 0 = 전부 통과)

import fs from 'node:fs'
import path from 'node:path'
import {
  CHAIN_STOP_REASONS, chainCarryOf, decideRelaunch, fetchAllPages, orderForJudge, parseExcludedSources, parseSourceList, quotaResetWaitMin, saveVerdictsInsertOnly, saveWithColumnFallback,
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
        select(c) { if (st.op === 'select' && c) st.cols = c.split(',').map((x) => x.trim()); return b }, eq(c, v) { st.filters.push([c, v]); return b }, is(c, v) { st.filters.push([c, v]); return b },
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
          const page = rows.slice(a, Math.min(z, a + 999) + 1).map((r) => (st.cols ? Object.fromEntries(st.cols.filter((k) => k in r).map((k) => [k, r[k]])) : r))
          st.bytes = JSON.stringify(page).length
          return Promise.resolve({ data: page, error: null }).then(res, rej)
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

  // 소비재 파생 제외(남헌 v61): youtube 는 소비재라 제외 소스를 풀어도 RELEVANCE_SKIP_CONSUMER=off 전까지는 대상이 아니다.
  const noEx = await createPendingFor({ supabase: db, sampleSize: 5000, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {}, excludedSources: [], skipConsumer: false }).pendingFor({ id: 'p1' })
  t('제외 스위치 + 소비재 스위치 끄면 youtube 도 대상', noEx.unjudged === 1000)
  const noExC = await createPendingFor({ supabase: db, sampleSize: 5000, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {}, excludedSources: [], skipConsumer: true, allowIds: new Set() }).pendingFor({ id: 'p1' })
  t('제외 스위치만 끄면 youtube 는 소비재로 빠진다', noExC.unjudged === 800 && noExC.consumer === 200)

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
  t('판정 행에 model·prompt_version 을 쓴다', /model: out\.model,/.test(src) && /prompt_version: PROMPT_VERSION/.test(src))
  t('기준 스위치(v66·v67): 기본 v22, RELEVANCE_CRITERIA=v21|old 로 복귀, prompt_version 이 기준을 가른다', src.includes("process.env.RELEVANCE_CRITERIA ?? 'v22'") && src.includes("v === 'old' || v === 'v21' || v === 'v23'") && src.includes('{ criteria: criteriaMode, areas: v23Areas }') && src.includes("criteriaMode === 'v22' ? RELEVANCE_V22_VERSION"))
  const { buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const crit = await import('../lib/analysis/relevance-criteria.ts')
  const oldP = buildRelevancePrompt(null, [{ input_id: 'x', text: 't' }], [])
  const newP = buildRelevancePrompt(null, [{ input_id: 'x', text: 't' }], [], { criteria: 'v21' })
  t('v2.1 프롬프트: 기본 SYSTEM 은 옛 기준 그대로, v21 만 새 기준', oldP.system.includes(crit.RELEVANCE_CRITERIA) && !oldP.system.includes(crit.RELEVANCE_CRITERIA_V21) && newP.system.includes(crit.RELEVANCE_CRITERIA_V21) && !newP.system.includes(crit.RELEVANCE_CRITERIA) && newP.system.includes('"info":true') && newP.user === oldP.user)
  const p22 = buildRelevancePrompt(null, [{ input_id: 'x', text: 't' }], [], { criteria: 'v22' })
  t('v2.2 프롬프트: v2.1 규칙 전부 + 경계 원칙(11)~(15), 옛·v21 기준은 빠짐, 출력 키 유지', p22.system.includes(crit.RELEVANCE_CRITERIA_V22) && p22.system.includes('(10) SaaS') && p22.system.includes('(15) 가격 비교') && !p22.system.includes(crit.RELEVANCE_CRITERIA) && !p22.system.includes(crit.RELEVANCE_CRITERIA_V21) && p22.system.includes('"info":true') && p22.user === oldP.user)
  const so = await import('../lib/analysis/second-opinion.ts')
  t('2차 판정 v2.2: 같은 기준 상수(criteria_version 줄은 옛 t2d 그대로), 옛 지시문은 그대로', so.SECOND_OPINION_INSTRUCTIONS_V22.includes(crit.RELEVANCE_CRITERIA_V22) && so.SECOND_OPINION_INSTRUCTIONS_V22.includes(`criteria_version 은 "${crit.RELEVANCE_CRITERIA_VERSION}"`) && !so.SECOND_OPINION_INSTRUCTIONS_V22.includes(crit.RELEVANCE_CRITERIA) && so.SECOND_OPINION_INSTRUCTIONS.includes(crit.RELEVANCE_CRITERIA))
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

  // v71bb: 한도 정지 + 리셋 90분 안 → 리셋 뒤에 잇는다(10-20 s2: 11:31Z 정지, 리셋 12:00Z).
  {
    const at = (min) => new Date(now.getTime() + min * 60_000).toISOString()
    const q = d({ stopReason: 'quota', judged: 0, zeroStreak: 1, quotaResetAt: at(29) })
    t('quota + 리셋 29분 뒤 → 이어감 · 34분 쉼 · 연속 0건 안 셈', q.relaunch && q.waitMin === 34 && q.nextZeroStreak === 1)
    t('quota + 주간 안전선 이상이어도 리셋 뒤 잇는다(창이 새로 열림)', d({ stopReason: 'quota', quotaResetAt: at(10), weeklyPct: 99 }).relaunch)
    t('quota + 리셋 86분 뒤 → 멈춤(90분 상한 밖)', !d({ stopReason: 'quota', quotaResetAt: at(86) }).relaunch && d({ stopReason: 'quota', quotaResetAt: at(85) }).waitMin === 90)
    t('quota + 리셋이 지났거나 모르면 → 멈춤(종전)', !d({ stopReason: 'quota', quotaResetAt: at(-1) }).relaunch && !d({ stopReason: 'quota', quotaResetAt: null }).relaunch && !d({ stopReason: 'quota', quotaResetAt: 'garbage' }).relaunch)
    t('quota + hop 상한이면 → 멈춤', !d({ stopReason: 'quota', quotaResetAt: at(10), hop: 24 }).relaunch)
    t('quota 외 정지 사유는 리셋 시각이 있어도 멈춤', !d({ stopReason: 'hard_cap', quotaResetAt: at(10) }).relaunch)
    t('스위치 off·만료는 quota 리셋보다 먼저', !d({ stopReason: 'quota', quotaResetAt: at(10), enabled: false }).relaunch && !d({ stopReason: 'quota', quotaResetAt: at(10), untilMs: null }).relaunch)
    t('quotaResetWaitMin: 경계', quotaResetWaitMin(at(85), now) === 90 && quotaResetWaitMin(at(85.5), now) === null && quotaResetWaitMin(undefined, now) === null)
    const src = fs.readFileSync(path.join(process.cwd(), 'scripts/relevance-judge-auto.mjs'), 'utf8')
    t('배선: 판정 스크립트가 quotaResetAt 을 넘기고, 잇는 경우는 소진 경보를 안 낸다', /decideRelaunch\(\{[\s\S]*quotaResetAt,[\s\S]*\}\)/.test(src) && /stopReason === 'quota' && !chain\.relaunch/.test(src))
  }

  // 오늘 한정 완화(남헌 v61, ~2026-10-13 00:00 KST)
  const relaxUntilMs = Date.parse('2026-10-13T00:00:00+09:00')
  const inRelax = new Date(relaxUntilMs - 3_600_000)
  const r = (o) => decideRelaunch({ ...ok, weeklyStopPct: 90, now: inRelax, relaxUntilMs, ...o })
  t('완화 중: 주간 확인 불가여도 이어감', r({ weeklyPct: null }).relaunch)
  t('완화 중: 주간 90% 이상 확인되면 멈춤', !r({ weeklyPct: 90 }).relaunch && r({ weeklyPct: 89.9 }).relaunch)
  t('완화 중: 5시간 창 안전선·확인 불가 무시(휴식 0)', r({ window5hPct: 99 }).relaunch && r({ window5hPct: 99 }).waitMin === 0 && r({ window5hPct: null }).relaunch)
  t('완화 중: 한도(quota)·오류율 5% 초과·연속 0건·스위치 off 는 그대로 멈춤', !r({ stopReason: 'quota' }).relaunch && !r({ errors: 51 }).relaunch && !r({ judged: 0, zeroStreak: 1 }).relaunch && !r({ enabled: false }).relaunch)
  t('완화 중: hop 상한 60(체인당)', r({ hop: 59 }).relaunch && !r({ hop: 60 }).relaunch)
  const afterRelax = new Date(relaxUntilMs)
  const a = (o) => decideRelaunch({ ...ok, weeklyStopPct: 90, now: afterRelax, relaxUntilMs, ...o })
  t('완화 만료 뒤: 주간 확인 불가 → 다시 멈춤(자동 복귀)', !a({ weeklyPct: null }).relaunch)
  t('완화 만료 뒤: 5시간 창 50% 이상 → 90분 휴식, 확인 불가 → 멈춤', a({ window5hPct: 55 }).waitMin === 90 && !a({ window5hPct: null }).relaunch)
  t('완화 만료 뒤: hop 상한 24 로 복귀', !a({ hop: 24 }).relaunch)
  t('주간 안전선 설정 자체가 없으면 완화 중에도 멈춤', !r({ weeklyStopPct: null }).relaunch)
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

// ── 7. 수 세기(countFor) — raw_text 를 안 읽는다 · 전송량 ──
{
  const big = inputs.map((r) => ({ ...r, raw_text: `${r.raw_text} ${'가'.repeat(1000)}` })) // 실측 평균 ~1KB 가정
  const db = mockDb({ tables: { analysis_inputs: big, review_relevance_verdicts: judged() } })
  const pf = createPendingFor({ supabase: db, sampleSize: 1000, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {} })
  const c = await pf.countFor({ id: 'p1' })
  const countCalls = db.calls.filter((x) => x.table === 'analysis_inputs')
  t('countFor: 미판정 800 · 제외(youtube) 200 · 소스 목록', c.unjudged === 800 && c.excluded === 200 && c.sources.length === 5)
  t('countFor: analysis_inputs 를 id·source_key 만 조회(raw_text 없음)', countCalls.every((x) => x.cols?.join() === 'id,source_key'))
  const countBytes = countCalls.reduce((s, x) => s + (x.bytes ?? 0), 0)
  db.calls.length = 0
  await pf.pendingFor({ id: 'p1' })
  const fullBytes = db.calls.filter((x) => x.table === 'analysis_inputs').reduce((s, x) => s + (x.bytes ?? 0), 0)
  const ratio = countBytes / fullBytes
  console.log(`  전송량(원문 1KB 가정, 2,500행): 수 세기 ${Math.round(countBytes / 1024)}KB vs 원문 읽기 ${Math.round(fullBytes / 1024)}KB (${(ratio * 100).toFixed(1)}%)`)
  t('countFor 전송량 < 원문 읽기의 10%', ratio < 0.1)
  const src = fs.readFileSync('scripts/relevance-judge-auto.mjs', 'utf8')
  const loop = src.indexOf('for (const c of ready)')
  t('스크립트: 후보 전부는 countFor, pendingFor 는 이번에 돌 프로젝트(maxProjects)만', /const count = await countFor\(p\)/.test(src) && (src.match(/await pendingFor\(/g) ?? []).length === 1
    && src.indexOf('await pendingFor(') > loop && loop > 0 && /if \(targets\.length >= maxProjects\) break/.test(src))
  t('countFor 실패 → null(확인 불가)', (await createPendingFor({ supabase: mockDb({ tables: { analysis_inputs: inputs }, failPage: 0 }), sampleSize: 1, highRatingShare: 1, prefilterCfg: null, log: () => {}, warn: () => {} }).countFor({ id: 'p1' })) === null)
}

// ── 8. 컬럼 없음 폴백 — prompt_version·product_informative 둘 다 없어도 save_failed 가 아니다 ──
{
  const LABELS = ['impact', 'frequency']
  const fakeSave = (missing) => {
    const tried = []
    return { tried, save: async (rows) => {
      tried.push(Object.keys(rows[0]).sort().join())
      const m = missing.find((k) => k in rows[0])
      return m ? { data: null, error: { code: 'PGRST204', message: `Could not find the '${m}' column of 'review_relevance_verdicts' in the schema cache` } } : { data: rows.map((r) => ({ input_id: r.input_id })), error: null }
    } }
  }
  const row = { input_id: 'x', verdict: 'relevant', model: 'm', prompt_version: 'v', product_informative: true, impact: 1, frequency: 2 }
  for (const order of [['product_informative', 'prompt_version'], ['prompt_version', 'product_informative']]) {
    const f = fakeSave(order)
    const cols = { promptVersion: 'unknown', info: 'unknown', labels: 'unknown' }
    const r = await saveWithColumnFallback(f.save, [row], cols, LABELS, () => {})
    t(`둘 다 없음(${order.join('→')}): 둘 다 빼고 저장 성공 · 라벨은 유지`, !r.error && r.data.length === 1 && cols.promptVersion === 'absent' && cols.info === 'absent' && cols.labels === 'unknown' && f.tried.length === 3)
  }
  const f3 = fakeSave(['product_informative', 'prompt_version', 'impact'])
  const c3 = { promptVersion: 'unknown', info: 'unknown', labels: 'unknown' }
  t('셋 다 없음 → 라벨까지 빼고 성공(재시도 3회)', !(await saveWithColumnFallback(f3.save, [row], c3, LABELS, () => {})).error && c3.labels === 'absent' && f3.tried.length === 4)
  const f4 = fakeSave(['unknown_col'])
  const r4 = await saveWithColumnFallback(f4.save, [{ ...row, unknown_col: 1 }], { promptVersion: 'unknown', info: 'unknown', labels: 'unknown' }, LABELS, () => {})
  t('뺄 것이 없으면 오류 그대로(무한 반복 없음)', !!r4.error && f4.tried.length === 2)
  const f5 = fakeSave([])
  const c5 = { promptVersion: 'absent', info: 'unknown', labels: 'unknown' }
  await saveWithColumnFallback(f5.save, [row], c5, LABELS, () => {})
  t('이미 absent 인 필드는 첫 저장부터 뺀다', !f5.tried[0].includes('prompt_version'))
}

// ── 9. 제외 소스 fail-closed ──
{
  t("'none' 만 전부 허용", parseExcludedSources('none').length === 0 && parseExcludedSources(' NONE ').length === 0)
  t('빈 값·없음 = 기본(youtube)', parseExcludedSources(undefined).join() === 'youtube' && parseExcludedSources('').join() === 'youtube')
  t('오타·부분 값은 기본에 더해진다(youtube 닫힌 채)', parseExcludedSources('youtub').join() === 'youtube,youtub' && parseExcludedSources('danawa, kakao_blog').join() === 'youtube,danawa,kakao_blog')
  t("'none,danawa' 같은 섞인 값은 none 으로 안 읽는다", parseExcludedSources('none,danawa').includes('youtube'))
  const src = fs.readFileSync('scripts/relevance-judge-auto.mjs', 'utf8')
  t('스크립트가 parseExcludedSources 를 쓰고, 원문에 없는 이름을 경고한다', /parseExcludedSources\(process\.env\.RELEVANCE_EXCLUDE_SOURCES\)/.test(src) && /후보 원문에 없는 소스 이름/.test(src))
}

// ── 10. Cancel 뒤 넘겨받기 금지 ──
{
  const now = new Date('2026-10-12T03:00:00Z')
  const rows = [
    { run_key: 'relevance-judge-2026-10-12-m1', status: 'ok', summary: { chain: { relaunch: true, next_hop: 3, next_zero_streak: 0 } }, started_at: '2026-10-12T00:00:00Z', finished_at: '2026-10-12T01:00:00Z' },
    { run_key: 'relevance-judge-2026-10-12-m2', status: 'running', summary: {}, started_at: '2026-10-12T01:05:00Z' }, // 사람이 Cancel → running 으로 남음
  ]
  t('가장 최근 행이 running(취소·죽음)이면 앞 실행의 "이어 가라"를 잇지 않는다', chainCarryOf(rows, now) === null)
}

// ── 11. v71bb 잔여 — 판정할 수 없는 미판정(본문 없음·HN 저가치)을 센다 · 1차 미판정 사유 분류 ──
{
  const { loadPrefilterConfig } = await import('../lib/analysis/prefilter.ts')
  const hnCfg = loadPrefilterConfig(undefined, { HN_PREFILTER: 'on' }).cfg
  const rows = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `hn-${i}`, project_id: 'p9', purged_at: null, raw_text: `short hn comment ${i}`, created_at: day(i), collected_at: null, source_key: 'hackernews', rating: null })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `nb-${i}`, project_id: 'p9', purged_at: null, raw_text: '', created_at: day(i), collected_at: null, source_key: 'googleplay', rating: 2 })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `ok-${i}`, project_id: 'p9', purged_at: null, raw_text: `배터리가 너무 빨리 닳아서 불편합니다 ${i}`, created_at: day(i), collected_at: null, source_key: 'googleplay', rating: 2 })),
  ]
  const pf = createPendingFor({ supabase: mockDb({ tables: { analysis_inputs: rows, review_relevance_verdicts: [] } }), sampleSize: 1000, highRatingShare: 1, prefilterCfg: hnCfg, log: () => {}, warn: () => {}, excludedSources: [] })
  const c = await pf.countFor({ id: 'p9' })
  const p = await pf.pendingFor({ id: 'p9' })
  t('잔여: countFor 근사는 9건, pendingFor 정확값은 3건 · 본문 없음 2 · HN 저가치 4', hnCfg?.hn.mode === 'on' && c.unjudged === 9 && p.unjudged === 3 && p.reviews.length === 3 && p.residue?.no_body === 2 && p.residue?.hn_low === 4)
  const src = fs.readFileSync('scripts/relevance-judge-auto.mjs', 'utf8')
  t('스크립트: 원문을 읽은 프로젝트는 정확값으로 미판정을 센다(근사로 체인이 헛돌지 않게) · summary 에 residue', /exactUnjudged\.get\(c\.project\.id\) \?\? c\.count\.unjudged/.test(src) && /unjudged_after: unjudgedAfter, residue,/.test(src))

  const { classifyProject, mergeCounts } = await import('./relevance-unjudged-why.mjs')
  const ctx = { done: new Set(['ok-0']), tagged: new Set(['ok-1']), allow: new Set(), excludedSources: [], skipConsumer: true, prefilterCfg: hnCfg }
  const P = (o) => ({ id: 'p', status: 'collecting', extract_attempts: 0, area_code: '1', ...o })
  t('사유: 상태가 후보 밖이면 전부 status:<값>', JSON.stringify(classifyProject(P({ status: 'archived' }), rows, ctx)) === JSON.stringify({ hackernews: { 'status:archived': 4 }, googleplay: { 'status:archived': 4 } }))
  t('사유: 재추출 뒤 failed → failed_excluded', classifyProject(P({ status: 'failed', extract_attempts: 2 }), rows, ctx).googleplay.failed_excluded === 4)
  const m = classifyProject(P({}), rows, ctx)
  t('사유: 판정된 건 빼고 · 태그 · 본문 없음 · HN 저가치 · 대기', m.googleplay.consumer_tag === 1 && m.googleplay.no_body === 2 && m.googleplay.eligible === 1 && m.hackernews.hn_low === 4)
  const mc = classifyProject(P({ area_code: 'out-consumer' }), rows, ctx)
  t('사유: out-consumer 영역은 태그 표에 없어도 consumer_derived(SQL 로 태그만 빼면 미판정처럼 보이는 몫)', mc.googleplay.consumer_tag === 1 && mc.googleplay.consumer_derived === 3 && mc.hackernews.consumer_derived === 4)
  t('사유: out-founder 영역의 대기분은 eligible_out_area', classifyProject(P({ area_code: 'out-founder' }), rows, ctx).googleplay.eligible_out_area === 1)
  t('사유: 합치기', mergeCounts([m, m]).googleplay.no_body === 4)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 전량 판정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
