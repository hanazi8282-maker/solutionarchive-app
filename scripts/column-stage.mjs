#!/usr/bin/env node
// drafts/columns/*.md(칼럼) + 짝 .threads.md·.verify.md 를 content_columns 에 적재한다.
// /columns 화면(사람 검수)이 이 테이블을 읽는다. 정본은 여전히 파일 — 이건 검수용 사본이다.
//
// 사람이 CLI 로 돌린다(무인 루프 아님, cmo-daily.mjs 스텝이 아니다 — CLAUDE.md §10.1
// "승인·발행은 사람만"과 같은 이유로, 검수 대상에 뭐가 올라가는지도 사람이 통제한다).
//
//   node --env-file=.env.local scripts/column-stage.mjs                              # drafts/columns/ 전체
//   node --env-file=.env.local scripts/column-stage.mjs drafts/columns/2026-09-15-juicero.md   # 특정 파일만
//   node scripts/column-stage.mjs --self-test                                        # DB 없이 파싱만 검증
//
// 규칙:
// - column-check.mjs 기계 점검에 오류가 있는 칼럼은 올리지 않는다 — 기계 점검도 못 통과한 걸
//   사람에게 검수하라고 올리지 않는다. §10 점검(자체 점검)은 .research.md 에 있어도 인정된다
//   (checkColumn 의 기존 규약 그대로 재사용).
// - slug 가 이미 있으면 본문·스레드·검증 필드만 갱신하고 review_status·review_note·
//   reviewed_by·reviewed_at 은 건드리지 않는다 — 재적재가 사람의 기존 결정을 지우면 안 된다.
// - 독자 유형은 칼럼 첫머리 `독자: 창업자|셀러` 줄에서 그대로 읽는다(checkColumn 이 이미 검증).
//
// 종료 코드: 0 = 정상(대상 0건 포함) · 1 = 하나라도 기계 점검 오류·DB 오류 · 2 = 확인 불가(env 없음)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkColumn, checkThreads } from './column-check.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COLUMNS_DIR = path.join(HERE, '..', 'drafts', 'columns')

/** 대상 칼럼 .md 경로 목록. 인자가 있으면 그대로, 없으면 drafts/columns/ 전체 중 본편만
 *  (.research/.analysis/.verify/.threads 짝 파일과 _review/ 하위는 제외). */
export function discoverColumns(dir, explicit) {
  if (explicit?.length) return explicit
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => /\.md$/.test(f) && !/\.(research|analysis|verify|threads)\.md$/.test(f))
    .map((f) => path.join(dir, f))
    .sort()
}

const slugOf = (mdPath) => path.basename(mdPath, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '')
const pair = (mdPath, suffix) => mdPath.replace(/\.md$/, suffix)
const readIfExists = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null)

/** .verify.md 첫 줄의 "판정: ..." 문구만 뽑는다 — 전문을 안 옮기는 건 검수 화면이
 *  파일을 또 하나 요약하는 게 아니라 진짜 판정만 배지로 보이게 하려는 것. */
export function extractVerdict(verifyText) {
  if (!verifyText) return null
  const m = verifyText.match(/\*{0,2}판정\s*:\s*([^\n*]+)/)
  return m ? m[1].trim() : null
}

/** 파일 한 벌 → DB 행(하나) 또는 { error }. DB 를 부르지 않는다 — 그래서 --self-test 가 가능하다. */
export function buildRow(mdPath) {
  const src = readIfExists(mdPath)
  if (src === null) return { error: `파일 없음: ${mdPath}` }

  const researchPath = pair(mdPath, '.research.md')
  const research = readIfExists(researchPath) ?? ''
  const check = checkColumn(src, research)
  if (check.errors.length) {
    return { error: `기계 점검 실패(${path.basename(mdPath)}): ${check.errors.join(' / ')}` }
  }

  const readerMatch = src.match(/^독자:\s*(창업자|셀러)/m)
  if (!readerMatch) return { error: `독자 유형을 못 찾음: ${mdPath}` } // checkColumn 이 이미 걸렀겠지만 방어적으로.
  const titleMatch = src.match(/^#\s+(.+)$/m)
  // 칼럼 md 첫머리의 `case_slug: <slug>` (있으면) -> content_columns.case_study_slug(20260929000003).
  // 없으면 필드 자체를 안 싣는다 — 마이그 미적용 DB 에서도 적재가 깨지지 않게.
  const caseMatch = src.match(/^case_slug:\s*([\w-]+)\s*$/m)

  const threadsPath = pair(mdPath, '.threads.md')
  const threadsSrc = readIfExists(threadsPath)
  const threads = threadsSrc
    ? checkThreads(threadsSrc).map((t) => ({ n: t.n, body: t.body, char_count: t.chars, warns: t.warns }))
    : []

  const verifyPath = pair(mdPath, '.verify.md')
  const verifyText = readIfExists(verifyPath)

  return {
    row: {
      slug: slugOf(mdPath),
      source_path: path.relative(path.join(HERE, '..'), mdPath).replace(/\\/g, '/'),
      reader_type: readerMatch[1],
      title: titleMatch ? titleMatch[1].trim() : slugOf(mdPath),
      body: src,
      char_count: check.chars,
      threads,
      verify_path: verifyText ? path.relative(path.join(HERE, '..'), verifyPath).replace(/\\/g, '/') : null,
      verify_verdict: extractVerdict(verifyText),
      ...(caseMatch ? { case_study_slug: caseMatch[1] } : {}),
    },
  }
}

async function stageAll(targets) {
  const { createClient } = await import('../lib/supabase/server.ts')
  const supabase = await createClient()
  if (!supabase) {
    console.error('❌ 확인 불가 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    return 2
  }

  let failed = 0
  let staged = 0
  for (const mdPath of targets) {
    const built = buildRow(mdPath)
    if (built.error) {
      console.error(`✗ ${built.error}`)
      failed++
      continue
    }
    // ON CONFLICT DO UPDATE 이지만 review_status 등 사람 결정 컬럼은 SET 절에 없다 —
    // 즉 갱신되지 않고 기존 값이 그대로 남는다(신규 행이면 DEFAULT 'draft'가 적용된다).
    const payload = { ...built.row, staged_at: new Date().toISOString() }
    const upsert = (row) => supabase.from('content_columns').upsert(row, { onConflict: 'slug', ignoreDuplicates: false })
    let { error } = await upsert(payload)
    // 20260929000003 미적용 DB 에는 case_study_slug 컬럼이 없다 — 그 한 줄만 빼고 다시 올린다.
    // 링크가 빠지는 것과 칼럼이 통째로 안 올라가는 것은 무게가 다르다.
    if (error && /case_study_slug/.test(error.message)) {
      const rest = { ...payload }
      delete rest.case_study_slug
      ;({ error } = await upsert(rest))
      if (!error) console.warn(`⚠️ ${built.row.slug}: case_study_slug 컬럼 없음(20260929000003 미적용) — 케이스 링크 없이 적재`)
    }
    if (error) {
      console.error(`✗ ${built.row.slug}: DB 적재 실패 — ${error.message}`)
      failed++
      continue
    }
    console.log(`✓ ${built.row.slug} (${built.row.char_count}자, 스레드 ${built.row.threads.length}편${built.row.verify_verdict ? `, 검증: ${built.row.verify_verdict.slice(0, 30)}` : ', 미검증'})`)
    staged++
  }
  console.log(`\n적재 ${staged}건 · 실패 ${failed}건`)
  return failed ? 1 : 0
}

function selfTest() {
  const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'colstage-'))
  const body = `독자: 창업자\n\n# 제목\n\n${'가'.repeat(3100)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검 (가이드 §10)\n0. 예\n`
  fs.writeFileSync(path.join(tmp, '2026-09-15-demo.md'), body)
  fs.writeFileSync(path.join(tmp, '2026-09-15-demo.threads.md'),
    `# t\n\n## 1편\n\n- 마무리 유형: 질문\n\n\`\`\`text\n${'나'.repeat(300)}\n\`\`\`\n`)
  fs.writeFileSync(path.join(tmp, '2026-09-15-demo.verify.md'), '**판정: 수정 후 통과.** 지어낸 숫자 0건.\n')

  const files = discoverColumns(tmp, null)
  assert(files.length === 1, `discoverColumns 는 본편 1개만 — 실제 ${files.length}`)

  const built = buildRow(files[0])
  assert(!built.error, `정상 칼럼인데 error: ${built.error}`)
  assert(built.row.slug === 'demo', `slug 파싱: ${built.row.slug}`)
  assert(built.row.reader_type === '창업자', 'reader_type 파싱')
  assert(built.row.title === '제목', 'title 파싱')
  assert(built.row.threads.length === 1 && built.row.threads[0].body.length === 300, '스레드 파싱')
  assert(built.row.verify_verdict?.includes('수정 후 통과'), `verify_verdict 파싱: ${built.row.verify_verdict}`)

  // .threads.md / .verify.md 가 없어도(어제 파일럿처럼) 에러 없이 미검증으로 올라가야 한다.
  const noExtra = path.join(tmp, '2026-09-15-bare.md')
  fs.writeFileSync(noExtra, body)
  const bare = buildRow(noExtra)
  assert(!bare.error, `짝 파일 없어도 통과해야: ${bare.error}`)
  assert(bare.row.threads.length === 0 && bare.row.verify_verdict === null, '짝 파일 없음 = 빈 스레드·미검증(null)')

  assert(!('case_study_slug' in bare.row), 'case_slug 줄이 없으면 필드 자체를 싣지 않는다(마이그 미적용 대비)')

  // case_slug 줄이 있으면 그대로 실린다.
  const linked = path.join(tmp, '2026-09-15-linked.md')
  fs.writeFileSync(linked, body.replace('독자: 창업자', '독자: 창업자\ncase_slug: convertkit-concierge-migration-conversion'))
  const linkedBuilt = buildRow(linked)
  assert(linkedBuilt.row?.case_study_slug === 'convertkit-concierge-migration-conversion', `case_slug 파싱: ${linkedBuilt.row?.case_study_slug ?? linkedBuilt.error}`)

  // 기계 점검 실패(분량 미달)는 올리지 않는다.
  const bad = path.join(tmp, '2026-09-15-bad.md')
  fs.writeFileSync(bad, '독자: 창업자\n\n# 제목\n\n너무 짧다\n')
  const badBuilt = buildRow(bad)
  assert(Boolean(badBuilt.error), '기계 점검 실패 칼럼은 error 를 돌려줘야')

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('self-test ok')
}

const args = process.argv.slice(2)
if (args[0] === '--self-test') {
  selfTest()
} else if (args[0] === '--help') {
  console.log('usage: node scripts/column-stage.mjs [파일...] | --self-test')
} else {
  const targets = discoverColumns(COLUMNS_DIR, args.length ? args : null)
  if (!targets.length) {
    console.log('적재 대상 0건 (drafts/columns/ 에 본편 .md 없음)')
    process.exit(0)
  }
  process.exit(await stageAll(targets))
}
