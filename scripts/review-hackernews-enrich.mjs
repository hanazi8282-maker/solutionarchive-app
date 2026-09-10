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
// ⚠️ 이건 파이프라인 필수 단계가 아니다. hackernews 는 enabled=false 이고,
//    이 스크립트는 **코드 완성**까지다 — 나이틀리 워크플로에 안 꽂았다.
//    돌릴지/언제 돌릴지는 남헌이 정한다.
//
// ⚠️ 기본은 dry-run 이다. `--apply` 를 명시해야 analysis_inputs 를 UPDATE 한다
//    (review-purge.mjs 와 같은 규약). raw_text 를 바꾸므로 지문 content_hash 와도
//    어긋난다 — 신규 소스라 기존 지문이 없어 지금은 무해하지만, 켠 뒤에 돌리려면
//    그 점을 감안해야 한다.
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
  let storiesNoScore = 0
  const started = Date.now()

  for (let i = 0; i < toFetch.length; i++) {
    const sid = toFetch[i]
    if (i > 0) await new Promise((r) => setTimeout(r, minIntervalMs))

    let score = null
    try {
      const res = await fetch(`${FIREBASE_ORIGIN}/v0/item/${sid}.json`, {
        headers: { 'user-agent': PRODUCT_TOKEN },
        signal: AbortSignal.timeout(20_000),
      })
      requests++
      if (res.ok) {
        const item = await res.json()
        if (item && Number.isFinite(item.score)) score = item.score
      }
    } catch (e) {
      console.log(`  - story ${sid}: 요청 실패 (${e.message})`)
    }

    if (score == null) {
      storiesNoScore++
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
          continue
        }
      }
      rowsUpdated++
    }
  }

  console.log(
    `- ${((Date.now() - started) / 1000).toFixed(1)}초 · 요청 ${requests}건 · score 받은 스토리 ${storiesOk} · score 없음 ${storiesNoScore}`,
  )
  console.log(`- ${apply ? 'UPDATE 한' : 'UPDATE 대상'} 행: ${rowsUpdated}`)
  if (!apply) console.log('\n**dry-run 이었다. --apply 로 실제 반영한다.**')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
