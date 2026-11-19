#!/usr/bin/env node
// [v71cu B4] 나란히 비교 하니스 — 같은 실행에서 같은 회사마다 (1) 기존 경로 retrieveSimilar 와 (2) 새 경로 B(story flow + enrichDiagnosis + STORY_FLOW_B_OPTS)
// 를 만들고, LLM 이 블라인드(A/B 순서 무작위)로 "진단과의 주제 적합성" 1~5점을 매긴다. B 쪽 인용은 원본 표로 검증한다(B5).
// DB 쓰기·발송·깃발 변경 없음. 결론서(compose.ts)는 부르지 않는다 — 바뀌는 칸(③ 비슷한 회사)만 비교한다.
//
//   오프라인 연기 시험(합성 픽스처, LLM·DB 없음):      node scripts/story-flow-compare.mjs --dry
//   선택 결과만 실DB 로(오케스트레이터, 읽기 전용):     node --env-file=.env.local scripts/story-flow-compare.mjs --dry --db
//   실비교(오케스트레이터, 읽기 전용 + 구독 경로 LLM): node --env-file=.env.local scripts/story-flow-compare.mjs --real --db [--k 12] [--seed 20261120]
//   공통: [--out reports/2026-11-20-story-flow]
// LLM 은 구독 경로 claude -p(lib/story-label/cli.mjs runCli — ANTHROPIC_API_KEY 를 뺀 env). 기존 경로의 두 판정(질의·심사)은 Haiku, 채점은 Sonnet.
// 출력: <out>/compare-<dry|real>.json(원자료 — 사업 설명·내부 slug 포함, 커밋 전 확인) · <out>/compare-<dry|real>.md(회사별 점수·평균·승/무/패·실패 표시·인용).
// 종료 코드: 0 = 끝까지 돎 · 1 = 돌았지만 확인 실패가 있음(K 미달·채점 실패·인용 불일치) · 2 = 입력/DB 를 못 읽음 · 64 = 사용법.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { selectStoryFlow, dbLoaders, selectionToSimilar, verifyQuotes, collectQuotes, quoteSlugs, sourceFromRows, STORY_FLOW_B_OPTS } from '../lib/consult/story-flow-select.ts'
import { enrichDiagnosis } from '../lib/consult/story-flow-topic.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

export const AREA_NAMES = { 1: '회의·통화 기록', 2: '영업 도우미', 3: '마케팅 도구', 4: '인사 운영·근태', 5: '리뷰 관리·글쓰기', design: '디자인' }
/** analysis_projects.bottleneck(PMF 진단 입력) → story flow 장. SUPPLY·NULL 은 장 근거가 없어 기본 5장(손님 데려오기)으로 두고 chapter_basis 에 남긴다. */
export const BOTTLENECK_CH = { AWARENESS: [5], DISTRIBUTION: [5], TRUST: [6], CONVERSION: [6], UNIT_ECONOMICS: [6], RETENTION: [7] }
export const MUST = { 2: 3, 5: 3 } // 영역②·⑤ 최소 3곳씩
const ROUND = ['2', '5', '1', '3', '4', 'design']

/** 테스트 회사 고르기(순수). 조건: 사업 설명 20자 이상 · 영역 1~5·design · 같은 설명 중복 제외 · id 순(결정적). 영역②·⑤ 를 먼저 MUST 만큼, 나머지는 영역을 돌아가며 k 까지. */
export function pickCompanies(rows, k = 12) {
  const seen = new Set()
  const ok = rows.filter((r) => {
    const p = (r.product_elevator_pitch ?? '').trim(), key = p.toLowerCase().replace(/\s+/g, ' ')
    if (p.length < 20 || !(String(r.area_code) in AREA_NAMES) || seen.has(key)) return false
    seen.add(key); return true
  }).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
  const by = Object.fromEntries(ROUND.map((a) => [a, ok.filter((r) => String(r.area_code) === a)]))
  const out = []
  for (const [a, n] of Object.entries(MUST)) out.push(...by[a].splice(0, n))
  for (let progressed = true; out.length < k && progressed;) {
    progressed = false
    for (const a of ROUND) if (out.length < k && by[a].length) { out.push(by[a].shift()); progressed = true }
  }
  return out.slice(0, Math.max(k, Object.values(MUST).reduce((x, y) => x + y, 0)))
}
/** 회사 한 줄 → story flow 진단(B1 칸 채우기까지). 단계는 analysis_projects 에 매출 칸이 없어 모름으로 둔다(지어내지 않는다). */
export function diagnosisFor(row) {
  const chapters = BOTTLENECK_CH[row.bottleneck] ?? [5]
  const base = { chapter: chapters[0], chapters, situation: {} }
  return { chapter_basis: BOTTLENECK_CH[row.bottleneck] ? `bottleneck:${row.bottleneck}` : 'default:5(bottleneck 없음)',
    d: enrichDiagnosis(base, { oneLiner: row.product_elevator_pitch, url: row.competitor_url, category: AREA_NAMES[row.area_code], detail: row.detail ?? null }) }
}
/** 재현 가능한 난수(시드). */
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
/** 블라인드 순서: X·Y 자리에 어느 경로를 놓을지. */
export const blindOrder = (rng) => (rng() < 0.5 ? ['legacy', 'b'] : ['b', 'legacy'])
/** 채점 응답 검사 — 1~5 정수만. 아니면 null(채점 실패 — 점수로 접지 않는다, §7.1). */
export function parseJudge(data) {
  const ok = (v) => Number.isInteger(v) && v >= 1 && v <= 5
  return data && ok(data.x) && ok(data.y) ? { x: data.x, y: data.y, why_x: String(data.why_x ?? '').slice(0, 200), why_y: String(data.why_y ?? '').slice(0, 200) } : null
}
/** 집계(순수): 채점된 회사만. 승/무/패 는 B 기준. */
export function tally(results) {
  const s = results.filter((r) => r.score && r.score.legacy != null && r.score.b != null)
  const mean = (k) => (s.length ? Number((s.reduce((x, r) => x + r.score[k], 0) / s.length).toFixed(2)) : null)
  return { judged: s.length, total: results.length, mean_legacy: mean('legacy'), mean_b: mean('b'),
    win: s.filter((r) => r.score.b > r.score.legacy).length, tie: s.filter((r) => r.score.b === r.score.legacy).length, loss: s.filter((r) => r.score.b < r.score.legacy).length }
}

export const JUDGE_SYSTEM = `당신은 사업 진단 보고서의 "비슷한 회사 사례" 칸을 채점하는 심사자입니다.
${UNTRUSTED_INPUT_NOTICE}
사업 설명·병목과, 사례 목록 두 개(X, Y — 각 최대 3건)를 받습니다. 목록마다 "이 사업·이 병목과 주제가 맞는가"만 1~5점으로 매깁니다.
5 = 세 건 모두 같은 종류의 사업이거나 같은 병목을 같은 수단으로 다룸 · 3 = 일부만 맞음 · 1 = 거의 무관하거나 목록이 비어 있음.
글솜씨·숫자 크기·회사 유명세는 보지 않습니다. 두 목록의 출처는 알려 주지 않습니다. 목록에 적힌 내용 밖의 사실을 지어내지 않습니다.
출력은 JSON 하나만: {"x":1~5 정수,"y":1~5 정수,"why_x":"40자 이내","why_y":"40자 이내"}`
const CH_NAME = { 4: '써 보게 만들기', 5: '손님 데려오기(유입)', 6: '돈 내게 만들기(전환·가격)', 7: '계속 쓰게 만들기(유지)' }
const listText = (xs) => (xs.length ? xs.map((x, n) => `${n + 1}. ${x.name} — ${x.what}${x.why ? ` (${x.why})` : ''}`).join('\n') : '(제시된 사례 없음)')

async function main() {
  const argv = process.argv, has = (f) => argv.includes(`--${f}`), arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d }
  const dry = has('dry'), real = has('real'), useDb = has('db')
  if (dry === real) { console.error('사용법: --dry | --real (둘 중 하나), 실DB 는 --db'); process.exit(64) }
  if (real && !useDb) { console.error('--real 은 --db 가 필요하다(기존 경로 case_retrieve 가 DB 를 읽는다)'); process.exit(64) }
  const k = Number(arg('k', 12)), seed = Number(arg('seed', 20261120)), out = arg('out', 'reports/2026-11-20-story-flow')
  const mode = real ? 'real' : 'dry', now = new Date(), problems = []

  let sb = null, rows, loaders
  const fxCards = [...JSON.parse(readFileSync('fixtures/story-flow/cards.json', 'utf8')).cards, ...JSON.parse(readFileSync('fixtures/story-flow/topic-cards.json', 'utf8')).cards]
  if (useDb) {
    const { createClient } = await import('@supabase/supabase-js')
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    // 회사 고르는 쿼리: 사업 설명이 있고 영역(1~5·design)이 붙은 analysis_projects. 고르기 규칙은 pickCompanies(순수, 셀프테스트 고정).
    const { data, error } = await sb.from('analysis_projects').select('id,competitor_url,product_elevator_pitch,area_code,bottleneck')
      .in('area_code', Object.keys(AREA_NAMES)).not('product_elevator_pitch', 'is', null).order('id').limit(5000)
    if (error) { console.error(`analysis_projects 를 못 읽음: ${error.message}`); process.exit(2) }
    rows = pickCompanies(data ?? [], k)
    loaders = dbLoaders(sb)
  } else {
    rows = JSON.parse(readFileSync('fixtures/story-flow/topic-cards.json', 'utf8')).compare_companies
    loaders = { flowCards: async (ch) => fxCards.filter((c) => c.chapter === ch && c.weight >= 30) }
  }
  const per = Object.fromEntries(Object.keys(MUST).map((a) => [a, rows.filter((r) => String(r.area_code) === a).length]))
  if (useDb && (rows.length < k || Object.entries(MUST).some(([a, n]) => per[a] < n))) problems.push(`회사 K 미달 — ${rows.length}곳(영역② ${per[2]}·⑤ ${per[5]}), 목표 ${k}곳·②⑤ 각 ${MUST[2]}`)

  let runCli = null, parseJsonObject = null, retrieveSimilar = null
  if (real) {
    ;({ runCli } = await import('../lib/story-label/cli.mjs'))
    ;({ parseJsonObject } = await import('../lib/analysis/llm.ts'))
    ;({ retrieveSimilar } = await import('../lib/consult/cases.ts'))
  }
  const askJson = (model) => async ({ system, user }) => ({ data: parseJsonObject((await runCli({ system, user, model })).text) })
  const rng = mulberry32(seed), results = []

  for (const row of rows) {
    const { d, chapter_basis } = diagnosisFor(row)
    const r = { id: row.id, area: String(row.area_code), url: row.competitor_url, pitch: row.product_elevator_pitch, chapter_basis, diagnosis: { chapters: d.chapters, situation: d.situation, enrich_basis: d.enrich_basis, topic: d.topic } }
    // (2) 새 경로 B — 그리고 참고용으로 현재 기본 동작(옵션 없음, 진단 칸 채우기 없음)
    const base = { chapter: d.chapter, chapters: d.chapters, situation: {} }
    const cur = await selectStoryFlow(base, loaders, { now })
    const b = await selectStoryFlow(d, loaders, { now, ...STORY_FLOW_B_OPTS })
    r.current = { status: cur.status, items: cur.status === 'ok' ? selectionToSimilar(cur) : [], note: cur.note }
    r.b = { status: b.status, items: b.status === 'ok' ? selectionToSimilar(b) : [], note: b.note, selection: b }
    r.b.failed_shown = r.b.items.filter((x) => x.failed).length
    // B5 인용 검증 — 원본 표(ss_episode_tags)로 독립 대조. 오프라인은 픽스처 카드.
    if (b.status === 'ok') {
      const qs = collectQuotes(b)
      let source = {}
      if (sb) {
        const slugs = quoteSlugs(qs)
        if (slugs.length) {
          const { data, error } = await sb.from('ss_episode_tags').select('source_key,slug,label_run,episode_idx,quote_orig').in('slug', slugs).order('slug').order('label_run').order('episode_idx').limit(10000)
          if (error) { r.quote_check = { ok: false, error: error.message }; problems.push(`${row.id} 인용 원문 못 읽음`) }
          else source = sourceFromRows(data ?? [])
        }
      } else for (const c of fxCards) (source[c.slug] ??= []).push(...c.episodes.map((e) => ({ ...e, source_key: c.source_key, label_run: c.label_run })))
      if (!r.quote_check) { const q = verifyQuotes(b, source); r.quote_check = { ok: q.ok, checked: q.checked, mismatches: q.mismatches }; if (!q.ok) problems.push(`${row.id} 인용 불일치 ${q.mismatches.length}건`) }
    }
    // (1) 기존 경로 + 블라인드 채점(--real 만)
    if (real) {
      try {
        r.legacy = { items: await retrieveSimilar({ runId: 'story-flow-compare', owner: 'story-flow-compare', category: AREA_NAMES[row.area_code], oneLiner: row.product_elevator_pitch }, { llmJson: askJson('claude-haiku-5-5'), sb }) }
      } catch (e) { r.legacy = { items: [], error: String(e?.message ?? e) }; problems.push(`${row.id} 기존 경로 실패`) }
      const order = blindOrder(rng), lists = { legacy: r.legacy.items, b: r.b.items }
      r.blind = { x: order[0], y: order[1] }
      if (!lists.legacy.length && !lists.b.length) r.score = { legacy: 1, b: 1, rule: 'both_empty' }
      else {
        try {
          const user = `사업 설명: ${row.product_elevator_pitch.slice(0, 400)}\n병목: ${d.chapters.map((c) => CH_NAME[c] ?? `장 ${c}`).join(', ')}\n\n[X]\n${listText(lists[order[0]])}\n\n[Y]\n${listText(lists[order[1]])}`
          const j = parseJudge((await askJson('claude-sonnet-5-5')({ system: JUDGE_SYSTEM, user })).data)
          if (!j) { r.score = null; problems.push(`${row.id} 채점 응답 형식 오류`) }
          else r.score = { [order[0]]: j.x, [order[1]]: j.y, why: { [order[0]]: j.why_x, [order[1]]: j.why_y } }
        } catch (e) { r.score = null; r.judge_error = String(e?.message ?? e); problems.push(`${row.id} 채점 실패`); if (e?.constructor?.name === 'StopRun') { results.push(r); break } }
      }
    }
    results.push(r)
    console.log(`${row.id}: 현재 ${cur.status} · B ${b.status}(${r.b.items.length}) · 인용 ${r.quote_check ? (r.quote_check.ok ? 'ok' : '불일치') : '-'}${real ? ` · 점수 ${r.score ? `기존 ${r.score.legacy} / B ${r.score.b}` : '채점 실패'}` : ''}`)
  }

  const t = real ? tally(results) : null
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, `compare-${mode}.json`), JSON.stringify({ generated_at: now.toISOString(), mode, db: useDb, seed, k, opts: STORY_FLOW_B_OPTS, tally: t, problems, results }, null, 2) + '\n')
  const host = (u) => { try { return new URL(u).hostname } catch { return '-' } }
  const names = (xs) => (xs?.length ? xs.map((x) => `${x.failed ? '⚠' : ''}${x.name}`).join(' · ') : '(없음)')
  const verdict = (r) => (!r.score ? '채점 실패' : r.score.b > r.score.legacy ? '승' : r.score.b < r.score.legacy ? '패' : '무')
  const md = [
    `# story flow 나란히 비교 — ${mode}`, '',
    `- 생성 ${now.toISOString()} · 원천 ${useDb ? 'DB(읽기 전용)' : '합성 픽스처(실제 회사 아님)'} · 회사 ${rows.length}곳(영역② ${per[2]}·⑤ ${per[5]}) · 시드 ${seed}`,
    `- B = enrichDiagnosis(사업 설명·URL·영역 이름) + selectStoryFlow(${JSON.stringify(STORY_FLOW_B_OPTS)}) · 기존 = retrieveSimilar(카테고리 자리에 영역 이름)`,
    `- 진단 단계는 analysis_projects 에 매출 칸이 없어 모름. 장은 bottleneck 칸(없으면 5장 기본) — 회사별 chapter_basis 참고.`,
    ...(t ? [`- **채점 ${t.judged}/${t.total} · 평균 기존 ${t.mean_legacy} / B ${t.mean_b} · B 승 ${t.win} · 무 ${t.tie} · 패 ${t.loss}**`] : ['- 드라이런 — LLM 호출 없음, 채점 없음']),
    ...(problems.length ? ['', '## 확인 실패(통과로 접지 않음)', ...problems.map((p) => `- ${p}`)] : []), '',
    real ? '| 회사 | 영역 | 장 | 기존 | B | 결과 | B 실패 표시 | B 인용 |\n|---|---|---|---|---|---|---|---|' : '| 회사 | 영역 | 장 | 현재(옵션 없음) | B | B 실패 표시 | B 인용 |\n|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const who = `${String(r.id).slice(0, 8)} ${host(r.url)}`, q = r.quote_check ? (r.quote_check.ok ? `ok ${r.quote_check.checked}` : `✗ ${r.quote_check.mismatches?.length ?? '?'}`) : '-'
      const fs = r.b.items.length ? (r.b.failed_shown ? `${r.b.failed_shown}건 표시` : '없음') : '-'
      return real ? `| ${who} | ${r.area} | ${r.diagnosis.chapters.join('·')} | ${r.score?.legacy ?? '-'} | ${r.score?.b ?? '-'} | ${verdict(r)} | ${fs} | ${q} |`
        : `| ${who} | ${r.area} | ${r.diagnosis.chapters.join('·')} | ${names(r.current.items)} | ${names(r.b.items)} | ${fs} | ${q} |`
    }),
    '', '## 회사별 목록', ...results.flatMap((r) => [`### ${String(r.id).slice(0, 8)} (영역 ${r.area}, ${r.chapter_basis})`, `- 채운 칸: ${JSON.stringify(r.diagnosis.situation)} · 주제 개념: ${r.diagnosis.topic.concepts.join(', ') || '(없음)'}`,
      ...(real ? [`- 기존: ${names(r.legacy?.items)}`] : [`- 현재: ${names(r.current.items)}`]), `- B: ${names(r.b.items)} (${r.b.status})`, ...(r.score?.why ? [`- 채점 이유: 기존 「${r.score.why.legacy}」 / B 「${r.score.why.b}」`] : []), '']),
  ].join('\n')
  writeFileSync(join(out, `compare-${mode}.md`), md + '\n')
  console.log(`→ ${join(out, `compare-${mode}.md`)}${t ? ` · 평균 기존 ${t.mean_legacy} / B ${t.mean_b} · 승 ${t.win} 무 ${t.tie} 패 ${t.loss}` : ''}${problems.length ? ` · 확인 실패 ${problems.length}건` : ''}`)
  process.exitCode = problems.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
