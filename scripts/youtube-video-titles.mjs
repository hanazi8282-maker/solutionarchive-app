#!/usr/bin/env node
// YouTube 영상 제목·채널을 videos.list 로 받아 youtube_videos 에 upsert 한다(사람이 실행하는 1회성·가끔 도구).
//
// 영상 ID 출처: review_targets(source_key='youtube').product_ref `v:<id>` — 댓글 머리말 `[YouTube 댓글 · <id>]` 와 같은 ID.
//   `--ids a,b,c` 로 직접 줄 수도 있다(타깃에서 지워진 영상 등).
// 호출: videos.list?part=snippet&id=<최대 50개 쉼표> — 50개당 1유닛. 영상 20개면 1회.
//
// 지키는 것
//   · 기본은 드라이런 — API 는 부르지만(키가 있으면) DB 에 쓰지 않는다. 쓰기는 `--apply`.
//   · 쿼터 초과·차단은 그 자리에서 멈춘다. 다른 키·프록시·재시도로 우회하지 않는다.
//   · 403 정책 계열(쿼터 아닌 403)은 별도 종료코드 5 + `::error::` 로그 — 사람이 API 콘솔·약관을 본다.
//   · 키·요청 URL 은 출력하지 않는다(URL 에 key 가 들어간다).
//   · summary_line 은 payload 에 없다 — 사람이 쓴 요약을 덮지 않는다.
//   · 30일 보존 규칙은 기존 override 그대로 — 이 스크립트는 지우지 않는다.
//
// 사용:
//   node --env-file=.env.local scripts/youtube-video-titles.mjs            # 드라이런
//   node --env-file=.env.local scripts/youtube-video-titles.mjs --apply    # upsert
//   ... --ids dQw4w9WgXcQ,xxxxxxxxxxx                                      # 타깃 대신 직접 지정
//
// env: YOUTUBE_API_KEY · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (lib/supabase/server.ts)
// 종료코드: 0 정상 · 2 설정/조회 실패 · 3 저장 실패 · 4 쿼터 초과 · 5 정책 경고(403 비쿼터) · 6 그 밖의 API/응답 이상

import { createClient } from '../lib/supabase/server.ts'
import { parseProductRef } from '../lib/review/adapters/youtube.ts'
import { chunkVideoIds, classifyVideosError, parseVideosList } from '../lib/review/youtube-videos.ts'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const idsArg = args.find((a) => a.startsWith('--ids='))?.slice(6) ?? (args.includes('--ids') ? args[args.indexOf('--ids') + 1] : null)
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const fatal = (code, m) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${m}`)
  console.error(`✗ ${m}`)
  process.exit(code)
}

const key = process.env.YOUTUBE_API_KEY
if (apply && !key) fatal(2, 'YOUTUBE_API_KEY 가 없다 — --apply 를 시작하지 않는다')

const needDb = apply || !idsArg
const supabase = needDb ? await createClient() : null
if (needDb && !supabase) fatal(2, 'DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')

let ids
if (idsArg) {
  ids = idsArg.split(',')
} else {
  const { data, error } = await supabase.from('review_targets').select('product_ref').eq('source_key', 'youtube')
  if (error) fatal(2, `review_targets 조회 실패: ${error.message}`)
  ids = (data ?? []).map((r) => parseProductRef(r.product_ref)).filter(Boolean)
}
const chunks = chunkVideoIds(ids)
const total = chunks.reduce((s, c) => s + c.length, 0)
log(`${apply ? '적용' : '드라이런'} — 영상 ${total}개(${idsArg ? '--ids' : 'review_targets'}) · videos.list ${chunks.length}회(=${chunks.length}유닛)`)
if (total === 0) {
  log('영상 ID 0개 — 할 일 없음. (타깃이 비었는지, product_ref 형식이 v:<11자> 인지 확인)')
  process.exit(0)
}
if (!key) {
  log(`YOUTUBE_API_KEY 없음 — API 조회 생략(드라이런). 대상: ${chunks.flat().join(', ')}`)
  process.exit(0)
}

const rows = []
const missing = []
for (const [i, chunk] of chunks.entries()) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunk.join(',')}&maxResults=${chunk.length}&key=${encodeURIComponent(key)}`
  let res
  let body
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    body = await res.text()
  } catch (e) {
    fatal(6, `videos.list ${i + 1}/${chunks.length}회 호출 실패(네트워크·타임아웃): ${e instanceof Error ? e.name : 'error'} — 재시도하지 않는다`)
  }
  if (!res.ok) {
    const err = classifyVideosError(res.status, body)
    const where = `videos.list ${i + 1}/${chunks.length}회 HTTP ${res.status} reason=${err.reason ?? '(모름)'}`
    if (err.kind === 'quota') fatal(4, `${where} — 쿼터 초과. 우회하지 않고 멈춘다(내일 다시)`)
    if (err.kind === 'policy') fatal(5, `${where} — 정책 경고(403 비쿼터). 키·API 콘솔·YouTube API 약관 상태를 사람이 확인할 것. 우회하지 않는다`)
    fatal(6, `${where} — 응답 이상`)
  }
  const parsed = parseVideosList(body, chunk)
  // 200 인데 items 가 없으면 "0건"이 아니라 구조 이상이다(§7.1).
  if (!parsed) fatal(6, `videos.list ${i + 1}/${chunks.length}회 HTTP 200 인데 items 배열이 없다 — 구조 이상`)
  rows.push(...parsed.rows)
  missing.push(...parsed.missing)
}

for (const r of rows) log(`  · ${r.video_id} — ${r.title}${r.channel ? ` (채널: ${r.channel})` : ''}`)
if (missing.length > 0) log(`⚠️ 응답에 없거나 제목이 빈 영상 ${missing.length}개(비공개·삭제 추정): ${missing.join(', ')}`)
log(`받음 ${rows.length}/${total}개`)

if (!apply) {
  log('드라이런 — DB 쓰기 없음. 쓰려면 --apply')
  process.exit(0)
}

const fetchedAt = new Date().toISOString()
// summary_line 은 넣지 않는다 — 기존 값 유지.
const { error } = await supabase.from('youtube_videos').upsert(rows.map((r) => ({ ...r, fetched_at: fetchedAt })), { onConflict: 'video_id' })
if (error) {
  const hint = error.code === '42P01' || error.code === 'PGRST205' ? ' — 마이그 20261012000040 미적용' : ''
  fatal(3, `youtube_videos upsert 실패: ${error.code ?? ''} ${error.message}${hint}`)
}
log(`✓ youtube_videos upsert ${rows.length}행`)
process.exit(0)
