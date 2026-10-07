#!/usr/bin/env node
// 크론 감시 — 크론이 "안 돌았다"와 Threads 토큰이 죽어 가는 것을 아침 브리핑(07:00 KST) 전에
// Notion "일일 상태 로그" CTO 행의 막힌것 칸에 올린다 (reports/2026-09-15-code-audit.md 3-1·3-2).
//
//   node scripts/cron-watchdog.mjs          # .github/workflows/cron-watchdog.yml 이 매일 21:53 UTC 에 부른다
//   node scripts/cron-watchdog.mjs --dry    # Notion 에 쓰지 않고 판정만 출력
//
// 왜 워크플로마다 `if: failure()` 가 아니라 밖에서 세나 — 스케줄 미발화(2026-09-01 실측)는 실행 자체가
// 없어서 그 안의 어떤 스텝도 돌지 않는다. "있어야 할 실행"을 밖에서 세야 보인다.
//
// 판정 (CLAUDE.md §7.1 — 확인 불가도 이상으로 올린다):
//   - 일일 크론(`M H * * *`)마다 가장 최근 예정 시각 이후 schedule 실행이 있고, 끝났고, success 여야 한다.
//   - 단, 그 슬롯 시점에 워크플로 파일이 기본 브랜치에 없었으면 "미발화"가 아니라 "해당 없음"이다
//     (workflowLandedAt). 히스토리를 못 읽으면 해당 없음이 아니라 "확인 불가"로 올린다.
//   - api_tokens 의 threads 행이 없거나·만료됐거나·만료 임박(lib/threads/token.ts tokenExpiryAlert)이면 이상.
// 이상이 있으면 CTO 행 1개 + exit 1(Actions 실패 메일). 없으면 행을 쓰지 않는다.
// 사람판단필요는 Threads 재인증 필요일 때만 true(v17/v19 — §10.2 예외 8번 남헌만 줄 수 있는 입력). 미발화·실패는 false.
//
// ⛔ access_token 은 읽지 않는다. 만료 시각만 본다 (CLAUDE.md §10 — 무인 루프에 발행 자격증명 없음).
// ponytail: 감시 자신이 미발화하면 여전히 조용하다. 필요해지면 두 번째 스케줄(같은 날 중복 행 방지 포함)을 붙인다.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'
import { tokenExpiryAlert } from '../lib/threads/token.ts'

// 예정 시각 뒤 이만큼은 실행이 아직 없어도 봐준다(Actions 지연). 90분이었는데 오탐을 냈다 —
// 2026-09-16 nightly-review-collect(17:37Z 예정)이 20:22:48Z 에 돌았다(2시간 45분 지연).
// 이 리포의 야간 슬롯은 상시 이만큼 밀리므로 4시간으로 넓혔다(남헌 2026-09-18 결정).
//
// ⚠️ 감시 자신(21:53Z)과의 간격이 GRACE 보다 좁은 크론은 그날 슬롯을 판정할 수 없다.
// 그래서 lastSlot 이 그 슬롯을 어제 것으로 되돌리고 = 하루 뒤 감시가 판정한다. 21:53 기준:
//   같은 날 판정  nightly-notion-feedback 12:07(9h46m) · hn-failure-signal 16:11(5h42m)
//                 nightly-discovery 17:13(4h40m) · nightly-review-collect 17:37(4h16m)
//   다음 날 판정  nightly-hackernews-enrich 18:19(3h34m) · nightly-insight-loop 18:41(3h12m)
//                 daily-cmo-loop 20:17(1h36m)
// 뒤 3개를 같은 날 보려면 감시를 00:17Z 이후로 미뤄야 하는데 그건 아침 브리핑(07:00 KST=22:00Z)
// 뒤다. 그래서 "하루 늦게 보되 절대 놓치지는 않는다"를 골랐다 — judgeRuns 가 슬롯당 24시간
// 창으로만 실행을 귀속시키므로, 어제 슬롯을 볼 때 오늘 실행이 그 자리를 메우지 못한다.
export const GRACE_MS = 4 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 파일별 예외 — 전역 GRACE 를 올리면 lastSlot 이 거의 모든 크론을 하루 늦게 판정하게 되므로 여기만 따로 준다.
// nightly-extract 는 슬롯마다 4~7시간 늦게 뜨고 성공한다(2026-10-01·02 실측: 03:33Z 슬롯 → 10:00~10:25Z,
// 09:33Z 슬롯 → 15:56~16:39Z). 슬롯 간격(6h)보다 지연이 길어서 "다음 슬롯까지" 창으로는 s2 가 매일 미발화로 뜬다.
// 그래서 이 파일은 창을 slot+유예로 잡고, 실행을 슬롯 순서대로 하나씩 짝짓는다(judgeRuns claimed) —
// 겹치는 창에서 s3 실행이 s2 미발화를 메우지 못하게(건수가 모자라면 반드시 한 슬롯이 미발화로 뜬다).
export const GRACE_OVERRIDE_MS = { 'nightly-extract.yml': 10 * 60 * 60 * 1000 }
// nightly-review-collect(v30 §2): cron 이 6줄(간격 3~4시간)이 되면 "다음 슬롯까지" 창이 17:37 슬롯 기준 12h → 3h10m 로 줄어
// 실측 2h45m(위 GRACE 주석)·평소 1~3h 지연에서 오탐 미발화가 나고, 늦은 17:37 실행이 20:47 창으로 잡힌다. extract 와 같은 짝짓기로.
// 같은 객체 리터럴 줄을 다른 PR(#448 nightly-relevance)도 고치므로 충돌을 피하려고 별도 줄로 더한다.
GRACE_OVERRIDE_MS['nightly-review-collect.yml'] = 10 * 60 * 60 * 1000
// nightly-relevance 도 같다(v30 §5 재시도 크론 r1 02:03Z · r2 06:03Z 추가): 슬롯 간격이 4~7시간이라 "다음 슬롯까지" 창이면
// r1 이 4시간 넘게 늦게 뜨는 날 r1 미발화 + r2 창에 r1 실행이 끼는 오경보가 난다. 정규 실행 실측 지연은 2.7~4.7시간.
GRACE_OVERRIDE_MS['nightly-relevance.yml'] = 10 * 60 * 60 * 1000
export const graceFor = (file) => GRACE_OVERRIDE_MS[file] ?? GRACE_MS
const SELF = 'cron-watchdog.yml'

/** 워크플로 폴더 → [{ file, crons }]. schedule 이 있는 것만(주석 처리된 cron 은 제외), 감시 자신은 뺀다. */
export function scheduledWorkflows(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && f !== SELF)
    .map((file) => ({
      file,
      crons: [...fs.readFileSync(path.join(dir, file), 'utf-8').matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    }))
    .filter((w) => w.crons.length)
}

/**
 * `git push` 하는 워크플로 중 전용 GitHub App 토큰 스텝(actions/create-github-app-token)이 없는 파일.
 * 09-25 main 룰셋 뒤 기본 GITHUB_TOKEN 의 push 는 GH013 으로 거부된다 — 수집은 되고 커밋만 매일 유실되는데
 * 워크플로 자체는 failure 라 원인이 로그 끝에 묻힌다(2026-09-25·26 hn-failure-signal·nightly-notion-feedback).
 * 주석 줄은 빼고 본다(checkout 주석이 `git push` 를 언급한다).
 */
export function pushWithoutBotToken(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((file) => {
      const code = fs.readFileSync(path.join(dir, file), 'utf-8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
      return /\bgit push\b/.test(code) && !/create-github-app-token/.test(code)
    })
    .sort()
}

/** now - GRACE 이전의 가장 최근 예정 시각. 일일 크론만 이해한다 — 그 밖은 null(확인 불가). */
export function lastSlot(cron, now, grace = GRACE_MS) {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron.trim())
  if (!m) return null
  const t = new Date(now.getTime() - grace)
  const slot = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), Number(m[2]), Number(m[1])))
  if (slot > t) slot.setUTCDate(slot.getUTCDate() - 1)
  return slot
}

/**
 * 예정 시각과 schedule 실행 목록(GitHub API workflow_runs) → `{ missing, line }`, 정상이면 null.
 * 실행은 그 슬롯 이후 **24시간 안**의 것만 센다. 이 상한이 없으면 어제 슬롯을 판정할 때
 * 오늘 실행이 어제 자리를 메워 미발화가 영영 초록불이 된다(GRACE 완화의 함정).
 * `claimed`(Set)를 주면 아직 안 짝지은 실행 중 **가장 이른 것**을 이 슬롯 몫으로 가져가고 표시한다
 * (GRACE_OVERRIDE_MS 파일 전용 — 슬롯을 오름차순으로 불러야 한다).
 */
export function judgeRuns(file, slot, runs, until = slot.getTime() + DAY_MS, { grace = GRACE_MS, claimed = null } = {}) {
  const hhmm = `${slot.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  const after = runs
    .filter((r) => Date.parse(r.created_at) >= slot.getTime() - 60_000 && Date.parse(r.created_at) < until)
    .filter((r) => !claimed?.has(r.id))
    .sort((a, b) => (claimed ? -1 : 1) * (Date.parse(b.created_at) - Date.parse(a.created_at)))
  if (!after.length) return { missing: true, line: `${file}: ${hhmm} 예정 실행이 없다 — 미발화 또는 ${grace / 3600000}시간 넘게 지연` }
  const r = after[0]
  claimed?.add(r.id)
  if (r.status !== 'completed') return { missing: false, line: `${file}: ${hhmm} 실행이 아직 안 끝났다(${r.status}) ${r.html_url ?? ''}`.trim() }
  if (r.conclusion !== 'success') return { missing: false, line: `${file}: ${hhmm} 실행 ${r.conclusion} ${r.html_url ?? ''}`.trim() }
  return null
}

/**
 * 같은 파일의 다음 슬롯 시각(ms) — judgeRuns 창의 상한. 크론이 하나면 slot+24h(기존과 같다).
 * 슬롯이 여럿(nightly-extract s1·s2·s3)인데 24시간 창을 쓰면 s2 미발화를 s3 실행이 메워 안 보인다.
 */
export function nextSlotAfter(crons, slot) {
  let next = slot.getTime() + DAY_MS
  for (const c of crons) {
    const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(c.trim())
    if (!m) continue
    let t = Date.UTC(slot.getUTCFullYear(), slot.getUTCMonth(), slot.getUTCDate(), Number(m[2]), Number(m[1]))
    if (t <= slot.getTime()) t += DAY_MS
    next = Math.min(next, t)
  }
  return next
}

const gitLines = (args) => execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/**
 * 그 워크플로 파일이 기본 브랜치에 들어온 시각. GitHub 은 기본 브랜치에 있는 워크플로만
 * 스케줄로 돌리므로, 슬롯보다 늦게 들어온 워크플로의 "미발화"는 미발화가 아니다
 * (2026-09-16 실측 오탐: nightly-discovery.yml 은 18:38:37Z 머지, 슬롯은 17:13Z).
 *
 * `--first-parent` 라야 머지 시각이 나온다 — 브랜치에서 파일을 만든 시각이 아니라
 * main 에 얹힌 시각이 발화 조건이다(eb19c54 = 18:38:37Z, 브랜치 커밋은 17:55:30Z).
 * 반환: `{ at: Date }` / `{ at: null }`(히스토리에 없다 = 아직 main 에 없다) /
 *       `{ unknown: 사유 }` — 얕은 클론이면 여기다. ⛔ 확인 불가를 "해당 없음"으로 접지 않는다.
 */
export function workflowLandedAt(file, { git = gitLines } = {}) {
  try {
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') return { unknown: '얕은 클론 — git 히스토리 없음(checkout fetch-depth 확인)' }
    const out = git(['log', '--first-parent', '--diff-filter=A', '--format=%cI', '-1', '--', `.github/workflows/${file}`])
    if (!out) return { at: null }
    const at = new Date(Date.parse(out))
    return Number.isNaN(at.getTime()) ? { unknown: `git 날짜를 못 읽었다(${out})` } : { at }
  } catch (e) {
    return { unknown: `git 조회 실패(${e.message})` }
  }
}

/** 전 검사. 네트워크·기록은 주입받는다(셀프테스트가 가짜로 바꾼다). 반환 { problems, code, record? } */
export async function runWatchdog({
  now = new Date(), env = process.env, fetchImpl = fetch, record = recordStatusLog,
  workflowsDir, dry = false, log = console.log, git = gitLines,
}) {
  const problems = []
  const repo = env.GITHUB_REPOSITORY

  for (const { file, crons } of scheduledWorkflows(workflowsDir)) {
    const grace = graceFor(file)
    const claimed = file in GRACE_OVERRIDE_MS ? new Set() : null
    // claimed 짝짓기는 슬롯 오름차순이어야 한다. 판정 불가(null) 크론은 순서와 무관하다.
    const ordered = crons.map((cron) => ({ cron, slot: lastSlot(cron, now, grace) }))
      .sort((a, b) => (a.slot?.getTime() ?? 0) - (b.slot?.getTime() ?? 0))
    for (const { cron, slot } of ordered) {
      if (!slot) { problems.push(`${file}: 일일 크론이 아닌 '${cron}' — 감시 확인 불가`); continue }
      log(`· ${file} ${cron} → 판정 슬롯 ${slot.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
      if (!repo || !env.GITHUB_TOKEN) { problems.push(`${file}: 실행 이력 확인 불가 — GITHUB_REPOSITORY/GITHUB_TOKEN 없음`); continue }
      const since = new Date(slot.getTime() - 60_000).toISOString()
      const url = `https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?event=schedule&per_page=20&created=${encodeURIComponent(`>=${since}`)}`
      try {
        const res = await fetchImpl(url, { headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' } })
        const body = await res.json().catch(() => null)
        if (!res.ok || !Array.isArray(body?.workflow_runs)) { problems.push(`${file}: 실행 이력 조회 실패(HTTP ${res.status}) — 확인 불가`); continue }
        const until = claimed ? slot.getTime() + grace : nextSlotAfter(crons, slot)
        const j = judgeRuns(file, slot, body.workflow_runs, until, { grace, claimed })
        if (!j) continue
        if (!j.missing) { problems.push(j.line); continue }
        // 미발화로 보일 때만 도입 시각을 본다 — 실행이 있으면 물어볼 것도 없다.
        const landed = workflowLandedAt(file, { git })
        if (landed.unknown) { problems.push(`${j.line} · 도입 시각 확인 불가(${landed.unknown}) — 미발화인지 판단 못 함`); continue }
        // 같은 시각(=)은 판정한다. 그 경계는 현실에 거의 없고, 애매할 때 경보를 끄는 쪽으로 기울이지 않는다.
        if (landed.at === null || landed.at.getTime() > slot.getTime()) {
          log(`· ${file}: 그 슬롯에 main 에 없었다(${landed.at ? landed.at.toISOString() : 'git 히스토리에 없음'}) — 해당 없음`)
          continue
        }
        problems.push(j.line)
      } catch (e) {
        problems.push(`${file}: 실행 이력 조회 실패(${e.message}) — 확인 불가`)
      }
    }
  }

  for (const f of pushWithoutBotToken(workflowsDir)) {
    problems.push(`${f}: git push 하는데 전용 앱 토큰 스텝(create-github-app-token)이 없다 — main 룰셋(GH013)에 막혀 push 단계에서 매일 실패한다. daily-cmo-loop.yml 의 "Mint bot token" 블록을 복사하라`)
  }
  const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) problems.push('Threads 토큰: 확인 불가 — Supabase 환경변수 없음')
  else {
    try {
      const res = await fetchImpl(`${sbUrl}/rest/v1/api_tokens?provider=eq.threads&select=expires_at,user_id`, {
        headers: { apikey: sbKey, authorization: `Bearer ${sbKey}` },
      })
      const rows = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(rows)) problems.push(`Threads 토큰: api_tokens 조회 실패(HTTP ${res.status}) — 확인 불가`)
      else {
        const alert = tokenExpiryAlert(rows[0] ?? null, now.getTime())
        if (alert) problems.push(alert)
      }
    } catch (e) {
      problems.push(`Threads 토큰: api_tokens 조회 실패(${e.message}) — 확인 불가`)
    }
  }

  if (!problems.length) { log('✅ 크론 감시 — 이상 없음 (상태 로그 행을 쓰지 않는다)'); return { problems, code: 0 } }
  for (const p of problems) log(`❌ ${p}`)
  if (dry) return { problems, code: 1 }

  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : '로컬 실행(run URL 없음)'
  const w = await record({
    date: kstDate(now),
    track: 'CTO',
    done: `크론 감시 — 이상 ${problems.length}건 발견`,
    blocked: problems.join('\n'),
    next: '미발화·실패 크론은 Actions 탭에서 원인 확인 후 필요하면 수동 실행 · Threads 토큰 만료/임박이면 재인증',
    // v17: 미발화·실패는 막힘 사실. Threads 재인증만 남헌만 줄 수 있는 입력(OAuth)이라 true.
    needsHuman: problems.some((p) => p.includes('재인증 필요')),
    note: `cron-watchdog · ${runUrl}`,
  })
  log(w.ok ? `✅ Notion 기록·재확인: ${w.title}` : `❌ Notion 기록 실패 — ${w.stage}: ${w.error}`)
  return { problems, code: 1, record: w }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = await runWatchdog({ workflowsDir: path.join(process.cwd(), '.github', 'workflows'), dry: process.argv.includes('--dry') })
  process.exit(r.code)
}
