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
//    "리뷰가 충분히 모였다"는 판단과 extract 실행은 사람이 한다.
//
// 사용:
//   node scripts/review-collect.mjs [--dry] [--source=danawa,appstore] [--targets=N]
//   node scripts/review-collect.mjs --source=all

import fs from 'node:fs/promises'
import { createClient } from '../lib/supabase/server.ts'
import { runCollection, USER_AGENT } from '../lib/review/runner.ts'
import { createReviewStore } from '../lib/review/store.ts'
import { alertLine } from '../lib/review/health.ts'
import { danawaAdapter } from '../lib/review/adapters/danawa.ts'
import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { hackernewsAdapter } from '../lib/review/adapters/hackernews.ts'

const ADAPTERS = { danawa: danawaAdapter, appstore: appstoreAdapter, hackernews: hackernewsAdapter }

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
const targetLimit = Number(arg('targets', '10'))

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

for (const sourceKey of sourceKeys) {
  const adapter = ADAPTERS[sourceKey]

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
      continue
    }
    runId = data.id
  }

  const started = Date.now()
  let result = null
  let fatal = null

  try {
    result = await runCollection(
      adapter,
      { dryRun, targetLimit },
      {
        now: () => new Date(),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        async fetchText(url) {
          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
              redirect: 'follow',
              signal: AbortSignal.timeout(20_000),
            })
            return { status: res.status, body: await res.text() }
          } catch (e) {
            return { status: null, body: '', error: e instanceof Error ? e.message : String(e) }
          }
        },
        store: createReviewStore(supabase),
      },
    )
  } catch (e) {
    fatal = e instanceof Error ? e.message : String(e)
  }

  // ── 소스별 보고 ────────────────────────────────────────────────
  say('')
  say(`### \`${sourceKey}\``)

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
    await supabase
      .from('review_collection_runs')
      .update({
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
      })
      .eq('id', runId)
  }

  // 차단(403/429)은 실패로 센다. 잡이 초록불이면 아무도 안 본다.
  if (fatal || (result?.stats.blockedResponses ?? 0) > 0) failures.push(sourceKey)
}

// ── 프로젝트별 누적 ───────────────────────────────────────────────
// "이제 extract 를 돌릴 때인가"를 사람이 판단할 근거다. 소스 전체 합산이다.
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
      for (const [pid, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
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

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

// 한 소스라도 실패하면 실패로 끝낸다(OR). 나머지가 성공했다고 초록불이면
// 그 소스가 망가진 사실이 묻힌다.
process.exit(failures.length > 0 ? 1 : 0)
