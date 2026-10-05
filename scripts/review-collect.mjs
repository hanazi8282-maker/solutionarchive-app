#!/usr/bin/env node
// 리뷰 수집 실행기 (GitHub Actions 진입점).
//
// 설계: docs/review-collection-design.md
// 소스: 다나와 / App Store / Hacker News (docs/review-source-findings.md)
//
// ⛔ 이 스크립트는 리포에 쓰지 않는다. 워크플로 permissions 가
//    contents: read 다. 인사이트 루프와 별도 잡인 이유가 그것이다 —
//    권한이 다른 일을 한 잡에 합치면 낮은 쪽이 높은 쪽으로 끌려간다.
//
// ⛔ extract 를 부르지 않는다. analysis_inputs 를 채우고 멈춘다.
//    POST /api/analyze/extract 는 기존 aspects 를 delete→insert 하므로,
//    자동으로 돌리면 사람이 검수해 둔 교정값이 매일 밤 날아간다.
//    (2026-09-23) 자동 추출은 별도 워크플로다 — scripts/extract-auto.mjs, collecting 상태·force 없음.
//
// 사용:
//   node scripts/review-collect.mjs [--dry] [--source=danawa,appstore] [--targets=N]
//   node scripts/review-collect.mjs --source=all

import fs from 'node:fs/promises'
import { createClient } from '../lib/supabase/server.ts'
import { USER_AGENT } from '../lib/review/runner.ts'
import { collectWithRamp, stepPctRamps } from '../lib/review/ramp.ts'
import { createReviewStore } from '../lib/review/store.ts'
import { alertLine } from '../lib/review/health.ts'
import { finishRunRow } from '../lib/review/run-log.ts'
import { danawaAdapter } from '../lib/review/adapters/danawa.ts'
import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { hackernewsAdapter } from '../lib/review/adapters/hackernews.ts'
import { damoangAdapter } from '../lib/review/adapters/damoang.ts'
import { cook82Adapter } from '../lib/review/adapters/82cook.ts'
import { bobaedreamAdapter } from '../lib/review/adapters/bobaedream.ts'
import { tumblbugAdapter } from '../lib/review/adapters/tumblbug.ts'
import { naverBlogAdapter } from '../lib/review/adapters/naver-blog.ts'
import { theqooAdapter } from '../lib/review/adapters/theqoo.ts'
import { todayhumorAdapter } from '../lib/review/adapters/todayhumor.ts'
import { brunchAdapter } from '../lib/review/adapters/brunch.ts'
import { clienAdapter } from '../lib/review/adapters/clien.ts'
import { fmkoreaAdapter } from '../lib/review/adapters/fmkorea.ts'
import { okkyAdapter } from '../lib/review/adapters/okky.ts'
import { velogAdapter } from '../lib/review/adapters/velog.ts'
import { youtubeAdapter } from '../lib/review/adapters/youtube.ts'
import { disquietAdapter } from '../lib/review/adapters/disquiet.ts'
import { producthuntAdapter } from '../lib/review/adapters/producthunt.ts'
import { devtoAdapter } from '../lib/review/adapters/devto.ts'
import { inflearnAdapter } from '../lib/review/adapters/inflearn.ts'
import { yozmAdapter } from '../lib/review/adapters/yozm.ts'
import { indiehackersAdapter } from '../lib/review/adapters/indiehackers.ts'
import { googleplayAdapter } from '../lib/review/adapters/googleplay.ts'
import { kakaoBlogAdapter, kakaoCafeAdapter } from '../lib/review/adapters/kakao.ts'
import { recordStatusLog, kstDate } from './notion-status-log.mjs'
import { buildReviewCollectEntry } from './review-collect-status.mjs'
import { brokenSources, LOOKBACK_DAYS, runSourceHealthReport } from './review-source-health-report.mjs'
import { PENDING_DIR } from './notion-status-log-flush.mjs'

// ⚠️ 키는 review_sources.key 와 **철자까지 같아야 한다.** 다르면 loadSource 가
//    행을 못 찾아 그 소스가 조용히 안 돈다(20260917000001 마이그레이션 참조).
//    82cook 은 식별자가 숫자로 시작할 수 없어 export 이름만 cook82Adapter 다.
const ADAPTERS = {
  danawa: danawaAdapter,
  appstore: appstoreAdapter,
  hackernews: hackernewsAdapter,
  damoang: damoangAdapter,
  '82cook': cook82Adapter,
  bobaedream: bobaedreamAdapter,
  tumblbug: tumblbugAdapter,
  naver_blog_post: naverBlogAdapter,
  theqoo: theqooAdapter,
  todayhumor: todayhumorAdapter,
  brunch: brunchAdapter,
  clien: clienAdapter,
  fmkorea: fmkoreaAdapter,
  okky: okkyAdapter,
  velog: velogAdapter,
  youtube: youtubeAdapter,
  disquiet: disquietAdapter,
  producthunt: producthuntAdapter,
  devto: devtoAdapter,
  inflearn: inflearnAdapter,
  yozm: yozmAdapter,
  indiehackers: indiehackersAdapter,
  // 약관이 자동 접근을 금지하는 걸 알고 남헌이 연 소스(2026-10-05, 마이그 20261005000005). 우회 없음 —
  // 403·429·빈 응답·캡차면 즉시 중단(어댑터 abortOnChallenge). robots 는 러너가 매 실행 판정한다.
  googleplay: googleplayAdapter,
  // 카카오(다음) 블로그·카페 검색 공식 API(남헌 승인 2026-10-06, 마이그 20261006000003 enabled=false). 키 KAKAO_REST_API_KEY.
  kakao_blog: kakaoBlogAdapter,
  kakao_cafe: kakaoCafeAdapter,
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

// ⚠️ 소스를 여러 개 받는다. 예전에는 하나만 받았고 워크플로의 선택지에
//    danawa 밖에 없어서 **appstore 가 스케줄로는 한 번도 안 돌았다.**
//    소스를 추가하고도 실행 경로에 안 꽂으면 코드만 있고 수집은 0건이다.
const rawSource = arg('source', 'danawa')
const requested =
  rawSource.trim() === 'all'
    ? Object.keys(ADAPTERS)
    : rawSource
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

if (requested.length === 0) {
  console.error('❌ --source 가 비어 있다. (가능: all, ' + Object.keys(ADAPTERS).join(', ') + ')')
  process.exit(1)
}

// 하나라도 오타면 시작 전에 끊는다. 절반만 돌고 끝나면 그날 수집이
// 조용히 반쪽이 되는데, 종료코드는 0 이라 아무도 안 본다.
const unknown = requested.filter((k) => !ADAPTERS[k])
if (unknown.length > 0) {
  console.error(`❌ 알 수 없는 소스: ${unknown.join(', ')} (가능: all, ${Object.keys(ADAPTERS).join(', ')})`)
  process.exit(1)
}

// 같은 소스를 두 번 적으면 커서를 서로 덮어쓴다.
const sourceKeys = [...new Set(requested)]
// --targets 가 없으면(스케줄 기본) 소스별 램프 단계의 1회 타깃 수를 쓴다(lib/review/ramp.ts collectWithRamp).
// 있으면 수동 지정 — 램프를 무시한다. 램프 행 없음·확인 불가는 RAMP_STEPS[0]=10.
const targetsArg = arg('targets', '')
const explicitTargets = targetsArg.trim() === '' ? null : Number(targetsArg)
if (explicitTargets !== null && !(Number.isInteger(explicitTargets) && explicitTargets > 0)) {
  console.error(`❌ --targets 는 양의 정수여야 한다: ${targetsArg}`)
  process.exit(1)
}

const supabase = await createClient()
if (!supabase) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  process.exit(1)
}

const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}

say(`## 리뷰 수집 ${dryRun ? '(dry-run — 적재하지 않음)' : ''}`)
say('')
say(`대상 소스: ${sourceKeys.join(', ')}`)

// ── 소스별 실행 ───────────────────────────────────────────────────
//
// ⚠️ 소스마다 try/catch 로 감싼다. 하나가 죽어도 나머지는 돌아야 한다.
//    한 소스의 구조 변경이 그날 전체 수집을 날리면, 멀쩡한 소스의 리뷰까지
//    하루씩 밀린다.
//
// ⚠️ review_collection_runs 는 **소스별로 1행**이다. 합치면 어느 소스가
//    언제부터 망가졌는지 추적이 안 된다. 건강도 판정도 소스 단위다.
const failures = []
// Notion 일일 상태 로그(CTO 행) 재료. 보고 줄(say)을 다시 파싱하지 않으려고 값으로 모은다.
const sourceResults = []
// finishRunRow 의 "이 컬럼 묶음은 없다" 기억 — 이 실행 동안 소스마다 실패 요청을 반복하지 않게(lib/review/run-log.ts).
const runLogMemo = {}

// 퍼센트 램프 하루 판정(남헌 v24·v25, lib/review/ramp.ts stepPctRamps) — 어제(UTC)가 아직 판정 안 된 행만, 소스 실행 전에.
// 그날 첫 슬롯이 하고 둘째 슬롯은 날짜 잠금으로 건너뛴다. 퍼센트 램프 행이 없으면 줄도 없다(지금과 같다).
// 판정이 죽어도 수집은 돈다 — 예외는 ⚠️ 로 남긴다(§7.1).
try {
  const pctNotes = await stepPctRamps(supabase, new Date(), dryRun)
  if (pctNotes.length > 0) {
    say('')
    say('### 퍼센트 램프 판정')
    for (const n of pctNotes) say(`- ${n}`)
  }
} catch (e) {
  say(`- ⚠️ 퍼센트 램프 판정 예외 — ${e instanceof Error ? e.message : String(e)} (수집은 계속)`)
}

// 꺼진 소스(enabled=false)는 키가 없어도 실패로 세지 않는다 — 러너가 어차피 건너뛴다. 키 줄을 워크플로 env 에 아직
// 안 넣은 신규 소스(kakao_*)가 --source=all 에서 매일 밤 잡을 빨갛게 만들던 결함(2026-10-06 독립 검토).
// 못 읽으면(오류) 엄격하게 둔다: 켜져 있는 것으로 보고 기존처럼 키를 검사한다(§7.1, 확인 불가를 정상으로 접지 않는다).
const enabledByKey = new Map()
{
  const { data, error } = await supabase.from('review_sources').select('key, enabled').in('key', sourceKeys)
  if (!error) for (const r of data ?? []) enabledByKey.set(r.key, r.enabled)
}

for (const sourceKey of sourceKeys) {
  const adapter = ADAPTERS[sourceKey]

  // 공식 API 소스는 키가 없으면 돌리지 않는다. 키 없이 받은 401/403 은 러너가 "차단"으로
  // 기록해 소스를 끈다 — 우리 설정 문제가 상대 차단으로 남는다(types.ts requiredEnv).
  const missingEnv = (adapter.requiredEnv ?? []).filter((k) => !process.env[k])
  if (missingEnv.length > 0 && enabledByKey.get(sourceKey) === false) {
    say('')
    say(`### \`${sourceKey}\``)
    say(`- 소스가 꺼져 있어(enabled=false) 키 검사를 생략하고 건너뛴다(필요 환경변수: ${missingEnv.join(', ')})`)
    sourceResults.push({ key: sourceKey, skipped: true, skipReason: '소스 꺼짐(enabled=false) — 키 검사 생략' })
    continue
  }
  if (missingEnv.length > 0) {
    failures.push(sourceKey)
    say('')
    say(`### \`${sourceKey}\``)
    say(`- ❌ 환경변수 미설정으로 건너뛴다: ${missingEnv.join(', ')} (차단이 아니라 우리 설정이다)`)
    sourceResults.push({ key: sourceKey, fatal: `환경변수 미설정 — ${missingEnv.join(', ')}` })
    continue
  }

  // 이전 실행 정리 — running 으로 남은 행은 잡이 죽은 것이다.
  // finished_at 이 비어 있다고 성공으로 읽으면 안 된다.
  if (!dryRun) {
    const { error } = await supabase
      .from('review_collection_runs')
      .update({ status: 'interrupted', finished_at: new Date().toISOString() })
      .eq('source_key', sourceKey)
      .eq('status', 'running')
    if (error) console.error(`⚠️ [${sourceKey}] 이전 실행 정리 실패: ${error.message}`)
  }

  let runId = null
  if (!dryRun) {
    const { data, error } = await supabase
      .from('review_collection_runs')
      .insert({
        source_key: sourceKey,
        trigger: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'manual' : 'cron',
        dry_run: false,
        status: 'running',
      })
      .select('id')
      .single()
    if (error) {
      // 이 소스는 기록을 남길 수 없으니 돌리지 않는다. 다음 소스로 넘어간다 —
      // 기록 없는 수집은 나중에 무슨 일이 있었는지 알 수 없다.
      console.error(`❌ [${sourceKey}] 실행 로그 생성 실패: ${error.message}`)
      failures.push(sourceKey)
      say('')
      say(`### \`${sourceKey}\``)
      say(`- ❌ 실행 로그를 만들지 못해 건너뛴다: ${error.message}`)
      sourceResults.push({ key: sourceKey, fatal: `실행 로그 생성 실패 — ${error.message}` })
      continue
    }
    runId = data.id
  }

  const started = Date.now()

  const { result, fatal, notes: rampNotes } = await collectWithRamp({
    sb: supabase,
    adapter,
    dryRun,
    explicitTargets,
    ports: {
      now: () => new Date(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      async fetchText(url, init) {
        try {
          const res = await fetch(url, {
            // init = POST API(producthunt·googleplay)·헤더 인증 GET(kakao)만. 헤더를 합쳐도 User-Agent 는 우리 것으로 고정한다.
            method: init?.method ?? 'GET',
            body: init?.body,
            headers: { Accept: '*/*', ...(init?.headers ?? {}), 'User-Agent': USER_AGENT },
            redirect: 'follow',
            signal: AbortSignal.timeout(20_000),
          })
          // ⚠️ finalUrl 은 robots 캐시가 쓴다. 빠지면 리다이렉트로 남의 호스트
          //    robots 를 읽고도 요청한 호스트의 규칙으로 판정한다(runner.ts).
          return { status: res.status, body: await res.text(), finalUrl: res.url }
        } catch (e) {
          return { status: null, body: '', error: e instanceof Error ? e.message : String(e) }
        }
      },
      store: createReviewStore(supabase),
    },
  })

  // ── 소스별 보고 ────────────────────────────────────────────────
  say('')
  say(`### \`${sourceKey}\``)
  // 램프 줄은 fatal·skip 이어도 찍는다 — 확인 불가 폴백(⚠️)과 되돌리기 결과가 묻히지 않게(§7.1).
  for (const n of rampNotes) say(`- 램프: ${n}`)

  if (fatal) {
    say(`- ❌ 실행이 통째로 실패했다: ${fatal}`)
  } else if (result.skipped) {
    say(`- ⏭️ 건너뜀 — ${result.skipReason}`)
  } else {
    // ⚠️ 경보를 맨 위에 둔다. ok 면 줄 자체가 없다.
    const alert = alertLine(result.sourceKey, result.health)
    if (alert) {
      say(alert)
      say('')
    }

    const s = result.stats
    say(
      `- ${((Date.now() - started) / 1000).toFixed(1)}초 · 타깃 ${result.targetsVisited}개 · 요청 ${result.requests}건`,
    )
    // ⚠️ dry-run 의 "신규 0건" 은 0 이 아니라 **측정 안 함**이다.
    //    lib/review/runner.ts 가 `if (opts.dryRun) continue` 를 newCount++ 앞에서
    //    한다 — 지문을 쓰지 않으므로 중복 판정 자체를 못 한다. 구조상 항상 0이다.
    //    그런데 같은 글자로 찍으면 "새 게 없다"와 "세지 않았다"가 구별되지 않고,
    //    실수집에서 진짜 0건이 나온 날과도 구별되지 않는다(CLAUDE.md §7.1).
    const newLabel = dryRun ? '신규 —(dry-run 은 판정하지 않음)' : `신규 ${s.newReviews}건`
    const quotaLabel = s.quotaExhaustedResponses > 0 ? ` · 쿼터 소진 ${s.quotaExhaustedResponses}건` : ''
    // 관련없음 제외는 파싱 실패와 다른 사건이다 — 소스가 아니라 질의의 문제.
    // 0 이면 줄을 늘리지 않는다(늘 있는 숫자는 안 읽힌다).
    const filteredLabel = s.relevanceFiltered > 0 ? ` · 관련없음 ${s.relevanceFiltered}건 제외` : ''
    say(
      `- 파싱 ${s.reviewsParsed}건(실패 ${s.parseFailures}) · ${newLabel} · 폴백키 ${s.fallbackKeys}건 · robots 회피 ${result.robotsSkips}건${quotaLabel}${filteredLabel}`,
    )
    // robots 를 못 읽었는데 어댑터 표식(proceedWhenRobotsUnverified) 때문에만 보낸 요청.
    // ⚠️ 0 이어도 찍는다 — "오늘은 표식이 필요 없었다"(예: PH 가 robots 403 을 멈췄다)가 보여야 한다.
    const bypassHosts = Object.entries(result.robotsBypassedHosts ?? {})
      .map(([h, c]) => `${h}: ${c}`)
      .join(', ')
    say(`- robots 예외 통과 ${result.robotsBypassed ?? 0}건${bypassHosts ? `(${bypassHosts})` : ''}`)
    // 소유자 예외(OWNER_ROBOTS_OVERRIDES, §7.1)로 robots 금지를 통과한 요청. 0 이어도 찍는다(위 줄과 같은 이유).
    say(`- 소유자 예외 사용 ${result.robotsOwnerOverride ?? 0}건`)
    // ⚠️ 0 이어도 찍는다. "신규 0건"과 "중복만 받았다"는 다른 사건이고, 이 줄이
    //    없으면 둘이 똑같이 보인다(§7.1). 같은 글이 `url:`·`board:` 두 타깃으로
    //    들어오는 것을 2차 방어(content_hash)가 걸러낸 수다.
    say(`- 중복(다른 타깃 경로): ${dryRun ? '—(dry-run 은 판정하지 않음)' : `${s.crossTargetDuplicates}건`}`)

    for (const w of result.health.warnings) say(`- ⚠️ ${w}`)

    if (result.perTarget.length > 0) {
      say('')
      say('#### 타깃별')
      for (const p of result.perTarget) say(`- \`${p.productRef}\` — ${p.outcome}`)
    }
  }

  // ── 소스별 실행 로그 마감 ──────────────────────────────────────
  if (runId) {
    const s = result?.stats
    // 차단·쿼터 건수(마이그 20260930000033). 컬럼이 없으면 두 필드만 빼고 저장 + 경고(3상태, lib/review/run-log.ts).
    // ⚠️ fatal 실행은 stats 가 없어 0 으로 쓴다 = 측정 못 함. status='failed' 로 구별한다.
    const saved = await finishRunRow(
      supabase,
      runId,
      {
        finished_at: new Date().toISOString(),
        status: fatal ? 'failed' : 'ok',
        targets_visited: result?.targetsVisited ?? 0,
        requests: result?.requests ?? 0,
        pages_fetched: result?.pagesFetched ?? 0,
        reviews_parsed: s?.reviewsParsed ?? 0,
        parse_failures: s?.parseFailures ?? 0,
        new_reviews: s?.newReviews ?? 0,
        robots_skips: result?.robotsSkips ?? 0,
        health_after: result?.health?.health ?? null,
        error: fatal,
      },
      { blockedResponses: s?.blockedResponses ?? 0, quotaExhaustedResponses: s?.quotaExhaustedResponses ?? 0 },
      // robots 예외 사용 기록(마이그 20261006000001). 행 = 소스 1개라 override 값도 1개 — 다값 방침은 run-log.ts 주석.
      // 호스트별 이유(robotsBypassedHosts)는 요약 줄에만 남긴다(json 칸 없음).
      {
        robotsOwnerOverride: result?.robotsOwnerOverride ?? 0,
        robotsBypassed: result?.robotsBypassed ?? 0,
        overrideValue: result?.overrideValue ?? null,
      },
      runLogMemo,
    )
    if (saved.state === 'saved_without_counts') {
      console.warn(`⚠️ [${sourceKey}] ${saved.warning}`)
      say(`- ⚠️ ${saved.warning}`)
    } else if (saved.state === 'failed') {
      console.error(`❌ [${sourceKey}] 실행 로그 마감 실패: ${saved.error}`)
      say(`- ❌ 실행 로그 마감 실패(행이 running 으로 남는다): ${saved.error}`)
    }
  }

  // 차단(403/429)은 실패로 센다. 잡이 초록불이면 아무도 안 본다.
  if (fatal || (result?.stats.blockedResponses ?? 0) > 0) failures.push(sourceKey)
  sourceResults.push({
    key: sourceKey,
    fatal,
    skipped: result?.skipped ?? false,
    skipReason: result?.skipReason ?? null,
    stats: result?.stats ?? null,
    alert: result && !result.skipped && result.health ? alertLine(result.sourceKey, result.health) : null,
    warnings: result?.health?.warnings ?? [],
    // 소스 고장 보고(review-source-health-report.mjs)의 재료. 러너는 더 이상 review_sources 에 판정을 쓰지 않는다.
    health: result?.health ?? null,
    perTarget: result?.perTarget ?? [],
    robotsOwnerOverride: result?.robotsOwnerOverride ?? 0,
  })
}

// ── 소스 고장 보고 (남헌 2026-09-30) ─────────────────────────────────
// 고장(health=broken)이어도 소스를 끄지 않는다(§10.1). 그 대신 여기서 Notion 일일 상태 로그 CTO 행(하루 1행,
// 사람판단필요=false — 고장은 막힘 사실, v17)에 올린다. 보고 실패·토큰 없음은 폴백 파일 + 종료 코드 1 — 고장이 묻히지 않게(§7.1).
// dry-run 은 판정을 남기지 않는 실행이라 보고하지 않는다(아래 CTO 행과 같다) — 목록만 찍는다.
{
  const runUrlForReport = process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null
  let rep
  if (dryRun) {
    rep = { ok: true, broken: brokenSources(sourceResults), dry: true }
  } else {
    try {
      rep = await runSourceHealthReport({
        sourceResults,
        date: kstDate(),
        runUrl: runUrlForReport,
        pendingDir: PENDING_DIR,
        // "N일째" 재료. 읽기만 한다. 실패하면 throw → 보고에 "확인 불가"로 적힌다.
        async loadRuns(keys) {
          const since = new Date(Date.now() - (LOOKBACK_DAYS + 1) * 86_400_000).toISOString()
          const { data, error } = await supabase
            .from('review_collection_runs')
            .select('source_key, started_at, finished_at, status, dry_run, health_after')
            .in('source_key', keys)
            .eq('dry_run', false)
            .gte('started_at', since)
            .order('started_at', { ascending: false })
          if (error) throw new Error(error.message)
          return Object.fromEntries(keys.map((k) => [k, (data ?? []).filter((r) => r.source_key === k)]))
        },
      })
    } catch (e) {
      rep = { ok: false, broken: brokenSources(sourceResults), record: { stage: 'report', error: e instanceof Error ? e.message : String(e) } }
    }
  }
  // hidden = 이번 실행엔 판정이 없지만 마지막 확인이 broken 인 소스(확인 불가가 고장을 가리지 않게, 남헌 2026-09-30).
  const reported = [...rep.broken, ...(rep.hidden ?? [])]
  if (reported.length > 0 || !rep.ok) {
    say('')
    say(`### 소스 고장 보고 — ${reported.map((b) => b.key).join(', ') || '대상 확인 전 실패'} (자동으로 끄지 않았다)`)
    if (rep.dry) say('- dry-run — Notion 보고 생략')
    else if (rep.ok) say(`- ✅ Notion 일일 상태 로그(CTO) ${rep.record.updated ? '같은 날 행 갱신' : '행 생성'}·재확인 — ${rep.record.title} (사람판단필요=true)`)
    else {
      const r = rep.record ?? {}
      say(`- ❌ 소스 고장 보고 실패 — ${r.stage}: ${r.error}${r.pendingPath ? ` · 폴백 파일 ${r.pendingPath}` : ''}${r.pendingError ? ` · 폴백 파일도 실패: ${r.pendingError}` : ''}`)
      console.log(`::error title=source-health-report::소스 고장 보고 실패 — ${r.stage}: ${r.error}`)
      failures.push('source-health-report')
    }
  }
}

// ── 프로젝트별 누적 ───────────────────────────────────────────────
// "이제 extract 를 돌릴 때인가"를 사람이 판단할 근거다. 소스 전체 합산이다.
let topProject = null
if (!dryRun) {
  const { data, error } = await supabase
    .from('analysis_inputs')
    .select('project_id')
    .eq('source_type', 'review')
    .not('source_key', 'is', null)

  if (!error && data) {
    const counts = new Map()
    for (const row of data) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1)
    if (counts.size > 0) {
      say('')
      say('### 프로젝트별 누적 리뷰')
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
      topProject = { id: sorted[0][0], n: sorted[0][1] }
      for (const [pid, n] of sorted) {
        say(`- \`${pid}\` — ${n}건`)
      }
      say('')
      say('⛔ extract 는 자동으로 돌지 않는다. 충분하다고 판단되면 사람이 실행한다.')
    }
  }
}

if (dryRun) {
  say('')
  say('**적재하지 않았다. 실제 수집은 dry_run 을 끄고 실행한다.**')
}

if (failures.length > 0) {
  say('')
  say(`- ❌ 실패한 소스: ${failures.join(', ')} (나머지 소스는 계속 진행했다)`)
}

// ── Notion 일일 상태 로그 (CTO 트랙, CLAUDE.md §11) ──────────────────
// 아침 브리핑이 이 행을 읽는다. 기록 실패가 수집 종료코드를 바꾸지 않지만 조용히 넘기지도
// 않는다: 실행 요약에 ❌ 줄 + Actions 경고 주석. dry-run 은 쓰지 않는다(반영 없는 실행).
// 이 워크플로는 contents: read 라 폴백 파일을 커밋할 수 없다 — 파일 폴백을 두지 않는다.
if (!dryRun) {
  const runUrl = process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null
  let r
  try {
    r = await recordStatusLog(buildReviewCollectEntry({
      date: kstDate(), sources: sourceResults, failures, topProject, runUrl,
    }))
  } catch (e) {
    r = { ok: false, stage: 'build', error: e instanceof Error ? e.message : String(e) }
  }
  say('')
  if (r.ok) {
    say(`- ✅ Notion 일일 상태 로그(CTO) — ${r.title} 기록·재확인`)
  } else {
    say(`- ❌ Notion 일일 상태 로그(CTO) 기록 실패 — ${r.stage}: ${r.error}${r.pageId ? ` (페이지는 생성됨 ${r.pageId})` : ''} · 수집 결과엔 영향 없음`)
    console.log(`::warning title=status-log::Notion 일일 상태 로그(CTO) 기록 실패 — ${r.stage}: ${r.error}`)
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

// 한 소스라도 실패하면 실패로 끝낸다(OR). 나머지가 성공했다고 초록불이면
// 그 소스가 망가진 사실이 묻힌다.
process.exit(failures.length > 0 ? 1 : 0)
