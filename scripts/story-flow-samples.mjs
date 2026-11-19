#!/usr/bin/env node
// [v71cu 2-7] 내부 샘플 — 같은 진단(영역②·⑤)에 대해 점수 적용 전(pickFlowCards: 비슷함→설득력)과 후(selectStoryFlow: scoreCard·회사당 1장·폴백)를 나란히 만든다.
// 결론서 전체(1~6장)는 모델 호출이 들어가 여기서 만들지 않는다 — 바뀌는 칸(③ 비슷한 회사 = ch1.similar)과 payload.story_flow 만 낸다. 발송·DB 쓰기 없음.
//   오프라인(합성 픽스처):  node scripts/story-flow-samples.mjs [--fixture fixtures/story-flow/cards.json] [--out reports/2026-11-19-v71cu/story-flow-samples]
//   실데이터(오케스트레이터만, 읽기 전용): node --env-file=.env.local scripts/story-flow-samples.mjs --db --out reports/2026-11-19-v71cu/story-flow-samples-db
//   실제 결론서 경로 진단(F6): ... --real-diagnosis  — compose.ts 의 diagnosisFromReport 가 채우는 칸(장·단계)만으로 만든 진단(픽스처 real_inputs). 파일 이름 끝에 -real.
// 출력: <out>/<진단키>.md(전/후 표) · <out>/<진단키>.json(전/후 원자료 — scripts/story-flow-quote-check.mjs 로 인용 검증).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickFlowCards } from '../lib/consult/story-flow.ts'
import { selectStoryFlow, dbLoaders, cardFromMoveTag, cardFromCaseBank, selectionToSimilar, verifyQuotes, diagnosisFromReport } from '../lib/consult/story-flow-select.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const useDb = process.argv.includes('--db')
const fixturePath = arg('fixture', 'fixtures/story-flow/cards.json')
const out = arg('out', useDb ? 'reports/2026-11-19-v71cu/story-flow-samples-db' : 'reports/2026-11-19-v71cu/story-flow-samples')
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'))
const realDiag = process.argv.includes('--real-diagnosis')
const diagnoses = realDiag
  ? Object.fromEntries(Object.entries(fx.real_inputs ?? {}).map(([k, v]) => [`${k}-real`, { ...diagnosisFromReport(v), label: v.label }]))
  : fx.diagnoses
if (realDiag && Object.values(diagnoses).some((d) => d.chapter == null)) { console.error('real_inputs 중 장을 정하지 못한 진단이 있습니다(diagnosisFromReport → null)'); process.exit(2) }

let loaders
if (useDb) {
  const { createClient } = await import('@supabase/supabase-js')
  loaders = dbLoaders(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }))
} else {
  loaders = {
    flowCards: async (ch) => fx.cards.filter((c) => c.chapter === ch && c.weight >= 30),
    moveTags: async (ch) => (fx.move_tags ?? []).filter((r) => Number(r.chapter) === ch).map(cardFromMoveTag),
    caseBank: async (ch) => (fx.case_bank ?? []).map((r) => cardFromCaseBank(r, ch)).filter(Boolean),
  }
}

mkdirSync(out, { recursive: true })
const now = new Date()
const line = (p, i) => `| ${i === 0 ? '추천' : `대안 ${i}`} | ${p.slug ?? p.card?.slug} | ${p.source ?? 'story_flow'} | ${p.score ?? '-'} | ${p.similarity ?? p.situation} | ${p.persuasion} | ${p.hasFailure ? '예' : ''} | ${(p.reasons ?? [p.similarWhy, p.persuasiveWhy]).join(' / ')} |`
const head = '| 자리 | 사례 | 원천 | 점수 | 비슷함/상황 | 설득력 | 안 된 시도 | 이유 2개 |\n|---|---|---|---|---|---|---|---|'
let failed = 0
for (const [key, d] of Object.entries(diagnoses)) {
  const cards = (await Promise.all((d.chapters ?? [d.chapter]).map((ch) => loaders.flowCards(ch)))).flat()
  const before = pickFlowCards(cards, d)
  const after = await selectStoryFlow(d, loaders, { now })
  const bPicks = before.recommended ? [before.recommended, ...before.alternatives] : []
  const aPicks = after.recommended ? [after.recommended, ...after.alternatives] : after.alternatives
  const source = Object.fromEntries(cards.map((c) => [c.slug, [...(cards.filter((x) => x.slug === c.slug).flatMap((x) => x.episodes))]]))
  // 자체 대조(같은 카드 데이터 — 독립 검증 아님). 독립 대조는 scripts/story-flow-quote-check.mjs --db(원본 ss_episode_tags).
  const qc = verifyQuotes({ story_flow: after }, source, { allowEmpty: true })
  if (qc.mismatches.length) failed++
  const md = [
    `# story flow 샘플 — ${d.label ?? key}`, '',
    `- 생성: ${now.toISOString()} · 원천: ${useDb ? 'DB(story_flow_cards_mat→story_flow_cards, ss_move_tags_current, case_bank)' : `합성 픽스처 \`${fixturePath}\` — 실제 회사·실제 인용 아님`}`,
    `- 진단: 장 ${(d.chapters ?? [d.chapter]).join('·')} · 상황 ${JSON.stringify(d.situation)}${d.mechanism ? ` · 원리 ${d.mechanism}` : ''}`, '',
    `## 점수 적용 전 (pickFlowCards — 비슷함 상위 10 → 설득력) · ${before.status}`, before.note, '', bPicks.length ? head : '(없음 — 기존 경로로 폴백)', ...bPicks.map(line), '',
    `## 점수 적용 후 (scoreCard 0.35/0.30/0.15/0.15/0.05 · 회사당 1장 · 폴백) · ${after.status}`, after.note, '', aPicks.length ? head : '(없음 — 기존 경로로 폴백)', ...aPicks.map(line), '',
    '## 결론서 ③ 비슷한 회사 칸(깃발 ON 일 때 화면에 나가는 것)', ...(after.status === 'ok' ? selectionToSimilar(after).map((x) => `- **${x.name}** — ${x.what} (${x.why})`) : ['- 깃발 ON 이어도 ok 가 아니라 기존 경로(retrieveSimilar) 그대로']), '',
    `## 인용 자체 대조(같은 카드 데이터, 독립 검증 아님 — 독립 대조는 story-flow-quote-check.mjs --db) — ${qc.checked}건 확인, 불일치 ${qc.mismatches.length}건${qc.mismatches.length ? '\n' + qc.mismatches.map((m) => `- ${m.slug}#${m.episode_idx} ${m.reason}`).join('\n') : ''}`,
  ].join('\n')
  writeFileSync(join(out, `${key}.md`), md + '\n')
  writeFileSync(join(out, `${key}.json`), JSON.stringify({ diagnosis: d, before, after, quote_check: qc }, null, 2) + '\n')
  console.log(`${key}: 전 ${before.status}(${bPicks.length}) · 후 ${after.status}(${aPicks.length}) · 인용 ${qc.checked}건 불일치 ${qc.mismatches.length}`)
}
process.exitCode = failed ? 1 : 0
