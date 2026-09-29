#!/usr/bin/env node
// 이식성 판정자 셀프테스트 — LLM·네트워크·DB 없이 파싱·판정 합성만 고정한다.
// 핵심 불변식: **확인 불가는 절대 pass 가 아니다**, 그리고 on 모드에서 fail·확인 불가는 적재되지 않는다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_GATE_MODE,
  applyTransfer,
  gateMode,
  parseTransferVerdict,
  transferFromRun,
  transferPrompt,
} from '../lib/discovery/transfer.ts'
import { judgeEnv, judgeTransfer, proposalPrompt } from './discovery-run.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (got === want) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const LESSON = '처음부터 유료로 받고 가입자가 늘 때마다 가격을 조금씩 올려 무료 사용자를 거른다'
const J = (o) => JSON.stringify(o)

// ── 파싱 ──
const p = parseTransferVerdict(J({ verdict: 'pass', founding_scale: 'solo', lesson: LESSON, reason: '1인 운영' }))
t('pass + 구체적 교훈 → pass', p.state, 'pass')
t('교훈이 그대로 남는다', p.lesson, LESSON)
t('founding_scale 을 읽는다', p.foundingScale, 'solo')
t('펜스·앞뒤 설명을 견딘다', parseTransferVerdict('판정:\n```json\n' + J({ verdict: 'pass', lesson: LESSON }) + '\n```').state, 'pass')
t('fail → fail', parseTransferVerdict(J({ verdict: 'fail', founding_scale: 'venture_scale', reason: '인프라 R&D' })).state, 'fail')
t('fail 사유가 비어도 fail 이다(사유 미기재 표시)', parseTransferVerdict(J({ verdict: 'fail' })).reason, '(사유 미기재)')

// 확인 불가 — 하나도 pass 로 새면 안 된다.
const unv = {
  '빈 문자열': '',
  'null': null,
  'JSON 아님': '잘 모르겠습니다',
  '깨진 JSON': '{"verdict":"pass",',
  '배열': '[1,2]',
  'unknown': J({ verdict: 'unknown', reason: '모르는 제품' }),
  '이상한 verdict': J({ verdict: 'yes', lesson: LESSON }),
  'verdict 없음': J({ lesson: LESSON }),
  'pass 인데 교훈 없음': J({ verdict: 'pass', reason: 'x' }),
  'pass 인데 교훈이 공백': J({ verdict: 'pass', lesson: '   ' }),
  'pass 인데 교훈이 짧다': J({ verdict: 'pass', lesson: '가격을 올려라' }),
  'pass 인데 교훈이 뻔하다': J({ verdict: 'pass', lesson: '고객의 목소리를 들어라.' }),
  'pass 인데 교훈이 뻔하다(띄어쓰기 변형)': J({ verdict: 'pass', lesson: '고객  피드백을 반영하라!' }),
}
for (const [k, v] of Object.entries(unv)) t(`확인 불가: ${k}`, parseTransferVerdict(v).state, 'unverified')
t('모르는 scale 은 unknown', parseTransferVerdict(J({ verdict: 'fail', founding_scale: 'huge' })).foundingScale, 'unknown')

// ── 실행 결과(봉투) ──
t('exit≠0 → 확인 불가', transferFromRun({ exitCode: 1, stdout: J({ result: J({ verdict: 'pass', lesson: LESSON }) }), stderr: '' }).state, 'unverified')
t('타임아웃(exit null) → 확인 불가', transferFromRun({ exitCode: null, timedOut: true, stdout: '', stderr: '' }).state, 'unverified')
t('is_error 봉투 → 확인 불가', transferFromRun({ exitCode: 0, stdout: J({ is_error: true, result: J({ verdict: 'pass', lesson: LESSON }) }) }).state, 'unverified')
t('정상 봉투 → result 를 파싱', transferFromRun({ exitCode: 0, stdout: J({ is_error: false, result: J({ verdict: 'pass', lesson: LESSON }) }) }).state, 'pass')
t('봉투가 아니면 원문 파싱', transferFromRun({ exitCode: 0, stdout: J({ verdict: 'fail', reason: 'r' }) }).state, 'fail')
t('빈 stdout → 확인 불가', transferFromRun({ exitCode: 0, stdout: '' }).state, 'unverified')

// ── 판정 합성 ──
const acc = { verdict: 'accepted', reason: 'voc_ok: 3000 hits' }
const P = { state: 'pass', foundingScale: 'solo', lesson: LESSON, reason: 'r' }
const F = { state: 'fail', foundingScale: 'venture_scale', lesson: null, reason: '인프라' }
const U = { state: 'unverified', foundingScale: 'unknown', lesson: null, reason: 'judge_call_failed: exit 1' }
t('on: pass → accepted 유지', applyTransfer(acc, P, 'on').verdict, 'accepted')
t('on: fail → rejected', applyTransfer(acc, F, 'on').verdict, 'rejected')
ok('on: fail 사유는 not_transferable:', applyTransfer(acc, F, 'on').reason.startsWith('not_transferable: '))
t('on: 확인 불가 → unverified (pass 아님)', applyTransfer(acc, U, 'on').verdict, 'unverified')
ok('on: 확인 불가 사유는 transfer_unverified:', applyTransfer(acc, U, 'on').reason.startsWith('transfer_unverified: '))
t('shadow: fail 이어도 VOC 판정 그대로', applyTransfer(acc, F, 'shadow').verdict, 'accepted')
t('shadow: 확인 불가여도 VOC 판정 그대로', applyTransfer(acc, U, 'shadow').verdict, 'accepted')
const rej = { verdict: 'rejected', reason: 'insufficient_voc' }
t('VOC 기각은 pass 로 되살아나지 않는다', applyTransfer(rej, P, 'on').verdict, 'rejected')

// ── 모드 ──
t('빈 값 → 기본 모드', gateMode(''), DEFAULT_GATE_MODE)
t('undefined → 기본 모드', gateMode(undefined), DEFAULT_GATE_MODE)
t('on', gateMode(' ON '), 'on')
t('shadow', gateMode('shadow'), 'shadow')
let threw = false
try { gateMode('off') } catch { threw = true }
ok('모르는 값은 던진다(오타로 게이트가 조용히 바뀌지 않게)', threw)
ok('기본 모드는 on|shadow 중 하나', ['on', 'shadow'].includes(DEFAULT_GATE_MODE))

// ── 프롬프트 ──
const tp = transferPrompt({ name: 'Acme', categoryHint: 'crm', homepageUrl: 'https://acme.test' })
ok('판정 프롬프트에 이름이 들어간다', tp.includes('제품: Acme'))
ok('판정 프롬프트는 규모가 기준이 아니라고 말한다', tp.includes('회사 규모는 판정 기준이 아니다'))
ok('판정 프롬프트는 모르면 unknown 이라고 말한다', tp.includes('"unknown"'))

const known = { names: new Set(), acceptedByCategory: new Map(), killed: [{ kind: 'saas', name: 'Retool', note: '엔터프라이즈 영업 의존' }, { kind: 'physical', name: '다이슨', note: null }] }
const sp = proposalPrompt('saas', 2, known)
ok('제안 프롬프트에 옛 "상한(500)" 문장이 없다', !sp.includes('상한(500)') && !sp.includes('자동 기각된다'))
ok('제안 프롬프트는 이식성 규칙을 말한다', sp.includes('옮겨 쓸 교훈'))
ok('사람이 죽인 SaaS 이름·사유가 반례로 들어간다', sp.includes('Retool(엔터프라이즈 영업 의존)'))
ok('다른 축의 무효화 이름은 안 섞인다', !sp.includes('다이슨'))
ok('무효화 목록이 없으면 반례 줄도 없다', !proposalPrompt('saas', 2, { names: new Set(), acceptedByCategory: new Map() }).includes('무효화한 후보'))

// ── 판정자 env: DB 키가 새지 않는다 ──
const envCi = judgeEnv({ CLAUDE_CODE_OAUTH_TOKEN: 'tok', SUPABASE_SERVICE_ROLE_KEY: 'x' })
t('CI env 는 토큰 하나뿐', J(Object.keys(envCi)), J(['CLAUDE_CODE_OAUTH_TOKEN']))
const envLocal = judgeEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' })
ok('로컬 env 에도 서비스 키가 없다', !('SUPABASE_SERVICE_ROLE_KEY' in envLocal))

// ── judgeTransfer 경계면: 가짜 runClaude 로 호출 실패가 확인 불가가 되는지 ──
const fakeRun = (r) => async (_bin, args, opts) => { fakeRun.last = { args, opts }; return r }
const r1 = await judgeTransfer({ name: 'Acme' }, { bin: 'x', run: fakeRun({ exitCode: 1, stdout: '', stderr: 'boom', timedOut: false }) })
t('호출 실패 → 확인 불가', r1.state, 'unverified')
const r2 = await judgeTransfer({ name: 'Acme', why: '소규모 인디 팀' }, { bin: 'x', run: fakeRun({ exitCode: 0, stdout: J({ result: J({ verdict: 'pass', lesson: LESSON }) }), stderr: '' }) })
t('정상 호출 → pass', r2.state, 'pass')
ok('판정자는 제안 LLM 의 why 를 받지 않는다', !fakeRun.last.opts.input.includes('소규모 인디 팀'))
ok('프롬프트는 stdin 으로 간다(인자 아님)', !fakeRun.last.args.some((a) => a.includes('Acme')))
ok("judgeTransfer 가 --tools '' 로 도구를 끈다(2026-09-29, PR #348)", (() => {
  const i = fakeRun.last.args.indexOf('--tools')
  return i >= 0 && fakeRun.last.args[i + 1] === ''
})())

// ── 도구 호출 실패(tool_use / error_max_turns)는 한도도 pass 도 아니다 — 항상 unverified ──
// 2026-09-29 run 36511286722(lib/analysis/llm.ts)와 같은 결의 실패다. transferFromRun 은
// 문구·subtype 을 따로 안 보고 exit≠0/is_error 만 본다 — 그래서 이 케이스도 그냥 unverified 로 접힌다.
const toolUseEnvelope = J({ is_error: true, subtype: 'error_max_turns', stop_reason: 'tool_use', num_turns: 2 })
const r3 = await judgeTransfer({ name: 'Acme' }, { bin: 'x', run: fakeRun({ exitCode: 1, stdout: toolUseEnvelope, stderr: '' }) })
t('도구 호출 실패(exit≠0) → 확인 불가 (한도로 새지 않는다)', r3.state, 'unverified')
const r4 = await judgeTransfer({ name: 'Acme' }, { bin: 'x', run: fakeRun({ exitCode: 0, stdout: toolUseEnvelope, stderr: '' }) })
t('도구 호출 실패(is_error 봉투) → 확인 불가', r4.state, 'unverified')

// ── Notion 다이제스트: 후보마다 판정·hits·이식성 ──
const { discoveryBlocks } = await import('./notion-push-digest.mjs')
const drow = (o) => ({ kind: 'saas', name: 'X', category_hint: 'c', why: null, probe_hits: 3000, probe_ref: 'q:X', verdict: 'accepted', verdict_reason: 'voc_ok', ...o })
const text = (blocks) => J(blocks)
const dPass = text(discoveryBlocks([drow({ name: 'Buffer', transfer_verdict: 'pass', transfer_lesson: LESSON })]))
ok('채택 줄에 판정·hits 가 있다', dPass.includes('accepted · hits 3000'))
ok('pass 면 교훈을 보여준다', dPass.includes(`이식성 pass: ${LESSON}`))
const dFail = text(discoveryBlocks([drow({ name: 'Stripe', transfer_verdict: 'fail', transfer_reason: '결제 인프라' })]))
ok('shadow 로 채택된 fail 은 ⚠️ 와 사유', dFail.includes('⚠️ 이식성 fail: 결제 인프라'))
ok('판정 안 한 행(NULL)은 이식성 줄이 없다', !text(discoveryBlocks([drow({})])).includes('이식성'))
const dRej = text(discoveryBlocks([drow({ name: 'Figma', verdict: 'rejected', transfer_verdict: 'fail' }), drow({ name: 'Y', verdict: 'unverified', transfer_verdict: 'unverified', transfer_reason: 'judge_call_failed' })]))
ok('on 모드 기각은 (이식성 미달) 표시', dRej.includes('Figma(이식성 미달)'))
ok('확인 불가는 사유를 보여준다', dRej.includes('⚠️ 이식성 unverified: judge_call_failed'))

// ── 배선(변이 테스트): 게이트가 VOC 통과분에만, 적재 전에 걸린다 ──
const here = path.dirname(fileURLToPath(import.meta.url))
const src = await fs.readFile(path.join(here, 'discovery-run.mjs'), 'utf8')
ok('SaaS·VOC 통과분에만 판정자를 부른다', /kind === 'saas' && vocJudgement\.verdict === 'accepted'/.test(src))
ok('최종 판정은 applyTransfer 로 합성한다', /applyTransfer\(vocJudgement, transfer, GATE_MODE\)/.test(src))
ok('적재 행에 transfer_verdict 를 싣는다', /transfer_verdict: row\.transfer\?\.state \?\? null/.test(src))
ok('적재는 판정 뒤다(persist 가 main 루프 뒤에서 돈다)', src.indexOf('applyTransfer(vocJudgement') < src.indexOf('await persist(known.supabase'))

// ── 두 claude -p 호출(제안·판정) 모두 도구를 끈다 — 둘 다 프롬프트가 "도구 쓰지 마라"고 말리는데
//    실제로 막힌 적은 없었다(2026-09-17 --allowedTools 실측 실패). PR #348 이 확인한 --tools '' 로 막는다.
ok(
  "propose() 의 claude -p 가 --tools '' 로 도구를 끈다",
  /const args = \['-p', '--output-format', 'json', '--max-turns', '4', '--tools', ''\]/.test(src),
)
ok(
  "judgeTransfer() 의 claude -p 가 --tools '' 로 도구를 끈다",
  /run\(bin, \['-p', '--output-format', 'json', '--max-turns', '4', '--tools', ''\]/.test(src),
)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('이식성 판정 정상 — 확인 불가는 pass 로 새지 않고, on 모드의 fail·확인 불가는 적재되지 않는다.')
