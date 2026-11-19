#!/usr/bin/env node
// [v71cu E1] story flow 콘텐츠 가치(고객 관점) 평가 — 블라인드 채점 패킷 만들기.
// 외부 진단 입력(리포 밖 JSON) 하나로, 같은 실행에서 진단마다
//   (기존) retrieveSimilar  vs  (새) enrichDiagnosis + selectStoryFlow(변형별 옵션)
// 의 '비슷한 사례' 칸을 같은 마크다운 형식으로 렌더링하고, 대조군(나쁜·좋은 결론서)을 몰래 섞어 채점 패킷을 만든다.
// 정답 표(어느 칸이 어느 경로·대조군인지)는 패킷과 다른 파일 key.json 에만 쓴다. 채점·합격 판정은 story-flow-eval-score.mjs.
//
//   오프라인(합성 카드 픽스처, 기존 경로 미실행 — 연기 시험용):
//     node scripts/story-flow-eval-pack.mjs --diagnoses <리포 밖 json> --out <리포 밖 dir> [--seed 20261120] [--variants topic]
//   실DB(오케스트레이터만 — 읽기 전용 + 기존 경로 판정 Haiku 구독 경로):
//     node --env-file=.env.local scripts/story-flow-eval-pack.mjs --diagnoses <json> --out <dir> --seed 20261120 --variants both --db
// 좋은 대조군을 사람·외부 작성자가 고를 때(E3): --dump-candidates <dir> 로 진단별 새 경로 후보 40장 + 기존 경로 후보를 <dir>/candidates.json 에 쓰고(채점자에게 주지 않음),
//   그걸 보고 쓴 { "<진단 id>": { "cases": [{display_name, what, why, quote_orig, quote_ko}] ×3 } } 를 --good-controls <json> 으로 넣는다. 인용 원문이 후보 원문에 없으면 패킷을 쓰지 않고 종료 1.
// --variants: base(진단 칸 채우기 + 단계 우선) · topic(칸 채우기 + 단계 우선 + 주제 신호 = STORY_FLOW_B_OPTS) · both(두 열 모두). 쉼표 목록도 된다.
// --synth(기본 꺼짐): 모든 칸(새 경로·기존 경로·대조군)에 같은 '사례 기반 맞춤 적용 문장' 층(lib/consult/story-flow-synthesis.ts)을 같은 프롬프트로 붙인다(구독 경로 Sonnet).
//   사례 없는 칸·합성 실패·근거 검사 실패 칸은 원래 모양 그대로 두고 key.json(notes.synth·problems)에 기록.
// DB 쓰기·발송·깃발 변경 없음. 결론서(compose.ts)는 부르지 않는다.
// 종료 코드: 0 = 끝까지 돎 · 1 = 돌았지만 확인 실패가 있음(빠진 진단·대조군 부족 등, key.json problems) · 2 = 입력/DB 를 못 읽음 · 64 = 사용법.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { selectStoryFlow, dbLoaders, clipText, healClip, anchorEpisode, BOTTLENECK_ANSWER, STORY_FLOW_B_OPTS } from '../lib/consult/story-flow-select.ts'
import { synthesize } from '../lib/consult/story-flow-synthesis.ts'
import { BOTTLENECK_CHAPTERS } from '../lib/consult/story-flow.ts'
import { enrichDiagnosis } from '../lib/consult/story-flow-topic.ts'
import { AREA_NAMES, BOTTLENECK_CH, mulberry32 } from './story-flow-compare.mjs'

/** 새 경로 변형. base = 진단 칸 채우기만(+단계 우선), topic = 칸 채우기 + 주제 신호(권장 설정 B안). */
export const VARIANT_OPTS = { base: { stageFirst: true }, topic: { ...STORY_FLOW_B_OPTS } }
export const SCORE_ITEMS = ['same_situation', 'specificity', 'actionability', 'novelty', 'decision_help', 'readability']
const SITUATION_KEYS = ['customer', 'price_band', 'stage', 'team_size', 'pricing_model']
const LABELS = 'ABCDEFGH'

export function parseVariants(v = 'topic') {
  const s = new Set()
  for (const x of String(v).split(',').map((t) => t.trim()).filter(Boolean)) {
    if (x === 'both') { s.add('base'); s.add('topic') } else if (x in VARIANT_OPTS) s.add(x)
    else throw new Error(`--variants 값 "${x}" 를 모름 (base·topic·both)`)
  }
  if (!s.size) throw new Error('--variants 가 비었음')
  return Object.keys(VARIANT_OPTS).filter((k) => s.has(k))
}
/** 병목 → story flow 장. 결론서 질문 답(예: '방문하는 사람이 적다')·장 키(not_arriving)·analysis_projects 코드(AWARENESS) 셋 다 받는다. 모르면 null(기본 장으로 접지 않는다). */
export function chaptersFor(b) {
  if (typeof b !== 'string') return null
  if (b in BOTTLENECK_ANSWER) return BOTTLENECK_CHAPTERS[BOTTLENECK_ANSWER[b]]
  return BOTTLENECK_CHAPTERS[b] ?? BOTTLENECK_CH[b] ?? null
}
/** 입력 검사 — 오류 문장 목록(비면 통과). */
export function validateDiagnoses(xs) {
  if (!Array.isArray(xs) || !xs.length) return ['진단 입력이 비었거나 배열이 아님']
  const errs = [], ids = new Set()
  xs.forEach((x, i) => {
    const at = `#${i}(${x?.id ?? '?'})`
    if (!x || typeof x !== 'object') { errs.push(`${at} 객체가 아님`); return }
    if (!x.id || ids.has(String(x.id))) errs.push(`${at} id 가 없거나 중복`); ids.add(String(x.id))
    if (!(String(x.area) in AREA_NAMES)) errs.push(`${at} area 는 ${Object.keys(AREA_NAMES).join('·')} 중 하나`)
    if (typeof x.has_pitch !== 'boolean') errs.push(`${at} has_pitch 는 true/false`)
    if (x.has_pitch && !(x.pitch ?? '').trim()) errs.push(`${at} has_pitch=true 인데 pitch 가 비었음`)
    if (!chaptersFor(x.bottleneck)) errs.push(`${at} bottleneck "${x.bottleneck}" 를 장으로 못 바꿈`)
    if (x.situation != null && typeof x.situation !== 'object') errs.push(`${at} situation 은 객체`)
  })
  return errs
}
/**
 * 진단 한 건 → 두 경로에 줄 같은 조건.
 * has_pitch=false = '실제 경로' 조건: 사업 설명을 비우고 상황은 단계만(결론서 diagnosisFromReport 가 채우는 칸과 같다).
 * has_pitch=true = 사업 설명(+사업 모델) 포함, 상황 칸 전부.
 */
export function conditionFor(x) {
  const chapters = chaptersFor(x.bottleneck), sit = x.situation ?? {}
  const situation = x.has_pitch ? Object.fromEntries(SITUATION_KEYS.filter((k) => sit[k]).map((k) => [k, sit[k]])) : sit.stage ? { stage: sit.stage } : {}
  const pitch = x.has_pitch ? [x.pitch, x.business_model].filter(Boolean).join(' · ') : ''
  const category = AREA_NAMES[String(x.area)]
  return {
    base: { chapter: chapters[0], chapters, situation, ...(x.adversity_text ? { adversity: x.adversity_text } : {}) },
    enrich: { oneLiner: pitch, url: x.url ?? null, category, detail: x.adversity_text ?? null },
    legacy: { category, oneLiner: pitch },
  }
}
/** 로더를 감싸 읽은 카드를 기억한다(인용 번역 quote_ko 를 찾으려고 — 선택 결과에는 원문만 있다). */
export function remembering(loaders) {
  const cards = new Map()
  const wrap = (f) => f && (async (ch) => { const xs = await f(ch); for (const c of xs) if (!cards.has(c.slug)) cards.set(c.slug, c); return xs })
  return { cards, loaders: { flowCards: wrap(loaders.flowCards), moveTags: wrap(loaders.moveTags), caseBank: wrap(loaders.caseBank) } }
}
// 옛 꼬리표는 quote_ko·action_ko 등이 200자에서 낱말 중간으로 잘려 저장돼 있다 — healClip 으로 문장·낱말 경계로 다시 자른다(인용 원문 quote_orig 는 자르지 않는다).
const quoteKo = (cards, q) => healClip(cards.get(q.slug_internal ?? q.slug)?.episodes?.find((e) => e.episode_idx === q.episode_idx)?.quote_ko ?? null)
/** 선택 한 건 → 렌더링 항목. 내용은 selectionToSimilar 와 같다(what = 요약, why = 비슷한 이유 / 설득력 이유). 실패 표시는 앞말 대신 표시 칸으로.
 * src = 합성 층 입력(패킷에는 안 나간다): 기준 에피소드의 행동·결과·조건·어려움 + 인용 번역(인용 허용 소스일 때만 — p.quote 가 있을 때). */
export const pickItem = (p, cards) => {
  const ko = p.quote ? quoteKo(cards, p.quote) : null, card = cards.get(p.slug_internal), e = card ? anchorEpisode(card) : undefined
  return { what: p.summary_ko, why: clipText(`${p.reasons[0]} / ${p.reasons[1]}`, 120), fail: p.fail_kind ?? null, quote: p.quote ? { orig: p.quote.text, ko } : null,
    src: { action: healClip(e?.action_ko) ?? p.summary_ko, result: healClip(e?.result_ko), condition: healClip(e?.condition_ko), adversity: healClip(e?.adversity_ko), quote_ko: ko, failed: !!p.fail_kind, quote_allowed: !!p.quote } }
}
export const legacyItem = (x) => ({ what: x.what ?? '', why: x.why ?? '', fail: null, quote: null })
/** 합성 층 입력 — src 가 없는 칸(기존 경로·일반론·외부 대조군)은 화면에 보이는 '무엇을 했나'(+번역)만. */
export const synthPick = (it) => it.src ?? { action: it.what, failed: !!it.fail, quote_ko: it.quote?.ko ?? null, quote_allowed: !!it.quote }
const picksOf = (s) => (s.recommended ? [s.recommended, ...s.alternatives] : s.alternatives ?? [])

/** 일반론 템플릿(사업 무관한 상투적 조언) — 나쁜 대조군 재료. 스스로 "나쁘다"고 밝히지 않는 그럴듯한 문장으로 쓴다. */
export const GENERIC_ADVICE = [
  { what: '고객의 목소리에 귀 기울이고 꾸준히 개선했다 → 결국 성장했다', why: '많은 창업자가 같은 고민을 한다 / 꾸준함이 결과를 만들었다' },
  { what: '소셜 미디어 마케팅을 강화하고 브랜드 인지도를 높였다 → 매출이 늘었다', why: '요즘 시장에서 흔한 상황이다 / 마케팅의 기본을 지켰다' },
  { what: '핵심 가치에 집중하고 불필요한 기능을 줄였다 → 사업이 안정됐다', why: '성장 단계에서 누구나 겪는 일이다 / 선택과 집중의 힘' },
  { what: '데이터를 기반으로 의사결정을 내렸다 → 효율이 좋아졌다', why: '비슷한 고민을 하는 회사가 많다 / 데이터는 거짓말을 하지 않는다' },
  { what: '팀의 열정과 끈기로 위기를 넘겼다 → 다시 성장 궤도에 올랐다', why: '어려운 시기를 겪는 회사가 많다 / 포기하지 않은 것이 비결이었다' },
  { what: '고객 경험을 최우선으로 두고 서비스 품질을 높였다 → 재구매가 늘었다', why: '고객이 중요하다는 점은 같다 / 품질이 경쟁력이 됐다' },
]
const shuffle = (xs, rng) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

const FAIL_MARK = { negative: '잘 안 풀린 경우', mixed: '반쯤만 풀린 경우' }
/** 합성 칸 — 모든 칸이 같은 형식. 할 일·하지 말 것이 0개면 '(없음)'. */
export function renderSynthesis(s) {
  return ['', '**이 고객에게(요약)**', '', s.summary_for_you, '', '**이번 주 할 일**', '',
    ...(s.do_this_week.length ? s.do_this_week.map((x, i) => `${i + 1}. ${x.step} (사례 ${x.from_case}) — ${x.why}`) : ['- (없음)']), '', '**하지 말 것**', '',
    ...(s.dont_do.length ? s.dont_do.map((x) => `- ${x.avoid} (사례 ${x.from_case}) — ${x.why}`) : ['- (없음)']), '', `**주의**: ${s.caveat}`]
}
/** 결론서 한 칸 — 모든 칸(경로·대조군)이 같은 형식. 회사명 대신 '사례 N', 경로 정체는 쓰지 않는다. synth 가 있으면 사례 아래에 합성 칸을 붙인다(사례가 없으면 붙이지 않는다). */
export function renderPanel(label, items, synth = null) {
  const lines = [`### 결론서 ${label}`, '', '**비슷한 사례**', '']
  if (!items.length) lines.push('- (제시된 사례 없음)')
  items.forEach((x, i) => {
    lines.push(`${i + 1}. **사례 ${i + 1}**${x.fail ? ` — ⚠ ${FAIL_MARK[x.fail] ?? FAIL_MARK.negative}` : ''}`, `   - 무엇을 했나: ${x.what || '(내용 없음)'}`)
    if (x.why) lines.push(`   - 왜 비슷한가: ${x.why}`)
    if (x.quote) lines.push(`   - 원문 인용: "${x.quote.orig}"`, `   - 번역: ${x.quote.ko ? `"${x.quote.ko}"` : '(번역 없음)'}`)
  })
  if (synth && items.length) lines.push(...renderSynthesis(synth))
  return lines.join('\n')
}
const SIT_KO = { stage: '단계', customer: '손님', price_band: '값대(월, 달러)', team_size: '팀 크기', pricing_model: '과금 방식' }
/** 채점자에게는 병목 코드 대신 말로(코드 이름이 경로 단서가 되지 않게). 결론서 질문 답(한국어)은 그대로. */
const BOTTLENECK_KO = { AWARENESS: '사람들이 잘 모른다', DISTRIBUTION: '손님에게 닿을 길이 없다', TRUST: '믿고 사지 않는다', CONVERSION: '써 보고 돈은 안 낸다', UNIT_ECONOMICS: '팔수록 남는 게 적다', RETENTION: '쓰다가 떠난다',
  not_arriving: '방문하는 사람이 적다', no_signup: '와서 가입을 안 한다', not_using: '가입하고 쓰다 만다', not_paying: '써 보고 돈은 안 낸다', churn: '쓰다가 떠난다', new_channels: '새 손님 길을 찾는다' }
const host = (u) => { try { return new URL(u).hostname } catch { return u || '' } }
/** 채점자에게 보이는 진단 — 고객이 아는 자기 사정 그대로(입력의 사업 설명·상황 전부). 경로 조건(has_pitch)은 쓰지 않는다. */
export function diagnosisInfo(x) {
  const sit = x.situation ?? {}
  return { name: x.name ?? '', area: AREA_NAMES[String(x.area)], pitch: x.pitch ?? '', url: host(x.url), business_model: x.business_model ?? '', bottleneck: BOTTLENECK_KO[x.bottleneck] ?? x.bottleneck,
    situation: Object.fromEntries(Object.keys(SIT_KO).filter((k) => sit[k]).map((k) => [SIT_KO[k], sit[k]])), adversity_text: x.adversity_text ?? '', customer_story: x.customer_story ?? '' }
}

export const INSTRUCTIONS = [
  '당신은 아래 사업을 하는 사장님이라고 생각하고 읽습니다. 진단마다 결론서 여러 개의 "비슷한 사례" 칸이 있습니다. 결론서끼리 서로 무엇이 다른지·어떻게 만들었는지는 알려 주지 않습니다.',
  '결론서마다 6개 항목을 0~5 정수로 매깁니다(5 = 아주 그렇다, 0 = 전혀 아니다).',
  '  same_situation: 내 상황(사업·막힌 곳)과 같은 처지의 사례인가',
  '  specificity: 무엇을 했고 결과가 어땠는지 구체적인가',
  '  actionability: 내가 따라 할 수 있는 행동이 보이는가',
  '  novelty: 내가 몰랐던 것을 알려 주는가',
  '  decision_help: 다음 결정을 내리는 데 도움이 되는가',
  '  readability: 읽기 쉬운가',
  '시험 ②: 결론서마다 "이것만 읽고 내일 무엇을 하겠는가"를 한 줄로 적습니다(tomorrow_action). action_concrete 는 그 한 줄이 구체적 행동인지(누가·무엇을·언제 할지 알 수 있으면 true)입니다.',
  '시험 ①: 진단마다 짝지어 준 두 결론서 중 사장님에게 더 도움되는 쪽의 글자를 고릅니다. 정말 차이가 없으면 "tie".',
  '응답은 form-template.json 을 채워 form.schema.json 에 맞는 JSON 하나로 돌려줍니다. packet_id 는 그대로 둡니다. 결론서에 적힌 내용 밖의 사실을 지어내지 않습니다.',
]

/** --synth 일 때만 덧붙는 안내(합성 꺼짐 패킷은 한 글자도 안 바뀐다). */
export const SYNTH_INSTRUCTION = '결론서에 "이 고객에게(요약)·이번 주 할 일·하지 말 것·주의" 칸이 있으면 그 칸까지 포함해 결론서 전체를 채점합니다.'
export const SYNTH_MODEL = 'claude-sonnet-5-5'
/** 합성 층에 주는 진단 — 채점자가 보는 진단과 같다(사업 설명·막힌 곳·상황·어려움·고객 이야기 요약 600자). 모든 칸 같은 값. */
export function synthDiagnosis(x) {
  const i = diagnosisInfo(x)
  return { pitch: [i.pitch, i.business_model].filter(Boolean).join(' · '), bottleneck: i.bottleneck, situation: i.situation, adversity: i.adversity_text, story: clipText(i.customer_story, 600) }
}

/** 응답 양식(JSON Schema). 채점자 파일 — 경로·점수식 설명 없음. */
export function formSchema() {
  const score = { type: 'integer', minimum: 0, maximum: 5 }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: '비슷한 사례 칸 채점 응답', type: 'object', required: ['packet_id', 'grader', 'diagnoses'],
    properties: {
      packet_id: { type: 'string' }, grader: { type: 'string', description: '채점자 이름(예: opus, fable)' }, round: { type: 'string' },
      diagnoses: { type: 'array', items: { type: 'object', required: ['id', 'panels', 'test1'], properties: {
        id: { type: 'string' },
        panels: { type: 'object', additionalProperties: { type: 'object', required: [...SCORE_ITEMS, 'tomorrow_action', 'action_concrete'],
          properties: { ...Object.fromEntries(SCORE_ITEMS.map((k) => [k, score])), tomorrow_action: { type: 'string', minLength: 1 }, action_concrete: { type: 'boolean' } } } },
        test1: { type: 'array', items: { type: 'object', required: ['pair_id', 'choice'], properties: { pair_id: { type: 'string' }, choice: { type: 'string', description: '두 글자 중 하나 또는 "tie"' } } } },
      } } },
    },
  }
}

/**
 * 패킷·정답 표 만들기(순수 + 주입). legacy(input) → SimilarCase[] , loaders → story flow 카드.
 * 기존 경로가 실패하면 그 진단은 패킷에서 빼고 problems 에 남긴다(공정하지 않은 비교를 채점시키지 않는다). 한도 오류(StopRun)는 다시 던진다.
 * 새 경로가 ok 가 아니면 결론서 실경로(chooseSimilar)처럼 기존 경로 목록이 그 칸에 나간다 — key 에 fallback 으로 남긴다.
 */
export async function buildPack({ diagnoses, seed = 20261120, variants = ['topic'], loaders, legacy, now = new Date(), mode = 'dry', goodControls = null, dumpCandidates = false, synth = null }) {
  const rng = mulberry32(seed), problems = [], goodErrors = [], candidates = [], { cards, loaders: ld } = remembering(loaders)
  if (goodControls) for (const id of Object.keys(goodControls)) if (!diagnoses.some((x) => String(x.id) === id)) goodErrors.push(`${id} 좋은 대조군의 진단 id 가 입력에 없음`)
  const done = []
  for (const x of diagnoses) {
    const c = conditionFor(x), d = enrichDiagnosis(c.base, c.enrich)
    let legRaw
    try { legRaw = await legacy(c.legacy) } catch (e) {
      if (e?.constructor?.name === 'StopRun') throw e
      problems.push(`${x.id} 기존 경로 실패 — 패킷에서 뺌: ${String(e?.message ?? e).slice(0, 120)}`); continue
    }
    const leg = legRaw.map(legacyItem)
    const out = { x, c, d, panels: { legacy: leg }, notes: { legacy_count: leg.length } }
    for (const v of variants) {
      const s = await selectStoryFlow(d, ld, { now, ...VARIANT_OPTS[v] })
      out.notes[v] = { status: s.status, note: s.note, fallback: s.status !== 'ok' }
      out.panels[v] = s.status === 'ok' ? picksOf(s).map((p) => pickItem(p, cards)) : leg
    }
    // 후보 덤프(사람·외부 작성자용, 채점자에게 주지 않음): 새 경로 상위 40장(권장 설정 순위) + 기존 경로 목록.
    const cand = dumpCandidates || goodControls ? await candidatesFor(d, ld, cards, now) : null
    if (dumpCandidates) candidates.push({ id: String(x.id), info: diagnosisInfo(x), chapters: d.chapters, new_candidates: cand, legacy_candidates: legRaw.map((l) => ({ name: l.name ?? '', what: l.what ?? '', why: l.why ?? '' })) })
    if (goodControls) {
      // 좋은 대조군(외부 작성): 같은 형식으로 렌더링, 인용 원문이 이 진단의 후보 원문 안에 실제로 있는지 확인.
      const g = goodControls[String(x.id)], errs = checkGoodControl(g, cand)
      if (errs.length) goodErrors.push(...errs.map((e) => `${x.id} ${e}`))
      else { out.panels.good = g.cases.map((k) => ({ what: k.what, why: k.why ?? '', fail: null, quote: k.quote_orig ? { orig: k.quote_orig, ko: k.quote_ko || null } : null })); out.notes.good = { source: 'external', display_names: g.cases.map((k) => k.display_name ?? '') } }
    } else {
      // 좋은 대조군(자동): 같은 장(병목) 카드 중 주제 일치(영역)·점수가 높은 것, 잘 된 사례만 3건.
      const pool = await selectStoryFlow(d, ld, { now, topic: true, limit: 50 })
      const good = picksOf(pool).filter((p) => p.source === 'story_flow' && !p.failed).sort((a, b) => (b.topic ?? 0) - (a.topic ?? 0) || b.score - a.score).slice(0, 3)
      if (good.length < 3) problems.push(`${x.id} 좋은 대조군 ${good.length}건(<3)`)
      if (good.length) { out.panels.good = good.map((p) => pickItem(p, cards)); out.notes.good = { source: 'auto' } }
    }
    out.area = String(x.area)
    done.push(out)
  }
  // 나쁜 대조군: 일반론 2건 + 다른 영역 진단의 새 경로 사례 1건(없으면 일반론 3건). 자리는 섞는다.
  for (const o of done) {
    const others = done.filter((p) => p.area !== o.area).flatMap((p) => p.panels[variants[0]] ?? []).filter((it) => it.what)
    const gen = shuffle(GENERIC_ADVICE, rng).map((g) => ({ ...g, fail: null, quote: null }))
    const foreign = others.length ? [others[Math.floor(rng() * others.length)]] : []
    o.panels.bad = shuffle([...gen.slice(0, 3 - foreign.length), ...foreign], rng)
    o.notes.bad = { generic: 3 - foreign.length, other_area: foreign.length }
  }
  // 합성 층(--synth): 모든 칸에 같은 진단·같은 프롬프트. 칸 순서를 섞는 난수는 쓰지 않는다(합성 켜고 끄기가 칸 글자를 바꾸지 않게).
  if (synth) for (const o of done) {
    const sd = synthDiagnosis(o.x)
    o.synth = {}; o.notes.synth = {}
    for (const [kind, items] of Object.entries(o.panels)) {
      const r = await synthesize(sd, items.map(synthPick), synth)
      o.notes.synth[kind] = r.status === 'ok' ? { status: 'ok' } : { status: r.status, ...(r.reason ? { reason: r.reason } : {}), ...(r.unsupported ? { unsupported: r.unsupported } : {}) }
      if (r.status === 'ok') o.synth[kind] = r.value
      else if (r.status !== 'skipped') problems.push(`${o.x.id} ${kind} 합성 ${r.status === 'unsupported' ? '버림(근거 없는 ' + r.unsupported.join('·') + ')' : '실패: ' + r.reason} — 그 칸은 합성 없이 나감`)
    }
  }
  const pDiag = [], kDiag = []
  for (const o of done) {
    const kinds = shuffle(Object.keys(o.panels), rng), labelOf = Object.fromEntries(kinds.map((k, i) => [k, LABELS[i]]))
    const pairs = shuffle(variants, rng).map((v, i) => ({ pair_id: `p${i + 1}`, v, options: shuffle([labelOf.legacy, labelOf[v]], rng) }))
    pDiag.push({ id: String(o.x.id), info: diagnosisInfo(o.x),
      panels: kinds.map((k) => ({ label: labelOf[k], markdown: renderPanel(labelOf[k], o.panels[k], o.synth?.[k] ?? null),
        items: o.panels[k].map((it, i) => ({ name: `사례 ${i + 1}`, mark: it.fail ? FAIL_MARK[it.fail] ?? FAIL_MARK.negative : null, what: it.what, why: it.why, quote_orig: it.quote?.orig ?? null, quote_ko: it.quote ? it.quote.ko : null })),
        ...(synth ? { for_you: o.synth?.[k] ?? null } : {}) })),
      test1_pairs: pairs.map(({ pair_id, options }) => ({ pair_id, options })) })
    kDiag.push({ id: String(o.x.id), area: o.area, has_pitch: o.x.has_pitch, panels: Object.fromEntries(kinds.map((k) => [labelOf[k], k])),
      pairs: Object.fromEntries(pairs.map(({ pair_id, v }) => [pair_id, { variant: v, variant_label: labelOf[v], legacy_label: labelOf.legacy }])),
      notes: o.notes, condition: { chapters: o.d.chapters, situation: o.d.situation, enrich_basis: o.d.enrich_basis, topic: o.d.topic, legacy_input: o.c.legacy } })
  }
  const body = { title: '비슷한 사례 칸 채점 패킷', instructions: synth ? [...INSTRUCTIONS, SYNTH_INSTRUCTION] : INSTRUCTIONS, diagnoses: pDiag }
  const packet_id = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  const packet = { packet_id, ...body }
  const template = { packet_id, grader: '', round: '', diagnoses: pDiag.map((d) => ({ id: d.id,
    panels: Object.fromEntries(d.panels.map((p) => [p.label, { ...Object.fromEntries(SCORE_ITEMS.map((k) => [k, null])), tomorrow_action: '', action_concrete: null }])),
    test1: d.test1_pairs.map((p) => ({ pair_id: p.pair_id, choice: '' })) })) }
  const key = { packet_id, generated_at: now.toISOString(), mode, seed, variants, variant_opts: Object.fromEntries(variants.map((v) => [v, VARIANT_OPTS[v]])), good_controls: goodControls ? 'external' : 'auto', synth: synth ? { enabled: true, model: SYNTH_MODEL, input: 'diagnosisInfo(진단 전체) — 모든 칸 같은 진단·같은 프롬프트' } : { enabled: false }, problems, diagnoses: kDiag }
  return { packet, template, key, problems, goodErrors, candidates }
}

export const CANDIDATE_LIMIT = 40
/** 새 경로 후보 상위 40장 — 권장 설정(topic) 순위, 에피소드 전부. 내부 slug 대신 표시용 이름(selectStoryFlow 가 붙인 displayName)과 후보 번호. */
export async function candidatesFor(d, ld, cards, now) {
  const s = await selectStoryFlow(d, ld, { now, ...VARIANT_OPTS.topic, limit: CANDIDATE_LIMIT })
  return picksOf(s).map((p, i) => ({ cand_id: `c${String(i + 1).padStart(2, '0')}`, display_name: p.name, source: p.source, chapter: p.chapter, score: p.score, topic: p.topic ?? null, failed: p.failed, summary_ko: p.summary_ko,
    episodes: (cards.get(p.slug_internal)?.episodes ?? []).map((e) => ({ chapter: e.chapter, episode_idx: e.episode_idx, result_class: e.result_class, evidence_strength: e.evidence_strength,
      adversity_ko: e.adversity_ko ?? null, action_ko: e.action_ko ?? null, result_ko: e.result_ko ?? null, condition_ko: e.condition_ko ?? null, quote_orig: e.quote_orig ?? null, quote_ko: e.quote_ko ?? null })) }))
}
const normQ = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
/** 외부 좋은 대조군 검사 — 3건, what 필수, quote_orig 가 있으면 이 진단 후보 에피소드의 원문 안에 실제로 있어야 한다(지어낸 인용 금지). 오류 문장 목록. */
export function checkGoodControl(g, cand) {
  if (!g || !Array.isArray(g.cases)) return ['좋은 대조군 없음(cases 배열)']
  const errs = [], origs = (cand ?? []).flatMap((c) => c.episodes.map((e) => normQ(e.quote_orig)).filter(Boolean))
  if (g.cases.length !== 3) errs.push(`좋은 대조군 ${g.cases.length}건(3건이어야 함)`)
  g.cases.forEach((k, i) => {
    if (!String(k?.what ?? '').trim()) errs.push(`좋은 대조군 ${i + 1} what 비었음`)
    const q = normQ(k?.quote_orig)
    if (q && !origs.some((o) => o.includes(q))) errs.push(`좋은 대조군 ${i + 1} 인용이 후보 원문에 없음: "${q.slice(0, 60)}"`)
  })
  return errs
}

export function packetMarkdown(packet) {
  return [`# ${packet.title}`, '', `packet_id: \`${packet.packet_id}\``, '', '## 채점 방법', ...packet.instructions.map((s) => (s.startsWith('  ') ? `  - ${s.trim()}` : `- ${s}`)), '',
    ...packet.diagnoses.flatMap((d) => {
      const i = d.info
      return ['---', '', `## 진단 ${d.id}${i.name ? ` — ${i.name}` : ''}`, '',
        `- 영역: ${i.area}`, `- 사업 설명: ${i.pitch || '(없음)'}`, ...(i.business_model ? [`- 사업 모델: ${i.business_model}`] : []), ...(i.url ? [`- 사이트: ${i.url}`] : []),
        `- 막힌 곳: ${i.bottleneck}`, `- 상황: ${Object.entries(i.situation).map(([k, v]) => `${k} ${v}`).join(' · ') || '(적힌 것 없음)'}`,
        ...(i.adversity_text ? [`- 겪는 어려움: ${i.adversity_text}`] : []), ...(i.customer_story ? ['', '> 고객 이야기', ...i.customer_story.split('\n').map((l) => `> ${l}`)] : []), '',
        ...d.panels.flatMap((p) => [p.markdown, '']),
        '#### 시험 ① — 둘 중 더 도움되는 쪽', ...d.test1_pairs.map((p) => `- ${p.pair_id}: 결론서 ${p.options[0]} vs 결론서 ${p.options[1]}`), '']
    })].join('\n') + '\n'
}

async function main() {
  const argv = process.argv.slice(2), has = (f) => argv.includes(`--${f}`), arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
  const valued = ['--diagnoses', '--out', '--seed', '--variants', '--dump-candidates', '--good-controls'], known = new Set([...valued, '--db', '--synth'])
  const bad = argv.filter((a, i) => a.startsWith('--') && !known.has(a) && !(i > 0 && valued.includes(argv[i - 1])))
  const inPath = arg('diagnoses'), out = arg('out'), seed = Number(arg('seed') ?? 20261120), useDb = has('db')
  if (bad.length || !inPath || !out || !Number.isInteger(seed)) { console.error('사용법: --diagnoses <json> --out <dir> [--seed N] [--variants base|topic|both] [--dump-candidates <dir>] [--good-controls <json>] [--db] [--synth]'); process.exit(64) }
  let variants
  try { variants = parseVariants(arg('variants') ?? 'topic') } catch (e) { console.error(e.message); process.exit(64) }
  let raw
  try { raw = JSON.parse(readFileSync(inPath, 'utf8')) } catch (e) { console.error(`진단 입력을 못 읽음: ${e.message}`); process.exit(2) }
  const diagnoses = Array.isArray(raw) ? raw : raw?.diagnoses
  const errs = validateDiagnoses(diagnoses)
  if (errs.length) { console.error(['진단 입력 오류:', ...errs].join('\n  ')); process.exit(2) }
  const dumpDir = arg('dump-candidates'), gcPath = arg('good-controls')
  let goodControls = null
  if (gcPath) {
    try { goodControls = JSON.parse(readFileSync(gcPath, 'utf8')) } catch (e) { console.error(`좋은 대조군 파일을 못 읽음: ${e.message}`); process.exit(2) }
    if (!goodControls || typeof goodControls !== 'object' || Array.isArray(goodControls)) { console.error('좋은 대조군은 { "<진단 id>": { "cases": [...] } } 객체'); process.exit(2) }
  }
  for (const dir of [out, dumpDir].filter(Boolean)) {
    const rel = relative(process.cwd(), resolve(dir))
    if (!rel.startsWith('..') && !isAbsolute(rel)) console.warn(`⚠ ${dir} 이 리포 안(${rel})이다. 이 리포는 공개 — 진단·고객 이야기가 든 파일은 커밋하지 않는다.`)
  }

  let loaders, legacy, sb = null
  if (useDb) {
    const { createClient } = await import('@supabase/supabase-js')
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { runCli } = await import('../lib/story-label/cli.mjs'), { parseJsonObject } = await import('../lib/analysis/llm.ts'), { retrieveSimilar } = await import('../lib/consult/cases.ts')
    const llmJson = async ({ system, user }) => ({ data: parseJsonObject((await runCli({ system, user, model: 'claude-haiku-5-5' })).text) })
    loaders = dbLoaders(sb)
    legacy = (i) => retrieveSimilar({ runId: 'story-flow-eval', owner: 'story-flow-eval', ...i }, { llmJson, sb })
  } else {
    const fx = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).cards
    const cards = [...fx('../fixtures/story-flow/cards.json'), ...fx('../fixtures/story-flow/topic-cards.json')]
    loaders = { flowCards: async (ch) => cards.filter((c) => c.chapter === ch && c.weight >= 30) }
    legacy = async () => [] // 오프라인: 기존 경로(DB·LLM)를 돌리지 않는다 — 그 칸은 비어 나간다(연기 시험 전용, 실채점에 쓰지 않는다).
  }
  let synth = null
  if (has('synth')) {
    // 구독 경로(claude -p, ANTHROPIC_API_KEY·서비스 키를 뺀 env, 도구 없이 1턴). 한도 오류(StopRun)는 buildPack 밖으로 올라와 멈춘다.
    const { runCli } = await import('../lib/story-label/cli.mjs'), { parseJsonObject } = await import('../lib/analysis/llm.ts')
    synth = async ({ system, user }) => parseJsonObject((await runCli({ system, user, model: SYNTH_MODEL })).text)
  }
  let r
  try { r = await buildPack({ diagnoses, seed, variants, loaders, legacy, mode: useDb ? 'db' : 'dry', goodControls, dumpCandidates: !!dumpDir, synth }) } catch (e) { console.error(`멈춤: ${String(e?.message ?? e)}`); process.exit(e?.constructor?.name === 'StopRun' ? 1 : 2) }
  if (dumpDir) {
    mkdirSync(dumpDir, { recursive: true })
    writeFileSync(join(dumpDir, 'candidates.json'), JSON.stringify({ note: '좋은 대조군 작성용 후보 — 채점자에게 주지 않는다', mode: useDb ? 'db' : 'dry', seed, limit: CANDIDATE_LIMIT, diagnoses: r.candidates }, null, 2) + '\n')
    console.log(`→ 후보(채점자에게 주지 않음): ${join(dumpDir, 'candidates.json')} · 진단 ${r.candidates.length}건`)
  }
  if (r.goodErrors.length) { console.error(['좋은 대조군 검사 실패 — 패킷을 쓰지 않는다:', ...r.goodErrors].join('\n  ')); process.exit(1) }
  const pdir = join(out, 'packet')
  mkdirSync(pdir, { recursive: true })
  writeFileSync(join(pdir, 'packet.json'), JSON.stringify(r.packet, null, 2) + '\n')
  writeFileSync(join(pdir, 'packet.md'), packetMarkdown(r.packet))
  writeFileSync(join(pdir, 'form.schema.json'), JSON.stringify(formSchema(), null, 2) + '\n')
  writeFileSync(join(pdir, 'form-template.json'), JSON.stringify(r.template, null, 2) + '\n')
  writeFileSync(join(out, 'key.json'), JSON.stringify(r.key, null, 2) + '\n')
  console.log(`→ 채점자에게 줄 폴더: ${pdir} (packet.md·packet.json·form.schema.json·form-template.json)\n→ 정답 표(채점자에게 주지 않음): ${join(out, 'key.json')}\n진단 ${r.packet.diagnoses.length}/${diagnoses.length}건 · 변형 ${variants.join(',')} · packet_id ${r.packet.packet_id}${r.problems.length ? `\n확인 실패 ${r.problems.length}건:\n  ${r.problems.join('\n  ')}` : ''}`)
  process.exitCode = r.problems.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
