#!/usr/bin/env node
// 카드뉴스·칼럼 문장용 AI 말투 린터 — 순수 함수 + CLI. AI 호출 0 · 네트워크 0 · DB 0.
//   node scripts/ai-tone-lint.mjs card.json            # 카드 내용 JSON(slides[].paragraphs[].text · caption · hashtags[])
//   node scripts/ai-tone-lint.mjs draft.md --json      # 평문(빈 줄 = 문단 경계), JSON 보고서
//   node scripts/ai-tone-lint.mjs x.json --config my.json --spec reports/2026-10-15/ig-style-spec.json
//
// 기준값은 scripts/ai-tone-lint.config.json 한 파일. style_spec(ig-style-spec.json)이 있으면 그 voice 값이 목표를 덮는다.
// 모든 지표는 문장 단위로 센 값이다. 문장 분리·어미 분류는 lib/content/ko-style.ts 한 벌을 쓴다(산식 두 벌 금지).
// 종료 코드: 0 = 실패 없음(경고는 있을 수 있음) / 1 = 실패 / 2 = 확인 불가(입력·설정 오류).
// 한계: 전부 정규식·끝음절 휴리스틱이다. 명사구 단문은 "체언+마침표"를 보수적으로(덜 세는 쪽으로) 잡는다.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitSentences, endingOf, PATTERNS } from '../lib/content/ko-style.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_CONFIG_PATH = path.join(ROOT, 'scripts', 'ai-tone-lint.config.json')
const cp = (s) => [...s].length
const PLAIN = new Set(['~ㅆ다', '~ㄴ다', '~이다', '~다'])
const POLITE = new Set(['합쇼체', '해요체'])
const TRIAD = PATTERNS.find((p) => p.id === 'B-triad')
const re = (s, flags = 'gu') => new RegExp(s, flags)
const short = (s, n = 24) => (cp(s) > n ? [...s].slice(0, n).join('') + '…' : s)
const trimTail = (s) => s.trim().replace(/[\s.!?…。~"'”’)\]」』*]+$/u, '')
const outOf = (v, [lo, hi]) => v < lo || v > hi
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

// ── 설정 ────────────────────────────────────────────────────────────────────
export function applySpec(cfg, spec, label = 'spec') {
  const v = { ...(spec?.defaults?.voice ?? {}), ...(spec?.override?.voice ?? {}) }
  if (!Object.keys(v).length) throw new Error(`스펙(${label})에 voice 값이 없다`)
  const t = { ...cfg.targets }
  if (v.ending_distribution_pct?.['~다']) t.da_pct = v.ending_distribution_pct['~다']
  if (v.question_pct?.range) t.question_pct = v.question_pct.range
  if (v.sentence_len_chars?.median_range) t.median_len = v.sentence_len_chars.median_range
  if (v.sentence_len_chars?.max) t.max_len = v.sentence_len_chars.max
  if (v.emoji === false) t.emoji_max = 0
  return { ...cfg, targets: t, targets_from: `스펙 ${label}` }
}
export function loadConfig(configPath = DEFAULT_CONFIG_PATH, specPath) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
  const sp = specPath ? path.resolve(specPath) : cfg.style_spec ? path.resolve(ROOT, cfg.style_spec) : null
  const r0 = sp && path.relative(ROOT, sp)
  const rel = sp && (r0.startsWith('..') ? sp : r0).split(path.sep).join('/')
  if (sp && existsSync(sp)) return applySpec(cfg, JSON.parse(readFileSync(sp, 'utf8')), rel)
  if (specPath) throw new Error(`--spec 파일이 없다: ${specPath}`)
  return { ...cfg, targets_from: sp ? `설정 파일(스펙 ${rel} 없음)` : '설정 파일' }
}

// ── 입력 → 단위 ──────────────────────────────────────────────────────────────
// body: 말투 지표 대상 문단 / quotes: role=quote 장(인용 규칙만) / extra: 제목·해시태그(문자열 검사만)
export function toUnits(input) {
  const body = [], quotes = [], extra = []
  if (typeof input === 'string') {
    input.replace(/\r\n?/g, '\n').split(/\n\s*\n/).forEach((t, i) => t.trim() && body.push({ where: `문단${i + 1}`, text: t }))
    return { body, quotes, extra }
  }
  if (!input || !Array.isArray(input.slides)) throw new Error('카드 JSON 에 slides 배열이 없다')
  input.slides.forEach((s, si) => {
    const label = `${s.no ?? si}장(${s.role ?? '?'})`
    if (Array.isArray(s.heading) && s.heading.length) extra.push({ where: `${label} 제목`, text: s.heading.join('\n') })
    const ps = (s.paragraphs ?? []).map((p) => (typeof p === 'string' ? p : p?.text ?? ''))
    if (s.role === 'quote') quotes.push({ where: label, text: ps.join('\n') })
    else ps.forEach((t, i) => t.trim() && body.push({ where: `${label} 문단${i + 1}`, text: t }))
  })
  if (typeof input.caption === 'string') {
    // 해시태그만 있는 줄은 문장이 아니다.
    const cap = input.caption.split('\n').filter((l) => !/^\s*(#\S+\s*)+$/.test(l)).join('\n')
    cap.split(/\n\s*\n/).forEach((t, i) => t.trim() && body.push({ where: `캡션 문단${i + 1}`, text: t }))
  }
  if (Array.isArray(input.hashtags) && input.hashtags.length) extra.push({ where: '해시태그', text: input.hashtags.join(' ') })
  return { body, quotes, extra }
}
export function parseInput(raw) {
  const t = raw.replace(/^﻿/, '')
  if (/^\s*\{/.test(t)) return JSON.parse(t)
  return t
}

// ── 문장 판정 ────────────────────────────────────────────────────────────────
export const isQuestion = (s) => /\?["'”’)\]」』]*\s*$/.test(s.trim())
// 명사구 단문: 짧고(≤maxChars) 마침표 하나로 끝나며 끝음절이 서술어·연결 어미가 아니다("체언+마침표").
// 서술어 끝음절 목록에 걸리면 세지 않는다 — 애매하면 덜 센다(예: "아이디어."는 '어'로 끝나 빠진다).
// ponytail: 끝음절 휴리스틱. 형태소 분석기가 들어오면 품사로 바꾼다.
const PRED_END = /[다요죠까냐니네지게자라고서면며데걸군래대야어아해]$/u
export function isNounPhrase(s, maxChars) {
  const t = s.trim()
  if (!/[^.]\.$/.test(t) || cp(t) > maxChars) return false
  const core = trimTail(t)
  return core.length > 0 && !PRED_END.test(core)
}
// "A가 아니라 B" 대비 틀. 첨가 '뿐만 아니라'·인용 '아니라고'·추측 '아닌 것 같다'는 뺀다.
// "A가 아니다. B다." 두 문장 꼴은 다음 문장이 부정 없는 ~다 일 때만 센다.
export function contrastCount(sents) {
  let n = 0
  sents.forEach((s, i) => {
    n += (s.match(/(?<!뿐만?\s?)아니라(?![가-힣])/gu) ?? []).length
    n += (s.match(/(?<![가-힣])아닌(?=\s)(?!\s것\s?같)/gu) ?? []).length
    const next = sents[i + 1]
    if (/[이가]\s?아니다$/u.test(trimTail(s)) && next && PLAIN.has(endingOf(next)) && !/아니|않|없|못/u.test(next)) n++
  })
  return n
}

// ── 린트 ────────────────────────────────────────────────────────────────────
export function lint(input, cfg) {
  const T = cfg.targets, sev = cfg.severity ?? {}
  const { body, quotes, extra } = toUnits(input)
  const findings = []
  const add = (id, msg, where) => findings.push({ id, level: sev[id] ?? 'warn', msg, ...(where ? { where } : {}) })

  const paras = body.map((u) => ({ where: u.where, sents: splitSentences(u.text) }))
  const S = paras.flatMap((p) => p.sents.map((text, i) => ({ text, where: `${p.where} 문장${i + 1}` })))
  const n = S.length
  const pct = (k) => (n ? Math.round((k / n) * 1000) / 10 : 0)
  const ends = S.map((s) => endingOf(s.text.replace(/[\p{Extended_Pictographic}️]/gu, ''))) // "늘었다 🚀." 도 ~다
  const da = ends.filter((e) => PLAIN.has(e)).length
  const polite = S.filter((_, i) => POLITE.has(ends[i]))
  const questions = S.filter((s) => isQuestion(s.text)).length
  const nouns = S.filter((s) => isNounPhrase(s.text, T.noun_phrase_max_chars))
  const contrast = contrastCount(S.map((s) => s.text))
  const lens = S.map((s) => cp(s.text))
  const med = median(lens)
  const long = S.filter((s) => cp(s.text) > T.max_len)
  const stats = { sentences: n, da_pct: pct(da), polite: polite.length, question_pct: pct(questions), noun_phrases: nouns.length, contrast, median_len: med, long_sentences: long.length }

  if (!n && !quotes.length) add('no_sentences', '본문 문장을 하나도 찾지 못했다 — 판정할 수 없다')
  if (n) {
    if (outOf(stats.da_pct, T.da_pct)) add('da_ratio', `"~다"로 끝나는 문장이 ${stats.da_pct}%다(목표 ${T.da_pct[0]}~${T.da_pct[1]}%, ${da}/${n}문장)`)
    for (const s of polite) add('polite_mix', `존댓말 문장이 섞였다: "${short(s.text)}"`, s.where)
    if (outOf(stats.question_pct, T.question_pct)) add('question', `물음표 문장이 ${stats.question_pct}%다(목표 ${T.question_pct[0]}~${T.question_pct[1]}%, ${questions}/${n}문장)`)
    if (nouns.length > T.noun_phrase_max) add('noun_phrase', `명사로 끊은 짧은 문장이 ${nouns.length}번이다(${T.noun_phrase_max}번까지): ${nouns.map((s) => `"${short(s.text, 12)}"`).join(', ')}`)
    if (contrast > T.contrast_max) add('contrast', `"A가 아니라 B" 꼴이 ${contrast}번이다(${T.contrast_max}번까지)`)
    if (outOf(med, T.median_len)) add('median_len', `문장 길이 가운데값이 ${med}자다(목표 ${T.median_len[0]}~${T.median_len[1]}자)`)
    for (const s of long) add('long_sentence', `${cp(s.text)}자짜리 긴 문장(${T.max_len}자 넘음): "${short(s.text)}"`, s.where)
  }

  // 금지·AI 말투 표현 — 본문 문장 + 제목(인용 제외)
  const scan = [...S, ...extra]
  for (const b of cfg.banned ?? []) for (const s of scan) if (re(b.re, 'u').test(s.text)) add('banned', `AI 말투 "${b.label}": "${short(s.text)}"`, s.where)
  // 정리 문장이 문단마다 반복: 2문장 이상 문단의 끝 문장이 정리 접속어로 시작
  const opener = new RegExp(`^(?:${(cfg.summary_openers ?? []).map((w) => w.replace(/\s/g, '\\s?')).join('|')})(?=[\\s,])`, 'u')
  const sumParas = paras.filter((p) => p.sents.length >= 2 && opener.test(p.sents.at(-1)))
  if (cfg.summary_openers?.length && sumParas.length > T.summary_paragraph_max) add('summary_repeat', `문단 끝을 정리 문장으로 맺은 곳이 ${sumParas.length}곳이다(${T.summary_paragraph_max}곳까지): ${sumParas.map((p) => p.where).join(', ')}`)
  // "~라고 썼다" 연속
  if (cfg.rago_re) {
    let run = 0, maxRun = 0, at = ''
    S.forEach((s) => { run = re(cfg.rago_re, 'u').test(s.text) ? run + 1 : 0; if (run > maxRun) { maxRun = run; at = s.where } })
    if (maxRun > T.rago_run_max) add('rago_run', `"~라고 썼다"가 ${maxRun}문장 연속이다(${T.rago_run_max}까지)`, at)
  }
  const allText = [...body, ...extra].map((u) => u.text).join('\n')
  const emoji = (allText.match(/\p{Extended_Pictographic}/gu) ?? []).length
  if (emoji > T.emoji_max) add('emoji', `이모지가 ${emoji}개다(${T.emoji_max}개까지)`)
  const dash = (allText.match(/—/g) ?? []).length
  if (dash > T.emdash_max) add('emdash', `긴 줄표(—)가 ${dash}개다(${T.emdash_max}개까지)`)
  const triads = TRIAD.count({ text: body.map((u) => u.text).join('\n'), sentences: S.map((s) => s.text) })
  if (triads > T.triad_max) add('triad', `"A, B, C" 세 개 나열이 ${triads}번이다(${T.triad_max}번까지)`)
  stats.emoji = emoji; stats.emdash = dash; stats.triads = triads

  // 문단 리듬: 문장 수 + 문장 길이 구간(짧/중/긴)이 같은 문단이 연속
  const [b1, b2] = T.rhythm_len_buckets
  const sig = (p) => (p.sents.length < T.rhythm_min_sentences ? null : `${p.sents.length}:${p.sents.map((s) => (cp(s) < b1 ? '짧' : cp(s) < b2 ? '중' : '긴')).join('')}`)
  for (let i = 0; i < paras.length;) {
    let j = i
    while (sig(paras[i]) && j + 1 < paras.length && sig(paras[j + 1]) === sig(paras[i])) j++
    if (j - i + 1 > T.rhythm_run_max) add('rhythm', `${j - i + 1}문단 연속 같은 리듬(${sig(paras[i])})이다`, `${paras[i].where}~${paras[j].where}`)
    i = j + 1
  }

  // 메타 줄 누출·개인정보 — 인용 포함 전 단위
  const every = [...body, ...quotes, ...extra]
  for (const m of cfg.meta ?? []) for (const u of every) { const k = (u.text.match(re(m.re)) ?? []).length; if (k) add('meta_leak', `작업용 메모가 본문에 남았다: "${m.label}"${k > 1 ? ` ${k}번` : ''}`, u.where) }
  for (const m of cfg.pii ?? []) for (const u of every) for (const x of u.text.matchAll(re(m.re))) add('pii', `개인정보(${m.label})로 보이는 값: "${short(x[0], 16)}"`, u.where)
  // 인용
  for (const q of quotes) {
    const len = cp(q.text.replace(/\n/g, ''))
    if (len > T.quote_max_chars) add('quote_len', `인용이 ${len}자다(${T.quote_max_chars}자까지)`, q.where)
    for (const m of cfg.quote_source ?? []) if (re(m.re, 'iu').test(q.text)) add('quote_source', `인용 안에 출처 표시(${m.label})가 들어 있다`, q.where)
  }
  // 흔한 오타 — 고객 원문 인용은 고치지 않으므로 뺀다
  for (const t of cfg.typos ?? []) for (const u of [...body, ...extra]) for (const x of u.text.matchAll(re(t.re))) add('typo', `"${x[0]}" → "${t.fix}"`, u.where)

  const fails = findings.filter((f) => f.level === 'fail').length
  return { ok: fails === 0, fails, warns: findings.length - fails, targets_from: cfg.targets_from ?? '설정 객체', stats, findings }
}

export function summary(r) {
  const s = r.stats
  const lines = [
    `AI 말투 린터: ${r.ok ? '통과' : '실패'} — 실패 ${r.fails} · 경고 ${r.warns} (기준: ${r.targets_from})`,
    `- 본문 ${s.sentences}문장 · "~다" ${s.da_pct}% · 물음표 ${s.question_pct}% · 명사 단문 ${s.noun_phrases}번 · "아니라" 틀 ${s.contrast}번 · 길이 가운데값 ${s.median_len}자`,
  ]
  for (const f of r.findings) lines.push(`- [${f.level === 'fail' ? '실패' : '경고'}] ${f.where ? `${f.where}: ` : ''}${f.msg}`)
  return lines.join('\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const file = argv.find((a, i) => !a.startsWith('--') && !['--config', '--spec'].includes(argv[i - 1]))
  try {
    if (!file) throw new Error('입력 파일을 주지 않았다. 사용법: node scripts/ai-tone-lint.mjs <card.json|글.md> [--json] [--config c.json] [--spec s.json]')
    const cfg = loadConfig(opt('--config') ?? DEFAULT_CONFIG_PATH, opt('--spec'))
    const r = lint(parseInput(readFileSync(file, 'utf8')), cfg)
    console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : summary(r))
    process.exit(r.ok ? 0 : 1)
  } catch (e) {
    console.error(`확인 불가: ${e.message}`)
    process.exit(2)
  }
}
