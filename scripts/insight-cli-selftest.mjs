// lib/insight/claude-cli.ts 의 tar 파서 자체 검증.
//
//   node scripts/insight-cli-selftest.mjs
//
// 왜 이 테스트가 필요한가: 이 레포는 tar 라이브러리를 의존성에 넣지 않으려고
// ustar 헤더를 직접 파싱한다. 파서가 틀리면 214MB 를 받아놓고 바이너리가
// 깨진 채 저장되는데, 그 실패는 Vercel 런타임에서 "Exec format error" 같은
// 엉뚱한 증상으로만 보인다. 원인을 여기서 먼저 잘라낸다.
//
// 네트워크는 쓴다(npm 레지스트리). 대신 178KB 짜리 런처 패키지만 받는다 —
// 214MB 네이티브 패키지는 CI/로컬에서 받지 않는다.
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { extractSingleFile } from '../lib/insight/claude-cli.ts'

let passed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    return
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const TMP = path.join(os.tmpdir(), 'insight-cli-selftest')

async function fetchTarStream(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  const gunzip = createGunzip()
  Readable.fromWeb(res.body).pipe(gunzip)
  return gunzip
}

// ── 1) 실제 npm tarball 에서 파일 하나를 정확히 뽑는가 ──────────────
// 런처 패키지(178KB)에서 cli-wrapper.cjs 를 뽑아 내용이 온전한지 본다.
async function testExtractsRealFile() {
  const url =
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.251.tgz'
  const dest = path.join(TMP, 'cli-wrapper.cjs')

  const written = await extractSingleFile(
    await fetchTarStream(url),
    'package/cli-wrapper.cjs',
    dest,
  )

  const body = await fs.readFile(dest, 'utf8')
  const stat = await fs.stat(dest)

  check('실파일 추출: 바이트 수가 stat 과 일치', written === stat.size, `written=${written} stat=${stat.size}`)
  check('실파일 추출: 앞부분이 shebang', body.startsWith('#!/usr/bin/env node'), body.slice(0, 40))
  check(
    '실파일 추출: 끝이 잘리지 않음(닫는 괄호 존재)',
    body.trimEnd().endsWith('}') || body.trimEnd().endsWith(')'),
    JSON.stringify(body.slice(-40)),
  )
  check(
    '실파일 추출: 패딩 NUL 이 섞이지 않음',
    !body.includes('\0'),
    '추출물에 NUL 바이트가 있으면 512 패딩을 데이터로 잘못 읽은 것',
  )
  // 주의: 런처는 패키지명을 PACKAGE_PREFIX + '-linux-x64' 로 조립한다.
  // 'claude-code-linux-x64' 리터럴은 이 파일에 없다 — 마커로 쓰면 안 된다.
  check(
    '실파일 추출: 알려진 마커 포함',
    body.includes('getBinaryPath') && body.includes("PACKAGE_PREFIX + '-linux-x64'"),
  )
}

// ── 2) 두 번째 엔트리(헤더 여러 개를 건너뛴 뒤)도 정확히 뽑는가 ──────
// package.json 은 tarball 중간에 있다. skip 상태 전이가 틀리면 여기서 깨진다.
async function testExtractsLaterEntry() {
  const url =
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.251.tgz'
  const dest = path.join(TMP, 'package.json')

  await extractSingleFile(await fetchTarStream(url), 'package/package.json', dest)
  const raw = await fs.readFile(dest, 'utf8')

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    check('후행 엔트리 추출: JSON 파싱', false, e.message)
    return
  }

  check('후행 엔트리 추출: JSON 파싱', true)
  check('후행 엔트리 추출: 패키지명 일치', parsed.name === '@anthropic-ai/claude-code', parsed.name)
  check('후행 엔트리 추출: 버전 일치', parsed.version === '2.1.251', parsed.version)
  check(
    '후행 엔트리 추출: linux-x64 optionalDependency 존재',
    Boolean(parsed.optionalDependencies?.['@anthropic-ai/claude-code-linux-x64']),
    '이게 없으면 다운로드 URL 전제가 깨진 것',
  )
}

// ── 3) 없는 파일을 요구하면 조용히 성공하지 않고 던지는가 ────────────
async function testMissingFileThrows() {
  const url =
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.251.tgz'
  const dest = path.join(TMP, 'nope.bin')

  let threw = false
  try {
    await extractSingleFile(await fetchTarStream(url), 'package/does-not-exist', dest)
  } catch {
    threw = true
  }
  check('없는 파일: 예외를 던진다', threw, '조용히 0바이트 파일을 남기면 안 된다')
}

// ── 4) 바이너리 안전성 — NUL 을 포함한 파일도 손상 없이 나오는가 ─────
// LICENSE.md 대신 바이너리성 확인이 필요하지만 런처엔 큰 바이너리가 없다.
// 대신 추출물의 해시를 두 번 뽑아 결정적(deterministic)인지 본다.
async function testDeterministic() {
  const url =
    'https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.251.tgz'
  const hashes = []

  for (const n of [1, 2]) {
    const dest = path.join(TMP, `det-${n}.cjs`)
    await extractSingleFile(await fetchTarStream(url), 'package/install.cjs', dest)
    hashes.push(createHash('sha256').update(await fs.readFile(dest)).digest('hex'))
  }

  check('결정성: 두 번 추출한 결과가 동일', hashes[0] === hashes[1], hashes.join(' vs '))
}

async function main() {
  await fs.rm(TMP, { recursive: true, force: true })
  await fs.mkdir(TMP, { recursive: true })

  await testExtractsRealFile()
  await testExtractsLaterEntry()
  await testMissingFileThrows()
  await testDeterministic()

  await fs.rm(TMP, { recursive: true, force: true })

  console.log(`\n통과 ${passed}건`)
  if (failures.length) {
    console.error(`실패 ${failures.length}건:`)
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exit(1)
  }
  console.log('tar 파서 정상 — /tmp 다운로드 경로를 신뢰할 수 있다.')
}

main().catch((e) => {
  console.error('셀프테스트 실행 실패:', e)
  process.exit(1)
})
