// [v71ct-2] claude -p 구독 경로 한 번 호출(공용). story-label.mjs 의 callCli 와 같은 방식 — ANTHROPIC_API_KEY 를 빼고, 임시 폴더에서, 도구 없이 1턴,
// 사용자 설정·MCP 목록을 빼서 컨텍스트를 줄인다. 쿼터·한도 오류는 StopRun 으로 올려 호출부가 전체를 멈추게 한다.
import os from 'node:os'
import { spawn } from 'node:child_process'
import { UNTRUSTED_INPUT_NOTICE } from '../llm/untrusted-input.ts'

export class StopRun extends Error {}
export const tally = { usd: 0, unknown: 0, calls: 0, in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }

export async function runCli({ system, user, model = 'claude-sonnet-5-5', effort = 'low', timeoutMs = 600_000 }) {
  // 호출부는 외부 텍스트(전문·표본)를 user 에 싣는다 — 표준 경고가 system 에 없으면 호출하지 않는다(CI untrusted-input 게이트와 같은 규칙을 런타임에서도 강제).
  if (!String(system).includes(UNTRUSTED_INPUT_NOTICE)) throw new Error('UNTRUSTED_INPUT_NOTICE 가 system 에 없다')
  const { ANTHROPIC_API_KEY: _unused, ...env } = process.env
  const args = ['-p', '--output-format', 'json', '--max-turns', '1', '--tools', '', '--model', model, '--effort', effort,
    '--disable-slash-commands', '--no-session-persistence', '--setting-sources', 'project', '--strict-mcp-config']
  const res = await new Promise((resolve) => {
    const ch = spawn('claude', args, { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    ch.stdout.setEncoding('utf8'); ch.stderr.setEncoding('utf8')
    ch.stdout.on('data', (d) => { out += d }); ch.stderr.on('data', (d) => { err += d }); ch.stdin.on('error', () => {})
    const t = setTimeout(() => ch.kill('SIGKILL'), timeoutMs)
    ch.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }) })
    ch.stdin.end(`${system}\n\n---\n\n${user}`, 'utf8')
  })
  let e = null
  try { e = JSON.parse(res.out) } catch { e = null }
  tally.calls++
  if (typeof e?.total_cost_usd === 'number') tally.usd += e.total_cost_usd; else tally.unknown++
  const u = e?.usage ?? {}
  tally.in += u.input_tokens ?? 0; tally.out += u.output_tokens ?? 0; tally.cacheRead += u.cache_read_input_tokens ?? 0; tally.cacheWrite += u.cache_creation_input_tokens ?? 0
  const msg = `${e?.result ?? ''} ${res.err}`.slice(0, 300)
  if (/usage limit|limit reached|hit your .{0,20}limit|5-hour limit|rate limit|quota|resets? (at|[0-9])/i.test(msg) && (res.code !== 0 || e?.is_error)) throw new StopRun(`quota — ${msg.slice(0, 160)}`)
  if (res.code !== 0 || e?.is_error || typeof e?.result !== 'string') throw new Error(`cli 실패 code=${res.code} ${msg.slice(0, 160)}`)
  return { text: e.result, usage: u, costUsd: e.total_cost_usd ?? null }
}
