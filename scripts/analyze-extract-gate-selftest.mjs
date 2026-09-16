#!/usr/bin/env node
// 추출 시작 게이트 셀프테스트 — lib/analysis/extract-gate.ts + 그걸 쓰는 두 호출부 대조.
// 네트워크·DB 없음.
//   node scripts/analyze-extract-gate-selftest.mjs
//
// 이 검사가 존재하는 이유: 판정이 두 벌이면 "눌러도 409 만 나는 버튼" 또는 "시작할 수
// 있는데 버튼이 없는 화면"이 된다. 후자가 실제로 났다 — 배치로 만든 collecting
// 프로젝트 12건(원문 최대 340건)에 시작 버튼이 어디에도 없어 파이프라인이 멈춰 있었다.
// 그래서 함수 동작뿐 아니라 "두 호출부가 정말 이 함수를 쓰는지"까지 소스에서 확인한다(§7.1).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canStart, REANALYZABLE, STALE_AFTER_MS } from '../lib/analysis/extract-gate.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

const NOW = Date.parse('2026-09-16T00:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

// ── 1. 시작 가능 상태 ────────────────────────────────────────────
t('collecting 은 시작 가능', canStart('collecting', null, false, NOW).ok === true)
t('failed 는 재시도 가능', canStart('failed', null, false, NOW).ok === true)

// ── 2. 진행 중 보호 ──────────────────────────────────────────────
const fresh = canStart('processing', ago(60_000), false, NOW)
t('갓 시작한 processing 은 차단', fresh.ok === false && fresh.reason.includes('진행 중'))
t('force 여도 fresh processing 은 차단', canStart('processing', ago(60_000), true, NOW).ok === false)
t('stale processing 은 복구 허용', canStart('processing', ago(STALE_AFTER_MS + 1000), false, NOW).ok === true)
t('stale 경계 직전은 여전히 차단', canStart('processing', ago(STALE_AFTER_MS - 1000), false, NOW).ok === false)
// started_at 이 없거나 깨졌으면 "오래됐다"고 단정하지 않는다 — 확인 불가는 차단이다(§7.1).
t('started_at null 인 processing 은 차단', canStart('processing', null, false, NOW).ok === false)
t('started_at 파싱 불가면 차단', canStart('processing', 'not-a-date', false, NOW).ok === false)

// ── 3. 재분석은 force 로만 ───────────────────────────────────────
const done = canStart('extracted', null, false, NOW)
t('extracted 는 force 없이 차단', done.ok === false && done.reason.includes('force'))
t('extracted + force 는 허용', canStart('extracted', null, true, NOW).ok === true)
t('REANALYZABLE 은 extracted 한 개뿐', REANALYZABLE.length === 1 && REANALYZABLE[0] === 'extracted')

// 검수 이후 단계는 force 여도 열지 않는다. 사람이 고친 값이 delete→insert 로 날아간다.
for (const s of ['reviewed', 'scored', 'angled', 'done']) {
  const v = canStart(s, null, true, NOW)
  t(`검수 이후(${s})는 force 여도 차단`, v.ok === false && v.reason.includes('검수 이후'))
}

// ── 4. 호출부가 정말 이 함수를 쓰는가 ────────────────────────────
// 문자열 대조는 약한 검사지만, "판정을 다시 손으로 적었다"는 회귀는 이걸로 잡힌다.
const read = (p) => readFileSync(`${ROOT}${p}`, 'utf8')
const route = read('app/api/analyze/extract/route.ts')
const page = read('app/analyze/[id]/review/page.tsx')

t('서버 라우트가 extract-gate 를 import 한다', /from '@\/lib\/analysis\/extract-gate'/.test(route))
t('검수 화면이 extract-gate 를 import 한다', /from '@\/lib\/analysis\/extract-gate'/.test(page))
t('라우트에 canStart 지역 정의가 남아 있지 않다', !/function canStart\s*\(/.test(route))
t('검수 화면에 canStart 지역 정의가 남아 있지 않다', !/function canStart\s*\(/.test(page))
t('검수 화면이 canStart 로 버튼을 가린다', /canStart\(project\.status, project\.extract_started_at\)/.test(page))
// 버튼에서 force 를 켜면 검수해 둔 aspects 가 조용히 교체된다. 열려면 의도한 변경이어야 한다.
t('검수 화면 버튼은 force 를 쓰지 않는다', !/force:\s*true/.test(page))
// 시작 버튼이 실제로 POST 까지 간다(노출만 하고 배선이 빠지는 회귀 방지).
t('검수 화면이 extract 를 POST 한다', /'\/api\/analyze\/extract'/.test(page) && /method: 'POST'/.test(page))

console.log(`\n${fail === 0 ? '✅' : '❌'} 추출 게이트 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
