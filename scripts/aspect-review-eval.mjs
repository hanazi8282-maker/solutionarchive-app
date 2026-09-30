#!/usr/bin/env node
// 소구점(속성) 검수 자동화 평가 하네스 — 사람이 확정한 속성(analysis_aspects.human_confirmed=true)의 evidence_quotes 만 보고
// 1차(claude-cli Sonnet 5.5)·2차(Gemini)가 독립적으로 다섯 값(중요도·만족도·레이어·귀인·인지시점=pain_timing)을 다시 매기고,
// 둘이 완전 동의한 값이 사람 확정값과 얼마나 맞는지 잰다. **읽기 전용 — DB 에 쓰지 않고 아무것도 승인하지 않는다.**
// 틀은 scripts/t2-approval-eval.mjs 를 그대로 옮겼다. 순수 부품은 lib/analysis/aspect-review-eval.ts.
//
// 실행(오케스트레이터가 로컬에서):
//   드라이런(기본, LLM 호출 0 — DB 에서 대상만 세고 예상 호출 수를 찍는다):
//     node --env-file=.env.local scripts/aspect-review-eval.mjs
//   실행:
//     node --env-file=.env.local scripts/aspect-review-eval.mjs --run [--local-claude] [--limit N] [--resume] [--out ops/state/aspect-review-eval]
// 필요 env: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY(읽기만) ·
//   1차 CLAUDE_CODE_OAUTH_TOKEN(운영 callClaudeCli 경로) 또는 --local-claude + CLAUDE_CLI_PATH(로컬 로그인, t2 와 같은 우회) ·
//   2차 GEMINI_API_KEY(없으면 2차를 건너뛰고 전부 unjudged → 종료 3). 모델: 1차 CLAUDE_CLI_DEFAULT_MODEL, 2차 geminiModelChain().
// 예상 호출 수: 대상 속성 N × 2(1차 1회 + 2차 1회, 속성당 1호출). 09-30 기준 확정 45건 중 인용 있는 약 10건 → 약 20회.
//   1차 JSON 파싱 실패 시 callLlmJsonWithModel 이 1회 재요청한다(최대 +N). --resume 이면 캐시에 있는 건은 다시 부르지 않는다.
// --limit N: 대상을 id 순 앞 N 건으로 자른다(드라이런 예상치도 같이 준다). 한도(429·CLI 한도)면 그 판정자만 멈추고 캐시를 남긴다.
// 출력(스크립트가 만든다): <out>/first.json · <out>/second.json(판정 원본 캐시, 건별) · <out>/eval.json(건별 채점) ·
//   reports/<KST 날짜>/aspect-review-eval.md. 둘 다 커밋 화이트리스트(ops/state/ · reports/) 안이다.
// 종료코드: 0 완료 · 2 설정/조회 실패·캐시 충돌 · 3 판정이 빠진 속성 있음(--resume 으로 이어간다)
//
// 판정 방식 — "값 재판정 후 사람값과 비교" 를 쓴다(t2 와 같다: t2 도 1·2차가 verdict 를 새로 내고 사람 판정과 대조했다).
// "사람값이 인용으로 뒷받침되나(일치/불일치)" 를 묻는 방식은 판정자에게 값을 보여 줘야 하는데, 보여 줄 수 있는 값이 사람 확정값뿐이다
// (AI 원값 llm_* 은 마이그 20260820000001 이전 행에 없다). 사람값을 보여 주면 블라인드가 깨지고 판정자가 동조한다 —
// 정밀도가 부풀어 자동승인 근거로 오독된다. 재판정은 값을 안 보여 주므로 블라인드이고, "판정 불가" 는 null 로 따로 센다.
// 점수는 aspect-verdict 경계(VERDICT_CUT)로 띠를 나눠 비교한다 — 소구점 판정이 바뀌는 차이만 불일치로 센다.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '../lib/supabase/server.ts'
import { callLlmJsonWithModel, callGeminiRotating, parseJsonObject, isQuotaFailure, describeFailure, CLAUDE_CLI_DEFAULT_MODEL } from '../lib/analysis/llm.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import {
  FIELDS, MIN_INTERPRETABLE_N, REVIEW_SYSTEM_PROMPT, buildUserPrompt, loadTargets, normalizeJudgement, runJudgements, scoreAspectEval,
} from '../lib/analysis/aspect-review-eval.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const run = args.includes('--run')
const resume = args.includes('--resume')
const localClaude = args.includes('--local-claude')
const limit = opt('limit') == null ? null : Number(opt('limit'))
const DIR = opt('out') ?? 'ops/state/aspect-review-eval'
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

if (limit !== null && !(Number.isInteger(limit) && limit > 0)) die(`--limit 은 양의 정수: ${opt('limit')}`)
if (!REVIEW_SYSTEM_PROMPT.includes(UNTRUSTED_INPUT_NOTICE)) die('프롬프트에 UNTRUSTED_INPUT_NOTICE 가 없다')
if (run && localClaude && !process.env.CLAUDE_CLI_PATH) die('--local-claude 에는 CLAUDE_CLI_PATH 가 필요하다')
if (run && !localClaude && !process.env.CLAUDE_CODE_OAUTH_TOKEN) die('1차 claude-cli 에 CLAUDE_CODE_OAUTH_TOKEN 이 없다 — 로컬 로그인이면 --local-claude')

const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

// ── 1. 대상 ──────────────────────────────────────────────
let loaded
try { loaded = await loadTargets(sb) } catch (e) { die(e.message) }
let targets = loaded.targets
if (limit) targets = targets.slice(0, limit)
console.log(`확정 속성 ${loaded.confirmed}건 · 근거 없음 제외 ${loaded.noQuotes}건 · 대상 ${targets.length}건${limit ? ` (--limit ${limit}, 전체 ${loaded.targets.length})` : ''}`)
console.log(`AI 원값(llm_*) 컬럼: ${loaded.llmColumns === 'present' ? `있음 — 원값 있는 대상 ${targets.filter((t) => t.llm && FIELDS.some((f) => t.llm[f] != null)).length}건` : '없음(마이그 20260820000001 미적용) — 고친 것/안 고친 것 분해 불가'}`)

// ── 2. 캐시 ──────────────────────────────────────────────
const cacheFile = (k) => path.join(DIR, `${k}.json`)
const exists = ['first', 'second'].filter((k) => fs.existsSync(cacheFile(k)))
if (run && exists.length && !resume) die(`${DIR} 에 이전 판정 캐시(${exists.join(', ')})가 있다 — 이어가려면 --resume, 새로 하려면 다른 --out`)
const loadCache = (k) => (resume && fs.existsSync(cacheFile(k)) ? new Map(Object.entries(rd(cacheFile(k)))) : new Map())
const caches = { first: loadCache('first'), second: loadCache('second') }
const todo = { first: targets.filter((t) => !caches.first.has(t.id)).length, second: targets.filter((t) => !caches.second.has(t.id)).length }
console.log(`예상 호출: 1차 ${todo.first} + 2차 ${process.env.GEMINI_API_KEY ? todo.second : `0(GEMINI_API_KEY 없음 — ${todo.second}건 건너뜀)`} (속성 ${targets.length} × 2${resume ? ', 캐시 제외' : ''}; 1차 JSON 재요청 시 최대 +${todo.first})`)
if (!run) { console.log('드라이런 — LLM 호출 0. 실제 실행은 --run'); process.exit(0) }

// ── 3. 판정자 ─────────────────────────────────────────────
const localCall = async (system, user) => {
  // 운영 callClaudeCli 는 자식 env 를 격리해 로컬 로그인을 못 본다(t2 와 같은 우회) — 프롬프트·모델은 같게, 인증만 로컬.
  const r = spawnSync(process.env.CLAUDE_CLI_PATH, ['-p', '--output-format', 'json', '--max-turns', '1', '--model', CLAUDE_CLI_DEFAULT_MODEL],
    { input: `${system}\n\n---\n\n${user}`, encoding: 'utf8', timeout: 600_000, maxBuffer: 20_000_000 })
  const env = JSON.parse(r.stdout || '{}')
  if (r.status !== 0 || env.is_error) throw new Error(`claude 로컬 실패 exit=${r.status} ${String(env.result ?? r.stderr).slice(0, 200)}`)
  return { text: env.result, model: `claude-cli-local:${Object.keys(env.modelUsage ?? {}).join('+') || CLAUDE_CLI_DEFAULT_MODEL}` }
}
const firstJudge = async (t) => {
  try {
    const { data, model } = await callLlmJsonWithModel('claude-cli', REVIEW_SYSTEM_PROMPT, buildUserPrompt(t), 'aspect-eval-first',
      localClaude ? async (_p, s, u) => localCall(s, u) : undefined)
    const j = normalizeJudgement(data)
    return j ? { ok: true, judgement: j, model, raw: JSON.stringify(data) } : { ok: false, stop: false, reason: 'JSON 객체 아님' }
  } catch (e) {
    const quota = isQuotaFailure(e) || /usage limit|limit reached|rate[ _-]?limit|\b429\b/i.test(String(e?.message))
    return { ok: false, stop: quota, reason: describeFailure(e) }
  }
}
const exhausted = new Set()
const secondJudge = async (t) => {
  // 503 순환·4바퀴 백오프·429 모델 소진은 야간 2차·t2 하네스와 같은 헬퍼다.
  const res = await callGeminiRotating(REVIEW_SYSTEM_PROMPT, buildUserPrompt(t), 'aspect-eval-second', { exhausted })
  if (!res.ok) return { ok: false, stop: res.stop, reason: `${res.reason} · ${res.failures.slice(-2).join(' | ')}` }
  let obj
  try { obj = parseJsonObject(res.text) } catch { return { ok: false, stop: false, reason: `JSON 파싱 실패 model=${res.model}` } }
  const j = normalizeJudgement(obj)
  return j ? { ok: true, judgement: j, model: res.model, raw: res.text } : { ok: false, stop: false, reason: 'JSON 객체 아님' }
}
if (!process.env.GEMINI_API_KEY) console.warn('⚠️ GEMINI_API_KEY 없음 — 2차를 건너뛴다. 2차가 없는 속성은 unjudged 로 남는다(평가 불완전).')
else delete process.env.GEMINI_MODEL // Actions 기본 체인으로(로컬 덮어쓰기 제거, t2 와 같다)

// ── 4. 판정 ──────────────────────────────────────────────
fs.mkdirSync(DIR, { recursive: true })
const save = (k) => fs.writeFileSync(cacheFile(k), JSON.stringify(Object.fromEntries(caches[k]), null, 1))
const loop = await runJudgements(targets, caches, { first: firstJudge, second: process.env.GEMINI_API_KEY ? secondJudge : undefined }, save)
for (const f of loop.failures) console.error(`  실패(캐시 안 함): ${f}`)
if (loop.stopped.first) console.error(`1차 한도로 멈춤: ${loop.stopped.first}`)
if (loop.stopped.second) console.error(`2차 한도로 멈춤: ${loop.stopped.second}`)
console.log(`호출 1차 ${loop.calls.first} · 2차 ${loop.calls.second}`)

// ── 5. 채점 ──────────────────────────────────────────────
const j = (m, id) => m.get(id)?.judgement ?? null
const result = scoreAspectEval(targets.map((t) => ({ target: t, first: j(caches.first, t.id), second: j(caches.second, t.id) })))
const byId = new Map(targets.map((t) => [t.id, t]))
fs.writeFileSync(path.join(DIR, 'eval.json'), JSON.stringify({
  generated_at: new Date().toISOString(), first_model: CLAUDE_CLI_DEFAULT_MODEL, llm_columns: loaded.llmColumns,
  confirmed: loaded.confirmed, no_quotes_excluded: loaded.noQuotes, limit, calls: loop.calls, stopped: loop.stopped, ...result,
}, null, 1))

const pct = (x) => (x == null ? '해당 없음' : `${Math.round(x * 1000) / 10}%`)
const ci = (c) => (c ? `[${pct(c[0])}, ${pct(c[1])}]` : '')
const line = (name, m) => `| ${name} | ${m.hits}/${m.n_agree} = ${pct(m.precision)} ${ci(m.precision_ci)} | ${m.hits}/${m.known} = ${pct(m.recall)} ${ci(m.recall_ci)} | ${m.errors} | ${m.split} | ${m.undecidable} | ${m.small ? `⚠️ N<${MIN_INTERPRETABLE_N} 해석 불가` : ''} |`
const o = result.overall
const bad = result.items.filter((x) => !x.hit)
const date = kstDate()
fs.mkdirSync(path.join('reports', date), { recursive: true })
const mdPath = path.join('reports', date, 'aspect-review-eval.md')
fs.writeFileSync(mdPath, [
  `# 소구점 검수 자동화 평가 (${date})`,
  '',
  `- 확정 속성 ${loaded.confirmed}건 중 인용 있는 ${loaded.targets.length}건${limit ? `(--limit ${limit} → ${targets.length}건)` : ''} × 다섯 필드 · 판정 빠짐 ${result.unjudged}건 · 근거 없음 제외 ${loaded.noQuotes}건`,
  `- **완전 동의 정밀도 ${o.hits}/${o.n_agree} = ${pct(o.precision)} ${ci(o.precision_ci)} · 재현율 ${o.hits}/${o.known} = ${pct(o.recall)} ${ci(o.recall_ci)}** (Wilson 95%)`,
  `- ${o.small ? `⚠️ 분모가 ${MIN_INTERPRETABLE_N} 미만 — **표본이 작아 해석 불가.** 높은 정밀도가 나와도 자동승인 근거가 아니다.` : '분모 충분(그래도 필드는 한 속성 안에서 서로 독립이 아니다 — 한계 참고).'}`,
  '',
  '## 표본·방법',
  `- 대상: \`analysis_aspects.human_confirmed = true\` ${loaded.confirmed}건 → \`evidence_quotes\` 빈 것 ${loaded.noQuotes}건 제외 → ${targets.length}건.`,
  `- 1차 claude-cli \`${CLAUDE_CLI_DEFAULT_MODEL}\`${localClaude ? '(로컬 로그인)' : ''} · 2차 Gemini(geminiModelChain) — 같은 프롬프트(추출 단계 속성 정의 그대로 + UNTRUSTED_INPUT_NOTICE), 속성 이름·제품 설명·인용 원문만 준다. 사람값·상대 판정은 안 준다.`,
  `- 필드: ${FIELDS.join(' · ')}(인지시점 = pain_timing). 점수는 VERDICT_CUT 띠(중요도 ≥6 HIGH / 만족도 ≤4 LOW · ≥6 HIGH)로 비교. 사람 attribution null = NONE(칭찬).`,
  '- 완전 동의 = 1·2차 값이 둘 다 있고 같다. 정밀도 = 완전 동의 중 사람값과 같음 · 재현율 = 사람값 있는 필드 전체 중 완전 동의∧사람값과 같음.',
  `- 이번 실행 호출 1차 ${loop.calls.first} · 2차 ${loop.calls.second}${loop.stopped.first || loop.stopped.second ? ` · **한도 중단**(1차 ${loop.stopped.first ?? '—'} / 2차 ${loop.stopped.second ?? '—'}) — --resume 으로 이어간다` : ''}.`,
  '',
  '## 지표',
  '| 구분 | 정밀도 (Wilson 95%) | 재현율 (Wilson 95%) | 오류 | 1·2차 엇갈림 | 판정 불가 | 주의 |',
  '|---|---|---|---|---|---|---|',
  line('전체', o),
  ...FIELDS.map((f) => line(f, result.by_field[f])),
  '',
  loaded.llmColumns === 'absent'
    ? '**AI 원값 없음(llm_* 컬럼 부재) → "고친 것/안 고친 것" 분해 불가.** 위 지표는 현재 확정값만 gold 로 썼다.'
    : ['AI 원값(llm_*) 대비 사람 수정 여부별(풀링):', '', '| 구분 | 정밀도 | 재현율 | 오류 | 엇갈림 | 판정 불가 | 주의 |', '|---|---|---|---|---|---|---|',
        line('사람이 고친 필드', result.by_edit.edited), line('안 고친 필드', result.by_edit.unedited), line('원값 없음(마이그 이전 추출)', result.by_edit.no_original)].join('\n'),
  '',
  `## 불일치 목록 ${bad.length}건 (1·2차·사람 셋이 같지 않은 필드)`,
  ...bad.map((x) => `- \`${x.aspect_id}\` ${byId.get(x.aspect_id)?.name ?? ''} · **${x.field}** · 사람 ${x.human}(${x.human_raw ?? 'null'}) · 1차 ${x.first ?? '판정 불가'}(${x.first_raw ?? 'null'}) · 2차 ${x.second ?? '판정 불가'}(${x.second_raw ?? 'null'})${x.edit === 'edited' ? ` · AI 원값 ${x.llm_raw ?? 'null'}(사람이 고침)` : ''}\n  > ${(byId.get(x.aspect_id)?.quotes[0] ?? '').replace(/\s+/g, ' ').slice(0, 120)}`),
  '',
  '## 한계',
  `- AI 원값: ${loaded.llmColumns === 'present' ? 'llm_* 컬럼 있음. 단 마이그 20260820000001 이전 추출 행은 원값이 null 이라 "원값 없음" 으로 따로 센다. 이름(name)·메모는 원값을 보존하지 않는다 — 판정자가 보는 이름은 사람이 고친 것일 수 있다.' : '컬럼 없음 — 고친/안 고친 분해 불가.'}`,
  `- 표본 크기: 속성 ${targets.length}건. 다섯 필드는 같은 인용에서 나와 서로 독립이 아니다 — 필드 단위 Wilson 구간은 실제보다 좁다. 분모 ${MIN_INTERPRETABLE_N} 미만은 해석 불가.`,
  '- 1·2차 독립성: 서로의 출력·사람값을 보지 않지만 **같은 프롬프트·같은 인용**을 본다. 같은 인용에서 같이 틀리는 오류(공통 원인)는 완전 동의로 걸러지지 않는다.',
  '- 인용은 1~3문장뿐이다. 추출 정의의 importance 는 "전체 리뷰에서 얼마나 자주·강하게" 라 인용만으로는 원래 척도를 재현할 수 없다 — importance 판정 불가·불일치가 많으면 이 때문일 수 있다.',
  '',
  '## 남헌 결정 자리',
  '- [ ] 이 수치로 속성 검수 자동승인 설계를 시작할지(시작한다면 문턱: 분모 ≥ ? · 정밀도 Wilson 하한 ≥ ?) — 하네스는 승인 로직을 만들지 않았다.',
  '- [ ] 표본을 늘릴지: 인용 없는 확정 속성을 재추출(force)해 evidence_quotes 를 채울지.',
  '- [ ] importance 를 평가 대상에서 뺄지(인용만으로 재현 불가한 척도).',
  '',
].join('\n'))
console.log(`정밀도 ${pct(o.precision)} ${ci(o.precision_ci)} · 재현율 ${pct(o.recall)} ${ci(o.recall_ci)} · unjudged ${result.unjudged}${o.small ? ' · ⚠️ 표본 작음(해석 불가)' : ''}`)
console.log(`✅ ${path.join(DIR, 'eval.json')}\n✅ ${mdPath}`)
process.exit(result.unjudged > 0 ? 3 : 0)
