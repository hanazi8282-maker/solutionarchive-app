#!/usr/bin/env node
// 칼럼 전수검수 — 미발행 초안(content_columns.review_status='draft', published_at IS NULL)을 claude-cli(크레딧 경로)로
// 문체·가독성 위주로 **고쳐 써서** 수정본을 원문 옆에 둔다. 원문(body)은 덮어쓰지 않는다. 남헌이 /columns 에서 전/후를 보고 재승인한다.
//
//   CLAUDE_CLI_PATH=<claude 실행 파일> LLM_PROVIDER=claude-cli node --env-file=.env.local scripts/column-review-claude.mjs           # 대상 선정만(드라이런)
//   CLAUDE_CLI_PATH=<...> LLM_PROVIDER=claude-cli node --env-file=.env.local scripts/column-review-claude.mjs --run [--slug x] [--limit N] [--force]
//
// 남헌 2026-09-25 결정 4. 크레딧 대장: claude/agent-sdk-credit-2026-11-05.md #6.
//   · 대상: draft + 미발행. approved/rejected/published 는 건드리지 않는다. 이미 수정본이 있으면(revision_status 있음) --force 없이는 건너뛴다.
//   · 우선순위: 문체·가독성(voice-guide) > 구조 > 사실관계·인용 소폭. 수치·출처·인용문은 **바꾸지 않는다**(있던 것을 빼는 것도 금지).
//   · 저장: content_columns.body_revised/revision_summary/revision_status='pending'/revised_by/revised_at + 파일 drafts/columns/_review/<slug>.revised.md
//     + 전/후 diff reports/<KST date>/column-review/<slug>.diff (사람이 읽는 형태).
//   · 예산: callLlmWithModel 이 budget.ts 가드를 탄다(LLM_DAILY_BUDGET_BOOST_USD 안). 429/예산이면 그 자리에서 멈추고 남은 건수를 남긴다.
//   · 검증: 수정본이 원문의 30% 미만이거나 2배 초과면 저장하지 않는다(모델이 요약·부풀림). 헤더 "독자:" 줄이 사라져도 저장하지 않는다.
// 종료코드: 0 정상 · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createClient } from '../lib/supabase/server.ts'
import { callLlmWithModel, resolveProvider, requiredKeyFor } from '../lib/analysis/llm.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const run = args.includes('--run')
const force = args.includes('--force')
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const onlySlug = opt('slug')
const limit = Number(opt('limit') ?? Infinity)
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

const provider = resolveProvider()
if (run && provider !== 'claude-cli') { console.error(`✗ LLM_PROVIDER=claude-cli 로 돌려라(지금 ${provider}). 남헌 결정: 크레딧 경로로만.`); process.exit(2) }
const key = requiredKeyFor(provider)
if (run && key && !process.env[key] && !process.env.CLAUDE_CLI_PATH) {
  // 로컬은 CLI 가 로그인 세션을 쓴다(CLAUDE_CLI_PATH). 러너는 CLAUDE_CODE_OAUTH_TOKEN.
  console.error(`✗ ${key} 도 CLAUDE_CLI_PATH 도 없다 — 어느 경로로 claude 를 부를지 정해라.`); process.exit(2)
}
const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }

const VOICE = fs.existsSync('content/guides/voice-guide.md') ? fs.readFileSync('content/guides/voice-guide.md', 'utf8').slice(0, 12000) : ''

let q = sb.from('content_columns').select('id, slug, title, body, char_count, reader_type, review_status, revision_status, published_at').eq('review_status', 'draft').is('published_at', null).order('staged_at')
if (onlySlug) q = q.eq('slug', onlySlug)
const { data: cols, error } = await q
if (error) { console.error(`✗ 조회 실패: ${error.message}`); process.exit(2) }
const targets = cols.filter((c) => force || !c.revision_status).slice(0, limit)
log(`미발행 draft ${cols.length}편 → 대상 ${targets.length}편${force ? ' (--force)' : ''} · provider=${provider} · 일 예산 $${DAILY_BUDGET_USD}`)
for (const c of targets) log(`  - ${c.slug} (${c.char_count}자${c.revision_status ? `, 기존 수정본 ${c.revision_status}` : ''})`)
if (!run) { log('--dry: 여기서 끝낸다. 실행은 --run.'); process.exit(0) }

const SYSTEM = [
  '너는 한국어 칼럼 편집자다. 아래 칼럼 초안을 **문체와 가독성 위주로 고쳐 써서 전문을 돌려준다.**',
  '지키는 것(어기면 수정본은 버려진다):',
  '1. 파일 첫머리의 "독자: …" 줄과 "판단 이유: …" 줄, 제목(# 로 시작하는 한 줄), 절 제목(## ) 구조는 유지한다. 절을 합치거나 없애지 않는다.',
  '2. 숫자·날짜·고유명사·인용문·출처 표기는 한 글자도 바꾸지 않고 빼지도 않는다. 새 사실을 추가하지 않는다.',
  '3. 문체: 구어체에 가까운 자연스러운 서술. 전신형 단문(명사 종결 반복), 기호(→ ⇒ — ·), 경구·격언투, 영어 투 직역, 내부 용어(케이스/무브/코퍼스/승인/게이트/등급/처방)를 없앤다. 한 문장은 되도록 40자 안팎.',
  '4. 독자가 자기 작업에 옮길 행동이 분명한 절이 하나는 있어야 한다. 없으면 기존 내용 안에서 그 문장을 또렷하게 세운다(새 사실 추가 금지).',
  '5. 근거 메모·자체 점검 절이 있으면 그대로 둔다(고치지 않는다).',
  '출력 형식: 먼저 "<<<SUMMARY>>>" 한 줄 뒤에 무엇을 왜 고쳤는지 3~6문장, 그 다음 "<<<BODY>>>" 한 줄 뒤에 수정본 전문. 그 밖의 말은 쓰지 않는다.',
  VOICE ? `\n[문체 지침 원문 발췌]\n${VOICE}` : '',
].join('\n')

const date = kstDate()
const diffDir = path.join('reports', date, 'column-review')
const revDir = path.join('drafts', 'columns', '_review')
fs.mkdirSync(diffDir, { recursive: true }); fs.mkdirSync(revDir, { recursive: true })

let done = 0, saved = 0, skipped = 0, failed = 0, blocker = null
for (const c of targets) {
  try {
    const t0 = Date.now()
    const out = await withLlmBudget(() => callLlmWithModel(provider, SYSTEM, `[칼럼 초안 · slug ${c.slug} · ${c.char_count}자]\n\n${c.body}`, `column-review:${c.slug}`))
    log(`  ${c.slug}: 응답 ${Math.round((Date.now() - t0) / 1000)}s`)
    done++
    const text = out.text
    const si = text.indexOf('<<<SUMMARY>>>'), bi = text.indexOf('<<<BODY>>>')
    if (si < 0 || bi < 0 || bi < si) { skipped++; log(`⚠️ ${c.slug}: 출력 형식 불일치(마커 없음) — 저장 안 함`); continue }
    const summary = text.slice(si + 13, bi).trim()
    const revised = text.slice(bi + 10).trim() + '\n'
    const ratio = revised.length / Math.max(c.body.length, 1)
    if (ratio < 0.3 || ratio > 2) { skipped++; log(`⚠️ ${c.slug}: 길이 비 ${ratio.toFixed(2)} — 요약/부풀림 의심, 저장 안 함`); continue }
    if (!/^독자:\s*(창업자|셀러)/m.test(revised)) { skipped++; log(`⚠️ ${c.slug}: "독자:" 헤더 사라짐 — 저장 안 함`); continue }

    const revPath = path.join(revDir, `${c.slug}.revised.md`)
    fs.writeFileSync(revPath, revised)
    const origPath = path.join(revDir, `${c.slug}.orig.md`)
    fs.writeFileSync(origPath, c.body.endsWith('\n') ? c.body : c.body + '\n')
    const d = spawnSync('git', ['diff', '--no-index', '--no-color', '--', origPath, revPath], { encoding: 'utf8' })
    fs.writeFileSync(path.join(diffDir, `${c.slug}.diff`), `# ${c.slug} — ${date} claude-cli 수정본 (원문 → 수정본)\n# 요약: ${summary.replace(/\n/g, ' ')}\n\n${d.stdout}`)
    fs.unlinkSync(origPath)

    const { error: upErr, data: up } = await sb.from('content_columns').update({
      body_revised: revised, revision_summary: summary, revision_status: 'pending', revised_by: out.model, revised_at: new Date().toISOString(),
    }).eq('id', c.id).eq('review_status', 'draft').select('id')
    if (upErr) { failed++; console.error(`✗ ${c.slug} 저장 실패: ${upErr.code ?? ''} ${upErr.message}`); continue }
    if (!up || up.length === 0) { skipped++; log(`⚠️ ${c.slug}: 그사이 상태가 바뀌어 저장 안 함`); continue }
    saved++
    log(`✅ ${c.slug}: ${c.char_count}자 → ${revised.length}자 (비 ${ratio.toFixed(2)}) · model ${out.model} · diff ${path.join(diffDir, c.slug + '.diff')}`)
  } catch (e) {
    const msg = e?.message ?? String(e)
    if (/예산|429|rate limit|503/i.test(msg)) { blocker = msg; break }
    failed++; console.error(`✗ ${c.slug}: ${msg.slice(0, 300)}`)
  }
}
const spent = dailySpent()
if (blocker) log(`⚠️ 멈췄다 — ${done}/${targets.length}편 처리 후. 사유: ${blocker.slice(0, 200)}. 남은 ${targets.length - done}편은 다음 실행.`)
log(`끝 — 수정본 저장 ${saved} · 형식/길이 탈락 ${skipped} · 실패 ${failed} · 추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD})`)
process.exit(failed > 0 ? 3 : 0)
