// 스파이크 테스트 — Vercel 서버리스 안에서 `claude -p` 가 실제로 도는가?
//
// ⚠️ 임시 라우트다. 검증이 끝나면 지운다(피드백 루프 설계안 §0.5 미검증 리스크).
//    판정이 끝나면 이 파일은 삭제하고 결론만 feedback-loop-design.md 에 남긴다.
//
// 왜 단계별로 쪼개 보고하는가: "안 됨" 한 줄로는 GitHub Actions 로 갈아탈지
// 말지를 정할 수 없다. 어느 단계에서 왜 막혔는지가 그 결정을 가른다.
//   1) env      — 런타임 사실관계(노드 버전/아키텍처/메모리/리전)
//   2) token    — CLAUDE_CODE_OAUTH_TOKEN 존재 여부(값은 절대 안 찍는다)
//   3) spawn    — child_process 자체가 되는가 (되면 샌드박스 문제는 아님)
//   4) binary   — 214MB 바이너리를 /tmp 에 확보할 수 있는가
//   5) version  — 그 바이너리가 이 런타임에서 실행은 되는가 (glibc/권한)
//   6) headless — 실제 `claude -p` 가 인증까지 통과해 답을 주는가
//
// 인증: 다른 크론 라우트와 같은 CRON_SECRET 을 쓴다. 공개로 두면 아무나
//       214MB 다운로드를 유발할 수 있다.
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://<preview-url>/api/test/claude-headless

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import os from 'node:os'
import { spawn } from 'node:child_process'
import {
  resolveClaudeBinary,
  runClaude,
  CLAUDE_CLI_VERSION,
} from '@/lib/insight/claude-cli'

// Node 런타임 고정 — edge 에서는 child_process 자체가 없다.
export const runtime = 'nodejs'
// 다운로드(214MB) + 실행까지 여유. Vercel Pro 상한 안이다.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface Stage {
  name: string
  ok: boolean
  ms: number
  detail: Record<string, unknown>
}

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`

/** 순수 spawn 가능 여부만 본다 — claude 와 무관하게 런타임이 자식 프로세스를 허용하는지. */
function spawnSanity(): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(process.execPath, ['-e', 'process.stdout.write("spawn-ok")'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += d.toString()))
      child.stderr.on('data', (d) => (err += d.toString()))
      child.on('error', (e) =>
        resolve({ ok: false, detail: { error: e.message } }),
      )
      child.on('close', (code) =>
        resolve({
          ok: out.trim() === 'spawn-ok',
          detail: { exitCode: code, stdout: out.trim(), stderr: err.trim().slice(0, 500) },
        }),
      )
    } catch (e) {
      resolve({ ok: false, detail: { error: (e as Error).message } })
    }
  })
}

export async function GET(req: Request) {
  return POST(req)
}

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const stages: Stage[] = []
  const t0 = Date.now()
  const mark = (name: string, ok: boolean, started: number, detail: Record<string, unknown>) =>
    stages.push({ name, ok, ms: Date.now() - started, detail })

  // ── 1) 런타임 사실관계 ───────────────────────────────────────
  {
    const s = Date.now()
    mark('env', true, s, {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      cpus: os.cpus().length,
      region: process.env.VERCEL_REGION ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      cwd: process.cwd(),
      cliVersionPinned: CLAUDE_CLI_VERSION,
    })
  }

  // ── 2) 토큰 존재 여부 (값은 절대 노출하지 않는다) ─────────────
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN
  {
    const s = Date.now()
    mark('token', Boolean(token), s, {
      present: Boolean(token),
      length: token?.length ?? 0,
      // 토큰 형식만 확인 — 앞 4글자까지만. 값 유출 방지.
      prefix: token ? `${token.slice(0, 4)}…` : null,
      hint: token
        ? null
        : 'Vercel 환경변수에 CLAUDE_CODE_OAUTH_TOKEN 미설정 — 6단계는 반드시 실패한다',
    })
  }

  // ── 3) child_process 가능 여부 ───────────────────────────────
  {
    const s = Date.now()
    const r = await spawnSanity()
    mark('spawn', r.ok, s, r.detail)
    if (!r.ok) {
      return verdict(stages, t0, 'vercel-blocked', 'child_process 자체가 막혔다 — Claude CLI 경로는 불가. GitHub Actions 로 분리할 것.')
    }
  }

  // ── 4) 바이너리 확보 ─────────────────────────────────────────
  let binPath: string
  {
    const s = Date.now()
    try {
      const bin = await resolveClaudeBinary()
      binPath = bin.path
      mark('binary', true, s, {
        source: bin.source,
        path: bin.path,
        size: MB(bin.sizeBytes),
        sizeBytes: bin.sizeBytes,
        downloadMs: bin.downloadMs,
      })
    } catch (e) {
      mark('binary', false, s, { error: (e as Error).message })
      return verdict(stages, t0, 'vercel-blocked', '바이너리 확보 실패(/tmp 용량 또는 네트워크) — GitHub Actions 로 분리할 것.')
    }
  }

  // ── 5) 바이너리가 이 런타임에서 실행되는가 ────────────────────
  {
    const s = Date.now()
    const r = await runClaude(binPath, ['--version'], { timeoutMs: 60_000 })
    const ok = r.exitCode === 0
    mark('version', ok, s, {
      exitCode: r.exitCode,
      signal: r.signal,
      timedOut: r.timedOut,
      stdout: r.stdout.trim().slice(0, 500),
      stderr: r.stderr.trim().slice(0, 1500),
    })
    if (!ok) {
      return verdict(stages, t0, 'vercel-blocked', '바이너리는 받았으나 실행 불가(glibc 불일치/권한 추정) — GitHub Actions 로 분리할 것.')
    }
  }

  // ── 6) 실제 헤드리스 추론 ────────────────────────────────────
  {
    const s = Date.now()
    if (!token) {
      mark('headless', false, s, {
        skipped: true,
        reason: 'CLAUDE_CODE_OAUTH_TOKEN 미설정 — 토큰 등록 후 재실행 필요',
      })
      return verdict(stages, t0, 'inconclusive', '5단계까지 통과. 토큰만 등록하면 최종 판정 가능하다.')
    }

    // 도구 없이 순수 텍스트 생성만 시킨다. 파일시스템이 읽기 전용이라
    // 도구를 쓰게 두면 그 실패가 진짜 원인을 가린다.
    const r = await runClaude(
      binPath,
      [
        '-p',
        '정확히 다음 단어만 출력하라: SPIKE_OK',
        '--output-format',
        'json',
        '--max-turns',
        '1',
      ],
      { timeoutMs: 120_000 },
    )

    let parsed: unknown = null
    try {
      parsed = JSON.parse(r.stdout)
    } catch {
      /* 파싱 실패도 진단 정보다 — 아래 raw 로 남긴다 */
    }

    const ok = r.exitCode === 0 && r.stdout.includes('SPIKE_OK')
    mark('headless', ok, s, {
      exitCode: r.exitCode,
      signal: r.signal,
      timedOut: r.timedOut,
      parsedJson: parsed,
      rawStdout: parsed ? undefined : r.stdout.slice(0, 2000),
      stderr: r.stderr.trim().slice(0, 2000),
    })

    return ok
      ? verdict(stages, t0, 'vercel-viable', 'Vercel 서버리스에서 claude -p 실행 확인. §2~6 조립 진행 가능.')
      : verdict(stages, t0, 'vercel-blocked', '헤드리스 실행 실패 — stderr 확인 후 GitHub Actions 전환 판단.')
  }
}

function verdict(
  stages: Stage[],
  t0: number,
  result: 'vercel-viable' | 'vercel-blocked' | 'inconclusive',
  recommendation: string,
) {
  return NextResponse.json({
    ok: result === 'vercel-viable',
    verdict: result,
    recommendation,
    totalMs: Date.now() - t0,
    stages,
  })
}
