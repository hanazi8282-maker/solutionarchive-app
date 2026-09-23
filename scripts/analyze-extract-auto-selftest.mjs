#!/usr/bin/env node
// 야간 자동 extract 대상 선정 셀프테스트 — lib/analysis/extract-auto.ts + 호출부 배선 대조.
// 네트워크·DB·LLM 없음.
//   node scripts/analyze-extract-auto-selftest.mjs
//
// 왜 있나: 남헌 2026-09-23 Q4(a) 로 후보가 `collecting` 하나에서 `collecting + extracted` 둘로
// 넓어졌다. 이 선정이 조용히 틀리면 (1) 재추출이 매일 밤 상한을 다 먹어 한 번도 추출 안 된
// 프로젝트가 영원히 순서를 못 받거나, (2) force 가 안 붙어 claimExtraction 이 전부 거부해
// "대상 3건 · 실행 0건" 이 되면서도 종료코드는 0 이 된다. 둘 다 로그만 보면 정상처럼 보인다(§7.2).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  compareAutoPriority,
  describePick,
  needsForce,
  pickAutoTargets,
} from '../lib/analysis/extract-auto.ts'
import { REANALYZABLE } from '../lib/analysis/extract-gate.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`❌ ${name}`) } }

// ── 1. needsForce — force 가 필요한 상태 ─────────────────────────
t('extracted 는 force 가 필요하다', needsForce({ status: 'extracted' }) === true)
t('collecting 은 force 없이 돈다', needsForce({ status: 'collecting' }) === false)
t('status 미지정은 첫 추출로 본다(기존 동작)', needsForce({}) === false)
t('앞뒤 공백이 섞여도 판정이 같다', needsForce({ status: ' extracted ' }) === true)
// 검수 이후 단계는 REANALYZABLE 에 없다 = 후보 쿼리에도 안 들어오고 force 도 안 붙는다.
t('reviewed 는 force 대상이 아니다', needsForce({ status: 'reviewed' }) === false)
t('needsForce 는 extract-gate 목록을 그대로 쓴다', REANALYZABLE.every(s => needsForce({ status: s })))

// ── 2. 순서 — SaaS → 첫 추출 → 신규 많은 순 → id ────────────────
const p = (projectId, newInputs, businessModel, status) => ({ projectId, newInputs, businessModel, status })

// 실측 상황 재현(2026-09-23): 재추출 후보가 신규 수로는 압도적이지만 SaaS 첫 추출이 있다.
const real = [
  p('e819f101', 602, 'SAAS', 'extracted'),   // MAKE_BUT_NO_MONEY 재추출
  p('ee68cb68', 401, 'SAAS', 'extracted'),   // NO_FIRST_CUSTOMER 재추출
  p('40512422', 205, 'SAAS', 'collecting'),  // Baremetrics 첫 추출
  p('659642c8', 3272, null, 'collecting'),   // SONY (소비재)
]
const order = [...real].sort(compareAutoPriority).map(c => c.projectId)
t('SaaS 첫 추출이 신규 3,272건 소비재보다 먼저다', order[0] === '40512422')
t('SaaS 재추출은 SaaS 첫 추출 뒤다', order.indexOf('e819f101') > order.indexOf('40512422'))
t('재추출끼리는 신규 많은 순', order.indexOf('e819f101') < order.indexOf('ee68cb68'))
t('소비재는 맨 뒤 — SaaS 재추출보다도 뒤다', order[order.length - 1] === '659642c8')

// status 를 안 넘기는 호출부(relevance-judge-auto.mjs)에서는 기존 순서가 그대로여야 한다.
const legacy = [p('b', 100, null), p('a', 900, null), p('c', 900, 'SAAS')]
t(
  'status 없이 부르면 기존 순서(SaaS → 많은 순 → id)를 유지한다',
  [...legacy].sort(compareAutoPriority).map(c => c.projectId).join('') === 'cab',
)

// 결정적이어야 한다 — 같은 입력을 섞어 넣어도 같은 순서가 나온다.
t(
  '입력 순서가 달라도 결과는 같다(결정적)',
  [...real].reverse().sort(compareAutoPriority).map(c => c.projectId).join('') === order.join(''),
)

// ── 3. pickAutoTargets — 기준·상한·3상태 ────────────────────────
const pick = pickAutoTargets(real, { minNew: 100, max: 3 })
t('상한 3건까지만 고른다', pick.targets.length === 3)
t('남은 대상을 센다(0 으로 접지 않는다)', pick.remaining === 1)
t('고른 3건 중 재추출이 2건임을 말로 남긴다', describePick(pick, 100, 3).includes('재추출(force) 2건'))

// 신규가 기준에 못 미치는 재추출은 대상이 아니다 — 여기가 재추출 주기를 정하는 자리다.
const stale = pickAutoTargets(
  [p('d62f3caa', 0, 'SAAS', 'extracted'), p('x', 150, 'SAAS', 'extracted')],
  { minNew: 100, max: 3 },
)
t('신규 0건인 재추출은 제외된다', stale.targets.length === 1 && stale.targets[0].projectId === 'x')
t('제외 사유를 따로 센다', stale.belowMin === 1)

// 세지 못한 것은 대상에도 제외에도 넣지 않는다(§7.1).
const unknown = pickAutoTargets([p('u', null, 'SAAS', 'extracted')], { minNew: 100, max: 3 })
t('신규 수 확인 불가는 따로 센다', unknown.unknown === 1 && unknown.targets.length === 0 && unknown.belowMin === 0)
t('확인 불가를 로그에 드러낸다', describePick(unknown, 100, 3).includes('확인 불가'))

// 재추출이 하나도 없으면 그 말을 붙이지 않는다(없는 것을 있다고 하지 않는다).
const noRerun = pickAutoTargets([p('z', 500, 'SAAS', 'collecting')], { minNew: 100, max: 3 })
t('재추출 0건이면 그 문구가 없다', !describePick(noRerun, 100, 3).includes('재추출'))

// ── 4. 호출부 배선 — 함수가 옳아도 안 쓰면 소용없다 ─────────────
const auto = readFileSync(new URL('extract-auto.mjs', import.meta.url), 'utf8')
t('후보 쿼리가 REANALYZABLE 을 펼쳐 넣는다', /\.in\('status', \['collecting', \.\.\.REANALYZABLE\]\)/.test(auto))
t('후보 쿼리가 status 를 select 한다', /\.select\('id, status,/.test(auto))
t('후보에 status 를 실어 보낸다', /status: p\.status/.test(auto))
t('claimExtraction 에 force 를 넘긴다', /claimExtraction\(supabase, target\.projectId, force\)/.test(auto))
t('force 는 needsForce 로 정한다', /const force = needsForce\(target\)/.test(auto))
// 회귀 감시: 이 문자열이 남아 있으면 force 가 영구히 꺼져 재추출이 전부 skip 된다.
t('force 를 false 로 하드코딩하지 않는다', !/claimExtraction\(supabase, target\.projectId, false\)/.test(auto))

// ── 5. 사람 확인 속성 보존 — 재추출이 검수 결과를 지우지 않는다 ─
const run = readFileSync(new URL('../lib/analysis/extract-run.ts', import.meta.url), 'utf8')
t(
  '삭제 범위를 human_confirmed=false 로 좁혔다',
  /\.delete\(\)\s*\n\s*\.eq\('project_id', projectId\)\s*\n\s*\.eq\('human_confirmed', false\)/.test(run),
)
t('보존한 이름과 겹치는 새 속성은 넣지 않는다', /freshRows = aspectRows\.filter\(r => !keptNames\.has\(normName\(r\.name\)\)\)/.test(run))
t('보존 건수를 결과에 싣는다', /keptAspects: keptNames\.size/.test(run))
// 조회 실패를 "보존할 게 없다"로 접으면 그 실행이 검수 결과를 지운다.
t('사람 확인분 조회 실패는 실패로 다룬다', /keptError[\s\S]{0,200}return fail\(/.test(run))

// ── 6. 워크플로 — 늘린 상한이 실제 파일에 있다 ──────────────────
const collectYml = readFileSync(new URL('../.github/workflows/nightly-review-collect.yml', import.meta.url), 'utf8')
const relevanceYml = readFileSync(new URL('../.github/workflows/nightly-relevance.yml', import.meta.url), 'utf8')
t('수집 워크플로 timeout 90분', /timeout-minutes: 90/.test(collectYml))
t('수집 워크플로에 30분이 남아 있지 않다', !/timeout-minutes: 30\b/.test(collectYml))
t('수집 워크플로에 KST 14:37 슬롯이 있다', /cron: '37 5 \* \* \*'/.test(collectYml))
t('수집 워크플로가 KST 02:37 슬롯을 유지한다', /cron: '37 17 \* \* \*'/.test(collectYml))
t('관련성 워크플로 timeout 90분', /timeout-minutes: 90/.test(relevanceYml))
// extract·relevance 는 1회 유지다 — LLM 무료 티어를 더 태우지 않기로 한 결정(Q2(a)).
t('관련성 워크플로는 cron 이 1개다', (relevanceYml.match(/- cron:/g) ?? []).length === 1)
const extractYml = readFileSync(new URL('../.github/workflows/nightly-extract.yml', import.meta.url), 'utf8')
t('extract 워크플로도 cron 이 1개다', (extractYml.match(/- cron:/g) ?? []).length === 1)

// ── 7. 관련성 판정 — reader_problem 컬럼을 3상태로 다룬다 ───────
const rel = readFileSync(new URL('relevance-judge-auto.mjs', import.meta.url), 'utf8')
t('후보 조회에 reader_problem 을 넣는다', /reader_problem/.test(rel))
t('컬럼 없음(42703)을 따로 처리한다', /42703/.test(rel))
t('컬럼 없으면 컬럼 빼고 다시 조회한다', /projectQuery\(PROJECT_COLS\)/.test(rel))
t('컬럼 없음을 경고로 남긴다(조용히 넘어가지 않는다)', /warn\(\s*\n?\s*'analysis_projects\.reader_problem/.test(rel))
t('컬럼이 있어도 값이 0건이면 경고한다', /값이 채워진 프로젝트가 0건/.test(rel))

void ROOT
console.log(`\n${fail === 0 ? '✅' : '❌'} 야간 extract 대상 선정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
