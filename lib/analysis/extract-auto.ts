// 야간 자동 extract 의 **대상 선정**(순수함수). DB 조회는 호출부(scripts/extract-auto.mjs)가 한다.
//
// 남헌 2026-09-23 확정: "extract 야간 자동 실행 허용 — 신규 리뷰 100건 이상 프로젝트만,
// 일 $5 상한 안에서, Gemini 429 면 다음 날로" (reports/2026-09-23/data-velocity-plan.md §1 Q1).
// 그전까지 extract 는 사람이 `/analyze` 에서 눌러야만 돌았고, 그래서 입력 12,443건에
// 속성 40개였다. 비용 상한은 lib/analysis/budget.ts 가 이미 강제한다.
//
// 남헌 2026-09-23 추가 결정: **대상은 SaaS 프로젝트 우선**이다. 신규 많은 순만 보면 상위 3건이
// 전부 소비재(SONY 3,272 · QCY 1,910 · 코웨이 1,349)라 일 $5 를 소비재에 태우게 된다.
// 피봇 방향이 SaaS 인데 추출 예산이 소비재로 나가는 것을 순서 하나로 막는다.
//
// 남헌 2026-09-23 Q4(a): **추출이 끝난 프로젝트도 다시 태운다.** 그전까지 후보는
// `status='collecting'` 뿐이라 extract 는 프로젝트당 평생 1회였다 — 어제 추출된 SaaS 3건에
// 그 뒤로 +602·+401건이 들어왔는데 야간 루프에서 영구히 빠져 있었다
// (reports/2026-09-23/voc-expansion-investigation.md §4-2). 재추출 주기는 새 조건을 만들지
// 않고 기존 `신규 ≥ EXTRACT_AUTO_MIN_NEW` 가 그대로 조절한다(신규 0건이면 대상이 아니다).
//
// ⚠️ 재추출은 `force` 로 들어가고 force 는 기존 aspects 를 교체한다. 사람이 확인한
//    (human_confirmed=true) 속성은 extract-run.ts 가 지우지 않고 남긴다 — 그 보호가 없으면
//    이 기능이 매일 밤 검수 결과를 지운다. 검수 **이후** 단계(reviewed/angled/done)는
//    extract-gate.REANALYZABLE 이 애초에 후보에서 뺀다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

// 제품 종류 축은 새로 만들지 않는다 — advisor.productKindOf(business_model) 한 벌이다.
import { productKindOf } from '../cases/advisor.ts'
// 어느 상태가 재추출 가능한지는 extract-gate 가 정본이다. 여기서 문자열을 다시 적지 않는다 —
// 두 벌이 되면 후보에는 들어오는데 claimExtraction 이 거부하는 상태가 생긴다.
import { AUTO_RETRY_MAX_ATTEMPTS, REANALYZABLE } from './extract-gate.ts'

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** 마지막 추출 이후 새로 들어온 입력이 이만큼 있어야 다시 돌린다. */
export const autoMinNew = () => num(process.env.EXTRACT_AUTO_MIN_NEW, 100)
/** 한 실행에서 돌릴 최대 프로젝트 수. */
export const autoMaxProjects = () => num(process.env.EXTRACT_AUTO_MAX_PROJECTS, 3)

export type AutoCandidate = {
  projectId: string
  /** 마지막 extract 이후 새로 들어온 analysis_inputs 수. null = 세지 못했다(확인 불가). */
  newInputs: number | null
  label?: string | null
  /** analysis_projects.business_model. 'SAAS' 면 순서에서 앞선다. 안 주면 physical 취급(기존 동작). */
  businessModel?: string | null
  /**
   * analysis_projects.status. 'extracted' 면 **재추출**이라 force 가 필요하고 순서에서 뒤로 간다.
   * 안 주면 첫 추출로 본다(기존 동작 — 후보가 collecting 뿐이던 시절과 같다).
   */
  status?: string | null
  /** analysis_projects.extract_attempts. status='failed' 일 때만 본다(재시도 상한). */
  attempts?: number | null
}

const isFailed = (c: { status?: string | null }) => (c.status ?? '').trim() === 'failed'

/**
 * "신규 입력"을 셀 기준 시각. null = 전체가 신규.
 *
 * failed 는 성공한 추출이 없는 것으로 보고 전체를 센다(첫 추출 취급). runExtraction 의 fail() 이
 * extract_finished_at 을 실패 시각으로 찍기 때문에, 그 값을 기준으로 삼으면 실패 이후 신규가
 * minNew 를 넘을 때까지(사실상 영영) 재시도가 안 된다.
 */
export function newInputsSince(p: { status?: string | null; extract_finished_at?: string | null }): string | null {
  return isFailed(p) ? null : (p.extract_finished_at ?? null)
}

/**
 * 이 후보를 돌리려면 `claimExtraction(..., force)` 가 필요한가.
 * 판단 기준을 호출부에 복사하지 않기 위해 여기 한 벌만 둔다.
 */
export function needsForce(c: { status?: string | null }): boolean {
  return REANALYZABLE.includes((c.status ?? '').trim())
}

/** SaaS 가 0, 나머지·미기재가 1. 미기재를 SaaS 로 올리지 않는다 — 대부분 NULL 이라 순서가 무의미해진다. */
const saasRank = (c: { businessModel?: string | null }): number =>
  productKindOf(c.businessModel) === 'software' ? 0 : 1

/**
 * 첫 추출이 0, 재추출이 1.
 *
 * 속성이 **0개**인 프로젝트를 채우는 것이, 이미 5개 있는 프로젝트를 갱신하는 것보다 먼저다.
 * 이 축이 없으면 HN 이 주 소스인 재추출 후보(신규가 하루 수백 건 늘어난다)가 매일 밤 상한을
 * 다 먹고, 한 번도 추출 안 된 프로젝트가 영원히 순서를 못 받는다.
 */
const firstRunRank = (c: { status?: string | null }): number => (needsForce(c) ? 1 : 0)

/**
 * 야간 배치의 프로젝트 우선순위:
 * **SaaS 먼저 → 첫 추출 먼저 → 신규(또는 미판정) 많은 순 → projectId**.
 * extract 와 관련성 판정이 같은 순서를 쓴다(scripts/extract-auto.mjs · relevance-judge-auto.mjs).
 * 두 벌이 되면 어느 날 한쪽만 소비재를 먼저 태운다.
 *
 * status 를 안 주는 호출부(relevance-judge-auto.mjs 는 collecting 만 본다)에서는
 * firstRunRank 가 전부 0 이라 기존 순서와 같다.
 */
export function compareAutoPriority(
  a: { projectId: string; newInputs: number | null; businessModel?: string | null; status?: string | null },
  b: { projectId: string; newInputs: number | null; businessModel?: string | null; status?: string | null },
): number {
  return (
    saasRank(a) - saasRank(b) ||
    firstRunRank(a) - firstRunRank(b) ||
    (b.newInputs ?? 0) - (a.newInputs ?? 0) ||
    (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0)
  )
}

export type AutoPick = {
  /** 이번 실행에서 돌릴 것. 신규 많은 순. */
  targets: AutoCandidate[]
  /** 기준(minNew)을 넘긴 전체 수. */
  eligible: number
  /** 상한에 걸려 이번에 못 돈 수 — "대상 0"과 "상한 도달"을 가른다(§7.2). */
  remaining: number
  /** 신규가 기준에 못 미쳐 제외된 수. */
  belowMin: number
  /** 신규 수를 세지 못한 수. 0 으로 접지 않는다(§7.1). */
  unknown: number
  /** failed 인데 시도 수가 AUTO_RETRY_MAX_ATTEMPTS 이상이라 자동 재시도에서 뺀 수. 사람이 봐야 한다. */
  retryExhausted: number
}

/**
 * 기준(minNew)을 넘긴 것 중 **SaaS 우선 → 첫 추출 우선 → 신규 많은 순 → projectId** 로
 * 상한까지 고른다(결정적).
 * `newInputs === null`(조회 실패)은 대상에도 제외에도 넣지 않고 따로 센다 —
 * "새 리뷰가 없다"와 "세지 못했다"는 다른 사건이고, 후자는 사람이 봐야 한다.
 */
export function pickAutoTargets(
  candidates: readonly AutoCandidate[],
  opts: { minNew?: number; max?: number } = {},
): AutoPick {
  const minNew = opts.minNew ?? autoMinNew()
  const max = opts.max ?? autoMaxProjects()

  // failed 는 시도 상한 안에서만 다시 탄다. 영구 오류가 매일 밤 쿼터를 태우지 않게 하는 자리다.
  const retryOver = (c: AutoCandidate) => isFailed(c) && (c.attempts ?? 0) >= AUTO_RETRY_MAX_ATTEMPTS
  const retryExhausted = candidates.filter(retryOver).length
  const live = candidates.filter(c => !retryOver(c))

  const unknown = live.filter(c => c.newInputs === null).length
  const known = live.filter(c => c.newInputs !== null)
  const eligibleList = known.filter(c => (c.newInputs as number) >= minNew).sort(compareAutoPriority)

  const targets = eligibleList.slice(0, Math.max(0, max))
  return {
    targets,
    eligible: eligibleList.length,
    remaining: eligibleList.length - targets.length,
    belowMin: known.length - eligibleList.length,
    unknown,
    retryExhausted,
  }
}

/**
 * 스케줄 크론 → 슬롯 이름. yml 의 `- cron:` 줄과 1:1 이다(reports/2026-09-28/extract-adaptive-frequency-design.md §3.1).
 * 세 슬롯(KST 03:33 · 12:33 · 18:33)은 같은 KST 날짜에 떨어지므로 run_key 에 슬롯이 없으면 뒤 실행이 앞 행을 덮는다(F3).
 */
export const EXTRACT_SLOTS: Readonly<Record<string, string>> = { '33 18 * * *': 's1', '33 3 * * *': 's2', '33 9 * * *': 's3' }

// ── 적응형 슬롯 게이트 (남헌 2026-09-28 D1~D8 확정, 설계 §3·§4) ────────────
// 매 슬롯이 먼저 백로그를 재고, 그 슬롯의 문턱보다 작으면 이유를 남기고 쉰다. 상태는 agent_runs 에서 읽는다.

/** 히스테리시스 문턱(Bw 기준). 직전 같은 슬롯이 돌았으면 OFF, 아니면 ON. s1·수동은 B ≥ 1(D2: 하루 최소 1회). */
export const SLOT_THRESHOLDS: Readonly<Record<string, { on: number; off: number }>> = {
  s2: { on: 5, off: 2 },
  s3: { on: 12, off: 6 },
}
/**
 * 한도 정지 뒤 리셋 시각을 못 읽었을 때 쉬는 시간(D6 폴백). 남헌 v30 §5(2026-10-07): 5시간 → **4시간**.
 * T2 재시도 슬롯(session-guard.ts relevanceRetryDecision)도 같은 값을 쓴다.
 */
export const QUOTA_COOLDOWN_MS = 4 * 60 * 60 * 1000
/**
 * 실제로 돈 실행이 이만큼 연속 **한도** blocked 면 ::error:: + exit 1(§4.1) — 원래 1회 + 재시도 2회(남헌 v30 §5 "최대 2회").
 * exit 1 은 cron-watchdog 가 다음 감시에서 Notion 일일 상태 로그로 올린다(새 시크릿 없이 기존 경로 재사용).
 * 이 수에 닿은 뒤로 추가 슬롯(s2·s3)은 쉬고, s1(하루 1회)·수동만 한도가 풀렸는지 확인한다(decideSlot).
 */
export const BLOCKED_ALARM_STREAK = 3

/**
 * 이 run 이 구독 한도 소진(quota)으로 멈췄나. 세션 상한(session_cap)·주간 스위치(weekly_stop)로 멈춘 blocked 는 아니다 —
 * 그건 쿨다운·연속 경보를 걸지 않는다. stop_reason 이 없는 옛 blocked 행은 한도로 본다(그때는 그것뿐이었다).
 */
export function isQuotaBlocked(r: { status: string; summary?: Record<string, unknown> | null }): boolean {
  return r.status === 'blocked' && (r.summary?.stop_reason ?? 'quota') === 'quota'
}

/** 하루(KST) 처리 상한 — done + failed 합(D4). 3일 실측 뒤 리포 변수로 조정. */
export const autoDailyMax = () => num(process.env.EXTRACT_AUTO_DAILY_MAX, 24)

/**
 * 이 실행이 어느 슬롯인가. schedule 은 크론 표에서, 수동은 입력 slot(s1/s2/s3 — dry_run 으로 게이트만 보려고)이 있으면 그것, 없으면 'm'.
 * 표에 없는 크론은 throw(extractRunKey 와 같은 이유).
 */
export function resolveSlot(env: { eventName?: string; slotCron?: string; slotInput?: string }): string {
  if (env.eventName === 'schedule') {
    const slot = EXTRACT_SLOTS[(env.slotCron ?? '').trim()]
    if (!slot) throw new Error(`슬롯 표에 없는 크론 '${env.slotCron ?? ''}' — nightly-extract.yml 과 EXTRACT_SLOTS 를 맞춰라`)
    return slot
  }
  const input = (env.slotInput ?? '').trim()
  return Object.values(EXTRACT_SLOTS).includes(input) ? input : 'm'
}

export type Backlog = { B: number; S: number; Bw: number }

/**
 * 백로그 지표(설계 §1). `full` 은 pickAutoTargets(c, { max: Infinity }) 결과 — targets 가 곧 eligible 전체다.
 * 가중치: SaaS 2 · 비SaaS 재추출 0.5(D5 — 소비재 재추출이 하루 200~400건씩 들어와 추가 슬롯을 상시 켜던 것) · 나머지 1.
 * unknown·retryExhausted 는 B 밖이다(§7.1 — 모르는 것을 0 도 1 도 아닌 것으로 둔다).
 */
export function backlogOf(full: AutoPick): Backlog {
  let S = 0
  let Bw = 0
  for (const c of full.targets) {
    const saas = productKindOf(c.businessModel) === 'software'
    if (saas) S += 1
    Bw += saas ? 2 : needsForce(c) ? 0.5 : 1
  }
  return { B: full.targets.length, S, Bw }
}

export type AgentRunRow = {
  run_key: string
  status: string
  summary?: Record<string, unknown> | null
  started_at?: string | null
  finished_at?: string | null
}

export type SlotState = {
  /** 이 슬롯의 가장 최근 실행이 일을 했나. 행이 없으면 false(ON 문턱). */
  prevRan: boolean
  /** 오늘(KST) extract-auto 실행들의 done + failed 합. */
  doneToday: number
  /** 가장 최근 blocked 실행의 쿨다운 종료 시각(ISO). 없으면 null. */
  cooldownUntil: string | null
  /** cooldownUntil 이 CLI 리셋 시각에서 왔나(false = 5시간 폴백). */
  cooldownFromReset: boolean
  /** 실제로 돈 실행(쉼·진행 중 제외) 중 최근부터 연속 blocked 수. */
  consecutiveBlocked: number
}

const numOr0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const ranRow = (r: AgentRunRow) => r.summary?.decision !== 'skip' && r.status !== 'running'

/**
 * agent_runs 행(최근 며칠, run_key LIKE 'extract-auto-%') → 슬롯 상태. 순수함수.
 * 쉼 행(summary.decision='skip')은 "일한 실행"이 아니다 — 연속 blocked·prevRan 에서 뺀다.
 * decision 필드가 없는 옛 행(게이트 이전)은 돈 것으로 본다 — 그때는 매번 돌았다.
 */
export function slotStateOf(rows: readonly AgentRunRow[], opts: { today: string; slot: string }): SlotState {
  const desc = [...rows].sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))
  const todayPrefix = `extract-auto-${opts.today}`
  const doneToday = desc
    .filter(r => r.run_key === todayPrefix || r.run_key.startsWith(`${todayPrefix}-`))
    .reduce((s, r) => s + numOr0(r.summary?.done) + numOr0(r.summary?.failed), 0)

  const same = desc.find(r => r.run_key.endsWith(`-${opts.slot}`))
  const prevRan = same ? same.summary?.decision !== 'skip' : false

  let cooldownUntil: string | null = null
  let cooldownFromReset = false
  const lastBlocked = desc.find(isQuotaBlocked)
  if (lastBlocked) {
    const reset = lastBlocked.summary?.quota_reset_at
    const resetMs = typeof reset === 'string' ? Date.parse(reset) : NaN
    if (Number.isFinite(resetMs)) {
      cooldownUntil = new Date(resetMs).toISOString()
      cooldownFromReset = true
    } else {
      const at = Date.parse(lastBlocked.finished_at ?? lastBlocked.started_at ?? '')
      // 시각을 못 읽은 blocked 는 "쿨다운 없음"으로 접지 않는다 — 지금부터 5시간으로 본다(보수적).
      if (Number.isFinite(at)) cooldownUntil = new Date(at + QUOTA_COOLDOWN_MS).toISOString()
      else cooldownUntil = 'unknown'
    }
  }

  let consecutiveBlocked = 0
  for (const r of desc.filter(ranRow)) {
    if (!isQuotaBlocked(r)) break
    consecutiveBlocked += 1
  }
  return { prevRan, doneToday, cooldownUntil, cooldownFromReset, consecutiveBlocked }
}

export type SlotDecision = {
  run: boolean
  reason: string
  /** 이번 실행의 프로젝트 상한. run=false 면 0. */
  max: number
  threshold: number | null
  /** true 면 ::warning::(쿨다운·확인 불가), false 면 ::notice::(평범한 쉼). */
  warn: boolean
}

/**
 * 슬롯 게이트(순수함수). 순서: 상태 확인 불가 → 한도 쿨다운 → 하루 상한 → 문턱.
 * state=null = agent_runs 를 못 읽었다: s2·s3 는 쉰다(모른 채 구독 풀을 태우지 않는다), s1·수동은 진행(§4.1).
 * 수동(m)은 문턱을 건너뛰되(대상 1건 이상이면 돈다) 쿨다운·하루 상한은 지킨다(§3.1).
 */
export function decideSlot(i: {
  slot: string
  backlog: Backlog
  state: SlotState | null
  dailyMax: number
  slotMax: number
  now: Date
}): SlotDecision {
  const { slot, backlog, state } = i
  const skip = (reason: string, warn = false, threshold: number | null = null): SlotDecision => ({ run: false, reason, max: 0, threshold, warn })
  const extra = slot in SLOT_THRESHOLDS

  if (!state && extra) return skip(`실행 이력(agent_runs) 확인 불가 — 추가 슬롯 ${slot} 은 쉰다`, true)

  if (state?.cooldownUntil) {
    const until = Date.parse(state.cooldownUntil)
    if (!Number.isFinite(until) || i.now.getTime() < until) {
      const src = state.cooldownFromReset ? 'CLI 리셋 시각' : `blocked 뒤 ${QUOTA_COOLDOWN_MS / 3600000}시간`
      return skip(`한도 쿨다운 — ${Number.isFinite(until) ? `~${state.cooldownUntil} 까지(${src})` : 'blocked 시각 확인 불가'}`, true)
    }
  }
  // v30 §5 "재시도 최대 2회": 원래 1회 + 재시도 2회가 전부 한도면 추가 슬롯은 쉰다. s1·수동만 하루 1번 풀렸는지 본다.
  if (extra && (state?.consecutiveBlocked ?? 0) >= BLOCKED_ALARM_STREAK) {
    return skip(`한도 재시도 ${BLOCKED_ALARM_STREAK - 1}회 소진(연속 blocked ${state?.consecutiveBlocked}) — 추가 슬롯 ${slot} 은 쉰다, s1 이 하루 1번 확인`, true)
  }

  let max = i.slotMax
  if (state) {
    const left = i.dailyMax - state.doneToday
    if (left <= 0) return skip(`하루 상한 도달 — 오늘 처리 ${state.doneToday}/${i.dailyMax}`)
    max = Math.min(max, left)
  }

  if (!extra) {
    if (backlog.B < 1) return skip('대상 0건', false, 1)
    return { run: true, reason: `${slot === 'm' ? '수동' : '기본 슬롯'} — 대상 ${backlog.B}건`, max, threshold: 1, warn: false }
  }

  const t = SLOT_THRESHOLDS[slot]
  const prevRan = state?.prevRan ?? false
  const threshold = prevRan ? t.off : t.on
  const which = prevRan ? `OFF ${t.off}(직전 ${slot} 실행함)` : `ON ${t.on}(직전 ${slot} 쉼/없음)`
  if (backlog.Bw < threshold) return skip(`Bw ${backlog.Bw} < ${which}`, false, threshold)
  return { run: true, reason: `Bw ${backlog.Bw} ≥ ${which}`, max, threshold, warn: false }
}

/** 이 실행이 끝난 뒤 연속 blocked 경보를 올릴까(§4.1). thisStatus: 'skip' | run status. */
export function blockedAlarm(priorStreak: number, thisStatus: string): boolean {
  if (thisStatus === 'skip') return priorStreak >= BLOCKED_ALARM_STREAK
  return thisStatus === 'blocked' && priorStreak + 1 >= BLOCKED_ALARM_STREAK
}

/**
 * claude CLI 한도 오류 문구 → 리셋 시각(ISO). 못 읽으면 null — 호출부는 5시간으로 떨어진다(D6).
 * 없는 값을 "지금 리셋됨"으로 읽지 않는다(§7.1): now 이전이거나 8일 넘게 뒤면 버린다.
 * 알아보는 형태 두 가지(CLI 버전마다 다르다):
 *   `Claude AI usage limit reached|1727467200`            (epoch 초)
 *   `... resets 3pm (Asia/Seoul)` · `resets 3:30am (UTC)`   (그 시간대의 다음 해당 시각)
 * 날짜가 붙은 주간 한도 문구(`resets Oct 3, 9am`)는 일부러 안 읽는다 — 5시간 폴백이 매 슬롯 1건씩만 두드린다.
 */
export function parseQuotaResetAt(msg: string, now: Date): string | null {
  const sane = (ms: number) => (ms > now.getTime() && ms <= now.getTime() + 8 * 86_400_000 ? new Date(ms).toISOString() : null)
  const epoch = /limit reached\|(\d{10})\b/i.exec(msg)
  if (epoch) return sane(Number(epoch[1]) * 1000)

  const m = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([A-Za-z_]+(?:\/[A-Za-z_+-]+)*)\)/i.exec(msg)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'pm') h += 12
  const min = Number(m[2] ?? 0)
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: m[4], year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset',
    }).formatToParts(now)
  } catch {
    return null // 모르는 시간대
  }
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const off = /GMT([+-])(\d{2}):(\d{2})/.exec(get('timeZoneName'))
  const offMs = off ? (off[1] === '-' ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3])) * 60_000 : 0 // 'GMT' 단독 = UTC
  // ponytail: 오늘의 오프셋 하나로 계산 — 리셋 직전에 서머타임이 바뀌면 1시간 어긋난다. 쿨다운이라 허용.
  let at = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), h, min) - offMs
  if (at <= now.getTime()) at += 86_400_000
  return sane(at)
}

/**
 * agent_runs.run_key — `extract-auto-<KST날짜>-<s1|s2|s3|m<run_id>|local>`.
 * 표에 없는 크론이면 throw — yml 과 코드가 갈라진 것을 조용히 s1 로 접지 않는다(§7.1).
 */
export function extractRunKey(
  date: string,
  env: { eventName?: string; slotCron?: string; runId?: string },
): string {
  // 수동 실행은 입력 slot 과 무관하게 m<run_id> — 게이트 시험(dry_run·slot=s2)이 진짜 s2 행을 덮지 않게.
  if (env.eventName === 'schedule') return `extract-auto-${date}-${resolveSlot(env)}`
  return `extract-auto-${date}-${env.runId ? `m${env.runId}` : 'local'}`
}

/** 로그 한 줄 — "대상 0"과 "상한 도달, 남은 k건"을 말로 구분한다(§7.2). */
export function describePick(pick: AutoPick, minNew: number, max: number): string {
  const head =
    pick.eligible === 0
      ? `대상 0건 (신규 ${minNew}건 이상인 프로젝트가 없다)`
      : pick.remaining > 0
        ? `대상 ${pick.eligible}건 중 ${pick.targets.length}건 실행 — 실행 상한 ${max}건 도달, 남은 대상 ${pick.remaining}건은 다음 실행`
        : `대상 ${pick.eligible}건 전부 실행`
  const reruns = pick.targets.filter(needsForce).length
  const retries = pick.targets.filter(isFailed).length
  const tail = [
    reruns > 0 ? `그중 재추출(force) ${reruns}건` : null,
    retries > 0 ? `그중 실패 재시도 ${retries}건` : null,
    pick.belowMin > 0 ? `신규 부족 제외 ${pick.belowMin}건` : null,
    pick.unknown > 0 ? `⚠️ 신규 수 확인 불가 ${pick.unknown}건` : null,
    pick.retryExhausted > 0 ? `⚠️ 재시도 상한(${AUTO_RETRY_MAX_ATTEMPTS}회) 도달 제외 ${pick.retryExhausted}건` : null,
  ].filter(Boolean)
  return tail.length ? `${head} · ${tail.join(' · ')}` : head
}
