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
  backlogOf,
  blockedAlarm,
  compareAutoPriority,
  decideSlot,
  describePick,
  EXTRACT_SLOTS,
  extractRunKey,
  needsForce,
  newInputsSince,
  parseQuotaResetAt,
  pickAutoTargets,
  resolveSlot,
  slotStateOf,
} from '../lib/analysis/extract-auto.ts'
import { AUTO_EXTRACT_STATUSES, AUTO_RETRY_MAX_ATTEMPTS, REANALYZABLE, canStart } from '../lib/analysis/extract-gate.ts'

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

// ── 3b. failed 자동 재시도 (2026-09-27) ─────────────────────────
// 실측: run 36322068002 에서 ConvertKit(8207483a)이 Gemini 503 → status=failed, attempts=1.
// 그 전까지 failed 는 후보 쿼리에 없어서 영구 제외였다.
t('후보 상태 목록에 failed 가 있다', AUTO_EXTRACT_STATUSES.includes('failed'))
t('후보 상태는 전부 canStart 를 통과한다(force 는 needsForce 대로)',
  AUTO_EXTRACT_STATUSES.every(s => canStart(s, null, needsForce({ status: s })).ok))
t('failed 는 force 없이 돈다(첫 추출 취급)', needsForce({ status: 'failed' }) === false)

// 503 실패 직후의 행: fail() 이 extract_finished_at 을 실패 시각으로 찍는다. 그걸 기준으로 세면 신규 0.
t('failed 는 신규를 전체로 센다(실패 시각 기준 아님)',
  newInputsSince({ status: 'failed', extract_finished_at: '2026-09-27T01:00:00Z' }) === null)
t('extracted 는 마지막 완료 시각 기준', newInputsSince({ status: 'extracted', extract_finished_at: '2026-09-27T01:00:00Z' }) === '2026-09-27T01:00:00Z')
t('collecting(미실행)은 전체', newInputsSince({ status: 'collecting', extract_finished_at: null }) === null)

const f = (projectId, newInputs, attempts, businessModel = 'SAAS') => ({ projectId, newInputs, businessModel, status: 'failed', attempts })
// 503 실패 → 다음 실행: 같은 행이 다시 뽑히고, 첫 추출 순위(재추출보다 앞)를 받는다.
const after503 = pickAutoTargets(
  [p('e819f101', 602, 'SAAS', 'extracted'), f('8207483a', 2381, 1)],
  { minNew: 100, max: 1 },
)
t('503 실패(attempts=1)는 다음 실행에서 재선정된다', after503.targets[0]?.projectId === '8207483a')
t('실패 재시도는 재추출보다 앞선다(첫 추출 취급)', after503.remaining === 1)
t('실패 재시도를 로그에 드러낸다', describePick(after503, 100, 1).includes('실패 재시도 1건'))
// d62f3caa(재추출 503 → failed, attempts=2)도 한 번 더 탄다.
t('failed attempts=2 는 아직 대상', pickAutoTargets([f('d62f3caa', 500, 2)], { minNew: 100, max: 3 }).targets.length === 1)

const over = pickAutoTargets([f('dead', 2000, AUTO_RETRY_MAX_ATTEMPTS), f('ok', 2000, 1)], { minNew: 100, max: 3 })
t(`failed attempts>=${AUTO_RETRY_MAX_ATTEMPTS} 는 뽑지 않는다`, over.targets.length === 1 && over.targets[0].projectId === 'ok')
t('상한 도달 제외를 따로 센다(신규 부족으로 접지 않는다)', over.retryExhausted === 1 && over.belowMin === 0)
t('상한 도달 제외를 로그에 드러낸다', describePick(over, 100, 3).includes('재시도 상한'))
t('상한은 failed 에만 — extracted 는 시도 수와 무관', pickAutoTargets([p('x', 500, 'SAAS', 'extracted')].map(c => ({ ...c, attempts: 9 })), { minNew: 100, max: 3 }).targets.length === 1)

// 재추출 실패는 failed 로 떨어지지 않는다 — 속성 삭제 전 실패면 claim 직전 상태로 되돌린다.
{
  const run = readFileSync(new URL('../lib/analysis/extract-run.ts', import.meta.url), 'utf8')
  t('claim 이 재분석일 때 복원값을 돌려준다', /restore: isReanalysis \? \{ status: project\.status, finishedAt: project\.extract_finished_at \?\? null \} : null/.test(run))
  t('fail() 은 삭제 전일 때만 복원한다', /const back = restore && !aspectsDeleted \? restore : null/.test(run))
  t('복원 시 status·완료 시각을 되돌린다', /status: back \? back\.status : 'failed'/.test(run) && /extract_finished_at: back \? back\.finishedAt :/.test(run))
  t('삭제 실패 분기 뒤에서 표시한다', run.indexOf('aspectsDeleted = true') > run.indexOf('기존 속성 삭제에 실패했습니다'))
}

// ── 4. 호출부 배선 — 함수가 옳아도 안 쓰면 소용없다 ─────────────
const auto = readFileSync(new URL('extract-auto.mjs', import.meta.url), 'utf8')
t('후보 쿼리가 extract-gate 의 AUTO_EXTRACT_STATUSES 를 쓴다', /\.in\('status', AUTO_EXTRACT_STATUSES\)/.test(auto))
t('신규 기준 시각은 newInputsSince 가 정한다', /const since = newInputsSince\(p\)/.test(auto))
t('후보에 extract_attempts 를 실어 보낸다', /attempts: p\.extract_attempts/.test(auto))
t('재추출 실패 복원값을 runExtraction 에 넘긴다', /runExtraction\(supabase, target\.projectId, provider, claim\.restore\)/.test(auto))
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
// relevance 는 1회 유지다 — LLM 무료 티어를 더 태우지 않기로 한 결정(Q2(a)). extract 는 아래 6번 끝.
t('관련성 워크플로는 cron 이 1개다', (relevanceYml.match(/- cron:/g) ?? []).length === 1)
const extractYml = readFileSync(new URL('../.github/workflows/nightly-extract.yml', import.meta.url), 'utf8')
// extract 는 2026-09-28 남헌 D1·D3 으로 3슬롯(s1 기존 · s2 KST 12:33 · s3 KST 18:33). 크론 줄 = EXTRACT_SLOTS 키, 1:1.
const extractCrons = [...extractYml.matchAll(/- cron: '([^']+)'/g)].map(m => m[1])
t('extract 워크플로 cron 은 슬롯 표와 1:1', extractCrons.length === 3 && extractCrons.every(c => EXTRACT_SLOTS[c]) && Object.keys(EXTRACT_SLOTS).length === 3)
t('s3 = 33 9 * * *', EXTRACT_SLOTS['33 9 * * *'] === 's3')
t('D7: s1 은 새벽 슬롯 그대로', EXTRACT_SLOTS['33 18 * * *'] === 's1')
t('하루 상한 env 를 넘긴다(기본 24)', /EXTRACT_AUTO_DAILY_MAX: \$\{\{ vars\.EXTRACT_AUTO_DAILY_MAX \|\| '24' \}\}/.test(extractYml))
t('수동 slot 입력을 넘긴다', /EXTRACT_SLOT_INPUT: \$\{\{ inputs\.slot \}\}/.test(extractYml))
t('F6: claude-cli 타임아웃 600초', /LLM_CLAUDE_CLI_TIMEOUT_MS: '600000'/.test(extractYml))
t('게이트를 job if: 로 하지 않는다(skipped 결론 금지)', !/^\s{4}if:/m.test(extractYml))
t('permissions 확대 없음', /permissions:\n\s+contents: read\n\n/.test(extractYml.replace(/\r\n/g, '\n')))
t('extract 워크플로가 발화 크론을 EXTRACT_SLOT_CRON 으로 넘긴다', /EXTRACT_SLOT_CRON: \$\{\{ github\.event\.schedule \}\}/.test(extractYml))
t('extract 는 concurrency 그룹을 유지한다(두 슬롯이 겹쳐도 순차)', /group: extract-auto\n\s*cancel-in-progress: false/.test(extractYml.replace(/\r\n/g, '\n')))

// ── 6b. run_key 슬롯 접미사(설계 F3) — 같은 KST 날짜 두 실행이 agent_runs 행을 덮지 않는다 ─
t('s1 run_key', extractRunKey('2026-09-29', { eventName: 'schedule', slotCron: '33 18 * * *', runId: '1' }) === 'extract-auto-2026-09-29-s1')
t('s2 run_key', extractRunKey('2026-09-29', { eventName: 'schedule', slotCron: '33 3 * * *', runId: '2' }) === 'extract-auto-2026-09-29-s2')
t('수동 실행은 run_id 로 갈린다', extractRunKey('2026-09-29', { eventName: 'workflow_dispatch', runId: '99' }) === 'extract-auto-2026-09-29-m99')
t('로컬 실행', extractRunKey('2026-09-29', {}) === 'extract-auto-2026-09-29-local')
{
  let threw = false
  try { extractRunKey('2026-09-29', { eventName: 'schedule', slotCron: '0 0 * * *' }) } catch { threw = true }
  t('표에 없는 크론은 s1 로 접지 않고 throw', threw)
  threw = false
  try { extractRunKey('2026-09-29', { eventName: 'schedule' }) } catch { threw = true }
  t('schedule 인데 크론이 비었으면 throw', threw)
}
t('s3 run_key', extractRunKey('2026-09-29', { eventName: 'schedule', slotCron: '33 9 * * *' }) === 'extract-auto-2026-09-29-s3')
t('수동 + slot 입력이어도 run_key 는 m<run_id>(진짜 슬롯 행을 덮지 않는다)', extractRunKey('2026-09-29', { eventName: 'workflow_dispatch', runId: '7', slotInput: 's2' }) === 'extract-auto-2026-09-29-m7')
t('extract-auto.mjs 가 extractRunKey 로 run_key 를 만든다', /runKey = extractRunKey\(today, slotEnv\)/.test(auto) && !/runKey: `extract-auto-\$\{kstDate\(\)\}`/.test(auto))

// ── 6c. 적응형 슬롯 게이트 (설계 §3·§4 · 남헌 D1~D8) ────────────
t('resolveSlot schedule s2', resolveSlot({ eventName: 'schedule', slotCron: '33 3 * * *' }) === 's2')
t('resolveSlot 수동 기본은 m', resolveSlot({ eventName: 'workflow_dispatch' }) === 'm')
t('resolveSlot 수동 slot=s3', resolveSlot({ eventName: 'workflow_dispatch', slotInput: 's3' }) === 's3')
t('resolveSlot 수동 이상한 입력은 m', resolveSlot({ eventName: 'workflow_dispatch', slotInput: 'zz' }) === 'm')
{
  let threw = false
  try { resolveSlot({ eventName: 'schedule', slotCron: '0 1 * * *' }) } catch { threw = true }
  t('resolveSlot 모르는 크론 throw', threw)
}

// backlogOf — SaaS 2 · 비SaaS 재추출 0.5(D5) · 나머지 1. unknown 은 B 밖.
const bl = backlogOf(pickAutoTargets([
  p('s1', 500, 'SAAS', 'collecting'),     // 2
  p('s2', 500, 'SAAS', 'extracted'),      // 2 (SaaS 재추출도 2)
  p('c1', 500, null, 'extracted'),        // 0.5
  p('c2', 500, null, 'extracted'),        // 0.5
  p('c3', 500, null, 'collecting'),       // 1
  p('u', null, 'SAAS', 'collecting'),     // unknown — 안 센다
  p('low', 10, 'SAAS', 'collecting'),     // 기준 미달 — 안 센다
], { minNew: 100, max: Infinity }))
t('backlog B = eligible 전체', bl.B === 5)
t('backlog S = SaaS 수', bl.S === 2)
t('backlog Bw = 2+2+0.5+0.5+1', bl.Bw === 6)
t('D5: 소비재 재추출 4건만이면 Bw 2 — s2 ON 5 를 못 넘는다', backlogOf(pickAutoTargets([1, 2, 3, 4].map(i => p(`c${i}`, 400, null, 'extracted')), { minNew: 100, max: Infinity })).Bw === 2)
t('D5 는 순서를 바꾸지 않는다 — SaaS 재추출이 소비재 첫 추출보다 앞', [p('c', 900, null, 'collecting'), p('s', 100, 'SAAS', 'extracted')].sort(compareAutoPriority)[0].projectId === 's')

const NOW = new Date('2026-09-29T03:40:00Z') // s2 발화 직후(KST 12:40)
const st = (o = {}) => ({ prevRan: false, doneToday: 0, cooldownUntil: null, cooldownFromReset: false, consecutiveBlocked: 0, ...o })
const B = (b, s = 0, bw = b + s) => ({ B: b, S: s, Bw: bw })
const d = (slot, backlog, state, o = {}) => decideSlot({ slot, backlog, state, dailyMax: 24, slotMax: 10, now: NOW, ...o })

// s1 — D2: 대상 1건이면 돈다
t('s1 대상 1건이면 돈다(D2)', d('s1', B(1, 0, 0.5), st()).run === true)
t('s1 대상 0건이면 쉰다', d('s1', B(0), st()).run === false)
t('s1 은 state 확인 불가여도 진행(§4.1)', d('s1', B(3), null).run === true && d('s1', B(3), null).max === 10)
// s2 — ON 5 / OFF 2 경계
t('s2 ON: Bw 5 면 돈다', d('s2', B(5), st()).run === true)
t('s2 ON: Bw 4.5 면 쉰다', d('s2', B(5, 0, 4.5), st()).run === false)
t('s2 OFF: 직전 s2 가 돌았으면 Bw 2 로 돈다', d('s2', B(2), st({ prevRan: true })).run === true)
t('s2 OFF: 직전 s2 가 돌았어도 Bw 1.5 면 쉰다', d('s2', B(2, 0, 1.5), st({ prevRan: true })).run === false)
t('s2 쉼 사유에 수치가 있다', /Bw 4 < ON 5/.test(d('s2', B(4), st()).reason))
t('s2 문턱을 결정에 남긴다', d('s2', B(4), st()).threshold === 5 && d('s2', B(4), st({ prevRan: true })).threshold === 2)
// s3 — ON 12 / OFF 6
t('s3 ON: Bw 12 면 돈다', d('s3', B(6, 6), st()).run === true)
t('s3 ON: Bw 11 이면 쉰다', d('s3', B(11), st()).run === false)
t('s3 OFF: 직전 돌았으면 Bw 6 로 돈다', d('s3', B(6), st({ prevRan: true })).run === true)
t('s3 OFF: 직전 돌았어도 Bw 5 면 쉰다', d('s3', B(5), st({ prevRan: true })).run === false)
t('SaaS 2배: SaaS 3건이면 Bw 6 — s2 ON 을 넘는다', d('s2', B(3, 3), st()).run === true)
// 추가 슬롯 + 상태 확인 불가 → 쉼(경고)
t('s2 state 확인 불가면 쉰다(경고)', d('s2', B(50), null).run === false && d('s2', B(50), null).warn === true)
t('s3 state 확인 불가면 쉰다', d('s3', B(50), null).run === false)
// 하루 상한 (D4)
t('하루 상한 잔여로 max 를 줄인다', d('s1', B(30), st({ doneToday: 20 })).max === 4)
t('하루 상한 도달이면 쉰다', d('s1', B(30), st({ doneToday: 24 })).run === false && /하루 상한/.test(d('s1', B(30), st({ doneToday: 24 })).reason))
t('슬롯 상한이 더 작으면 슬롯 상한', d('s2', B(30), st({ doneToday: 3 })).max === 10)
// 쿨다운 (D6)
t('5시간 쿨다운 안이면 쉰다(경고)', (() => { const r = d('s2', B(50), st({ cooldownUntil: '2026-09-29T05:00:00Z' })); return !r.run && r.warn && /쿨다운/.test(r.reason) })())
t('쿨다운 밖이면 돈다', d('s2', B(50), st({ cooldownUntil: '2026-09-29T03:00:00Z' })).run === true)
t('수동(m)도 쿨다운을 지킨다', d('m', B(50), st({ cooldownUntil: '2026-09-29T05:00:00Z' })).run === false)
t('쿨다운 시각을 못 읽었으면 쉰다(없음으로 접지 않는다)', d('s1', B(5), st({ cooldownUntil: 'unknown' })).run === false)
// 수동 — 문턱 건너뜀, 하루 상한은 지킴
t('수동은 문턱 없이 1건이면 돈다', d('m', B(1, 0, 0.5), st()).run === true)
t('수동도 하루 상한을 지킨다', d('m', B(9), st({ doneToday: 24 })).run === false)

// slotStateOf — agent_runs 행 → 상태
const rows = [
  { run_key: 'extract-auto-2026-09-29-s1', status: 'ok', summary: { decision: 'run', done: 8, failed: 1 }, started_at: '2026-09-28T18:40:00Z', finished_at: '2026-09-28T19:30:00Z' },
  { run_key: 'extract-auto-2026-09-28-s2', status: 'ok', summary: { decision: 'skip', done: 0, failed: 0 }, started_at: '2026-09-28T03:40:00Z' },
  { run_key: 'extract-auto-2026-09-28-s1', status: 'ok', summary: { done: 10, failed: 0 }, started_at: '2026-09-27T18:40:00Z' }, // 게이트 이전 행(decision 없음)
  { run_key: 'extract-auto-2026-09-29-m55', status: 'ok', summary: { decision: 'run', done: 2 }, started_at: '2026-09-29T01:00:00Z' },
]
const s2State = slotStateOf(rows, { today: '2026-09-29', slot: 's2' })
t('오늘 처리 = 오늘 행들의 done+failed(수동 포함)', s2State.doneToday === 11)
t('어제 행은 오늘 처리에 안 센다', slotStateOf(rows, { today: '2026-09-28', slot: 's2' }).doneToday === 10)
t('직전 s2 가 쉼이면 prevRan=false', s2State.prevRan === false)
t('직전 s1 이 돌았으면 prevRan=true', slotStateOf(rows, { today: '2026-09-29', slot: 's1' }).prevRan === true)
t('이력이 없는 슬롯은 prevRan=false(ON 문턱)', slotStateOf(rows, { today: '2026-09-29', slot: 's3' }).prevRan === false)
t('blocked 없으면 쿨다운 없음', s2State.cooldownUntil === null && s2State.consecutiveBlocked === 0)
t('옛 슬롯 없는 run_key 도 오늘 처리에 센다', slotStateOf([{ run_key: 'extract-auto-2026-09-29', status: 'ok', summary: { done: 3 }, started_at: '2026-09-28T18:40:00Z' }], { today: '2026-09-29', slot: 's1' }).doneToday === 3)
{
  const blocked = [
    { run_key: 'extract-auto-2026-09-29-s2', status: 'ok', summary: { decision: 'skip' }, started_at: '2026-09-29T03:40:00Z' },
    { run_key: 'extract-auto-2026-09-29-s1', status: 'blocked', summary: { decision: 'run', done: 1 }, started_at: '2026-09-28T18:40:00Z', finished_at: '2026-09-28T20:00:00Z' },
    { run_key: 'extract-auto-2026-09-28-s3', status: 'blocked', summary: { decision: 'run' }, started_at: '2026-09-28T09:40:00Z', finished_at: '2026-09-28T09:50:00Z' },
    { run_key: 'extract-auto-2026-09-28-s2', status: 'blocked', summary: { decision: 'run' }, started_at: '2026-09-28T03:40:00Z', finished_at: '2026-09-28T03:50:00Z' },
    { run_key: 'extract-auto-2026-09-28-s1', status: 'ok', summary: { decision: 'run' }, started_at: '2026-09-27T18:40:00Z' },
  ]
  const bs = slotStateOf(blocked, { today: '2026-09-29', slot: 's3' })
  t('쿨다운 = 마지막 blocked 종료 + 5시간', bs.cooldownUntil === '2026-09-29T01:00:00.000Z' && bs.cooldownFromReset === false)
  t('연속 blocked 는 쉼 행을 건너뛰고 센다', bs.consecutiveBlocked === 3)
  const withReset = blocked.map((r, i) => (i === 1 ? { ...r, summary: { ...r.summary, quota_reset_at: '2026-09-29T06:00:00Z' } } : r))
  const rs = slotStateOf(withReset, { today: '2026-09-29', slot: 's3' })
  t('D6: 리셋 시각이 있으면 5시간보다 우선', rs.cooldownUntil === '2026-09-29T06:00:00.000Z' && rs.cooldownFromReset === true)
  t('리셋 시각 우선 쿨다운 안이면 쉰다', d('s3', B(50), rs).run === false)
  t('진행 중(running) 행은 연속 blocked 를 끊지도 세지도 않는다',
    slotStateOf([{ run_key: 'extract-auto-2026-09-29-s2', status: 'running', summary: {}, started_at: '2026-09-29T03:40:00Z' }, ...blocked.slice(1)], { today: '2026-09-29', slot: 's3' }).consecutiveBlocked === 3)
}

// 연속 blocked 경보(§4.1)
t('직전 2연속 + 이번 blocked = 경보', blockedAlarm(2, 'blocked') === true)
t('직전 2연속 + 이번 ok = 경보 없음', blockedAlarm(2, 'ok') === false)
t('직전 3연속 + 이번 쉼 = 경보', blockedAlarm(3, 'skip') === true)
t('직전 2연속 + 이번 쉼 = 경보 없음', blockedAlarm(2, 'skip') === false)

// parseQuotaResetAt (D6)
const PNOW = new Date('2026-09-29T03:40:00Z')
t('epoch 형태', parseQuotaResetAt('Claude AI usage limit reached|1790654400', PNOW) === new Date(1790654400 * 1000).toISOString())
t('시간대 형태 — 오늘 3pm 서울 = 06:00Z', parseQuotaResetAt("5-hour limit reached ∙ resets 3pm (Asia/Seoul)", PNOW) === '2026-09-29T06:00:00.000Z')
t('시간대 형태 — 이미 지난 시각이면 다음 날', parseQuotaResetAt('resets 9am (Asia/Seoul)', PNOW) === '2026-09-30T00:00:00.000Z')
t('분·UTC 형태', parseQuotaResetAt('resets 4:30am (UTC)', PNOW) === '2026-09-29T04:30:00.000Z')
t('12am = 자정', parseQuotaResetAt('resets 12am (UTC)', PNOW) === '2026-09-30T00:00:00.000Z')
t('못 읽는 문구는 null(5시간 폴백)', parseQuotaResetAt('claude -p 실패 (exit 1): something', PNOW) === null)
t('날짜 붙은 주간 문구는 읽지 않는다', parseQuotaResetAt('resets Oct 3, 9am (Asia/Seoul)', PNOW) === null)
t('과거 epoch 는 버린다(지금 리셋됨으로 읽지 않는다)', parseQuotaResetAt('limit reached|1600000000', PNOW) === null)
t('모르는 시간대는 null', parseQuotaResetAt('resets 3pm (Mars/Olympus)', PNOW) === null)

// 호출부 배선 — 게이트가 실제로 실행을 가른다
t('게이트 결과 max 로 대상을 고른다', /pickAutoTargets\(candidates, \{ minNew, max: gate\.max \}\)/.test(auto))
t('백로그는 상한 없이 잰다', /pickAutoTargets\(candidates, \{ minNew, max: Infinity \}\)/.test(auto))
t('상태는 extract-auto-* 행만 본다(D8)', /\.like\('run_key', 'extract-auto-%'\)/.test(auto))
t('쉼은 gate 스텝 skipped 로 남긴다(§4.2)', /stepKey: 'gate'[^\n]*status: 'skipped'/.test(auto))
t('쉼 summary 에 decision 필드', /decision: gate\.run \? 'run' : 'skip'/.test(auto))
t('blocked 면 리셋 시각을 뽑아 summary 에 남긴다', /quotaResetAt = parseQuotaResetAt\(out\.error/.test(auto) && /quota_reset_at: quotaResetAt/.test(auto))
t('성공 스텝에 cost_usd 를 남긴다(§6-4)', /cost_usd: out\.costUsd/.test(auto))
t('연속 blocked 면 exit 1', /alarm \? 1 : 0/.test(auto) && /raiseAlarm\('skip'\) \? 1 : 0/.test(auto))
t('게이트 판정이 --dry 종료보다 앞선다', auto.indexOf('const gate = decideSlot(') < auto.indexOf("--dry: 여기서 끝낸다"))
{
  const llm = readFileSync(new URL('../lib/analysis/llm.ts', import.meta.url), 'utf8')
  t('llm.ts 가 봉투 total_cost_usd 를 결과로 싣는다', /costUsd = env\.total_cost_usd/.test(llm) && /return \{ text, model, costUsd[ ,]/.test(llm))
  // F6: extract 경로의 claude-cli 호출은 전부 callClaudeCli 한 곳 — 거기서 env 를 읽는다.
  t('F6: callClaudeCli 가 LLM_CLAUDE_CLI_TIMEOUT_MS 를 읽는다', /timeoutMs: Number\(process\.env\.LLM_CLAUDE_CLI_TIMEOUT_MS\) > 0/.test(llm))
  t('F6: runClaude 호출은 llm.ts 에 한 곳뿐', (llm.match(/runClaude\(/g) ?? []).length === 1)
  t('extract-run 이 costUsd 를 결과에 싣는다', /costUsd = call\.costUsd \?\? null/.test(run))
}

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
