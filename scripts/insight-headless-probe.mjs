#!/usr/bin/env node
// 헤드리스 실행 환경 판정 — GitHub Actions 러너에서 `claude -p` 가 실제로
// 추론까지 하는지 확인한다.
//
// 이게 이 파이프라인의 **유일한 미검증 전제**다. Vercel 스파이크에서
// 바이너리 확보(214MB, 2.37초)와 `claude --version`(exit 0, 14ms)까지는
// 실측했지만, OAuth 토큰이 없어 실제 추론은 못 돌려봤다.
//
// 단계별로 판정한다. "안 됨" 한 줄로는 다음 수를 정할 수 없어서다.
//   env      — 토큰이 주입됐는가
//   binary   — 바이너리를 확보했는가 (설치 경로/크기)
//   version  — 실행은 되는가
//   headless — 실제 추론이 되는가  ← 진짜 물어보는 것
//
// 종료 코드는 항상 0 이다. 이 스크립트는 판정을 보고하는 게 목적이고,
// "안 된다"도 유효한 판정이다. 워크플로가 실패로 붉어지면 판정이 아니라
// 사고처럼 보인다.

import fs from 'node:fs/promises'
import { resolveClaudeBinary, runClaude } from '../lib/insight/claude-cli.ts'

const out = []
const say = (s) => {
  out.push(s)
  console.log(s)
}

const steps = []
const record = (name, ok, detail) => {
  steps.push({ name, ok, detail })
  say(`- ${ok ? '✅' : '❌'} \`${name}\` — ${detail}`)
}

say('## 헤드리스 실행 판정 (GitHub Actions)')
say('')
say(`러너: ${process.platform}/${process.arch} · Node ${process.version}`)
say('')

// ── 1) env ────────────────────────────────────────────────────────
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? ''
const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
record(
  'env',
  Boolean(token || apiKey),
  token
    ? `CLAUDE_CODE_OAUTH_TOKEN 주입됨 (${token.length}자)`
    : apiKey
      ? 'CLAUDE_CODE_OAUTH_TOKEN 없음 · ANTHROPIC_API_KEY 만 있음'
      : '토큰 없음 — 리포 시크릿에 CLAUDE_CODE_OAUTH_TOKEN 을 넣어야 한다',
)

// ── 2) binary ─────────────────────────────────────────────────────
let bin = null
try {
  const r = await resolveClaudeBinary()
  bin = r.path
  record(
    'binary',
    true,
    `${r.source} · ${(r.sizeBytes / 1024 / 1024).toFixed(1)}MB · 확보 ${r.downloadMs}ms · ${r.path}`,
  )
} catch (e) {
  record('binary', false, e.message)
}

// ── 3) version ────────────────────────────────────────────────────
if (bin) {
  const v = await runClaude(bin, ['--version'], { timeoutMs: 60_000 })
  record(
    'version',
    v.exitCode === 0,
    v.exitCode === 0 ? `${v.stdout.trim()} · ${v.ms}ms` : `exit ${v.exitCode} · ${v.stderr.slice(0, 200)}`,
  )
}

// ── 4) headless — 진짜 물어보는 것 ────────────────────────────────
let verdict = 'inconclusive'

if (!bin) {
  verdict = 'blocked'
  record('headless', false, '바이너리 미확보로 시도 안 함')
} else if (!token && !apiKey) {
  record('headless', false, '토큰 없음 — 시도 안 함(판정 보류)')
} else {
  // 답을 눈으로 검증할 수 있는 프롬프트를 쓴다. 모델이 무슨 말이든 뱉으면
  // "돌았다"고 착각하기 쉬워서, 정답이 하나뿐인 걸 묻는다.
  const r = await runClaude(
    bin,
    ['-p', 'Reply with exactly one word, nothing else: the result of 6 times 7.'],
    { timeoutMs: 180_000 },
  )
  const text = r.stdout.trim()
  const correct = /\b42\b/.test(text)

  if (r.exitCode === 0 && correct) {
    verdict = 'viable'
    record('headless', true, `추론 정상 · ${r.ms}ms · 응답 "${text.slice(0, 60)}"`)
  } else if (r.exitCode === 0) {
    verdict = 'inconclusive'
    record('headless', false, `exit 0 인데 응답이 예상 밖이다: "${text.slice(0, 200)}"`)
  } else {
    verdict = 'blocked'
    record(
      'headless',
      false,
      `exit ${r.exitCode}${r.timedOut ? ' (timeout)' : ''} · stderr: ${r.stderr.slice(0, 300)}`,
    )
  }
}

say('')
say(`### 판정: **${verdict}**`)
say('')
if (verdict === 'viable') {
  say('Claude Pro 구독 헤드리스 실행이 Actions 에서 실제로 동작한다. API 과금 경로가 필요 없다.')
} else if (verdict === 'blocked') {
  say('헤드리스 실행이 막혔다. `INSIGHT_LLM_PROVIDER=anthropic` 으로 전환하면')
  say('나머지 파이프라인은 그대로 돈다 — 대신 API 과금이 발생한다.')
} else {
  say('아직 판정할 수 없다. 위 단계 중 실패한 곳을 먼저 해결해야 한다.')
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n')
}
