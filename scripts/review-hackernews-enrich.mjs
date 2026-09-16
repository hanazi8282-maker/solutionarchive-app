#!/usr/bin/env node
// Hacker News 스레드 score 배치 덧붙이기 (Stage 2 옵션 B).
//
// 설계 근거: docs/review-source-findings.md · 수익화 리서치 §Stage2 A/B/C 실측.
//   A(Algolia 단독) / B(스토리 score 배치) / C(댓글 전건 상세) 중 남헌이 B 채택.
//   score 를 노이즈 필터·증거 가중치로 쓸 수 있고(실측), 스토리당 1콜로 배치된다.
//
// 무엇을 하는가:
//   1. analysis_inputs 에서 hackernews 로 적재됐고 아직 score 가 안 붙은 행을 읽는다.
//   2. raw_text 에 심긴 스레드 URL 에서 story_id 를 뽑아 **스토리 단위로 묶는다.**
//   3. 스토리마다 Firebase 로 score 를 1건씩 받아온다(배치 = 스토리 수만큼).
//   4. raw_text 머리의 `[HN: 제목 · <url>]` 에 `· ▲<score>` 를 끼운다.
//
// ⚠️ 이건 파이프라인 필수 단계가 아니다. 지금은 .github/workflows/nightly-hackernews-enrich.yml
//    이 매일 18:19 UTC 에 --apply 로 부른다.
//
// 종료 코드: 0 = 정상(score 를 받았거나, 삭제·dead 라 score 필드가 없음)
//            1 = 실패(HTTP·네트워크로 못 물어봤거나 UPDATE 가 깨짐) — enrichVerdict 참고.
//    전량 실패를 0 으로 돌려주면 워크플로가 초록이고, 그러면 cron-watchdog 도 못 잡는다(진단 2-1).
//
// ⚠️ 기본은 dry-run 이다. `--apply` 를 명시해야 analysis_inputs 를 UPDATE 한다
//    (review-purge.mjs 와 같은 규약).
//
// ✅ raw_text 와 지문 content_hash 의 불일치는 표면적이며 무해하다 — 기능적 버그가
//    아니다 (2026-09-10 실측, scripts/review-hackernews-enrich-fingerprint-repro.mjs).
//    content_hash 는 매 수집 사이클마다 **API 응답을 다시 파싱한 review.text** 로
//    재계산된다(lib/review/runner.ts ingestPage → computeFingerprint). 저장된
//    raw_text 를 다시 읽어 해싱하는 경로는 파이프라인에 없다. 그래서 enrich 가
//    raw_text 에 `▲score` 를 끼워도, 다음 사이클이 같은 원본 응답을 다시 파싱해
//    계산한 content_hash 는 enrich 이전과 같고 recordFingerprint 가 duplicate 로
//    처리한다 — revision_count 는 오르지 않고 중복 재적재도 없다. raw_text(사람·화면용,
//    ▲ 있음) 와 content_hash(중복판별용, ▲ 없음) 는 서로 다른 시점의 값일 뿐이다.
//    켠 뒤 --apply 로 돌려도 안전하다.
//
// 예산: review_sources(hackernews) 의 min_interval_ms·daily_request_cap 를 읽어
//    그 안에서만 요청한다. 스토리가 상한을 넘으면 최신부터 처리하고 나머지는
//    다음 실행으로 미룬다("확인 불가"를 "했음"으로 접지 않는다 — §7.1).
//
// 사용:
//   node scripts/review-hackernews-enrich.mjs            # dry-run
//   node scripts/review-hackernews-enrich.mjs --apply    # 실제 UPDATE
//   node scripts/review-hackernews-enrich.mjs --apply --limit=300

import { fileURLToPath } from 'node:url'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { extractStoryIdFromText } from '../lib/review/adapters/hackernews.ts'

const PRODUCT_TOKEN = 'solutionarchive-review-collector'
const FIREBASE_ORIGIN = 'https://hacker-news.firebaseio.com'
const DEFAULT_SCAN_LIMIT = 500

// ── 순수 헬퍼 (셀프테스트가 여기만 가져다 쓴다) ──────────────────────────

/** 이미 score 가 붙었나. `[HN: … ▲…]` 머리에 ▲ 가 있으면 손대지 않는다. */
export function isEnriched(rawText) {
  const head = (rawText ?? '').split(']')[0]
  return head.includes('▲')
}

/**
 * raw_text 머리 `[HN: 제목 · news.ycombinator.com/item?id=ID]` 에
 * `· ▲SCORE` 를 URL 앞에 끼운다. 이미 붙었으면(또는 URL 이 없으면) 원본 그대로.
 */
export function spliceStoryScore(rawText, score) {
  if (rawText == null) return rawText
  if (isEnriched(rawText)) return rawText
  if (!Number.isFinite(score)) return rawText
  return rawText.replace(
    /(· )?(news\.ycombinator\.com\/item\?id=\d+\])/,
    (_m, sep, url) => `${sep ?? ''}▲${score} · ${url}`,
  )
}

/**
 * 실행 결과 카운터 → { code, line }.
 *
 * "score 필드 없음"(삭제·dead 스토리)과 "못 물어봤음"(HTTP/네트워크 실패)은 다른 사건이다(§7.1).
 * 전자는 정상 음성이라 0, 후자는 한 건이라도 있으면 1 — 그래야 cron-watchdog 가 잡아
 * 다음 아침 Notion 막힌것 칸에 올린다. UPDATE 실패도 같다(쓴 줄 알았는데 안 써졌다).
 */
export function enrichVerdict({ storiesOk = 0, noScoreField = 0, httpFailed = 0, updateFailed = 0 }) {
  const bad = []
  if (httpFailed > 0) bad.push(`score 조회 실패 ${httpFailed}건`)
  if (updateFailed > 0) bad.push(`UPDATE 실패 ${updateFailed}건`)
  if (bad.length === 0) {
    return { code: 0, line: `정상 — score 받음 ${storiesOk}건 · score 필드 없음(삭제·dead) ${noScoreField}건` }
  }
  return { code: 1, line: `❌ ${bad.join(' · ')} (score 받음 ${storiesOk}건 · score 필드 없음 ${noScoreField}건)` }
}

/** rows(각 {id, raw_text}) → { byStory: Map<storyId, rows[]>, skipped: number } */
export function groupByStory(rows) {
  const byStory = new Map()
  let skipped = 0
  for (const row of rows) {
    if (isEnriched(row.raw_text)) {
      skipped++
      continue
    }
    const sid = extractStoryIdFromText(row.raw_text)
    if (!sid) {
      skipped++
      continue
    }
    if (!byStory.has(sid)) byStory.set(sid, [])
    byStory.get(sid).push(row)
  }
  return { byStory, skipped }
}

// ── 실행부 ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const limitArg = args.find((a) => a.startsWith('--limit='))
  const scanLimit = limitArg ? Math.max(1, Number(limitArg.slice(8))) : DEFAULT_SCAN_LIMIT

  const { createClient } = await import('../lib/supabase/server.ts')
  const supabase = await createClient()
  if (!supabase) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    process.exit(1)
  }

  console.log(`## HN score enrich ${apply ? '' : '(dry-run — UPDATE 하지 않음)'}`)

  // 예산: review_sources 에서 읽는다. 없으면 돌지 않는다 — 소스가 등록 전이면
  // 적재된 행도 없다.
  const { data: src, error: srcErr } = await supabase
    .from('review_sources')
    .select('min_interval_ms, daily_request_cap, enabled')
    .eq('key', 'hackernews')
    .maybeSingle()
  if (srcErr) {
    console.error(`❌ review_sources 조회 실패: ${srcErr.message}`)
    process.exit(1)
  }
  if (!src) {
    console.error('❌ review_sources 에 hackernews 행이 없다. 먼저 등록 마이그레이션을 적용한다.')
    process.exit(1)
  }
  const minIntervalMs = src.min_interval_ms ?? 2000
  const dailyCap = src.daily_request_cap ?? 200
  console.log(`- 예산: 간격 ${minIntervalMs}ms · 하루 상한 ${dailyCap}건`)

  // robots — #23 이후 통과해야 정상. 막히면 멈춘다.
  let robotsGroups = []
  try {
    const res = await fetch(`${FIREBASE_ORIGIN}/robots.txt`, { headers: { 'user-agent': PRODUCT_TOKEN } })
    robotsGroups = res.status === 200 ? parseRobots(await res.text()) : []
  } catch (e) {
    console.error(`❌ robots.txt 를 못 읽었다: ${e.message} — 요청하지 않는다`)
    process.exit(1)
  }
  const probe = robotsVerdict(robotsGroups, '/v0/item/1.json', PRODUCT_TOKEN)
  if (!probe.allowed) {
    console.error(`❌ robots 가 Firebase item 경로를 막는다 (${probe.reason}) — 멈춘다`)
    process.exit(1)
  }

  // 대상 행: hackernews 적재분 중 스레드 URL 이 있고 아직 ▲ 가 없는 것.
  const { data: rows, error: rowsErr } = await supabase
    .from('analysis_inputs')
    .select('id, raw_text, collected_at')
    .eq('source_type', 'review')
    .eq('source_key', 'hackernews')
    .like('raw_text', '%news.ycombinator.com/item?id=%')
    .not('raw_text', 'like', '%▲%')
    .order('collected_at', { ascending: false })
    .limit(scanLimit)
  if (rowsErr) {
    console.error(`❌ analysis_inputs 조회 실패: ${rowsErr.message}`)
    process.exit(1)
  }

  const { byStory, skipped } = groupByStory(rows ?? [])
  const storyIds = [...byStory.keys()]
  console.log(`- 스캔 ${rows?.length ?? 0}행 · 대상 스토리 ${storyIds.length}개 · 건너뜀 ${skipped}행`)

  if (storyIds.length === 0) {
    console.log('- 붙일 게 없다. 끝.')
    return
  }

  // 예산 안: 상한을 넘으면 최신 스토리부터 처리하고 나머지는 미룬다.
  const toFetch = storyIds.slice(0, dailyCap)
  const deferred = storyIds.length - toFetch.length
  if (deferred > 0) {
    console.log(`- ⚠️ 스토리 ${storyIds.length}개 > 상한 ${dailyCap} — ${toFetch.length}개만 처리, ${deferred}개는 다음 실행으로`)
  }

  let requests = 0
  let rowsUpdated = 0
  let storiesOk = 0
  // "물어봤는데 score 필드가 없다"(삭제·dead)와 "못 물어봤다"(HTTP/네트워크)를 가른다.
  let noScoreField = 0
  let httpFailed = 0
  let updateFailed = 0
  const started = Date.now()

  for (let i = 0; i < toFetch.length; i++) {
    const sid = toFetch[i]
    if (i > 0) await new Promise((r) => setTimeout(r, minIntervalMs))

    let score = null
    let asked = false
    try {
      const res = await fetch(`${FIREBASE_ORIGIN}/v0/item/${sid}.json`, {
        headers: { 'user-agent': PRODUCT_TOKEN },
        signal: AbortSignal.timeout(20_000),
      })
      requests++
      if (res.ok) {
        asked = true
        const item = await res.json()
        if (item && Number.isFinite(item.score)) score = item.score
      } else {
        console.log(`  - story ${sid}: HTTP ${res.status}`)
      }
    } catch (e) {
      console.log(`  - story ${sid}: 요청 실패 (${e.message})`)
    }

    if (score == null) {
      if (asked) noScoreField++
      else httpFailed++
      continue
    }
    storiesOk++

    for (const row of byStory.get(sid)) {
      const next = spliceStoryScore(row.raw_text, score)
      if (next === row.raw_text) continue
      if (apply) {
        const { error } = await supabase.from('analysis_inputs').update({ raw_text: next }).eq('id', row.id)
        if (error) {
          console.log(`  - row ${row.id}: UPDATE 실패 (${error.message})`)
          updateFailed++
          continue
        }
      }
      rowsUpdated++
    }
  }

  console.log(
    `- ${((Date.now() - started) / 1000).toFixed(1)}초 · 요청 ${requests}건 · score 받음 ${storiesOk} · score 필드 없음 ${noScoreField} · 조회 실패 ${httpFailed} · UPDATE 실패 ${updateFailed}`,
  )
  console.log(`- ${apply ? 'UPDATE 한' : 'UPDATE 대상'} 행: ${rowsUpdated}`)
  if (!apply) console.log('\n**dry-run 이었다. --apply 로 실제 반영한다.**')

  const verdict = enrichVerdict({ storiesOk, noScoreField, httpFailed, updateFailed })
  console.log(`- ${verdict.line}`)
  process.exitCode = verdict.code
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
