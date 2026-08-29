// Claude Code CLI 를 Vercel 서버리스 런타임 안에서 확보·실행하는 계층.
//
// ⚠️ 이 파일이 존재하는 이유(고치기 전에 읽을 것):
//
//   Claude Code 는 2.x 부터 npm 패키지가 아니라 **플랫폼별 네이티브 바이너리**로
//   배포된다. `@anthropic-ai/claude-code` 는 178KB 짜리 런처 껍데기일 뿐이고,
//   실제 실행 파일은 optionalDependencies 로 갈라진 별도 패키지에 들어있다:
//
//     @anthropic-ai/claude-code-linux-x64  →  압축 해제 시 214MB
//
//   Vercel 서버리스 함수의 번들 상한은 250MB(uncompressed)다. Next.js 런타임과
//   기존 의존성(@supabase/*, @anthropic-ai/sdk)만으로도 수십 MB 를 쓰므로
//   이 바이너리를 의존성으로 넣어 번들에 태우면 상한을 넘길 가능성이 높다.
//   그래서 의존성으로 추가하지 않고, 실행 시점에 /tmp 로 내려받는다.
//   (Vercel /tmp 는 512MB — 214MB 가 들어간다.)
//
//   번들에 이미 바이너리가 있으면(향후 전략을 바꿔 의존성으로 넣는 경우)
//   내려받지 않고 그걸 그대로 쓴다. resolveClaudeBinary() 가 그 분기를 담당한다.
//
// ⚠️ 콜드스타트마다 재다운로드된다. /tmp 는 인스턴스 로컬이라 웜 인스턴스에서만
//    재사용된다. 나이틀리 크론은 사실상 항상 콜드스타트다 — 이 비용이 감당
//    안 되면 이 스텝을 GitHub Actions 로 분리하는 게 설계안의 대안이다.

import { spawn } from 'node:child_process'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import path from 'node:path'

// 버전을 고정한다. 'latest' 로 두면 어느 날 밤 크론이 조용히 다른 바이너리를
// 집어오고, 재현 불가능한 실패가 된다. 올릴 때는 의도적으로 올린다.
export const CLAUDE_CLI_VERSION = '2.1.251'

const PLATFORM_PKG = '@anthropic-ai/claude-code-linux-x64'
const BINARY_NAME = 'claude'

// /tmp 캐시 경로. 버전을 경로에 박아 버전을 올렸을 때 옛 바이너리를 계속
// 쓰는 일이 없게 한다.
const CACHE_DIR = `/tmp/claude-cli-${CLAUDE_CLI_VERSION}`
const CACHE_BIN = path.join(CACHE_DIR, BINARY_NAME)

// claude 는 설정을 쓸 수 있는 HOME 이 필요하다. Vercel 은 /tmp 외 전부
// 읽기 전용이므로 HOME 을 /tmp 아래로 돌린다.
export const CLAUDE_HOME = '/tmp/claude-home'

export type BinarySource = 'bundled' | 'tmp-cache' | 'downloaded'

export interface ResolvedBinary {
  path: string
  source: BinarySource
  sizeBytes: number
  downloadMs: number
}

/** 번들 안에 네이티브 패키지가 이미 있으면 그 경로를 준다. 없으면 null. */
function findBundledBinary(): string | null {
  try {
    // require.resolve 를 eval 로 감싸 Next.js 번들러가 이 패키지를 정적으로
    // 추적하려다 빌드에서 터지지 않게 한다(의존성에 없는 게 정상 경로다).
    const req = eval('require') as NodeRequire
    const pkgDir = path.dirname(req.resolve(`${PLATFORM_PKG}/package.json`))
    return path.join(pkgDir, BINARY_NAME)
  } catch {
    return null
  }
}

async function fileSize(p: string): Promise<number | null> {
  try {
    const st = await fs.stat(p)
    return st.isFile() ? st.size : null
  } catch {
    return null
  }
}

/**
 * npm tarball(.tgz) 에서 파일 하나만 골라 스트리밍으로 뽑아낸다.
 *
 * tar 라이브러리를 의존성으로 추가하지 않으려고 직접 파싱한다. ustar 헤더는
 * 512바이트 고정이라 파서가 짧다. 214MB 를 메모리에 올리면 함수가 죽으므로
 * 버퍼는 항상 소비한 만큼 잘라내고 디스크로 흘려보낸다.
 */
export async function extractSingleFile(
  stream: NodeJS.ReadableStream,
  wantedSuffix: string,
  destPath: string,
): Promise<number> {
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const handle = await fs.open(destPath, 'w')

  let buf: Buffer = Buffer.alloc(0)
  let state: 'header' | 'skip' | 'write' = 'header'
  let remaining = 0 // 남은 실데이터
  let padding = 0 // 512 정렬용 패딩
  let written = 0
  let found = false
  let done = false

  try {
    for await (const chunk of stream) {
      buf = buf.length === 0 ? (chunk as Buffer) : Buffer.concat([buf, chunk as Buffer])

      // 한 청크 안에서 여러 상태 전이가 일어날 수 있어 루프를 돈다.
      for (;;) {
        if (state === 'header') {
          if (buf.length < 512) break

          const header = buf.subarray(0, 512)
          // 전부 0 인 블록 = 아카이브 끝
          let allZero = true
          for (let i = 0; i < 512; i++) {
            if (header[i] !== 0) {
              allZero = false
              break
            }
          }
          if (allZero) {
            buf = buf.subarray(512)
            done = true
            break
          }

          const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
          const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
          const fullName = prefix ? `${prefix}/${name}` : name
          const sizeStr = header
            .subarray(124, 136)
            .toString('utf8')
            .replace(/\0.*$/, '')
            .trim()
          const size = parseInt(sizeStr, 8) || 0
          const typeflag = String.fromCharCode(header[156])

          buf = buf.subarray(512)
          remaining = size
          padding = size % 512 === 0 ? 0 : 512 - (size % 512)

          const isFile = typeflag === '0' || typeflag === '\0'
          state = isFile && !found && fullName.endsWith(wantedSuffix) ? 'write' : 'skip'
          if (state === 'write') found = true
          continue
        }

        // write / skip 공통: 실데이터 소비
        if (remaining > 0) {
          if (buf.length === 0) break
          const take = Math.min(buf.length, remaining)
          if (state === 'write') {
            await handle.write(buf.subarray(0, take))
            written += take
          }
          buf = buf.subarray(take)
          remaining -= take
          if (remaining > 0) break
        }

        // 원하는 파일을 다 썼으면 뒤는 읽을 필요가 없다.
        if (state === 'write') {
          done = true
          break
        }

        // 패딩 소비 후 다음 헤더로
        if (padding > 0) {
          if (buf.length === 0) break
          const take = Math.min(buf.length, padding)
          buf = buf.subarray(take)
          padding -= take
          if (padding > 0) break
        }

        state = 'header'
      }

      if (done) break
    }
  } finally {
    await handle.close()
  }

  if (!found) throw new Error(`tarball 안에서 "${wantedSuffix}" 를 찾지 못함`)
  return written
}

/**
 * 실행 가능한 claude 바이너리 경로를 확보한다.
 * 번들 → /tmp 캐시 → 다운로드 순으로 시도한다.
 */
export async function resolveClaudeBinary(): Promise<ResolvedBinary> {
  const bundled = findBundledBinary()
  if (bundled) {
    const size = await fileSize(bundled)
    if (size) return { path: bundled, source: 'bundled', sizeBytes: size, downloadMs: 0 }
  }

  const cached = await fileSize(CACHE_BIN)
  if (cached && cached > 1_000_000) {
    return { path: CACHE_BIN, source: 'tmp-cache', sizeBytes: cached, downloadMs: 0 }
  }

  const started = Date.now()
  const url = `https://registry.npmjs.org/${PLATFORM_PKG}/-/claude-code-linux-x64-${CLAUDE_CLI_VERSION}.tgz`
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`tarball 다운로드 실패: ${res.status} ${res.statusText}`)
  }

  const gunzip = createGunzip()
  Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).pipe(gunzip)

  // npm tarball 은 모든 엔트리가 package/ 로 시작한다.
  const size = await extractSingleFile(gunzip, `package/${BINARY_NAME}`, CACHE_BIN)
  await fs.chmod(CACHE_BIN, 0o755)

  return {
    path: CACHE_BIN,
    source: 'downloaded',
    sizeBytes: size,
    downloadMs: Date.now() - started,
  }
}

export interface RunResult {
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  timedOut: boolean
  ms: number
}

/** claude 바이너리를 인자와 함께 실행한다. stdout/stderr 를 상한까지만 모은다. */
export async function runClaude(
  binaryPath: string,
  args: string[],
  opts: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const maxOutput = opts.maxOutputBytes ?? 2_000_000
  const started = Date.now()

  await fs.mkdir(CLAUDE_HOME, { recursive: true })

  return new Promise<RunResult>((resolve) => {
    const child = spawn(binaryPath, args, {
      env: {
        ...process.env,
        HOME: CLAUDE_HOME,
        CLAUDE_CONFIG_DIR: path.join(CLAUDE_HOME, '.claude'),
        // 자동 업데이터가 읽기 전용 FS 에 쓰려다 죽는 걸 막는다.
        DISABLE_AUTOUPDATER: '1',
        DISABLE_TELEMETRY: '1',
        DISABLE_ERROR_REPORTING: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
      cwd: '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (d) => {
      if (stdout.length < maxOutput) stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      if (stderr.length < maxOutput) stderr += d.toString()
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr: `${stderr}\n[spawn error] ${err.message}`,
        timedOut,
        ms: Date.now() - started,
      })
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ exitCode: code, signal, stdout, stderr, timedOut, ms: Date.now() - started })
    })
  })
}
