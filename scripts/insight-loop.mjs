#!/usr/bin/env node
// 나이틀리 인사이트 루프 실행기 (GitHub Actions 전용 진입점).
//
// 왜 Vercel 라우트가 아니라 스크립트인가 — 실측 근거:
//
//   1) 300초 천장. Vercel Pro 의 maxDuration 은 300초인데 이 루프의 분석
//      단계는 건당 최대 120초(lib/insight/llm.ts) × 10건 = 최대 1,200초다.
//      함수가 3~4건째에서 죽는다. 죽은 자리에서 이미 analyzed 로 바뀐 행은
//      남고 패턴화·판정·커밋은 통째로 안 돈다 — 매일 밤 절반만 도는 루프가
//      된다. Actions 는 job 당 6시간이라 이 천장이 없다.
//
//   2) 크론 3중 발화. 같은 리포에 Vercel 프로젝트가 3개 붙어 있어
//      vercel.json 의 크론이 세 곳에 등록된다. 서로 모르는 세 인스턴스가
//      같은 시각에 같은 pending 행을 분석하고 각자 H8 을 발급하려 든다.
//      Actions 는 리포당 하나이고 concurrency 그룹으로 한 번 더 막는다.
//
//   3) 이 리포는 public 이라 Actions 표준 러너 분(minute)이 무제한이다.
//
// 사용:
//   node scripts/insight-loop.mjs [--dry] [--trigger=cron|manual]
//
// 종료 코드: 성공 0 / 단계 실패 1. 실패해도 다음 밤이 같은 일을 다시 한다
// (전 단계 멱등). 그래서 실패를 붙잡고 재시도하지 않는다.

import fs from 'node:fs/promises'
import { createClient } from '../lib/supabase/server.ts'
import { runInsightLoop } from '../lib/insight/loop.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const triggerArg = args.find((a) => a.startsWith('--trigger='))
const trigger = triggerArg ? triggerArg.slice('--trigger='.length) : 'cron'

const supabase = await createClient()
if (!supabase) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
  process.exit(1)
}

const result = await runInsightLoop(supabase, { dryRun, trigger })

// ── 사람이 읽는 요약 ──────────────────────────────────────────────
// 넓은 표를 쓰지 않는다. 항목당 한 줄이다.
const lines = []
const say = (s) => {
  lines.push(s)
  console.log(s)
}

say(`## 인사이트 루프 ${dryRun ? '(dry-run — 판정만)' : ''}`)
say('')

// ── 리뷰 수집 소스 경보 — 다른 무엇보다 위에 온다 ─────────────────
//
// 리뷰 수집은 별도 잡(nightly-review-collect)이 돌린다. 그 잡의 실패는
// 그쪽 로그에만 남아서, 아침에 이 보고만 보는 사람은 며칠씩 모른다.
// 수집이 죽으면 분석 재료가 끊기고 결국 이 루프의 판정도 굶는다.
//
// ⚠️ ok 인 소스는 한 줄도 찍지 않는다. 늘 있는 줄은 곧 안 읽는 줄이 된다.
for (const line of await sourceAlerts(supabase)) {
  say(line)
  say('')
}

say(`- 결과: ${result.ok ? '전 단계 정상' : '실패한 단계 있음'} · ${(result.totalMs / 1000).toFixed(1)}초 · provider=${result.provider} · trigger=${result.trigger}`)
say(`- 집계: 수집 ${result.counts.ingested} / 분석 ${result.counts.analyzed} / 패턴 ${result.counts.patterns} / 승격 ${result.counts.promoted} / 기각 ${result.counts.rejected}`)
if (result.commitSha) say(`- 커밋: \`${result.commitSha}\``)
if (result.warning) say(`- ⚠️ ${result.warning}`)

say('')
say('### 단계')
for (const s of result.steps) {
  const mark = s.ok ? '✅' : '❌'
  const note = s.ok
    ? s.detail.skipped
      ? `건너뜀 — ${s.detail.reason}`
      : summarizeDetail(s.name, s.detail)
    : `실패 — ${s.detail.error}`
  say(`- ${mark} \`${s.name}\` (${s.ms}ms) ${note}`)
}

if (result.decisions.length > 0) {
  say('')
  say('### 판정')
  for (const d of result.decisions) {
    const imp = typeof d.improvement === 'number' ? `${(d.improvement * 100).toFixed(1)}%` : '—'
    say(`- \`${d.pattern}\` → **${d.decision}** · 표본 ${d.sampleSize ?? '—'} · 개선 ${imp} · ${d.reason}`)
  }
}

if (dryRun) {
  say('')
  say('**판정만 했다. 실제 반영은 dry-run 을 끄고 실행한다.**')
}

// Actions 의 잡 요약 패널에도 같은 내용을 남긴다. 런타임 로그는 90일 뒤
// 사라지지만, 요약은 그 실행에서 무엇이 바뀌었는지 한 화면에 보여준다.
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

/**
 * 리뷰 수집 소스 중 정상이 아닌 것만 경보 줄로 만든다.
 *
 * ⚠️ 테이블이 없을 때 조용히 빈 배열을 돌려주지 않는다. 그건 "확인할 수
 *    없는데 정상이라고 답하는" 형태이고, 이 프로젝트에서 반복해 잡은
 *    실패다. 미적용이면 미적용이라고 말한다.
 */
async function sourceAlerts(supabase) {
  const { data, error } = await supabase
    .from('review_sources')
    .select('key, enabled, health, health_detail, health_checked_at')
    .neq('health', 'ok')

  if (error) {
    // 리뷰 수집 계층 자체가 아직 없는 상태. 사고가 아니라 미적용이다.
    if (error.code === 'PGRST205') {
      return ['ℹ️ 리뷰 수집 계층 미적용 — 마이그레이션 003 을 아직 실행하지 않았다']
    }
    return [`⚠️ 소스 상태를 읽지 못했다: ${error.message}`]
  }

  return (data ?? []).map((s) => {
    const icon = s.health === 'broken' ? '🚨' : '⚠️'
    const stopped = s.enabled ? '' : ' · 소스가 꺼져 있다'
    const when = s.health_checked_at ? ` (${s.health_checked_at.slice(0, 16).replace('T', ' ')})` : ''
    return `${icon} 소스 경보: ${s.key} = ${s.health} — ${s.health_detail ?? '사유 미기록'}${stopped}${when}`
  })
}

function summarizeDetail(name, d) {
  switch (name) {
    case 'ingest':
      return `발견 ${d.found} / 반영 ${d.inserted}`
    case 'analyze': {
      const base = `선택 ${d.picked} / 성공 ${d.succeeded} / 실패 ${d.failed} / 일반화가능 ${d.generalizable}`
      // 실패 사유를 여기서 버리면 요약에 "실패 1"만 남는다. 무엇을 고쳐야 할지
      // 알 수 없고, dry-run 은 행을 failed 로 못박지도 않아 DB 에도 안 남는다.
      // 사유를 못 보면 실패를 셀 수만 있고 판단할 수 없다(CLAUDE.md §7.1).
      const failures = d.failures ?? []
      return failures.length ? `${base}\n${failures.map((f) => `  - ⚠️ ${f}`).join('\n')}` : base
    }
    case 'patternize': {
      const base = `신규 ${(d.new ?? []).length} / 보강 ${(d.reinforced ?? []).length} / 신규가설 ${(d.newHypotheses ?? []).join(', ') || '없음'}`
      // key 값 자체가 인수인계서 리스크 6(같은 패턴에 매번 다른 key 가 붙으면
      // 근거가 1에서 안 올라가고 아무것도 반영되지 않는다)의 유일한 판단
      // 근거다. 개수만 찍으면 수렴과 분산이 같은 숫자로 보인다.
      const keys = [...(d.new ?? []), ...(d.reinforced ?? [])]
      return keys.length ? `${base}\n${keys.map((k) => `  - \`${k}\``).join('\n')}` : base
    }
    case 'measure':
      return `평가 ${d.evaluated}건`
    case 'reflect':
      if (d.dryRun) return `렌더 ${d.learnedBytes}B / 활성패턴 ${d.activeCount}`
      return `learned ${d.learned?.changed ? '변경' : '변경없음'} / rejected ${d.rejected?.changed ? '변경' : '변경없음'}`
    default:
      return ''
  }
}

process.exit(result.ok ? 0 : 1)
