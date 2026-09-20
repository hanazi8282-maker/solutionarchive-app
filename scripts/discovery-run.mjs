#!/usr/bin/env node
// 자율 VOC 발굴 루프 — 후보를 LLM 이 내고, 채택은 **실측이 정한다.**
//
//   [1] 축 선택(코드)      physical / saas 를 번갈아
//   [2] 후보 제안(claude -p) 이름·카테고리·홈페이지·이유만. 근거는 안 믿는다
//   [3] 게이트(코드)        이미 아는 이름 / 포화된 카테고리는 프로브 전에 기각
//   [4] 프로브(네트워크)    HN nbHits · 다나와 리뷰수. **이 숫자가 채택을 정한다**
//   [5] 적재(DB)            통과분만. --dry 면 여기까지 오지 않는다
//
// ⚠️ **LLM 이 "리뷰 많아요" 라고 한 말은 근거가 아니다.** 이 루프의 존재 이유가
//    그거다. 사람이 하던 "이 상품 VOC 있나 검색해 보기"를 코드가 대신한다.
//
// ⚠️ `--dry` 는 **Supabase 모듈을 import 조차 하지 않는다.** 플래그 검사로
//    "쓰기만 건너뛰는" 방식은 언젠가 한 줄이 새어 나간다. 클라이언트가 아예
//    존재하지 않으면 샐 곳이 없다. (AC-14)
//
// ⚠️ 다나와 Crawl-delay: 10 (2026-09-17 robots 재실측). 요청 사이에 그만큼
//    잔다. 잠든 사실과 실제 간격을 로그에 찍는다 — 안 그러면 "지켰다"는 주장을
//    사람이 확인할 방법이 없다.
//
// 사용법:
//   node scripts/discovery-run.mjs --dry              # 후보 제안 + 프로브, DB 쓰기 0건
//   node scripts/discovery-run.mjs                    # 적재까지
//   node scripts/discovery-run.mjs --dry --names=a,b  # LLM 건너뛰고 후보를 직접 준다
//                                                     # (프로브 경로만 볼 때. --kind 로 축 지정)
//
// env:
//   DISCOVERY_TARGET        하루 후보 수 (기본 2) — 비용 가드는 이 횟수다
//   DISCOVERY_MIN_VOC_HITS  채택 최소 VOC 건수 (기본 30)
//   DISCOVERY_MAX_VOC_HITS  채택 최대 VOC 건수 (기본 500) — 초대형 브랜드를 거른다
//   DISCOVERY_KIND          축 고정(physical|saas). 안 주면 이력에서 고른다

import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { resolveClaudeBinary, runClaude } from '../lib/insight/claude-cli.ts'
import {
  ACTIVE_KINDS,
  MAX_VOC_HITS,
  MIN_VOC_HITS,
  judge,
  nameKey,
  nextKind,
  screen,
} from '../lib/discovery/candidate.ts'
import { DANAWA_CRAWL_DELAY_MS, probePhysical, probeSaas } from '../lib/discovery/probe.ts'
import { RobotsCache } from '../lib/review/runner.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const TARGET = Number(process.env.DISCOVERY_TARGET ?? 2)
const MIN_HITS = Number(process.env.DISCOVERY_MIN_VOC_HITS ?? MIN_VOC_HITS)
const MAX_HITS = Number(process.env.DISCOVERY_MAX_VOC_HITS ?? MAX_VOC_HITS)

/** 프로브가 쓰는 소스 키. review_sources.key 와 철자가 같아야 한다(FK). */
const PROBE_SOURCE = { physical: 'danawa', saas: 'hackernews' }

const started = Date.now()
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)

// ── 네트워크 포트 ────────────────────────────────────────────────
// lib/review/runner.ts 와 같은 FetchOutcome 을 돌려준다. 던지지 않는다 —
// 요청 실패는 예외가 아니라 **판정 입력**이다(unverified).
const PRODUCT_TOKEN = 'solutionarchive-discovery'
const USER_AGENT = `${PRODUCT_TOKEN}/0.1 (+https://github.com/hanazi8282-maker/solutionarchive-app)`

/**
 * robots 판정을 **건너뛰는** 호스트. 문서화된 공개 API 만 넣는다.
 *   - hn.algolia.com: HN 공식 검색 API. robots 가 아니라 API 약관이 근거다.
 * 여기 없는 호스트(= 다나와 검색)는 전부 robots 를 먼저 읽고, 못 읽으면 요청하지 않는다.
 */
export const ROBOTS_EXEMPT_HOSTS = new Set(['hn.algolia.com'])

let lastDanawaAt = 0
let requestCount = 0

/** 실제 네트워크. robots 를 보지 않는다 — 판정은 아래 gatedFetch 가 한다. */
async function rawFetchText(url) {
  requestCount++
  log(`  → GET ${url}`)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
    const body = await res.text()
    log(`  ← HTTP ${res.status} ${body.length}B ${Date.now() - t0}ms`)
    // finalUrl: robots 캐시가 리다이렉트된 origin 을 키로 쓴다(runner.ts FetchOutcome 주석).
    return { status: res.status, body, finalUrl: res.url }
  } catch (e) {
    log(`  ← 요청 실패 ${e.message} ${Date.now() - t0}ms`)
    return { status: null, body: '', error: e.message }
  }
}

/**
 * robots 를 먼저 묻고 허용일 때만 요청하는 fetch 를 만든다 (감사 2026-09-19 치명 1-1).
 *
 * ⚠️ 2026-09-20 이전에는 `search.danawa.com/dsearch.php` 를 손으로 잰 Crawl-delay 상수만
 *    지키고 바로 GET 했다. 리뷰 수집 러너(`lib/review/runner.ts`)가 fail-closed 로 막는 바로
 *    그 규칙을 발굴 엔진이 우회한 것이다. 이제 같은 `RobotsCache` 판정을 거친다:
 *    - allowed     → 요청한다. robots 가 선언한 Crawl-delay 와 우리 상수 중 **긴 쪽**을 지킨다.
 *    - disallowed  → 요청하지 않는다. `{ status: null }` 을 돌려 프로브가 unverified 를 내게 한다.
 *    - unverified  → 요청하지 않는다(robots 404/5xx/네트워크 실패/그룹 없음 전부). 표식(proceedHosts)은
 *                    발굴 엔진에 **없다** — 사람이 실측 근거를 달 자리가 없기 때문이다.
 *    `ROBOTS_EXEMPT_HOSTS` 만 판정 없이 지나간다.
 *
 * 순수 함수로 뺀 이유: 셀프테스트가 가짜 rawFetch 로 "robots 를 못 읽으면 검색 GET 이 0건" 을 고정한다.
 */
export function gatedFetch({ rawFetch, gate, log: emit = () => {}, sleep: wait = sleep, now = Date.now }) {
  let lastAt = null
  return async function fetchText(url) {
    const host = new URL(url).hostname.toLowerCase()
    if (ROBOTS_EXEMPT_HOSTS.has(host)) return rawFetch(url)

    const d = await gate.decide(url)
    if (d.state !== 'allowed') {
      emit(`  ⛔ robots ${d.state} — ${d.reason} → 요청하지 않는다 (${url})`)
      return { status: null, body: '', error: `robots ${d.state} — ${d.reason}` }
    }

    // Crawl-delay: robots 선언값과 손으로 잰 상수 중 긴 쪽. 선언이 줄어도 우리 상수 아래로는 안 내려간다.
    const delayMs = Math.max(DANAWA_CRAWL_DELAY_MS, d.crawlDelayMs ?? 0)
    const gap = now() - lastAt
    if (lastAt !== null && gap < delayMs) {
      const waitMs = delayMs - gap
      emit(`  ⏳ Crawl-delay 대기 ${waitMs}ms (직전 요청과 ${gap}ms, robots ${d.crawlDelayMs ?? 0}ms)`)
      await wait(waitMs)
    }
    lastAt = now()
    return rawFetch(url)
  }
}

// 실행 시에만 조립한다 — import 만으로는 아무 것도 만들지 않는다(셀프테스트가 이 파일을 import 한다).
const fetchText = gatedFetch({
  rawFetch: rawFetchText,
  gate: new RobotsCache({ fetchText: rawFetchText }, [], PRODUCT_TOKEN),
  log,
})
void lastDanawaAt

// ── [1] 기존 상태 ────────────────────────────────────────────────
//
// ⚠️ --dry 는 DB 를 읽지도 않는다. 읽기만 해도 클라이언트를 만들어야 하고,
//    그러면 "쓰기 없음"의 근거가 코드 구조가 아니라 주의력이 된다.
//    대신 게이트가 약해진다는 걸 로그에 명시한다 — 조용히 통과시키지 않는다.
async function loadKnown() {
  if (dryRun) {
    log('⚠️ --dry: DB 를 열지 않는다. 기존 이름·카테고리 목록이 없어 중복/포화 게이트가 무력하다.')
    return { names: new Set(), acceptedByCategory: new Map(), recentKinds: [], supabase: null }
  }

  const { createClient } = await import('../lib/supabase/server.ts')
  const supabase = await createClient()
  if (!supabase) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')

  const { data: cands, error: cErr } = await supabase
    .from('discovery_candidates')
    .select('kind, name, category_hint, verdict, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (cErr) throw new Error(`discovery_candidates 조회 실패: ${cErr.message}`)

  // 기존 프로젝트 이름도 "아는 이름"이다. 사람이 손으로 만든 프로젝트를
  // 발굴이 다시 만들면 같은 상품이 두 번 분석된다.
  const { data: projects, error: pErr } = await supabase
    .from('analysis_projects')
    .select('product_elevator_pitch, competitor_url')
    .limit(1000)
  if (pErr) throw new Error(`analysis_projects 조회 실패: ${pErr.message}`)

  const names = new Set()
  const acceptedByCategory = new Map()
  for (const c of cands ?? []) {
    names.add(nameKey(c.kind, c.name))
    if (c.verdict === 'accepted' && c.category_hint) {
      const key = c.category_hint.trim().toLowerCase()
      acceptedByCategory.set(key, (acceptedByCategory.get(key) ?? 0) + 1)
    }
  }
  for (const p of projects ?? []) {
    // 프로젝트에는 kind 가 없다. 양쪽 축으로 다 막는다.
    for (const k of ACTIVE_KINDS) names.add(nameKey(k, p.product_elevator_pitch ?? ''))
  }

  return {
    names,
    acceptedByCategory,
    recentKinds: (cands ?? []).map((c) => c.kind),
    supabase,
  }
}

// ── [2] 후보 제안 ────────────────────────────────────────────────
export function proposalPrompt(kind, count, known) {
  const kindWord = kind === 'saas' ? '소프트웨어·SaaS 제품' : '한국에서 온라인으로 파는 실물 소비재'
  const source = kind === 'saas' ? 'Hacker News 댓글' : '다나와 상품 리뷰'
  const knownNames = [...known.names].map((k) => k.split(':').slice(1).join(':')).filter(Boolean)
  const cats = [...known.acceptedByCategory.entries()].map(([c, n]) => `${c}(${n})`)

  return [
    `${kindWord} ${count}개를 후보로 제안하라. 고객 불만(VOC)을 분석할 대상을 찾는 중이다.`,
    '',
    '조건:',
    `- ${source} 에 실제 후기·토론이 **많이** 쌓였을 법한 것.`,
    '- 서로 다른 카테고리로. 같은 카테고리 안에서 고르지 마라.',
    knownNames.length ? `- 아래는 이미 다루는 것들이다. 겹치지 마라: ${knownNames.slice(0, 80).join(', ')}` : null,
    cats.length ? `- 이미 채택된 카테고리(더 뽑지 마라): ${cats.join(', ')}` : null,
    '',
    '⚠️ 리뷰 수를 추측해서 쓰지 마라. 실제 건수는 이 도구가 직접 검색해서 센다.',
    // 검색하지 말라고 못박는다. 안 그러면 모델이 첫 턴을 도구에 쓰고 답할 턴을
    // 날린다(2026-09-17 실측 — stop_reason=tool_use 로 두 번 죽었다).
    '⚠️ 검색하지 마라. 도구를 쓰지 말고 네가 아는 것만으로 바로 답하라. 확인은 이 도구가 한다.',
    kind === 'saas'
      ? '⚠️ name 은 Hacker News 에서 그대로 검색할 이름이다. 영문 제품명으로 써라.'
      : '⚠️ name 은 다나와에서 그대로 검색할 말이다. 한국어 상품/카테고리명으로 써라.',
    '',
    '출력은 JSON 배열 하나만. 다른 말 붙이지 마라:',
    '[{"name":"...","category_hint":"...","homepage_url":"https://...","why":"1~2줄"}]',
  ]
    // null 만 걷어낸다. 빈 문자열은 **일부러 넣은 빈 줄**이다.
    .filter((line) => line !== null)
    .join('\n')
}

/** ```json 펜스나 앞뒤 설명이 붙어도 배열만 건져 낸다. */
export function parseCandidates(text) {
  const s = String(text ?? '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start < 0 || end <= start) return { ok: false, error: 'JSON 배열을 못 찾았다' }
  try {
    const arr = JSON.parse(s.slice(start, end + 1))
    if (!Array.isArray(arr)) return { ok: false, error: '배열이 아니다' }
    const items = arr
      .filter((x) => x && typeof x.name === 'string' && x.name.trim())
      .map((x) => ({
        name: x.name.trim(),
        categoryHint: typeof x.category_hint === 'string' ? x.category_hint.trim() : null,
        homepageUrl: typeof x.homepage_url === 'string' ? x.homepage_url.trim() : null,
        why: typeof x.why === 'string' && x.why.trim() ? x.why.trim() : '(이유 미기재)',
      }))
    return { ok: true, items }
  } catch (e) {
    return { ok: false, error: `JSON 파싱 실패: ${e.message}` }
  }
}

async function propose(kind, count, known) {
  const manual = arg('names', null)
  if (manual) {
    // LLM 을 건너뛰는 경로. 프로브·적재를 사람이 지정한 이름으로 확인할 때 쓴다.
    log(`후보를 직접 받았다(--names): ${manual}`)
    return manual
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, categoryHint: null, homepageUrl: null, why: '(--names 로 직접 지정)' }))
  }

  // ⚠️ 자식 env 에는 CLAUDE_CODE_OAUTH_TOKEN 하나만 넘어간다(아래). 그게 없으면
  //    자식은 로그인 정보 없이 떠서 stderr 도 없이 exit 1 로 죽는다. 그때
  //    "LLM 이 이상한 답을 했다"로 오해하지 않게 먼저 말해 둔다.
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    log('⚠️ CLAUDE_CODE_OAUTH_TOKEN 이 없다. 자식 프로세스는 자격증명 없이 뜬다(로컬에서는 --names 를 써라).')
  }

  const bin = (await resolveClaudeBinary()).path
  const prompt = proposalPrompt(kind, count, known)
  const childEnvKeys = ['CLAUDE_CODE_OAUTH_TOKEN']

  // ⚠️ `--output-format json` 을 쓴다. `text` 는 이 리포에서 이 호출만 쓰던 형식이고,
  //    claude 가 시작 단계에서 죽으면 stdout·stderr 둘 다 비어 exit 1 만 남는다
  //    (2026-09-17 실측 — run 35181944240). json 봉투는 `is_error` 와 `result` 를
  //    실어 주므로 실패 이유가 드러난다. 매일 성공하는 두 호출자
  //    (`lib/insight/llm.ts`, `scripts/cmo-daily.mjs`)도 전부 json 이다.
  //
  // ⚠️ `--max-turns` 가 1 이면 안 된다. 2026-09-17 실측으로 두 번 확인했다
  //    (run 35182471112 · 35182684521): 봉투가 매번 `is_error:true`,
  //    `stop_reason:"tool_use"`, `num_turns:2` 를 돌려줬다. 모델이 "후기가 많을 법한
  //    제품"을 고르려고 **첫 턴에 도구를 집는다.** 그러면 답을 쓸 턴이 남지 않는다.
  //    `--allowedTools ''` 로 막아 보려 했지만 빈 값은 무시됐다(두 번째 실측).
  //    그래서 막는 대신 **끝까지 갈 턴을 준다.** 프롬프트로도 도구를 말린다(아래).
  //    채택 판정은 어차피 프로브가 하므로(docs/discovery-design.md) 모델이 도구를
  //    쓰든 안 쓰든 결과의 신뢰도는 달라지지 않는다 — 비용과 시간만 문제다.
  //
  // ⚠️ cwd 를 리포가 아니라 /tmp 로 둔다. repoRoot 를 주면 claude 가 CLAUDE.md 와
  //    리포 컨텍스트를 통째로 읽는다 — 캐시 생성 22,434 토큰, 실패 한 번에 $0.098.
  //    /tmp 로 옮기고 같은 실패가 $0.042 로 떨어졌다(실측). 이름 2개 받는 데 리포를
  //    읽힐 이유가 없다. 성공하는 lib/insight/llm.ts 도 cwd 를 주지 않는다.
  const args = ['-p', '--output-format', 'json', '--max-turns', '4']
  log(`후보 ${count}건 제안 요청 (kind=${kind}) — 프롬프트 ${Buffer.byteLength(prompt, 'utf8')}B / args: ${JSON.stringify(args)} / cwd=/tmp`)

  const r = await runClaude(bin, args, {
    // ⚠️ DB 자격증명을 자식에게 주지 않는다(CLAUDE.md §10.1). 이름만 받으면 된다.
    env: { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN },
    timeoutMs: 5 * 60_000,
    input: prompt,
  })

  // 실패했는데 왜 실패했는지 못 적으면 다음 사람이 같은 자리에서 또 막힌다(§7.1).
  // 값이 아니라 **키 이름만** 찍는다 — 토큰을 로그에 흘리지 않는다.
  if (r.exitCode !== 0) {
    log(`⚠️ claude exit ${r.exitCode}${r.timedOut ? ' (timeout)' : ''} / stderr ${r.stderr.length}B / stdout ${r.stdout.length}B / 넘긴 env 키: ${childEnvKeys.join(',')}`)
    if (r.stderr.trim()) log(`   stderr: ${r.stderr.slice(0, 500)}`)
    // 봉투가 읽히면 판정에 쓰이는 필드부터 따로 찍는다. stop_reason='tool_use' 는
    // "도구를 집었다가 턴 상한에 걸렸다"는 뜻이라 원문 500자에 묻히면 놓친다.
    try {
      const env = JSON.parse(r.stdout)
      if (env && typeof env === 'object') {
        log(`   봉투: is_error=${env.is_error} stop_reason=${env.stop_reason} num_turns=${env.num_turns} cost=$${env.total_cost_usd}`)
        if (env.result) log(`   result: ${String(env.result).slice(0, 300)}`)
      }
    } catch {
      if (r.stdout.trim()) log(`   stdout: ${r.stdout.slice(0, 500)}`)
    }
    if (!r.stderr.trim() && !r.stdout.trim()) {
      log('   둘 다 비었다 — claude 가 자격증명·설정 단계에서 떴다가 조용히 죽은 형태다.')
    }
    throw new Error(`후보 제안 실패: exit ${r.exitCode}${r.timedOut ? '(timeout)' : ''} ${r.stderr.slice(0, 300)}`)
  }

  // json 봉투를 벗긴다(`lib/insight/llm.ts` 와 같은 규약). 봉투가 아니면 원문 그대로 쓴다 —
  // parseCandidates 가 앞뒤 설명이 붙어도 배열만 건져 내므로 둘 다 통과한다.
  let payload = r.stdout
  try {
    const envelope = JSON.parse(r.stdout)
    if (envelope && typeof envelope === 'object') {
      if (envelope.is_error === true) {
        throw new Error(`claude 가 오류를 보고했다: ${String(envelope.result ?? '').slice(0, 300)}`)
      }
      if (typeof envelope.result === 'string') payload = envelope.result
    }
  } catch (e) {
    // 봉투가 아니었을 뿐이면 넘어간다. claude 가 보고한 오류는 그대로 올린다.
    if (e instanceof Error && e.message.startsWith('claude 가 오류를')) throw e
  }

  const parsed = parseCandidates(payload)
  if (!parsed.ok) {
    log(`⚠️ 응답 앞 300자: ${payload.slice(0, 300)}`)
    throw new Error(`후보 제안 응답을 못 읽었다: ${parsed.error}`)
  }
  return parsed.items.slice(0, count)
}

// ── [5] 적재 ─────────────────────────────────────────────────────
//
// ⚠️ **--dry 에서는 호출되지 않는다.** supabase 는 loadKnown 이 null 로 준다.
//    CLAUDE.md §10.1 허용 범위: discovery_candidates 전체 /
//    analysis_projects 신규 INSERT(status='collecting') 한정 /
//    review_targets(enabled=true 인 소스 한정). review_sources 는 건드리지 않는다.
async function persist(supabase, row) {
  const base = {
    kind: row.kind,
    name: row.name,
    category_hint: row.categoryHint,
    homepage_url: row.homepageUrl,
    why: row.why,
    probe_source_key: row.probeSourceKey ?? null,
    probe_ref: row.probe?.ref ?? null,
    probe_hits: row.probe?.hits ?? null,
    probe_at: row.probe ? new Date().toISOString() : null,
    probe_note: row.probe?.note ?? null,
    verdict: row.judgement.verdict,
    verdict_reason: row.judgement.reason,
  }

  if (row.judgement.verdict !== 'accepted') {
    const { error } = await supabase.from('discovery_candidates').insert(base)
    // 이름 UNIQUE 충돌(23505)은 오류가 아니라 이미 원하는 상태다.
    if (error && error.code !== '23505') throw new Error(`후보 기록 실패: ${error.message}`)
    return { projectId: null, targetId: null }
  }

  // 소스가 꺼져 있으면 타깃을 만들지 않는다. 만들어 두면 나중에 소스를 켜는
  // 순간 아무도 예상 못 한 타깃이 같이 돌기 시작한다(targets 라우트와 같은 규칙).
  const { data: source, error: sErr } = await supabase
    .from('review_sources')
    .select('key, enabled, disabled_reason')
    .eq('key', row.probeSourceKey)
    .maybeSingle()
  if (sErr) throw new Error(`소스 조회 실패: ${sErr.message}`)
  if (!source) throw new Error(`소스가 등록돼 있지 않다: ${row.probeSourceKey}`)
  if (!source.enabled) {
    const { error } = await supabase.from('discovery_candidates').insert({
      ...base,
      verdict: 'unverified',
      verdict_reason: `source_disabled: ${row.probeSourceKey} (${source.disabled_reason ?? '사유 미기록'})`,
    })
    if (error && error.code !== '23505') throw new Error(`후보 기록 실패: ${error.message}`)
    return { projectId: null, targetId: null }
  }

  const competitorUrl =
    row.kind === 'physical'
      ? `https://prod.danawa.com/info/?pcode=${row.probe.ref}`
      : (row.homepageUrl ?? `https://hn.algolia.com/?query=${encodeURIComponent(row.name)}`)

  const { data: project, error: pErr } = await supabase
    .from('analysis_projects')
    .insert({
      competitor_url: competitorUrl,
      product_elevator_pitch: row.name,
      purpose: 'product_fit',
      seller_own_guess: row.why,
      status: 'collecting',
      mode: 'forward',
    })
    .select('id')
    .single()
  if (pErr) throw new Error(`프로젝트 생성 실패: ${pErr.message}`)

  const productRef = row.kind === 'physical' ? row.probe.ref : `q:${row.name}`
  const { data: target, error: tErr } = await supabase
    .from('review_targets')
    .insert({
      project_id: project.id,
      source_key: row.probeSourceKey,
      product_ref: productRef,
      label: row.name,
      status: 'active',
      cursor: null,
    })
    .select('id')
    .single()
  if (tErr) throw new Error(`타깃 등록 실패: ${tErr.message}`)

  const { error } = await supabase
    .from('discovery_candidates')
    .insert({ ...base, project_id: project.id })
  if (error && error.code !== '23505') throw new Error(`후보 기록 실패: ${error.message}`)

  return { projectId: project.id, targetId: target.id }
}

// ── 본체 ─────────────────────────────────────────────────────────
async function main() {
  log(
    `발굴 루프 시작 — ${dryRun ? 'DRY RUN (DB 쓰기 0건)' : '적재 모드'} / 목표 ${TARGET}건 / ` +
      `채택 창 ${MIN_HITS}~${MAX_HITS} hits`,
  )

  const known = await loadKnown()
  // ⚠️ `??` 를 쓰면 안 된다. 워크플로가 `DISCOVERY_KIND: ${{ inputs.kind }}` 로 넘기는데,
  //    schedule 실행에는 inputs 가 없어 **빈 문자열**이 들어온다. `??` 는 null/undefined 만
  //    폴백하므로 `''` 이 그대로 통과해 "이번에 뽑을 수 없는 축이다: " 로 매번 죽는다
  //    (2026-09-17 실측 — 첫 크론 실행 전에 dry-run 으로 잡았다). 빈 값 = 미지정이다.
  const kind = arg('kind', process.env.DISCOVERY_KIND) || nextKind(known.recentKinds)
  if (!ACTIVE_KINDS.includes(kind)) {
    throw new Error(`이번에 뽑을 수 없는 축이다: ${kind} (가능: ${ACTIVE_KINDS.join(', ')})`)
  }
  log(`축: ${kind} (최근 이력 ${known.recentKinds.slice(0, 6).join(',') || '없음'})`)

  const candidates = await propose(kind, TARGET, known)
  log(`후보 ${candidates.length}건: ${candidates.map((c) => c.name).join(' / ')}`)

  const results = []
  for (const cand of candidates) {
    log(`— ${cand.name} (${cand.categoryHint ?? '카테고리 미기재'})`)

    const blocked = screen({ kind, name: cand.name, categoryHint: cand.categoryHint }, known)
    if (blocked) {
      log(`  게이트 기각: ${blocked.reason} — 프로브 안 함`)
      results.push({ ...cand, kind, probe: null, probeSourceKey: null, judgement: blocked })
      continue
    }

    const probe = kind === 'saas' ? await probeSaas(cand.name, fetchText) : await probePhysical(cand.name, fetchText)
    const judgement = judge(probe, MIN_HITS, MAX_HITS)
    // 캡 여부를 여기 찍는다 — `999` 와 `999+`(하한선)는 상한 판정이 다르다.
    log(`  프로브: hits=${probe.hits ?? 'null'}${probe.capped ? '+(하한)' : ''} ref=${probe.ref ?? '-'} (${probe.note})`)
    log(`  판정: ${judgement.verdict} — ${judgement.reason}`)

    // 채택분은 같은 실행 안에서도 중복을 막는다(후보 둘이 같은 카테고리인 경우).
    known.names.add(nameKey(kind, cand.name))
    if (judgement.verdict === 'accepted' && cand.categoryHint) {
      const key = cand.categoryHint.trim().toLowerCase()
      known.acceptedByCategory.set(key, (known.acceptedByCategory.get(key) ?? 0) + 1)
    }

    results.push({ ...cand, kind, probe, probeSourceKey: PROBE_SOURCE[kind], judgement })
  }

  // ── 적재 ───────────────────────────────────────────────────────
  if (dryRun) {
    log('--dry — 적재 건너뜀. Supabase 클라이언트를 만들지 않았다.')
  } else {
    for (const r of results) {
      const { projectId, targetId } = await persist(known.supabase, r)
      log(`  적재: ${r.name} → ${projectId ? `project=${projectId} target=${targetId}` : '후보만 기록'}`)
    }
  }

  // ── 보고 ───────────────────────────────────────────────────────
  const count = (v) => results.filter((r) => r.judgement.verdict === v).length
  console.log('\n┌─ 발굴 결과 ────────────────────────────────')
  for (const r of results) {
    const mark = { accepted: '✅', rejected: '❌', unverified: '⚠️' }[r.judgement.verdict]
    console.log(`│ ${mark} ${r.name}  [${r.kind}/${r.categoryHint ?? '-'}]`)
    console.log(`│    hits=${r.probe?.hits ?? 'null'}  ref=${r.probe?.ref ?? '-'}`)
    console.log(`│    ${r.judgement.reason}`)
    console.log(`│    why: ${r.why}`)
  }
  console.log('└────────────────────────────────────────────')
  log(
    `요약: 채택 ${count('accepted')} / 기각 ${count('rejected')} / 확인불가 ${count('unverified')} · ` +
      `외부요청 ${requestCount}건 · ${Math.round((Date.now() - started) / 1000)}초` +
      (dryRun ? ' · DB 쓰기 0건' : ''),
  )

  // ⚠️ unverified 는 실패가 아니지만 **조용히 넘어가서도 안 된다.** 이게 쌓이면
  //    프로브가 깨진 것이다. 종료코드가 아니라 로그로 눈에 띄게 남긴다.
  if (count('unverified') === results.length && results.length > 0) {
    log('⚠️ 전부 확인 불가다. 프로브 경로가 깨졌을 수 있다 — scripts/discovery-selftest.mjs 를 돌려라.')
  }
}

// ⚠️ 셀프테스트가 이 파일을 import 한다(proposalPrompt·parseCandidates 검증).
//    import 만으로 루프가 돌면 테스트가 남의 서버를 때린다. 직접 실행일 때만 돈다.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    log(`실패: ${e.message}`)
    process.exit(1)
  })
}
