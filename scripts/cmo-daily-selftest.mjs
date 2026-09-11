#!/usr/bin/env node
// CMO 데일리 루프 자체 검증. **네트워크·DB 없이 돈다.**
//
//   node scripts/cmo-daily-selftest.mjs
//
// 이 루프가 조용히 틀리는 지점은 전부 "안전장치가 있는 척하는" 자리다.
// 그래서 검사가 **일부러 망가뜨렸을 때 실패하는지**까지 본다
// (case-pipeline-selftest.mjs 의 변이 테스트 방식).
//
//   1) 커밋 화이트리스트가 methodology/ 를 정말 막는가 — 막는 척만 하지 않는가
//   2) 자식 env 에 DB 관리자 키·발행 토큰이 안 새는가
//   3) writer 에게 Bash 가 없는가 (발행 수단 자체의 부재)
//   4) blocked 인데 blocker 없는 기록이 로컬에서 막히는가 (DB CHECK 만 믿지 않는다)
//   5) 실패 사례 할당량이 로직으로 강제되는가 — 문서 문구가 아니라
//   6) "확인 불가"가 "0건"으로 접히지 않는가
//   7) 발행 API 흔적이 코드에 없는가
//   8) 원칙 문구가 리포에 한 곳만 있는가 (복사본 = 드리프트)

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import {
  COMMIT_PREFIXES, checkStaged, buildAgentEnv, AGENT_TOOLS, STEPS, runKeyFor,
  RESEARCH_TARGET, DRAFT_TARGET,
  buildDigest, perfFailure, recordStep, scoreboardRows, parsePerformance,
  buildDecisionLogEntries, stagedJobs, selectAngles,
} from './cmo-daily.mjs'
import { validateStep, createTracker, readEvents, STEP_STATUS } from './agent-status.mjs'
import {
  buildPlan, enforceFailureQuota, coverageGaps, parseFrontmatter, setFrontmatterStatus, PAIRABLE_MIN,
} from './research-queue.mjs'
import { renderDashboard, renderRunLine, foldEvents, MARKS, STALE_MS } from './status-render.mjs'
import { normalizeFacets } from './pmf-assess.mjs'
import { buildChildEnv } from '../lib/insight/claude-cli.ts'

let passed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
const eq = (name, actual, expected) =>
  check(name, Object.is(actual, expected), `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`)

const FIX = path.join(process.cwd(), 'scripts', 'fixtures', 'cmo-daily')
const readFix = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf-8'))

// ════════════════════════════════════════════════════════════
// 1) 커밋 화이트리스트 (a)
// ════════════════════════════════════════════════════════════
{
  const clean = readFix('staged-clean.json')
  const dirty = readFix('staged-dirty.json')

  eq('화이트리스트 — 프리픽스 4개', COMMIT_PREFIXES.length, 4)
  eq('화이트리스트 — 정상 경로는 통과', checkStaged(clean.paths).ok, true)

  const d = checkStaged(dirty.paths)
  eq('화이트리스트 — 위반이 있으면 막는다', d.ok, false)
  check('화이트리스트 — methodology/ 를 위반으로 잡는다',
    d.offenders.includes('methodology/content/pdp/04-decisions.md'), d.offenders.join(','))
  check('화이트리스트 — CLAUDE.md 도 위반이다 (자기 규칙을 스스로 못 고친다)',
    d.offenders.includes('CLAUDE.md'), d.offenders.join(','))
  check('화이트리스트 — 워크플로도 위반이다 (실행 조건을 스스로 못 고친다)',
    d.offenders.includes('.github/workflows/daily-cmo-loop.yml'), d.offenders.join(','))
  check('화이트리스트 — .env.local 도 위반이다', d.offenders.includes('.env.local'), d.offenders.join(','))
  eq('화이트리스트 — 위반 목록이 픽스처 기대와 정확히 같다',
    d.offenders.sort().join('|'), [...dirty.expected_offenders].sort().join('|'))
  check('화이트리스트 — 막은 이유에 개수와 경로가 있다', /5건/.test(d.reason), d.reason)

  // 경로 구분자가 백슬래시로 와도 잡아야 한다 (Windows 로컬 실행).
  eq('화이트리스트 — 백슬래시 경로도 정규화해서 판정',
    checkStaged(['methodology\\content\\pdp\\04-decisions.md']).ok, false)

  // 하위 경로 위장: "reports-evil/" 은 "reports/" 가 아니다.
  eq('화이트리스트 — 프리픽스 위장(reports-evil/)을 통과시키지 않는다',
    checkStaged(['reports-evil/x.md']).ok, false)

  // ★ 변이 테스트 — 블랙리스트 방식으로 바꾸면 이 픽스처를 못 잡는다.
  //   "금지 목록에 있으면 거절"은 새로 생긴 위험 경로를 자동 허용한다.
  const blacklistMutant = (paths) => ({ ok: !paths.some((p) => p.startsWith('methodology/')) })
  eq('변이 — 블랙리스트 방식은 lib/ 수정을 놓친다 (그래서 안 쓴다)',
    blacklistMutant(['lib/cases/publish-gate.ts']).ok, true)
  eq('변이 — 화이트리스트 방식은 같은 입력을 막는다',
    checkStaged(['lib/cases/publish-gate.ts']).ok, false)

  // ★ 변이 테스트 — 검사를 무력화하면(항상 ok) 위 음성 검사가 깨져야 한다.
  const alwaysOk = () => ({ ok: true, offenders: [] })
  eq('변이 — 항상 통과시키는 검사는 음성 픽스처에서 틀린 답을 낸다', alwaysOk(dirty.paths).ok, true)
  check('변이 — 진짜 검사는 같은 입력에서 다른 답을 낸다', checkStaged(dirty.paths).ok !== alwaysOk().ok)
}

// ════════════════════════════════════════════════════════════
// 2) 자식 env 격리 (b)
// ════════════════════════════════════════════════════════════
{
  const parent = {
    PATH: '/usr/bin',
    CLAUDE_CODE_OAUTH_TOKEN: 'oauth-xxx',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-SECRET',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    THREADS_ACCESS_TOKEN: 'threads-SECRET',
    ANTHROPIC_API_KEY: 'sk-ant-SECRET',
    GITHUB_TOKEN: 'gh-SECRET',
  }
  const wl = buildAgentEnv(parent)
  eq('env — OAuth 토큰은 넘긴다', wl.CLAUDE_CODE_OAUTH_TOKEN, 'oauth-xxx')
  eq('env — 화이트리스트 키는 1개뿐이다', Object.keys(wl).length, 1)

  const child = buildChildEnv(parent, wl)
  check('env — SUPABASE_SERVICE_ROLE_KEY 가 자식에 없다', child.SUPABASE_SERVICE_ROLE_KEY === undefined)
  check('env — THREADS_ACCESS_TOKEN 이 자식에 없다', child.THREADS_ACCESS_TOKEN === undefined)
  check('env — ANTHROPIC_API_KEY 가 자식에 없다', child.ANTHROPIC_API_KEY === undefined)
  check('env — GITHUB_TOKEN 이 자식에 없다', child.GITHUB_TOKEN === undefined)
  check('env — NEXT_PUBLIC_SUPABASE_URL 도 자식에 없다', child.NEXT_PUBLIC_SUPABASE_URL === undefined)
  eq('env — PATH 는 상속한다 (없으면 node 가 안 돈다)', child.PATH, '/usr/bin')
  check('env — claude 런타임 고정 변수는 들어간다', typeof child.HOME === 'string' && child.HOME.length > 0)

  const serialized = JSON.stringify(child)
  check('env — 직렬화한 자식 env 어디에도 SECRET 문자열이 없다',
    !serialized.includes('SECRET'), serialized.slice(0, 300))

  // ★ 변이 — 화이트리스트를 안 주면(기존 동작) 전부 샌다. 그래서 반드시 줘야 한다.
  const leaky = buildChildEnv(parent, undefined)
  eq('변이 — env 화이트리스트를 생략하면 서비스 키가 샌다', leaky.SUPABASE_SERVICE_ROLE_KEY, 'service-role-SECRET')
}

// ════════════════════════════════════════════════════════════
// 3) 도구 화이트리스트 (c)
// ════════════════════════════════════════════════════════════
{
  check('도구 — writer 에 Bash 가 없다 (발행 수단 자체가 없다)',
    !AGENT_TOOLS['sa-cmo-writer'].includes('Bash'), AGENT_TOOLS['sa-cmo-writer'])
  check('도구 — writer 에 WebFetch 가 없다 (외부 호출 경로 차단)',
    !AGENT_TOOLS['sa-cmo-writer'].includes('WebFetch'), AGENT_TOOLS['sa-cmo-writer'])
  check('도구 — analyst 에 Write 가 없다 (읽기 전용)',
    !AGENT_TOOLS['sa-cmo-analyst'].includes('Write'), AGENT_TOOLS['sa-cmo-analyst'])
  check('도구 — analyst 에 Bash 가 없다 (DB 쓰기 스크립트 차단)',
    !AGENT_TOOLS['sa-cmo-analyst'].includes('Bash'), AGENT_TOOLS['sa-cmo-analyst'])
  check('도구 — researcher 의 Bash 는 case-research.mjs 로 좁혀져 있다',
    /Bash\(node scripts\/case-research\.mjs:\*\)/.test(AGENT_TOOLS['sa-cmo-researcher']),
    AGENT_TOOLS['sa-cmo-researcher'])
  for (const [name, tools] of Object.entries(AGENT_TOOLS)) {
    check(`도구 — ${name} 에 무제한 Bash 가 없다`, !/(^|,)Bash(,|$)/.test(tools), tools)
  }
}

// ════════════════════════════════════════════════════════════
// 4) 상태 기록 — blocked 는 사유가 필수
// ════════════════════════════════════════════════════════════
{
  const base = { stepKey: 'stage', label: '스테이징', seq: 6 }
  eq('상태 — 정상 ok 는 통과', validateStep({ ...base, status: 'ok' }).length, 0)
  check('상태 — blocked + blocker 는 통과',
    validateStep({ ...base, status: 'blocked', blocker: 'CG-1 귀속 문구 없음' }).length === 0)
  check('상태 — blocked 인데 blocker 없으면 거부',
    validateStep({ ...base, status: 'blocked' }).some((e) => /blocker/.test(e)))
  check('상태 — blocker 가 공백뿐이어도 거부',
    validateStep({ ...base, status: 'blocked', blocker: '   ' }).some((e) => /blocker/.test(e)))
  check('상태 — 어휘 밖 status 는 거부',
    validateStep({ ...base, status: '대충됨' }).some((e) => /어휘 밖/.test(e)))
  check('상태 — seq 가 정수가 아니면 거부',
    validateStep({ ...base, status: 'ok', seq: '여섯' }).some((e) => /seq/.test(e)))
  check('상태 — skipped / failed / blocked 가 서로 다른 값이다',
    new Set(['skipped', 'failed', 'blocked'].filter((s) => STEP_STATUS.includes(s))).size === 3)

  // ★ 변이 — blocker 검사를 빼면 사유 없는 차단이 통과한다.
  const mutant = ({ status }) => (STEP_STATUS.includes(status) ? [] : ['bad'])
  eq('변이 — blocker 검사 없는 판정기는 사유 없는 blocked 를 통과시킨다',
    mutant({ status: 'blocked' }).length, 0)
}

// ════════════════════════════════════════════════════════════
// 5) 상태 기록기 — JSONL 폴백 (DB 없이)
// ════════════════════════════════════════════════════════════
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmo-selftest-'))
  const runKey = 'cmo-2026-09-08-selftest'
  // dryRun=true 라 DB 를 아예 안 건드린다 — 이 검사가 네트워크 없이 도는 이유다.
  const t = await createTracker({ runKey, dept: 'cmo', trigger: 'local', dryRun: true, stateDir: tmp, quiet: true })

  eq('폴백 — dry-run 은 DB 에 쓰지 않는다', t.dbOk, false)
  check('폴백 — 그 이유가 기록돼 있다 (사고가 아니라 설계임을 말한다)',
    /dry-run/.test(t.fallbackReason ?? ''), String(t.fallbackReason))

  await t.step({ stepKey: 'preflight', label: '사전 점검', status: 'ok', seq: 1 })
  await t.step({ stepKey: 'stage', label: '스테이징', status: 'blocked', blocker: 'CG-1 귀속 문구 없음', seq: 6 })
  await t.finish({ status: 'partial', summary: { drafted: 1 } })

  let threw = false
  try { await t.step({ stepKey: 'x', label: 'x', status: 'blocked', seq: 9 }) } catch { threw = true }
  eq('폴백 — 사유 없는 blocked 는 폴백 경로에서도 거부된다', threw, true)

  const events = readEvents(runKey, tmp)
  check('폴백 — 이벤트가 JSONL 에 남았다', Array.isArray(events) && events.length >= 4, JSON.stringify(events?.length))
  eq('폴백 — 없는 실행을 읽으면 null (빈 배열 아님)', readEvents('없는키', tmp), null)

  const folded = foldEvents(events)
  eq('폴백 — 접으면 실행 상태가 복원된다', folded.status, 'partial')
  eq('폴백 — 스텝 2개', folded.steps.length, 2)
  eq('폴백 — blocked 스텝의 사유가 살아 있다',
    folded.steps.find((s) => s.step_key === 'stage')?.blocker, 'CG-1 귀속 문구 없음')

  fs.rmSync(tmp, { recursive: true, force: true })
}

// ════════════════════════════════════════════════════════════
// 6) 실패 사례 할당량 — 로직으로 강제되는가
// ════════════════════════════════════════════════════════════
{
  const gaps = [{ bottleneck: 'SUPPLY', cases: 0 }, { bottleneck: 'AWARENESS', cases: 1 }]

  const p2 = buildPlan({ n: 2, gaps })
  eq('큐 — 2건 계획', p2.length, 2)
  eq('큐 — 첫 건이 실패 할당분이다', p2[0].reason, 'failure_quota')
  eq('큐 — 할당량 게이트 통과', enforceFailureQuota(p2).ok, true)

  const p1 = buildPlan({ n: 1, gaps })
  eq('큐 — 1건만이어도 실패 할당분이 남는다', p1[0].reason, 'failure_quota')

  // CEO 피드백이 2건 들어와도 실패 할당분이 밀려나지 않는다.
  const fb = [
    { file: 'reports/feedback/a.md', brand: 'A사', market: null, bottleneck: 'TRUST', slug_hint: null, note: null },
    { file: 'reports/feedback/b.md', brand: 'B사', market: null, bottleneck: 'TRUST', slug_hint: null, note: null },
  ]
  const p2f = buildPlan({ n: 2, gaps, feedback: fb })
  eq('큐 — 피드백이 많아도 실패 할당분이 잘리지 않는다', p2f[0].reason, 'failure_quota')
  eq('큐 — 피드백이 그다음', p2f[1].reason, 'ceo_feedback')
  eq('큐 — 그래도 할당량 통과', enforceFailureQuota(p2f).ok, true)

  // ★ 음성 — 할당분을 빼면 게이트가 막아야 한다.
  const stripped = p2.filter((r) => r.reason !== 'failure_quota')
  eq('큐 — 실패 할당분이 없으면 게이트가 막는다', enforceFailureQuota(stripped).ok, false)
  check('큐 — 막은 이유에 생존 편향을 적는다', /생존 편향/.test(enforceFailureQuota(stripped).reason))

  // ★ 변이 — 계획 순서를 뒤집으면(할당분을 뒤에) N=1 에서 잘려 나간다.
  const mutantPlan = [...buildPlan({ n: 5, gaps })].reverse().slice(0, 1)
  eq('변이 — 할당분을 뒤에 붙이면 N=1 에서 사라진다', enforceFailureQuota(mutantPlan).ok, false)

  check('큐 — 실패 할당분 메모가 "성공으로 대체 금지"를 말한다', /성공 사례로 대체하지 마라/.test(p2[0].notes))
  check('큐 — 브랜드 미정 슬롯을 지어내지 않는다', /^미정 \(/.test(p2[0].brand_name), p2[0].brand_name)

  // 이미 큐/아카이브에 있는 브랜드는 뺀다.
  const excluded = buildPlan({ n: 3, gaps, feedback: fb, excludeBrands: new Set(['A사']) })
  check('큐 — 제외 브랜드는 계획에 안 들어간다', !excluded.some((r) => r.brand_name === 'A사'))

  // ★ 확인 불가를 "갭 0개"로 접지 않는다.
  eq('큐 — 조회 실패면 갭이 null 이다 (0개가 아니다)', coverageGaps(null, []), null)
  eq('큐 — moves 만 null 이어도 확인 불가다', coverageGaps([], null), null)
  let planThrew = false
  try { buildPlan({ n: 2, gaps: null }) } catch { planThrew = true }
  eq('큐 — 확인 불가 상태로는 계획을 세우지 않는다', planThrew, true)

  // 갭 계산 자체. TRUST 를 PAIRABLE_MIN 개수만큼 정확히 채워서 "목표선에 딱
  // 걸치면 갭이 아니다"를 검사한다 — 개수를 2 로 하드코딩하면 PAIRABLE_MIN 을
  // 바꿀 때마다(2026-09-09: 2→3) 이 테스트가 실제 버그 없이도 깨진다.
  const studies = Array.from({ length: PAIRABLE_MIN }, (_, i) => (
    { id: `s${i + 1}`, slug: `case-${i}`, brand_name: `브랜드${i}`, bottleneck: 'TRUST', review_status: 'approved' }
  ))
  const moves = studies.map((s, i) => (
    { id: `m${i + 1}`, case_study_id: s.id, lever: 'OFFER', claim: 'x', evidence_grade: 'A', outcome_direction: 'positive', review_status: 'approved' }
  ))
  const g = coverageGaps(studies, moves)
  check(`큐 — 케이스 ${PAIRABLE_MIN}곳(목표선)인 병목은 갭이 아니다`, !g.some((x) => x.bottleneck === 'TRUST'), JSON.stringify(g))
  eq('큐 — 나머지 6개 병목(0곳)은 갭이다', g.length, 6)
}

// ════════════════════════════════════════════════════════════
// 7) 피드백 프론트매터 — 지우지 않고 갱신한다
// ════════════════════════════════════════════════════════════
{
  const md = '---\nstatus: open\nbrand: 커먼컴퍼니\nbottleneck: TRUST\n---\n\n본문은 그대로 남아야 한다.\n'
  const { data } = parseFrontmatter(md)
  eq('피드백 — status 파싱', data.status, 'open')
  eq('피드백 — brand 파싱', data.brand, '커먼컴퍼니')

  const next = setFrontmatterStatus(md, 'ingested')
  eq('피드백 — status 만 바뀐다', parseFrontmatter(next).data.status, 'ingested')
  check('피드백 — 본문이 살아 있다', next.includes('본문은 그대로 남아야 한다'), next)
  check('피드백 — 다른 키도 살아 있다', /brand: 커먼컴퍼니/.test(next))
  eq('피드백 — 프론트매터 없는 파일은 그대로', setFrontmatterStatus('그냥 글', 'ingested'), '그냥 글')
  eq('피드백 — 프론트매터 없으면 data 는 null', parseFrontmatter('그냥 글').data, null)
}

// ════════════════════════════════════════════════════════════
// 8) 대시보드 — 확인 불가 배너 · stale · 막힘
// ════════════════════════════════════════════════════════════
{
  const now = Date.parse('2026-09-08T21:00:00Z')
  const run = {
    run_key: 'cmo-2026-09-08-cron', dept: 'cmo', status: 'partial', dry_run: false,
    started_at: '2026-09-08T20:17:00Z', finished_at: '2026-09-08T20:52:00Z',
    steps: [
      { seq: 1, step_key: 'preflight', status: 'ok', updated_at: '2026-09-08T20:18:00Z' },
      { seq: 2, step_key: 'queue', status: 'ok', updated_at: '2026-09-08T20:19:00Z' },
      { seq: 3, step_key: 'angle', status: 'skipped', updated_at: '2026-09-08T20:20:00Z' },
      { seq: 4, step_key: 'stage', status: 'blocked', blocker: 'CG-1 귀속 문구 없음', updated_at: '2026-09-08T20:50:00Z' },
      { seq: 5, step_key: 'digest', status: 'failed', detail: { error: '커밋 화이트리스트 위반' }, updated_at: '2026-09-08T20:52:00Z' },
    ],
  }
  const line = renderRunLine(run, now)
  check('대시 — 부서당 한 줄이다', !line.includes('\n'), line)
  check('대시 — 스텝 기호가 붙는다', line.includes(`${MARKS.ok}${MARKS.ok}${MARKS.skipped}${MARKS.blocked}${MARKS.failed}`), line)
  check('대시 — 끝난 실행은 stale 로 표시하지 않는다', !line.includes('stale'), line)

  const stuck = {
    ...run, status: 'running', finished_at: null,
    steps: [{ seq: 1, step_key: 'research', status: 'running', updated_at: '2026-09-08T20:20:00Z' }],
  }
  const stuckLine = renderRunLine(stuck, now)
  check('대시 — 5분 넘게 안 바뀐 running 은 stale', stuckLine.includes('stale'), stuckLine)
  const fresh = renderRunLine({ ...stuck, steps: [{ seq: 1, step_key: 'research', status: 'running', updated_at: new Date(now - 60_000).toISOString() }] }, now)
  check('대시 — 1분 전 갱신은 stale 이 아니다', !fresh.includes('stale'), fresh)
  eq('대시 — stale 기준은 5분', STALE_MS, 5 * 60 * 1000)

  const md = renderDashboard([run], { now, source: 'db' })
  check('대시 — 막힌 스텝의 사유가 화면에 있다', md.includes('CG-1 귀속 문구 없음'), md)
  check('대시 — 실패 스텝의 사유가 화면에 있다', md.includes('커밋 화이트리스트 위반'), md)
  check('대시 — 막힘이 실패도 성공도 아님을 말한다', /안전장치가 작동한 것/.test(md))
  check('대시 — DB 정상일 때는 확인 불가 배너가 없다', !md.includes('DB 확인 불가'), md.slice(0, 200))

  const fb = renderDashboard([run], { now, source: 'jsonl', reason: 'agent_runs 테이블 없음' })
  check('대시 — 폴백일 때 확인 불가 배너를 맨 위에 박는다', /DB 확인 불가 — 로컬 기준/.test(fb), fb.slice(0, 400))
  check('대시 — 폴백 사유를 적는다', fb.includes('agent_runs 테이블 없음'))

  const empty = renderDashboard([], { now, source: 'db' })
  check('대시 — DB 정상 + 0건은 "0건"이라고 말한다', /0건/.test(empty), empty)
  const emptyFb = renderDashboard([], { now, source: 'jsonl', reason: 'x' })
  check('대시 — 폴백 + 0건을 "실행 없음"으로 접지 않는다',
    /실행이 없었다는 뜻이 아니다/.test(emptyFb), emptyFb)

  const dry = renderDashboard([{ ...run, dry_run: true }], { now, source: 'db' })
  check('대시 — dry-run 전용 실행은 반영 없음을 말한다', /반영된 것은 없다/.test(dry))
}

// ════════════════════════════════════════════════════════════
// 9) PMF 입력 정규화 — 어휘 밖 값을 밀어 넣지 않는다
// ════════════════════════════════════════════════════════════
{
  const okr = normalizeFacets({ bottleneck: 'trust', price_band: 'mid', buyer_type: 'B2C', business_model: 'D2C' })
  eq('PMF — 소문자도 정규화된다', okr.facets.bottleneck, 'TRUST')
  eq('PMF — price_band 정규화', okr.facets.price_band, 'MID')
  eq('PMF — 정상 입력엔 경고가 없다', okr.notes.length, 0)

  const bad = normalizeFacets({ bottleneck: '느낌', price_band: '적당히' })
  eq('PMF — 어휘 밖 병목은 비운다 (가까운 값으로 밀지 않는다)', bad.facets.bottleneck, null)
  eq('PMF — 어휘 밖 가격대도 비운다', bad.facets.price_band, null)
  eq('PMF — 비운 이유를 남긴다', bad.notes.length, 2)
  check('PMF — 이유에 허용 어휘를 적는다', /허용:/.test(bad.notes[0]), bad.notes[0])

  const none = normalizeFacets({})
  eq('PMF — 입력이 없으면 전부 null', Object.values(none.facets).every((v) => v === null), true)
  eq('PMF — 입력이 없는 건 경고 대상이 아니다', none.notes.length, 0)
}

// ════════════════════════════════════════════════════════════
// 10) 발행 API 흔적이 없는가 (§10)
// ════════════════════════════════════════════════════════════
{
  // ★ 금지 문자열을 소스에 그대로 적지 않고 조립한다.
  //   발행 API 호스트를 `scripts/cmo-*.mjs` 에서 grep 해 0건이어야 한다는 게 수용기준인데,
  //   검사기가 그 문자열을 리터럴로 들고 있으면 검사기 자신이 검색에 걸린다.
  //   "검사 방법이 주장과 같은지 확인하라"(§7.1)의 반대 사례를 만들지 않기 위한 조립이다.
  const PUBLISH_HOST = ['graph', 'threads', 'net'].join('.')
  const PUBLISH_TOKEN = ['THREADS', 'ACCESS', 'TOKEN'].join('_')

  const targets = [
    'scripts/cmo-daily.mjs', 'scripts/agent-status.mjs',
    'scripts/status-render.mjs', 'scripts/research-queue.mjs', 'scripts/pmf-assess.mjs',
    'scripts/case-draft-stage.mjs',
    '.github/workflows/daily-cmo-loop.yml',
  ]
  for (const f of targets) {
    const p = path.join(process.cwd(), f)
    if (!fs.existsSync(p)) { failures.push(`§10 — 검사 대상 파일이 없다: ${f}`); continue }
    const src = fs.readFileSync(p, 'utf-8')
    check(`§10 — ${f} 에 발행 API 호스트가 없다`, !src.includes(PUBLISH_HOST))
    // 주석으로 "이걸 넣지 마라"라고 적는 건 허용한다. 금지하는 건 **실제 참조**다
    // (`process.env.X` 또는 YAML 의 `X:` 할당). 언급까지 막으면 경고를 못 적는다.
    check(`§10 — ${f} 가 발행 토큰을 참조하지 않는다`,
      !new RegExp(`process\\.env\\.${PUBLISH_TOKEN}`).test(src)
      && !new RegExp(`^\\s*${PUBLISH_TOKEN}\\s*:`, 'm').test(src))
  }

  // 이 셀프테스트 자신도 호스트 리터럴을 갖지 않아야 한다 — 안 그러면 수용기준의
  // grep(`scripts/cmo-*.mjs`)이 검사기 자신을 위반으로 집는다.
  //
  // 토큰 **이름**은 예외다. 위 env 격리 검사가 그 키를 실제로 세팅해서 안 새는지
  // 봐야 하기 때문이다. 이름을 못 쓰게 하면 그 검사를 통째로 잃는다 —
  // 문자열 위생을 위해 실질 검사를 버리는 건 거꾸로 된 우선순위다.
  {
    const self = fs.readFileSync(path.join(process.cwd(), 'scripts/cmo-daily-selftest.mjs'), 'utf-8')
    check('§10 — 셀프테스트 소스 자신에도 발행 호스트 리터럴이 없다', !self.includes(PUBLISH_HOST))
    // 등장 횟수를 세지 않는다 — 문구를 한 줄 고칠 때마다 깨지는 검사는
    // 곧 주석 처리된다. 대신 **실제 사용**만 금지한다: process.env 로 읽는 것.
    check('§10 — 셀프테스트가 발행 토큰을 process.env 로 읽지 않는다',
      !new RegExp(`process\\.env\\.${PUBLISH_TOKEN}`).test(self))
  }

  const wf = fs.readFileSync(path.join(process.cwd(), '.github/workflows/daily-cmo-loop.yml'), 'utf-8')
  check('§10 — 워크플로 env 에 ANTHROPIC_API_KEY 가 없다', !/ANTHROPIC_API_KEY\s*:/.test(wf))
  check('워크플로 — CLAUDE_CODE_OAUTH_TOKEN 은 있다', /CLAUDE_CODE_OAUTH_TOKEN\s*:/.test(wf))
  check('워크플로 — concurrency 그룹이 걸려 있다', /group:\s*cmo-daily/.test(wf))
  check('워크플로 — 실패해도 재시도하지 않는다(retry 설정 없음)', !/retry/i.test(wf))
}

// ════════════════════════════════════════════════════════════
// 11) 원칙 문구가 리포에 한 곳만 있는가 (드리프트 방지)
// ════════════════════════════════════════════════════════════
{
  const NEEDLE = '더 나은 방법도 없을 때에만 진행한다'
  const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build'])
  let hits = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(md|mjs|ts|tsx|yml|yaml|json)$/.test(e.name)) continue
      let src
      try { src = fs.readFileSync(p, 'utf-8') } catch { continue }
      if (src.includes(NEEDLE)) hits.push(path.relative(process.cwd(), p).replace(/\\/g, '/'))
    }
  }
  walk(process.cwd())
  // 이 셀프테스트 파일 자신은 문구를 문자열 상수로 들고 있다. 그건 복사본이 아니다.
  hits = hits.filter((h) => h !== 'scripts/cmo-daily-selftest.mjs')
  eq('원칙 — 진행 판단 문구가 리포에 정확히 1곳', hits.length, 1, hits.join(', '))
  eq('원칙 — 그 1곳이 ops/roles/_principles.md', hits[0], 'ops/roles/_principles.md')

  const principles = fs.readFileSync(path.join(process.cwd(), 'ops/roles/_principles.md'), 'utf-8')
  check('원칙 — 기획 → 자가검증 → 개선점 발굴 순서가 적혀 있다',
    /먼저 기획한다/.test(principles) && /자가검증한다/.test(principles) && /개선점을 반드시 발굴한다/.test(principles))
  check('원칙 — §7.1 3상태를 재확인한다', /확인 불가/.test(principles) && /양성/.test(principles) && /음성/.test(principles))
  check('원칙 — §7.2 안전장치 규칙을 재확인한다', /안전장치/.test(principles))

  // 역할 파일들이 원칙을 복사하지 않고 참조만 하는가
  for (const role of ['cmo', 'cto', 'ceo-staff']) {
    const body = fs.readFileSync(path.join(process.cwd(), `ops/roles/${role}.md`), 'utf-8')
    check(`역할 — ${role}.md 가 _principles.md 를 참조한다`, body.includes('_principles.md'))
    check(`역할 — ${role}.md 가 원칙 본문을 복사하지 않았다`, !body.includes(NEEDLE))
    const agent = fs.readFileSync(path.join(process.cwd(), `.claude/agents/${role}.md`), 'utf-8')
    check(`에이전트 — ${role}.md 가 헌장을 Read 로 주입한다`,
      agent.includes('_principles.md') && agent.includes(`ops/roles/${role}.md`))
    const cmd = fs.readFileSync(path.join(process.cwd(), `.claude/commands/${role}.md`), 'utf-8')
    check(`커맨드 — /${role} 도 같은 파일을 Read 한다`,
      cmd.includes('_principles.md') && cmd.includes(`ops/roles/${role}.md`))
  }
}

// ════════════════════════════════════════════════════════════
// 12) 서브에이전트 파일 규격
// ════════════════════════════════════════════════════════════
{
  const subs = ['sa-cmo-researcher', 'sa-cmo-writer', 'sa-cmo-analyst', 'sa-cto-pmf-analyst', 'sa-cto-data']
  for (const s of subs) {
    const p = path.join(process.cwd(), `.claude/agents/${s}.md`)
    check(`서브 — ${s}.md 가 있다`, fs.existsSync(p))
    if (!fs.existsSync(p)) continue
    const src = fs.readFileSync(p, 'utf-8')
    check(`서브 — ${s} 에 name/description/tools/model 프론트매터`,
      /^---[\s\S]*?name:[\s\S]*?description:[\s\S]*?tools:[\s\S]*?model:[\s\S]*?---/.test(src))
    check(`서브 — ${s} 가 _principles.md 를 Read 한다`, src.includes('_principles.md'))
    check(`서브 — ${s} 가 원칙 본문을 복사하지 않았다`, !src.includes('더 나은 방법도 없을 때에만 진행한다'))
  }
  const writer = fs.readFileSync(path.join(process.cwd(), '.claude/agents/sa-cmo-writer.md'), 'utf-8')
  check('서브 — writer 가 save_rate 금지를 명시한다', /save_rate/.test(writer) && /쓰지 마라|쓰지 않는다/.test(writer))
  check('서브 — writer 가 like_rate 를 기본 지표로 둔다', /기본 지표는 \*\*`like_rate`\*\*/.test(writer))
  check('서브 — writer 가 게이트 자동 발동에 의존하지 말라고 한다', /자동 발동에 의존하지 마라/.test(writer))
  check('서브 — writer 에 tools 로 Bash 가 없다', !/^tools:.*Bash/m.test(writer))

  const data = fs.readFileSync(path.join(process.cwd(), '.claude/agents/sa-cto-data.md'), 'utf-8')
  check('서브 — sa-cto-data 가 3상태 보고를 요구한다',
    /양성/.test(data) && /음성/.test(data) && /확인 불가/.test(data))
}

// ════════════════════════════════════════════════════════════
// 13) 단계 정의·물량
// ════════════════════════════════════════════════════════════
{
  eq('단계 — S0~S9 열 개', STEPS.length, 10)
  eq('단계 — 첫 단계는 preflight', STEPS[0][0], 'preflight')
  eq('단계 — 마지막 단계는 digest', STEPS[STEPS.length - 1][0], 'digest')
  eq('단계 — step_key 가 중복되지 않는다', new Set(STEPS.map((s) => s[0])).size, STEPS.length)
  eq('단계 — commit_cases 다음이 queue_resolve (claim 한 큐를 닫는다)',
    STEPS[STEPS.findIndex((s) => s[0] === 'commit_cases') + 1][0], 'queue_resolve')
  check('큐 — --resolve 가 --notes 없이 기존 notes 를 덮지 않는다',
    /opt\('notes'\) !== null\) patch\.notes/.test(
      fs.readFileSync(path.join(process.cwd(), 'scripts/research-queue.mjs'), 'utf-8')))
  eq('물량 — 기본 조사 목표', RESEARCH_TARGET, Number(process.env.CMO_RESEARCH_TARGET ?? 2))
  eq('물량 — 기본 초안 목표', DRAFT_TARGET, Number(process.env.CMO_DRAFT_TARGET ?? 2))
  eq('실행 키 — 날짜와 트리거로 결정된다', runKeyFor('2026-09-08', 'cron'), 'cmo-2026-09-08-cron')
  check('실행 키 — 크론과 수동이 서로 덮어쓰지 않는다',
    runKeyFor('2026-09-08', 'cron') !== runKeyFor('2026-09-08', 'manual'))
}

// ════════════════════════════════════════════════════════════
// 14) 마이그레이션 파일 — 짝과 가역성
// ════════════════════════════════════════════════════════════
{
  const migs = ['20260908000001_agent_ops', '20260908000002_research_queue', '20260908000003_pmf_assessments']
  for (const m of migs) {
    const up = path.join(process.cwd(), 'supabase/migrations', `${m}.sql`)
    const down = path.join(process.cwd(), 'supabase/migrations', `${m}_rollback.sql`)
    check(`마이그 — ${m}.sql 존재`, fs.existsSync(up))
    check(`마이그 — ${m}_rollback.sql 존재 (가역)`, fs.existsSync(down))
    if (!fs.existsSync(up)) continue
    const src = fs.readFileSync(up, 'utf-8')
    check(`마이그 — ${m} 은 BEGIN/COMMIT 트랜잭션`, /BEGIN;/.test(src) && /COMMIT;/.test(src))
    check(`마이그 — ${m} 은 CREATE TABLE IF NOT EXISTS`, /CREATE TABLE IF NOT EXISTS/.test(src))
    check(`마이그 — ${m} 에 파괴적 구문이 없다`, !/DROP TABLE|DROP COLUMN|ALTER COLUMN .* TYPE/i.test(src))
    const dsrc = fs.readFileSync(down, 'utf-8')
    check(`마이그 — ${m} 롤백은 DROP ... IF EXISTS`, /DROP TABLE IF EXISTS/.test(dsrc))
  }
  const ops = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260908000001_agent_ops.sql'), 'utf-8')
  check('마이그 — blocked 에 blocker 를 요구하는 CHECK 가 있다',
    /agent_run_steps_blocked_needs_blocker/.test(ops))
  const pmf = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260908000003_pmf_assessments.sql'), 'utf-8')
  check('마이그 — quadrant 가 NOT NULL 이 아니다', !/quadrant\s+text\s+NOT NULL/.test(pmf))
  check('마이그 — not_run 이면 축이 비어야 하는 CHECK 가 있다', /pmf_assessments_not_run_is_empty/.test(pmf))
  // 컬럼 정의만 본다. "거부한 대안" 주석은 pmf_score 를 언급해야 하고, 그건 위반이 아니다.
  check('마이그 — pmf_score 단일 점수 컬럼이 없다', !/^\s*pmf_score\s+/m.test(pmf))
  const rq = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260908000002_research_queue.sql'), 'utf-8')
  check('마이그 — reason 어휘에 failure_quota 가 있다', /'failure_quota'/.test(rq))
}

// ════════════════════════════════════════════════════════════
// 15) 다이제스트 5헤딩 · 성과 실패 판정 · 스텝 종료코드 (AC-12, 부수관측 1·2)
// ════════════════════════════════════════════════════════════
{
  const REQUIRED = ['## TL;DR', '## 스코어보드', '## 병목 진단', '## 개선 방안', '## 다음 주 주목 지표']
  const baseState = { blocked: 0, failed: 0, counts: { new_drafts: 1, committed: 1, drafted: 2, staged: 2 }, steps: [] }

  // ── AC-12: 5헤딩은 무조건 전부 ──────────────────────────────
  const normal = buildDigest({ date: '2026-09-08', runKey: 'cmo-2026-09-08-cron', state: baseState, log: [] })
  for (const h of REQUIRED) check(`다이제스트 — 정상 실행에 "${h}" 헤딩`, normal.includes(`\n${h}\n`))

  const dry = buildDigest({ date: '2026-09-08', runKey: 'x', dryRun: true, state: baseState, log: [] })
  for (const h of REQUIRED) check(`다이제스트 — dry-run 에도 "${h}" 헤딩`, dry.includes(`\n${h}\n`))

  const stopped = buildDigest({ date: '2026-09-08', runKey: 'x', state: { ...baseState, counts: {} }, stopped: 'preflight', log: [] })
  for (const h of REQUIRED) check(`다이제스트 — preflight 중단에도 "${h}" 헤딩`, stopped.includes(`\n${h}\n`))

  // ── AC-12: 스코어보드 숫자는 state.counts 를 그대로 쓴다 (AC-5/9 SQL 과 정합) ──
  const rows = scoreboardRows(baseState)
  eq('스코어보드 — 조사 수 = state.counts.new_drafts', rows.find((r) => r[0].startsWith('조사'))[1], 1)
  eq('스코어보드 — 초안 수 = state.counts.drafted', rows.find((r) => r[0].startsWith('초안'))[1], 2)
  check('스코어보드 — 본문에 초안 2건이 그대로 찍힌다', /초안\(drafted\): 2건/.test(normal))
  check('스코어보드 — 추정하지 않는다 (staged 4 를 넣으면 4 가 나온다)',
    /스테이징\(staged\): 4건/.test(buildDigest({ date: 'd', runKey: 'x', state: { ...baseState, counts: { ...baseState.counts, staged: 4 } }, log: [] })))

  // ── 개선 방안: analyst 해설을 performance.md 에서 읽어 박는다 (스크립트가 저장) ──
  const perf = parsePerformance('# 성과 원자료\n\n## coverage\n```\n✅ AWARENESS 케이스 3곳 · 무브 5건\n```\n\n# 해설\n\n광고비 회수 주기를 봐야 한다.\n')
  const withNote = buildDigest({ date: 'd', runKey: 'x', state: baseState, log: [], perf })
  check('다이제스트 — 개선 방안에 analyst 해설이 삽입된다', withNote.includes('광고비 회수 주기를 봐야 한다.'))
  const noNote = buildDigest({ date: 'd', runKey: 'x', state: { ...baseState, perfNote: 'claude 없음' }, log: [] })
  check('다이제스트 — 해설이 없으면 "왜 없는지"를 적는다 ("갭 없음" 아님)',
    /해설을 생성하지 못했다 — claude 없음/.test(noNote))

  // ── 부수관측 1: score-predictions 는 0 만 정상, coverage 의 1 은 정상 분기 ──
  check('성과판정 — score exit 1 (파싱 에러) 은 실패', perfFailure(1, 0, 'd') !== null)
  check('성과판정 — score exit 2 (채점 불가) 도 실패', perfFailure(2, 0, 'd') !== null)
  check('성과판정 — score exit 0 + coverage 1 (선례 0개 = 음성) 은 실패 아님', perfFailure(0, 1, 'd') === null)
  check('성과판정 — coverage exit 2 (확인 불가) 는 실패', perfFailure(0, 2, 'd') !== null)
  eq('성과판정 — 정상은 null', perfFailure(0, 0, 'd'), null)

  // ── 부수관측 2: run.json.state.steps 에 스텝별 종료코드가 남는다 (AC-11) ──
  const st = { blocked: 0, failed: 0, counts: {}, steps: [] }
  recordStep(st, { key: 'stage', label: '스테이징', status: 'blocked', blocker: 'CG-1 미통과', detail: { exit: 4 } })
  recordStep(st, { key: 'digest', label: '다이제스트', status: 'ok', detail: {} })
  eq('스텝기록 — stage 의 종료코드 4 가 보존된다', st.steps.find((s) => s.key === 'stage').exit, 4)
  eq('스텝기록 — 종료코드가 없는 스텝은 null (0 으로 접지 않는다)', st.steps.find((s) => s.key === 'digest').exit, null)
  eq('스텝기록 — blocker 문구가 보존된다', st.steps.find((s) => s.key === 'stage').blocker, 'CG-1 미통과')
  check('스텝기록 — run.json 직렬화에 steps 가 포함된다',
    JSON.stringify({ runKey: 'x', date: 'd', dryRun: false, state: st }).includes('"exit":4'))
}

// ════════════════════════════════════════════════════════════
// 16) decision-log-entries.md — 엔트리 수 == "붙여넣기 대기: N건" (AC-13)
// ════════════════════════════════════════════════════════════
{
  const jobs = [
    { content_code: 'CS-20260908-01', case_slug: 'elf-beauty-awareness-engine', move_id: 'aaaa',
      decision_doc: 'drafts/threads/2026-09-08-elf.md',
      // 전례 인용으로 다른 날짜 LOG 코드가 앞에 섞여 있다 — 오늘 날짜 코드를 골라야 한다
      gate_note: 'G-4 예외(Casper LOG-20260907-05 전례) · CG-1 비대상 · LOG-20260908-01' },
    { content_code: 'CS-20260908-02', case_slug: 'blue-apron', move_id: 'bbbb',
      decision_doc: 'drafts/threads/2026-09-08-blue-apron.md', gate_note: 'X-3 만남 · LOG-20260908-02' },
  ]
  const md = buildDecisionLogEntries({ date: '2026-09-08', runKey: 'cmo-2026-09-08-cron', jobs })
  const entryCount = (md.match(/^## /gm) || []).length
  eq('decision-log — 엔트리 수 == staged job 수', entryCount, jobs.length)
  check('decision-log — 헤더에 건수가 박힌다', md.includes(`스테이징한 초안 ${jobs.length}건`))
  check('decision-log — gate_note 에서 LOG 코드를 뽑는다', /`LOG-20260908-01`/.test(md) && /`LOG-20260908-02`/.test(md))
  check('decision-log — 전례 인용의 옛 날짜 LOG(20260907-05)가 아니라 오늘 코드를 고른다',
    !/판정 로그: `LOG-20260907-05`/.test(md))
  check('decision-log — 각 엔트리에 판정 전문 경로', md.includes('drafts/threads/2026-09-08-elf.md'))

  // ★ AC-13 정합: DIGEST 의 "붙여넣기 대기: N" 와 같은 정본(staged 카운트)을 쓴다
  const st = { blocked: 0, failed: 0, counts: { staged: jobs.length }, steps: [] }
  const digest = buildDigest({ date: '2026-09-08', runKey: 'x', state: st, log: [] })
  const nInDigest = Number((digest.match(/붙여넣기 대기: (\d+)건/) || [])[1])
  eq('decision-log — DIGEST N 과 엔트리 수가 일치', nInDigest, entryCount)

  const empty = buildDecisionLogEntries({ date: '2026-09-08', runKey: 'x', jobs: [] })
  eq('decision-log — 0건이면 엔트리 0', (empty.match(/^## /gm) || []).length, 0)
  check('decision-log — 0건이면 그 사실을 적는다', empty.includes('스테이징한 초안 없음'))

  // ★ 같은 날 재실행이 이전 매니페스트를 물려받지 않게, stage 스텝이 0건일 때
  //   매니페스트를 `[]` 로 덮는다 (DIGEST N 과 decision-log 엔트리 수가 갈라지던 버그).
  const daily = fs.readFileSync(path.join(process.cwd(), 'scripts/cmo-daily.mjs'), 'utf-8')
  check('stage — 스테이징 0건이면 매니페스트를 [] 로 덮는다',
    /!stageFiles\.length[\s\S]{0,400}writeFileSync\(stageManifestPath, '\[\]/.test(daily))
}

// ════════════════════════════════════════════════════════════
// 17) 세 헤드리스 호출이 전부 --permission-mode 를 준다
//     (없으면 CI 에서 첫 도구 사용이 권한 프롬프트에 걸려 즉시 죽는다)
// ════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(path.join(process.cwd(), 'scripts/cmo-daily.mjs'), 'utf-8')
  // 인자 배열 안에 AGENT_TOOLS['...'] 의 `]` 가 있어 non-greedy `]` 로는 못 자른다.
  // 배열이 닫히고 옵션 객체가 오는 `], {` 까지를 한 호출로 본다.
  const calls = [...src.matchAll(/runClaude\(claudeBin,\s*\[([\s\S]*?)\]\s*,\s*\{/g)].map((m) => m[1])
  eq('헤드리스 — runClaude 호출 3개 (researcher·writer·analyst)', calls.length, 3)
  calls.forEach((body, i) => {
    check(`헤드리스 — ${i + 1}번째 runClaude 가 --permission-mode 를 준다`, /--permission-mode/.test(body))
    check(`헤드리스 — ${i + 1}번째 runClaude 가 --allowedTools 를 준다`, /--allowedTools/.test(body))
  })
}

// ════════════════════════════════════════════════════════════
// N) selectAngles — 2026-09-07~08 peloton 중복 재현 회귀
//
// 그때 일어난 일: 09-07 초안이 파일로만 남고(매니페스트조차 없이) content_items
// 에 안 들어갔다. 선택 로직이 content_items 만 보니 09-08 실행이 같은 무브를
// 다시 골랐고, 같은 케이스로 초안이 두 벌 나왔다.
// ════════════════════════════════════════════════════════════
{
  const approved = (slug, grade = 'A', lever = 'OPERATIONS', id = `${slug}-${lever}`) => ({
    id, lever, claim: 'c', evidence_grade: grade, outcome_direction: 'negative',
    review_status: 'approved',
    case_studies: { slug, brand_name: slug, bottleneck: 'AWARENESS', review_status: 'approved' },
  })
  const PELOTON = 'peloton-owned-manufacturing-exit'
  const moves = [approved(PELOTON), approved('oatly-capacity-overbuild')]

  // (1) 옛 상태의 재현 — 파일 신호를 안 주면 peloton 이 다시 뽑힌다.
  //     이게 09-08 에 실제로 일어난 일이다. 회귀 감시용 대조군이다.
  const old = selectAngles({ moves, usedSlugs: new Set(), n: 2 })
  check('앵글 — (대조군) 파일 신호가 없으면 peloton 을 다시 고른다',
    old.moves.some((m) => m.slug === PELOTON))

  // (2) 정확한 신호: stage.json 의 case_slug 가 있으면 거른다.
  const staged = selectAngles({
    moves, usedSlugs: new Set(),
    stagedSlugs: new Set([PELOTON]),
    draftFileNames: [`2026-09-08-${PELOTON}.stage.json`], n: 2,
  })
  check('앵글 — stage.json 의 case_slug 로 중복을 거른다',
    !staged.moves.some((m) => m.slug === PELOTON))
  eq('앵글 — 거른 뒤에도 다른 케이스는 남는다', staged.moves.length, 1)
  eq('앵글 — 정확히 걸렀으면 경고는 안 낸다', staged.warnings.length, 0)

  // (3) 09-07 의 실제 모양: 매니페스트가 **없는** 파일만 있다. 파일명은 슬러그의
  //     앞부분만 담는다(`-exit` 가 빠져 있다). 거르지는 않되 반드시 경고한다 —
  //     접두 일치로 걸러 버리면 멀쩡한 무브를 조용히 잃는다.
  const fuzzy = selectAngles({
    moves, usedSlugs: new Set(), stagedSlugs: new Set(),
    draftFileNames: ['2026-09-07-peloton-owned-manufacturing.body.txt'], n: 2,
  })
  check('앵글 — 매니페스트 없는 초안 파일은 거르지 않는다(조용한 유실 금지)',
    fuzzy.moves.some((m) => m.slug === PELOTON))
  eq('앵글 — 대신 경고를 낸다', fuzzy.warnings.length, 1)
  check('앵글 — 경고에 슬러그가 들어 있다', String(fuzzy.warnings[0]).includes(PELOTON))

  // (4) content_items 경로(기존 동작)는 그대로여야 한다.
  const dbUsed = selectAngles({ moves, usedSlugs: new Set([PELOTON]), n: 2 })
  check('앵글 — content_items.source_case 필터는 그대로 동작한다',
    !dbUsed.moves.some((m) => m.slug === PELOTON))

  // (5) 회귀: 승인·등급 필터가 살아 있어야 한다.
  const unapprovedCase = approved('zzz-unapproved-case')
  unapprovedCase.case_studies.review_status = 'draft'
  eq('앵글 — 케이스가 미승인이면 안 고른다',
    selectAngles({ moves: [unapprovedCase], n: 2 }).moves.length, 0)
  eq('앵글 — 등급 D 는 안 고른다',
    selectAngles({ moves: [approved('zzz-grade-d-case', 'D')], n: 2 }).moves.length, 0)
  eq('앵글 — 등급 높은 쪽이 먼저 온다',
    selectAngles({ moves: [approved('bbb-low-grade-case', 'C'), approved('aaa-high-grade-case', 'A')], n: 2 }).moves[0].grade, 'A')
  eq('앵글 — n 을 넘겨 고르지 않는다',
    selectAngles({ moves: [approved('ccc-one-case'), approved('ddd-two-case'), approved('eee-three-case')], n: 2 }).moves.length, 2)

  // (6) 짧은 슬러그는 접두 일치 경고를 내지 않는다(소음 방지).
  eq('앵글 — 12자 미만 슬러그는 흐릿한 경고 대상이 아니다',
    selectAngles({ moves: [approved('short-slug')], draftFileNames: ['2026-09-07-short-slug.body.txt'], n: 2 }).warnings.length, 0)
}


// ════════════════════════════════════════════════════════════
// 결과
// ════════════════════════════════════════════════════════════
console.log(`\n통과 ${passed} / 실패 ${failures.length}`)
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ CMO 데일리 루프 자체 검증 통과')
