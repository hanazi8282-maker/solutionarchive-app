#!/usr/bin/env node
// [v71ct P1] 시험 결과 비교: 모델별 구조 통과율·인용/숫자 대조·장/결과/인과 일치율(기준 모델 대비)·L25 오류 4건 확인.
// 사용: node scripts/story-label-compare.mjs <기준 run suffix> <비교 run suffix...>   예) node scripts/story-label-compare.mjs test_p1_opus test_p1_sonnet test_p1_haiku
import fs from 'node:fs'

const dir = 'reports/2026-11-18'
const load = (run) => {
  const f = `${dir}/story-label-${run}.jsonl`
  const m = new Map(); if (!fs.existsSync(f)) return m
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); m.set(r.slug, r) }
  return m
}
const [refRun, ...runs] = process.argv.slice(2)
const ref = load(refRun)
const topCh = (r) => r.story?.focus?.[0]?.chapter
const chSet = (r) => new Set((r.story?.focus ?? []).map((x) => x.chapter))
const epKey = (e) => `${e.chapter}`
const resCount = (r, c) => (r.episodes ?? []).filter((e) => e.result_class === c).length
const jacc = (a, b) => { const i = [...a].filter((x) => b.has(x)).length, u = new Set([...a, ...b]).size; return u ? i / u : 1 }

for (const run of [refRun, ...runs]) {
  const m = load(run)
  const rows = [...m.values()]
  const okRows = rows.filter((r) => r.ok)
  const sum = fs.existsSync(`${dir}/story-label-${run}.summary.json`) ? JSON.parse(fs.readFileSync(`${dir}/story-label-${run}.summary.json`, 'utf8')).summary : {}
  console.log(`\n== ${run}  편 ${rows.length}  구조통과 ${okRows.length}  비용 $${sum.cost_usd ?? '?'}  편당 $${sum.per_story_usd ?? '?'}  ${sum.minutes ?? '?'}분`)
  console.log(`   인용 대조 실패 ${sum.quote_fail_rate ?? '?'}  숫자 대조 실패 ${sum.number_fail_rate ?? '?'}  상황 근거 탈락 ${sum.basisDropped ?? '?'}건  JSON 실패 ${sum.badJson ?? '?'}  호출 오류 ${sum.err ?? '?'}  잘림 ${sum.truncated ?? '?'}`)
  const failedAttempts = okRows.filter((r) => r.failedAttemptsFound).length
  const negs = okRows.reduce((s, r) => s + resCount(r, 'negative') + resCount(r, 'mixed'), 0)
  const eps = okRows.reduce((s, r) => s + (r.episodes?.length ?? 0), 0)
  console.log(`   에피소드 ${eps} (편당 ${(eps / Math.max(1, okRows.length)).toFixed(1)})  실패·섞임 에피소드 ${negs}  '안 된 시도 있음' ${failedAttempts}편`)
  const cust = okRows.filter((r) => r.story.customer !== 'unknown').length, price = okRows.filter((r) => r.story.price_band !== 'unknown').length, stage = okRows.filter((r) => r.story.stage !== 'unknown').length
  console.log(`   상황 채움: 손님 ${cust}/${okRows.length}  값대 ${price}/${okRows.length}  단계 ${stage}/${okRows.length}`)
  if (run === refRun) continue
  // 기준 대비 일치율(둘 다 구조 통과한 스토리만)
  const both = okRows.filter((r) => ref.get(r.slug)?.ok)
  let topSame = 0, jsum = 0, resSame = 0, resN = 0, chainBoth = 0, chainSame = 0
  for (const r of both) {
    const o = ref.get(r.slug)
    if (topCh(r) === topCh(o)) topSame++
    jsum += jacc(chSet(r), chSet(o))
    for (const c of ['positive', 'negative', 'mixed']) { resN++; if ((resCount(r, c) > 0) === (resCount(o, c) > 0)) resSame++ }
    const hasChain = (x) => (x.story.causal_chain?.length ?? 0) > 0
    chainBoth++; if (hasChain(r) === hasChain(o)) chainSame++
  }
  const n = Math.max(1, both.length)
  console.log(`   기준(${refRun}) 대비 [비교 가능 ${both.length}편]: 주된 장 일치 ${(100 * topSame / n).toFixed(0)}%  장 집합 자카드 ${(100 * jsum / n).toFixed(0)}%  결과 유무 일치 ${(100 * resSame / Math.max(1, resN)).toFixed(0)}%  인과 유무 일치 ${(100 * chainSame / Math.max(1, chainBoth)).toFixed(0)}%`)
}
// L25 오류 4건: 새 라벨에서 고쳐졌는지(사람이 읽을 요약 출력)
const L25 = { basis: 'BASIS 정성 결과(여성 전용 전환 → 문이 열림 = positive/qual)', gmass: 'GMass ROI 없음(블로그 글 ROI 거의 없다 = negative/qual 또는 learned)', 'knife-aid': 'Knife Aid 전환율(결과 있는 줄)', 'finn-and-remy': 'Finn and Remy 비용 지표(signal 이어야 함)' }
console.log('\n== L25 오류 4건 확인(각 run 의 해당 스토리 에피소드 결과)')
for (const run of [refRun, ...runs]) {
  const m = load(run)
  for (const [k, desc] of Object.entries(L25)) {
    const r = [...m.values()].find((x) => x.slug.includes(k)); if (!r?.episodes) continue
    console.log(`[${run}] ${desc}`)
    for (const e of r.episodes) console.log(`    ch${e.chapter} ${e.result_class}/${e.result_grain ?? '-'} · ${(e.action_ko ?? '').slice(0, 60)} → ${(e.result_ko ?? '').slice(0, 70)}`)
  }
}
