#!/usr/bin/env node
// content-gate 스킬 평가 하니스.
//
// 일회성 응시가 아니라 스킬을 고칠 때마다 돌리는 회귀 검사다.
// 문항은 methodology/content/eval/questions.md, 정답은 eval/answers.md 에 있고
// **정답 파일은 피평가자 컨텍스트에 절대 들어가지 않는다.** 한 파일에 같이 두면
// "정답 보지 마"라고 지시해도 파일을 읽는 순간 이미 본 상태가 된다(INF-04).
//
//   node scripts/run-eval.mjs --runs 3
//   node scripts/run-eval.mjs --runs 1 --only 1,2,3      # 파일럿
//   node scripts/run-eval.mjs --mock                     # 모델 호출 없이 채점기만 검증
//
// 문항 하나당 `claude -p` 프로세스를 새로 띄운다. 프로세스가 곧 컨텍스트 경계라
// 이전 문항의 답이 다음 문항에 새지 않는다.
//
// ⚠️ 스킬이 못 푼다고 스킬을 고치지 마라. 이 스크립트는 측정만 한다.
import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EVAL_DIR = path.join(ROOT, 'methodology', 'content', 'eval')
const QUESTIONS = path.join(EVAL_DIR, 'questions.md')
const ANSWERS = path.join(EVAL_DIR, 'answers.md')
const RESULTS_DIR = path.join(EVAL_DIR, 'results')

// 모델 응답 원문. 채점기를 고칠 때마다 90번을 다시 호출하지 않으려면
// **수집과 채점을 분리**해야 한다. --regrade 가 이걸 다시 읽는다.
const RAW_DIR = path.join(RESULTS_DIR, 'raw')

// 자동 채점이 어려운 서술형. 채점기가 확신하지 못하면 `수동확인` 으로 남긴다.
// 0점으로 접으면 "틀렸다"와 "채점 못 했다"가 섞인다 (CLAUDE.md §7.1).
const ESSAY_QUESTIONS = new Set([1, 6, 10, 11, 13, 17, 22, 23, 25, 26, 27, 29, 30])

// 규칙군 → 문항 (prompt-B-CC.md STEP 3). C-01 은 두 방법론이 완전히 일치한
// 유일한 영역이라 여기서 2개 이상 틀리면 나머지 점수를 신뢰하면 안 된다.
const RULE_GROUPS = [
  ['C-01 타깃/표본 (불변원리)', [11, 15, 19, 21, 22, 28]],
  ['C-12 해소 구간 (불변원리)', [8, 25]],
  ['C-10 효율화', [9, 24]],
  ['C-11 라벨 부여', [2, 3]],
  ['P-03 표본 층위', [23]],
  ['P-08 편집 공수', [24]],
  ['P-10 규격', [14]],
  ['연출·진정성 (솔파 §2-8)', [4, 5, 6, 12]],
  ['카피 구체성', [17, 20, 27]],
  ['교차 판정', [28, 29, 30]],
]

const PROMPT_HEADER = `먼저 content-gate 스킬을 로드하고(Skill 도구), 그 규칙으로만 답하라.
아래 문항에 스킬의 규칙(솔파 R-xx / 프드프 P-xx / 교차 C-xx, 게이트 G-x)을 적용해 답하라.

반드시 아래 두 줄 형식으로만 답한다. 다른 말은 붙이지 않는다.

[선택]: (보기 기호 또는 결론 한 줄)
[근거]: (왜 그런지 한 줄. 해당하는 규칙 코드나 §번호를 함께 적는다)

문항:
`

// ── 파싱 ────────────────────────────────────────────────────────────

function parseQuestions() {
  const text = fs.readFileSync(QUESTIONS, 'utf8')
  const out = []
  const re = /^### Q(\d+)\.(.*)$/gm
  const marks = [...text.matchAll(re)]
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    // 헤딩의 `[솔파 §2-3]` 출처 표시는 정답 힌트다. 문제지에서 떼고 던진다.
    const body = text
      .slice(start, end)
      .replace(/^\s*---\s*$/gm, '')
      .trim()
    out.push({ n: Number(marks[i][1]), body })
  }
  return out
}

// 정답 블록에서 "선택"에 해당하는 보기 기호들을 순서대로 뽑는다.
// A1 처럼 `C > A ≈ D > B` 인 배열 문제도 같은 방식으로 다뤄진다.
const OPTION_RE = /(?:\b[A-D]\b|갑|을|병|정)/g

function optionTokens(s) {
  if (!s) return []
  // 규칙 코드(R-01, C-11, P-03)와 §번호가 보기 기호로 오인되지 않게 먼저 지운다.
  const cleaned = s
    .replace(/[RPCGUDX]-\d+/g, ' ')
    .replace(/§\d+-\d+/g, ' ')
    .replace(/\*\*/g, ' ')
  return [...cleaned.matchAll(OPTION_RE)].map(m => m[0])
}

// 조사·접속사 같은 기능어는 아무 응답에나 들어가서 겹침을 부풀린다.
const STOPWORDS = new Set([
  '그리고', '그래서', '하지만', '때문에', '이것', '저것', '그것', '이거', '경우',
  '있다', '없다', '한다', '된다', '이다', '하는', '되는', '있는', '없는', '같은',
  '점수', '채점', '근거', '정답', '문항', '선택', '내용', '부분', '설명',
])

// 한글 2자 이상 / 영문 3자 이상 낱말만 남긴다. 숫자는 실측값이라 살린다.
function contentTokens(text) {
  const raw = (text || '')
    .replace(/[^0-9A-Za-z가-힣]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const out = new Set()
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue
    if (/^[가-힣]+$/.test(w) && w.length >= 2) out.add(w)
    else if (/^[A-Za-z]+$/.test(w) && w.length >= 3) out.add(w.toLowerCase())
    else if (/^\d{2,}$/.test(w)) out.add(w)
  }
  return [...out]
}

function parseAnswers() {
  const text = fs.readFileSync(ANSWERS, 'utf8')
  const map = new Map()
  const re = /^\*\*A(\d+)\.?\s*(.*)$/gm
  const marks = [...text.matchAll(re)]
  for (let i = 0; i < marks.length; i++) {
    const n = Number(marks[i][1])
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    const block = text.slice(start, end)
    const head = marks[i][2].replace(/\*\*/g, '').trim()

    const codes = [...block.matchAll(/\b[RPC]-\d{2}\b/g)].map(m => m[0])
    const sections = [...block.matchAll(/§\d+-\d+/g)].map(m => m[0])
    // 굵게 표시된 짧은 구절이 곧 채점 키워드다 (**언매칭**, **추상어의 저주** 등).
    // 원문 인용은 길어서 표현이 조금만 달라도 안 맞으므로 길이로 잘라낸다.
    const bolds = [...block.matchAll(/\*\*([^*]{2,24})\*\*/g)]
      .map(m => m[1].trim())
      .filter(s => !/^A\d+/.test(s) && !/^\d[\d,.만억]*$/.test(s))

    // 채점 기준은 정답 블록 전체다. 처음엔 `- **근거**:` 줄만 봤는데, 근거를
    // 번호 목록으로 쓴 정답(A22 등)이 통째로 빠져서 낱말이 0개가 됐고 그 문항은
    // 무조건 오답으로 찍혔다. 채점기가 못 읽은 것을 오답으로 세면 안 된다.
    const rubric = block.replace(/^\*\*A\d+\.?\**/, ' ')

    map.set(n, {
      n,
      head,
      block,
      expectedOptions: optionTokens(head),
      codes: [...new Set(codes)],
      sections: [...new Set(sections)],
      keywords: [...new Set(bolds)],
      rubricTokens: contentTokens(rubric + ' ' + head),
    })
  }
  return map
}

// ── 채점 ────────────────────────────────────────────────────────────

const norm = s => (s || '').replace(/\s+/g, '').toLowerCase()

function extractResponse(raw) {
  const pick = label => {
    const m = raw.match(new RegExp(`\\[${label}\\]\\s*[:：]\\s*(.*)`))
    return m ? m[1].trim() : ''
  }
  return { choice: pick('선택'), reason: pick('근거'), raw }
}

function gradeOne(ans, res) {
  const result = { n: ans.n, choice: false, reason: false, manual: false, note: '' }
  if (!res.choice && !res.reason) {
    result.note = '파싱 실패(형식 불일치)'
    result.manual = true
    return result
  }

  // ── 선택 ──
  if (ans.expectedOptions.length > 0) {
    const got = optionTokens(res.choice)
    result.choice =
      got.length > 0 && got.join('') === ans.expectedOptions.join('')
  } else {
    // 보기 기호가 없는 서술형. 정답 머리글의 핵심 표현이나 채점 키워드가
    // 응답에 있으면 정답으로 본다.
    const hay0 = norm(res.choice + ' ' + res.reason)
    const key = norm(ans.head.replace(/\(.*?\)/g, '').replace(/[.`*]/g, ''))
    const hitHead =
      key.length >= 2 && hay0.includes(key.length <= 10 ? key : key.slice(0, 10))
    const hitKw = ans.keywords.filter(k => k.length >= 3 && hay0.includes(norm(k))).length
    result.choice = hitHead || hitKw >= 1
    // 안 걸렸다고 오답으로 접지 않는다. 채점기가 못 읽은 것과 응답이 틀린 것은
    // 다른 사건이다 (CLAUDE.md §7.1). 사람에게 넘긴다.
    if (!result.choice) result.manual = true
  }

  // ── 근거 ── 표현이 달라도 같은 규칙을 지목했으면 정답
  const hay = norm(res.reason + ' ' + res.choice)
  const hitCode = ans.codes.some(c => hay.includes(norm(c)))
  const hitSection = ans.sections.some(s => hay.includes(norm(s)))
  const hitKeyword = ans.keywords.filter(k => k.length >= 3 && hay.includes(norm(k))).length
  // 규칙 코드가 정답지에 없는 문항(원문 인용이 근거인 경우)은 낱말 겹침으로 본다.
  const respTokens = new Set(contentTokens(res.reason + ' ' + res.choice))
  const overlap = ans.rubricTokens.filter(t => respTokens.has(t)).length
  result.reason = hitCode || hitSection || hitKeyword >= 1 || overlap >= 3

  // 걸리지 않았어도 스쳤으면 오답이 아니라 판정 불가다 (CLAUDE.md §7.1).
  if (!result.reason && (overlap >= 1 || (ESSAY_QUESTIONS.has(ans.n) && res.reason.length > 10))) {
    result.manual = true
  }
  result.score = (result.choice ? 1 : 0) + (result.reason ? 1 : 0)
  return result
}

// ── 실행 ────────────────────────────────────────────────────────────

async function askModel(q, opts, ans) {
  // ★ --mock-perfect 는 정답지에서 만든 만점짜리 응답을 넘긴다.
  // 맞는 답도 틀렸다고 하는 채점기라면 점수가 스킬 실력이 아니라
  // 채점기 버그를 측정하게 된다. 돌리기 전에 이걸로 바닥을 확인한다.
  if (opts.mockPerfect) {
    const reason = [...ans.codes, ...ans.sections, ...ans.keywords.slice(0, 2)]
      .concat(ans.rubricTokens.slice(0, 12))
      .join(' ')
    return {
      text: `[선택]: ${ans.head}\n[근거]: ${reason || ans.head}`,
      skillUsed: null,
    }
  }
  if (opts.mock) {
    return {
      text: `[선택]: ${opts.mockChoice ?? 'B'}\n[근거]: 모의 응답 (모델 호출 없음)`,
      skillUsed: null,
    }
  }
  const prompt = PROMPT_HEADER + q.body
  // stream-json 을 쓰는 이유는 출력이 예뻐서가 아니라 **스킬이 실제로 로드됐는지**
  // 확인하기 위해서다. 스킬 없이 낸 점수를 "스킬 점수"로 보고하면 측정 대상이
  // 바뀐다 (CLAUDE.md §7.1).
  const { stdout } = await execFileAsync(
    opts.cli,
    ['-p', prompt, '--output-format', 'stream-json', '--verbose'],
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, timeout: opts.timeout },
  )
  let text = ''
  let skillUsed = false
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (line.includes('content-gate')) skillUsed = true
    if (ev.type === 'result' && typeof ev.result === 'string') text = ev.result
  }
  return { text, skillUsed }
}

const KNOWN_FLAGS = new Set([
  '--runs', '--only', '--mock', '--mock-perfect', '--cli', '--timeout', '--concurrency', '--regrade', '--no-write',
])

function args() {
  const a = process.argv.slice(2)
  // 플래그를 한 글자 틀리면 --mock 이 안 먹혀서 조용히 실제 모델 호출 30번으로 간다.
  const unknown = a.filter(x => x.startsWith('--') && !KNOWN_FLAGS.has(x))
  if (unknown.length) {
    console.error(`알 수 없는 옵션: ${unknown.join(' ')}`)
    process.exit(2)
  }
  const get = (flag, def) => {
    const i = a.indexOf(flag)
    return i >= 0 && a[i + 1] ? a[i + 1] : def
  }
  return {
    runs: Number(get('--runs', '3')),
    only: get('--only', '') ? get('--only', '').split(',').map(Number) : null,
    mock: a.includes('--mock') || a.includes('--mock-perfect'),
    mockPerfect: a.includes('--mock-perfect'),
    cli: get('--cli', 'claude'),
    timeout: Number(get('--timeout', '300000')),
    concurrency: Number(get('--concurrency', '4')),
    regrade: get('--regrade', ''),
    out: !a.includes('--no-write'),
  }
}

function commitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  } catch {
    return 'nogit'
  }
}

async function main() {
  const opts = args()
  const questions = parseQuestions().filter(q => !opts.only || opts.only.includes(q.n))
  const answers = parseAnswers()

  const missing = questions.filter(q => !answers.has(q.n)).map(q => q.n)
  if (missing.length) {
    // 정답이 없는 문항을 조용히 0점 처리하면 만점이 틀어진다.
    console.error(`정답이 없는 문항: Q${missing.join(', Q')}`)
    process.exitCode = 1
    return
  }
  if (!opts.regrade) {
    console.log(`문항 ${questions.length}개 · ${opts.runs}회 실행` + (opts.mock ? ' (mock)' : ''))
  }

  // ── 재채점 모드 ── 저장된 원문을 다시 채점만 한다. 모델을 부르지 않는다.
  if (opts.regrade) {
    const saved = JSON.parse(fs.readFileSync(opts.regrade, 'utf8'))
    const runs = saved.runs.map((rows, r) =>
      rows
        .filter(row => !opts.only || opts.only.includes(row.n))
        .map(row => {
          const res = extractResponse(row.raw)
          const g = gradeOne(answers.get(row.n), res)
          g.skillUsed = row.skillUsed ?? null
          g.responseSummary = (res.choice + ' / ' + res.reason).slice(0, 120)
          if (row.error) {
            g.note = `호출 실패: ${row.error}`
            g.manual = true
            g.choice = g.reason = false
            g.score = 0
          }
          return g
        }),
    )
    const qs = questions.filter(q => runs[0].some(g => g.n === q.n))
    const rep = buildReport(qs, runs, opts)
    console.log(rep.summary)
    if (opts.out) {
      // 리포트는 raw/ 가 아니라 results/ 에 쓴다. 원문과 채점 결과를 같은
      // 폴더에 섞으면 --regrade 대상 json 을 고를 때마다 헷갈린다.
      const outFile = path.join(RESULTS_DIR, path.basename(opts.regrade).replace(/\.json$/, '.md'))
      fs.writeFileSync(outFile, rep.markdown, 'utf8')
      console.log(`\n→ ${path.relative(ROOT, outFile)}`)
    }
    return
  }

  const raw = { date: new Date().toISOString(), commit: commitHash(), runs: [] }
  const runs = []
  for (let r = 0; r < opts.runs; r++) {
    const rows = []
    // 문항 간에 의존이 없으니 병렬로 돌린다. 프로세스가 곧 컨텍스트 경계라
    // 동시에 돌려도 답이 서로 새지 않는다. 30문항 x 3회를 직렬로 돌리면 한 시간이 넘는다.
    const queue = [...questions]
    const worker = async () => {
      while (queue.length) {
        rows.push(await runOne(queue.shift(), r, opts, answers))
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(opts.concurrency, questions.length) }, worker),
    )
    rows.sort((a, b) => a.n - b.n)
    runs.push(rows)
    raw.runs.push(
      rows.map(g => ({ n: g.n, raw: g.rawText ?? '', skillUsed: g.skillUsed, error: g.error ?? '' })),
    )
  }

  // ★ 채점 전에 원문부터 남긴다. 채점기를 고칠 때마다 90번을 다시 부르면
  // 비용도 비용이지만 실행마다 응답이 흔들려서 채점기 변경의 효과를 못 본다.
  if (opts.out) {
    fs.mkdirSync(RAW_DIR, { recursive: true })
    const rawFile = path.join(
      RAW_DIR,
      `${new Date().toISOString().slice(0, 10)}-${commitHash()}.json`,
    )
    fs.writeFileSync(rawFile, JSON.stringify(raw, null, 2), 'utf8')
    console.log(`\n원문 저장 → ${path.relative(ROOT, rawFile)}`)
  }

  const report = buildReport(questions, runs, opts)
  console.log('\n' + report.summary)
  if (opts.out) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
    const file = path.join(
      RESULTS_DIR,
      `${new Date().toISOString().slice(0, 10)}-${commitHash()}.md`,
    )
    fs.writeFileSync(file, report.markdown, 'utf8')
    console.log(`\n→ ${path.relative(ROOT, file)}`)
  }
}

async function runOne(q, r, opts, answers) {
  let raw = ''
  let error = ''
  let skillUsed = null
  try {
    const out = await askModel(q, opts, answers.get(q.n))
    raw = out.text
    skillUsed = out.skillUsed
  } catch (e) {
    error = e.message?.slice(0, 200) ?? String(e)
  }
  const res = extractResponse(raw)
  const g = gradeOne(answers.get(q.n), res)
  if (error) {
    g.note = `호출 실패: ${error}`
    g.manual = true
    g.choice = g.reason = false
    g.score = 0
  }
  g.skillUsed = skillUsed
  g.rawText = raw
  g.error = error
  g.responseSummary = (res.choice + ' / ' + res.reason).slice(0, 120)
  process.stdout.write(
    `  run${r + 1} Q${q.n}: ${g.score ?? 0}/2${g.manual ? ' (수동확인)' : ''}\n`,
  )
  return g
}

function buildReport(questions, runs, opts) {
  const max = questions.length * 2
  const totals = runs.map(rows => rows.reduce((s, g) => s + (g.score ?? 0), 0))
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length

  // 3분류: 3회 다 맞음 = 안다 / 다 틀림 = 모른다 / 1~2회 = 우연에 가깝다
  const stable = [], unstable = [], stableWrong = [], ungraded = []
  const choiceOnly = []   // 선택 O · 근거 X — 우연히 맞힌 것이라 재현되지 않는다
  const manual = new Set()
  for (const q of questions) {
    const per = runs.map(rows => rows.find(g => g.n === q.n))
    const full = per.filter(g => g.score === 2).length
    // ★ 채점 불가를 오답으로 접지 않는다 (CLAUDE.md §7.1, eval-set §6-3).
    // 한 번도 만점이 아니면서 **모든 회차가 수동확인** 이면 그건 "틀렸다"가
    // 아니라 "채점기가 못 읽었다"다. 둘을 섞으면 안정 오답이 부풀고, 그 숫자를
    // 보고 스킬을 고치게 된다 — 실제로는 하니스가 문제인데.
    const allManual = per.every(g => g && g.manual)
    if (full === runs.length) stable.push(q.n)
    else if (full === 0 && allManual) ungraded.push(q.n)
    else if (full === 0) stableWrong.push(q.n)
    else unstable.push(q.n)
    if (per.some(g => g.choice && !g.reason)) choiceOnly.push(q.n)
    if (per.some(g => g.manual)) manual.add(q.n)
  }

  // 스킬이 실제로 로드된 횟수. 0 이면 이 점수는 스킬 점수가 아니다.
  const skillCalls = runs.flat().filter(g => g.skillUsed === true).length
  const skillTotal = runs.flat().filter(g => g.skillUsed !== null).length

  const grade = s =>
    s >= max * 0.9 ? 'A' : s >= max * 0.7 ? 'B' : s >= max * 0.5 ? 'C' : 'D'

  const groupRows = RULE_GROUPS.map(([label, qs]) => {
    const inScope = qs.filter(n => questions.some(q => q.n === n))
    // 여기서도 채점 불가는 오답에서 뺀다. 대신 따로 센다 — 빼기만 하고 안 세면
    // "오답 0건"이 "다 맞혔다"로 읽혀서 경고가 조용히 사라진다.
    const ungradedIn = inScope.filter(n => ungraded.includes(n))
    const wrong = inScope.filter(n => {
      if (ungraded.includes(n)) return false
      const per = runs.map(rows => rows.find(g => g.n === n))
      return per.some(g => g && g.score !== 2)
    })
    return { label, inScope, wrong, ungradedIn }
  })
  const c01 = groupRows[0]

  const summary =
    `총점 ${totals.join(' / ')} (평균 ${avg.toFixed(1)} / ${max}, 등급 ${grade(avg)})\n` +
    `안정 정답 ${stable.length} · 불안정 ${unstable.length} · 안정 오답 ${stableWrong.length} · 채점불가 ${ungraded.length}\n` +
    `선택O·근거X ${choiceOnly.length}건 · 수동확인 ${manual.size}건\n` +
    `스킬 로드 확인 ${skillCalls}/${skillTotal}` +
    (skillTotal && skillCalls < skillTotal ? '  ⚠️ 일부 응답이 스킬 없이 나왔다' : '') +
    '\n' +
    `C-01 오답 ${c01.wrong.length}건` +
    (c01.ungradedIn.length ? ` (+ 채점불가 ${c01.ungradedIn.length}건 — 사람이 봐야 확정된다)` : '') +
    (c01.wrong.length >= 2 ? '  ⚠️ 최상위 경고 — 두 방법론이 일치한 유일 영역이다' : '')

  const md = [
    `# content-gate 평가 결과 — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `- 커밋: \`${commitHash()}\`  실행: ${runs.length}회  문항: ${questions.length}개  만점: ${max}점`,
    `- 총점: ${totals.join(' / ')}  평균 **${avg.toFixed(1)}** (${((avg / max) * 100).toFixed(1)}%)  등급 ${grade(avg)}`,
    `- 선택 O · 근거 X: **${choiceOnly.length}건**` +
      (choiceOnly.length ? ` (Q${choiceOnly.join(', Q')}) — 우연히 맞힌 것이라 점수를 그대로 믿으면 안 된다` : ''),
    `- 수동확인 필요: **${manual.size}건**` + (manual.size ? ` (Q${[...manual].join(', Q')})` : ''),
    `- content-gate 스킬 로드 확인: **${skillCalls}/${skillTotal}**` +
      (skillTotal && skillCalls < skillTotal
        ? ' — ⚠️ 스킬 없이 나온 응답이 섞였다. 그만큼은 스킬 점수가 아니라 모델 기본 점수다'
        : ''),
    opts.mock ? '\n> ⚠️ **mock 실행이다. 모델을 부르지 않았다. 점수를 성능으로 읽지 마라.**' : '',
    '',
    '## 3분류',
    '',
    `- 안정 정답(3회 다 맞음): ${stable.length}건 — ${stable.length ? 'Q' + stable.join(', Q') : '없음'}`,
    `- 불안정(1~2회): ${unstable.length}건 — ${unstable.length ? 'Q' + unstable.join(', Q') : '없음'}`,
    `- 안정 오답(3회 다 틀림): ${stableWrong.length}건 — ${stableWrong.length ? 'Q' + stableWrong.join(', Q') : '없음'}`,
    `- **채점 불가**(3회 다 수동확인, 만점 없음): ${ungraded.length}건 — ${ungraded.length ? 'Q' + ungraded.join(', Q') : '없음'}`,
    '',
    '> ⚠️ 채점 불가는 **오답이 아니다.** 하니스가 정답과 대조하지 못한 것이라',
    '> 위 3분류와 아래 규칙별 오답 집계에서 뺐다. 사람이 직접 읽고 판정해야',
    '> 이 문항들의 정오가 확정된다. 오답으로 접으면 스킬 탓이 아닌 것을',
    '> 스킬 탓으로 돌리게 된다 (CLAUDE.md §7.1).',
    '',
    '## 문항별',
    '',
    '| Q | 선택 | 근거 | 점수(회차별) | 응답 요약 |',
    '|---|---|---|---|---|',
    ...questions.map(q => {
      const per = runs.map(rows => rows.find(g => g.n === q.n))
      const mark = b => (b ? 'O' : 'X')
      return `| Q${q.n} | ${per.map(g => mark(g.choice)).join('')} | ${per
        .map(g => mark(g.reason))
        .join('')} | ${per.map(g => g.score ?? 0).join('/')} | ${(per[0].note || per[0].responseSummary || '').replace(/\|/g, '/')} |`
    }),
    '',
    '## 규칙별 약점',
    '',
    '| 규칙군 | 해당 문항 | 오답 | 채점불가 |',
    '|---|---|---|---|',
    ...groupRows.map(
      g =>
        `| ${g.label} | ${g.inScope.map(n => 'Q' + n).join(',') || '—'} | ` +
        `${g.wrong.length}/${g.inScope.length} | ${g.ungradedIn.length} |`,
    ),
    '',
    '## 판정',
    '',
    c01.wrong.length >= 2
      ? `- ⚠️ **최상위 경고: C-01 에서 ${c01.wrong.length}개 틀렸다.** 두 방법론이 완전히 일치한 유일한 영역이라 여기서 틀리면 나머지 점수가 무의미하다.`
      : `- C-01 오답 ${c01.wrong.length}건.`,
    c01.ungradedIn.length
      ? `- C-01 에 채점 불가가 ${c01.ungradedIn.length}건 있다 (Q${c01.ungradedIn.join(', Q')}). ` +
        '사람이 읽기 전까지 위 경고는 **하한**이다 — 실제로는 더 나쁠 수 있다.'
      : '',
    '- 회귀 판정: 이전 베이스라인 대비 **비율(%)** 로 비교한다. 문항이 늘면 만점이 바뀐다.',
    '',
  ].join('\n')

  return { summary, markdown: md }
}

main().catch(e => {
  console.error(e)
  process.exitCode = 1
})
