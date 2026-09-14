#!/usr/bin/env node
// 아침 Notion 푸시 — 오늘 새로 pending_review 도달한 초안(본문+자기답글+근거)과
// 오늘 새로 적립된 case_studies/case_moves 요약을 "CMO 발행 대기함" Notion DB에
// 페이지 단위로 만든다.
//
//   node --env-file=.env.local scripts/notion-push-digest.mjs [--date YYYY-MM-DD] [--dry]
//
// daily-cmo-loop.yml 의 digest 스텝(S8) 마지막 — status-render.mjs 재호출 이후 —
// 에서 호출된다. 별도 크론을 만들지 않는다. NOTION_API_TOKEN/NOTION_DATABASE_ID
// 가 없으면 "확인 불가"로 조용히 건너뛴다 — 이 스텝이 없다고 CMO 루프 본체
// (S0~S8, 10스텝 계약)가 실패해서는 안 된다.
//
// ⚠️ 본문은 drafts/threads/<date>-<slug>.{md,body.txt,selfreply.txt} 파일에서
//   그대로 읽는다. DB 를 다시 조인해서 만들지 않는다 — 이미 있는 원문을 또
//   조립하면 재조립 과정에서 글자가 달라질 여지가 생긴다(§7.2 류 함정).
//   posts 테이블은 "이게 실제로 pending_review 인가"만 확인하는 데 쓴다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'
import { notionRequest } from './notion-api.mjs'

// 호출부 호환 — 예전엔 이 파일에 정의돼 있었다. 정본은 notion-api.mjs.
export { notionRequest }

const BOTTLENECKS = ['AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION', 'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY']

function today(d = new Date()) { return d.toISOString().slice(0, 10) }

// Notion 블록은 문단당 2000자 제한이 있다. 넘으면 잘라 여러 블록으로 나눈다.
export function paragraphBlocks(text) {
  const chunks = []
  const paras = String(text ?? '').split(/\n{2,}/)
  for (const p of paras) {
    let s = p
    while (s.length > 1900) { chunks.push(s.slice(0, 1900)); s = s.slice(1900) }
    if (s.trim()) chunks.push(s)
  }
  return chunks.map((c) => ({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: c } }] },
  }))
}

export function heading(text) {
  return {
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  }
}

function divider() { return { object: 'block', type: 'divider', divider: {} } }

// ── 대기함 설명서 ────────────────────────────────────────────
//
// 정본은 content/guides/queue-guide.md 한 파일이다. 매 푸시마다 Notion DB 의
// 설명란(표 바로 위에 뜨는 자리)을 그 파일로 덮어쓴다 — 발행 루프를 고치면서
// 그 파일을 같이 고치면 Notion 이 따라온다. 사람이 Notion 에서 직접 고쳐도 다음
// 실행이 되돌린다. 그게 의도다 — 정본이 둘이면 둘 다 안 믿게 된다.
//
// 실패해도 푸시 본체를 세우지 않는다. 설명서가 하루 낡은 것과 그날 초안이
// 통째로 안 올라가는 것은 무게가 다르다.
export function guideText(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const f = path.join(repoRoot, 'content', 'guides', 'queue-guide.md')
  if (!fs.existsSync(f)) return null
  // 앞머리 HTML 주석은 편집자에게 남기는 말이라 Notion 으로 보내지 않는다.
  return fs.readFileSync(f, 'utf-8').replace(/^s*<!--[sS]*?-->s*/, '').trim() || null
}

/** Notion 설명란은 rich_text 조각당 2000자다. 넘으면 잘라 여러 조각으로 나눈다. */
export function descriptionRichText(text) {
  const out = []
  let s = String(text ?? '')
  while (s.length > 2000) { out.push(s.slice(0, 2000)); s = s.slice(2000) }
  if (s) out.push(s)
  return out.map((c) => ({ type: 'text', text: { content: c } }))
}

async function syncGuide(token, databaseId, dry) {
  const text = guideText()
  if (!text) { console.log('⏭️ 설명서 없음 — content/guides/queue-guide.md 를 못 찾았다'); return }
  if (dry) { console.log(`(dry) 설명서 동기화 ${text.length}자`); return }
  const r = await notionRequest(token, 'PATCH', `/databases/${databaseId}`, {
    description: descriptionRichText(text),
  })
  if (!r.ok) console.error(`⚠️ 설명서 동기화 실패(푸시는 계속한다) — ${r.error}`)
  else console.log(`✅ 대기함 설명서 동기화 ${text.length}자`)
}


/** drafts/threads/<date>-<slug>.md 에서 "무브 `<id>`" / "등급 X" / "출처 케이스 `<slug>`" 를 관대하게 뽑는다. */
export function parseDecisionDoc(mdText) {
  const moveId = mdText.match(/무브[^`]*`([0-9a-f-]{8,})`/i)?.[1] ?? null
  const grade = mdText.match(/등급\s*\*{0,2}([A-D])\*{0,2}/)?.[1] ?? null
  const bottleneck = BOTTLENECKS.find((b) => mdText.includes(b)) ?? null
  return { moveId, grade, bottleneck }
}

async function run() {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
  }
  const date = opt('date', today())
  const dry = argv.includes('--dry')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  const token = process.env.NOTION_API_TOKEN
  const databaseId = process.env.NOTION_DATABASE_ID
  if (!token || !databaseId) {
    console.log('ℹ️ NOTION_API_TOKEN/NOTION_DATABASE_ID 미설정 — Notion 푸시를 건너뛴다 (CMO 루프 본체엔 영향 없음).')
    process.exit(0)
  }

  // 설명서를 먼저 맞춘다. 오늘 올릴 초안이 0건이어도 설명서는 최신이어야 한다.
  await syncGuide(token, databaseId, dry)

  let supabase
  try { supabase = await createClient() }
  catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); process.exit(2) }
  if (!supabase) { console.error('⚠️ 확인 불가: Supabase 자격증명 미설정'); process.exit(2) }

  // ── 1) 오늘 새로 pending_review 도달한 초안 ──────────────────
  const { data: posts, error: postsErr } = await supabase.from('posts')
    .select('id,content_code,status,created_at,body')
    .eq('status', 'pending_review')
    .gte('created_at', `${date}T00:00:00Z`).lt('created_at', `${date}T23:59:59.999Z`)
  if (postsErr) { console.error(`⚠️ 확인 불가: posts 조회 실패 — ${postsErr.code ?? ''} ${postsErr.message}`); process.exit(2) }

  const draftsDir = path.join(repoRoot, 'drafts', 'threads')
  const files = fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir) : []
  const mdByPrefix = new Map()
  for (const f of files) {
    if (f.startsWith(date) && f.endsWith('.md')) mdByPrefix.set(f.replace(/\.md$/, ''), f)
  }

  let pushedPosts = 0
  const skipped = []
  for (const post of posts ?? []) {
    // content_code -> 파일명 접두(<date>-<slug>) 매핑은 content_items.source_case 로 한다.
    const ci = await supabase.from('content_items').select('source_case').eq('code', post.content_code).maybeSingle()
    const slug = ci.data?.source_case ?? null
    const stem = slug ? `${date}-${slug}` : null
    const mdFile = stem ? [...mdByPrefix.keys()].find((k) => k === stem || k.startsWith(stem)) : null
    if (!mdFile) { skipped.push(`${post.content_code} — 결정문서(drafts/threads/${stem}.md) 못 찾음`); continue }

    const md = fs.readFileSync(path.join(draftsDir, `${mdFile}.md`), 'utf-8')
    const body = fs.existsSync(path.join(draftsDir, `${mdFile}.body.txt`))
      ? fs.readFileSync(path.join(draftsDir, `${mdFile}.body.txt`), 'utf-8') : (post.body ?? '')
    const selfreply = fs.existsSync(path.join(draftsDir, `${mdFile}.selfreply.txt`))
      ? fs.readFileSync(path.join(draftsDir, `${mdFile}.selfreply.txt`), 'utf-8') : ''
    const { grade, bottleneck } = parseDecisionDoc(md)

    const props = {
      content_code: { title: [{ text: { content: post.content_code ?? mdFile } }] },
      케이스명: { rich_text: [{ text: { content: slug ?? '(미상)' } }] },
      상태: { select: { name: '검토중' } },
      생성일: { date: { start: post.created_at.slice(0, 10) } },
    }
    if (grade) props.등급 = { select: { name: grade } }
    if (bottleneck) props.병목 = { select: { name: bottleneck } }

    const children = [
      heading('본문'), ...paragraphBlocks(body),
      heading('자기답글 / 근거'), ...paragraphBlocks(selfreply),
    ]

    if (dry) { console.log(`(dry) push ${post.content_code} (${slug}, 등급 ${grade ?? '?'})`); pushedPosts++; continue }

    const created = await notionRequest(token, 'POST', '/pages', {
      parent: { database_id: databaseId }, properties: props, children,
    })
    if (!created.ok) { skipped.push(`${post.content_code} — Notion 생성 실패: ${created.error}`); continue }

    const link = await supabase.from('notion_sync_log').insert({
      post_id: post.id,
      notion_database_id: databaseId,
      notion_page_id: created.data.id,
      notion_page_url: created.data.url,
      pushed_body: `${body}\n\n---\n\n${selfreply}`,
      pushed_status: '검토중',
    })
    if (link.error) {
      const hint = ['42P01', 'PGRST205'].includes(link.error.code)
        ? ' — 마이그레이션 20260909000001_notion_sync_log.sql 미적용일 수 있다.' : ''
      console.error(`⚠️ ${post.content_code} Notion 페이지는 만들어졌지만(${created.data.id}) 스냅샷 저장 실패 — ${link.error.code ?? ''} ${link.error.message}${hint}`)
    }
    pushedPosts++
    console.log(`✅ ${post.content_code} → ${created.data.url}`)
  }

  // ── 2) 오늘 새로 적립된 case_studies 요약 ────────────────────
  const { data: cases, error: casesErr } = await supabase.from('case_studies')
    .select('id,slug,brand_name,bottleneck,outcome_status,created_at')
    .gte('created_at', `${date}T00:00:00Z`).lt('created_at', `${date}T23:59:59.999Z`)
  if (casesErr) console.error(`⚠️ case_studies 조회 실패 — ${casesErr.code ?? ''} ${casesErr.message}`)

  let pushedCases = 0
  for (const c of cases ?? []) {
    const { data: moves } = await supabase.from('case_moves')
      .select('lever,evidence_grade,outcome_direction,claim').eq('case_study_id', c.id)
    const bestGrade = ['A', 'B', 'C', 'D'].find((g) => (moves ?? []).some((m) => m.evidence_grade === g)) ?? null

    const props = {
      content_code: { title: [{ text: { content: `CASE-${c.slug}` } }] },
      케이스명: { rich_text: [{ text: { content: c.brand_name ?? c.slug } }] },
      상태: { select: { name: '검토중' } },
      생성일: { date: { start: c.created_at.slice(0, 10) } },
    }
    if (bestGrade) props.등급 = { select: { name: bestGrade } }
    if (c.bottleneck) props.병목 = { select: { name: c.bottleneck } }

    const summary = (moves ?? []).map((m) => `- [${m.evidence_grade}] ${m.lever} (${m.outcome_direction}) — ${m.claim}`).join('\n\n')
    const children = [heading(`신규 적립 케이스 — ${c.outcome_status}`), ...paragraphBlocks(summary || '(무브 없음)')]

    if (dry) { console.log(`(dry) push CASE-${c.slug} (moves ${moves?.length ?? 0})`); pushedCases++; continue }

    const created = await notionRequest(token, 'POST', '/pages', {
      parent: { database_id: databaseId }, properties: props, children,
    })
    if (!created.ok) { skipped.push(`CASE-${c.slug} — Notion 생성 실패: ${created.error}`); continue }
    pushedCases++
    console.log(`✅ CASE-${c.slug} → ${created.data.url}`)
  }

  console.log(`\n푸시 완료 — 초안 ${pushedPosts}건 · 신규케이스 ${pushedCases}건 · 스킵 ${skipped.length}건`)
  for (const s of skipped) console.log(`  ⏭️ ${s}`)
  process.exit(0)
}

// import 될 때(예: 테스트에서 helper 함수만 가져다 쓸 때) run() 이 따라 실행되지
// 않게 막는다 — research-queue.mjs 등 이 리포의 다른 CLI 스크립트와 같은 관례.
function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}
if (isMain()) run()
