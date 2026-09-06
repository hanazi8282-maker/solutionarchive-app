#!/usr/bin/env node
// 케이스스터디 검수 CLI — 초안을 DB 에 올리고, 사람이 승인/반려한다.
//
// 역할 분담
//   case-research.mjs  로컬 JSON 초안 (DB 안 건드림)
//   case-review.mjs    ← 여기서만 DB 에 쓴다
//
// ★ commit 은 승인이 아니다. review_status='draft' 로 들어간다.
//   승인은 사람이 approve 로 따로 한다. 조사한 주체와 승인하는 주체를
//   분리하는 게 이 CLI 의 존재 이유다 (CLAUDE.md §10: 사람 최종 검수 필수).
//
// ★ 승인 단위는 케이스가 아니라 **무브**다. 무브 5개 중 1개가 미심쩍다고
//   나머지 4개까지 묶어서 막지 않는다.
//
// 사용:
//   node --env-file=.env.local scripts/case-review.mjs list
//   node --env-file=.env.local scripts/case-review.mjs commit  --slug notion
//   node --env-file=.env.local scripts/case-review.mjs show    --slug notion
//   node --env-file=.env.local scripts/case-review.mjs approve --slug notion --move 0 --by 남헌
//   node --env-file=.env.local scripts/case-review.mjs approve --slug notion --case   --by 남헌
//   node --env-file=.env.local scripts/case-review.mjs reject  --slug notion --move 1 --by 남헌
//
// 종료 코드: 0 정상 / 1 음성(거절·불일치) / 2 확인 불가(테이블 없음·설정 없음 등)

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { validateDraft, toRows } from '../lib/cases/draft.ts'

const DRAFT_DIR = path.join(process.cwd(), 'drafts', 'cases')

const args = process.argv.slice(2)
const cmd = args[0]
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const supabase = await createClient()
if (!supabase) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 — 확인 불가')
  process.exit(2)
}

/**
 * ⚠️ 에러를 "없음"으로 접지 않는다 (§7.1).
 *   42P01/PGRST205 = 테이블이 없다 → 마이그레이션 미적용. 확인 불가로 올린다.
 *   그 밖의 에러도 조용히 빈 결과로 만들지 않는다.
 */
const die = (kind, msg) => {
  console.error(`✗ ${kind}: ${msg}`)
  if (/42P01|PGRST205|does not exist/i.test(msg)) {
    console.error('  → 20260906000001_case_study_pipeline.sql 이 아직 적용되지 않았다.')
    console.error('    §12-5 규약상 대시보드 SQL Editor 에서만 실행한다. CLI 로 적용하지 마라.')
  }
  process.exit(2)
}
const must = ({ data, error }, what) => {
  if (error) die('확인 불가', `${what} — ${error.code ?? ''} ${error.message}`)
  return data
}

const fetchStudy = async (slug) => {
  const rows = must(
    await supabase.from('case_studies').select('*').eq('slug', slug).limit(1),
    `case_studies(slug=${slug}) 조회`,
  )
  return rows?.[0] ?? null
}
const fetchMoves = async (studyId) =>
  must(
    await supabase.from('case_moves').select('*').eq('case_study_id', studyId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }),
    'case_moves 조회',
  ) ?? []

// ────────────────────────────────────────────────────────────
// commit — 로컬 초안 → DB (draft 상태로)
// ────────────────────────────────────────────────────────────
async function commit() {
  const slug = opt('slug')
  if (!slug) { console.error('사용: commit --slug <slug>'); process.exit(2) }
  const p = path.join(DRAFT_DIR, `${slug}.json`)
  if (!fs.existsSync(p)) die('확인 불가', `초안 파일이 없다: ${p}`)

  let draft
  try { draft = JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch (e) { die('확인 불가', `JSON 파싱 실패 — ${e.message}`) }

  const issues = validateDraft(draft)
  const errors = issues.filter(i => i.level === 'error')
  if (errors.length > 0) {
    console.error(`✗ 음성: 검증 error ${errors.length}건 — DB 에 넣지 않는다`)
    for (const e of errors) console.error(`  ❌ ${e.where}: ${e.message}`)
    process.exit(1)
  }
  for (const w of issues) console.log(`  ⚠️  ${w.where}: ${w.message}`)

  const { study, moves, evidence } = toRows(draft)

  // 같은 slug 를 두 번 조사했으면 케이스를 새로 만들지 않고 무브를 덧붙인다.
  let existing = await fetchStudy(slug)
  if (existing) {
    console.log(`ℹ️  기존 케이스에 덧붙인다 (slug=${slug}, review_status=${existing.review_status})`)
  } else {
    const inserted = must(
      await supabase.from('case_studies').insert(study).select('*'),
      'case_studies INSERT',
    )
    existing = inserted[0]
    console.log(`✅ case_studies 1행 (id=${existing.id}, review_status=${existing.review_status})`)
  }

  const moveIds = []
  for (const m of moves) {
    const rows = must(
      await supabase.from('case_moves')
        .insert({ ...m.row, case_study_id: existing.id }).select('id'),
      `case_moves INSERT (moves[${m.index}])`,
    )
    moveIds[m.index] = rows[0].id
    console.log(`✅ case_moves [${m.row.evidence_grade}] ${m.row.lever} — ${m.grade_reason}`)
  }

  // ★ 마이그 20260906000003(is_issuer_defined_metric) 이 적용됐는지 첫 행에서 확인한다.
  //   미적용이면 PostgREST 가 PGRST204 로 거절한다 — 그때는 그 축을 빼고 저장하되,
  //   조용히 떨어뜨리지 않고 크게 경고한다. retrieved_at 이 그렇게 사라졌었다(L-59).
  let issuerAxis = true
  let droppedIssuerAxis = 0
  let evCount = 0
  for (const e of evidence) {
    const row = {
      case_study_id: existing.id,
      case_move_id: e.move === null || e.move === undefined ? null : moveIds[e.move] ?? null,
      url: e.url,
      domain: (() => { try { return new URL(e.url).hostname.replace(/^www\./, '') } catch { return null } })(),
      source_tier: e.source_tier ?? 'tertiary',
      is_self_reported: e.is_self_reported ?? false,
      is_estimate: e.is_estimate ?? false,
      is_regulatory_filing: e.is_regulatory_filing ?? false,
      published_at: e.published_at ?? null,
      snippet: e.snippet ?? null,
      supports_claim: e.supports_claim ?? null,
    }
    // retrieved_at 은 NOT NULL DEFAULT now() 다 — 비었으면 키를 아예 안 넣어야 기본값이 산다.
    if (e.retrieved_at) row.retrieved_at = e.retrieved_at
    if (issuerAxis) row.is_issuer_defined_metric = e.is_issuer_defined_metric ?? false

    let res = await supabase.from('case_evidence').insert(row).select('id')
    if (res.error && /is_issuer_defined_metric/.test(res.error.message ?? '')) {
      issuerAxis = false
      delete row.is_issuer_defined_metric
      res = await supabase.from('case_evidence').insert(row).select('id')
    }
    if (!issuerAxis && (e.is_issuer_defined_metric ?? false)) droppedIssuerAxis++
    must(res, 'case_evidence INSERT')
    evCount++
  }
  console.log(`✅ case_evidence ${evCount}행`)
  if (!issuerAxis) {
    console.log('⚠️ is_issuer_defined_metric 컬럼이 DB 에 없다 — 마이그 20260906000003 미적용.')
    console.log(`   그 축을 뺀 채로 저장했다. 초안에서 true 였던 근거 ${droppedIssuerAxis}건이 DB 에는 안 들어갔다.`)
    console.log('   → 마이그 적용 후 그 행들을 다시 채워야 등급 재계산이 재현된다.')
  }
  console.log('\n전부 review_status=draft 다. 승인은 사람이:')
  console.log(`  node --env-file=.env.local scripts/case-review.mjs show --slug ${slug}`)
}

// ────────────────────────────────────────────────────────────
// list / show
// ────────────────────────────────────────────────────────────
async function list() {
  const rows = must(
    await supabase.from('case_studies')
      .select('slug, brand_name, bottleneck, business_model, outcome_status, review_status')
      .order('created_at', { ascending: false }),
    'case_studies 목록',
  ) ?? []

  const localFiles = fs.existsSync(DRAFT_DIR)
    ? fs.readdirSync(DRAFT_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    : []
  const inDb = new Set(rows.map(r => r.slug))

  console.log(`DB 케이스 ${rows.length}건`)
  for (const r of rows) {
    console.log(`  [${r.review_status}] ${r.slug} — ${r.brand_name} `
      + `· ${r.bottleneck ?? '병목없음'} · ${r.business_model ?? '모델없음'} · ${r.outcome_status}`)
  }
  const notCommitted = localFiles.filter(s => !inDb.has(s))
  console.log(`\n로컬 초안 ${localFiles.length}건 · 그중 미반영 ${notCommitted.length}건`)
  for (const s of notCommitted) console.log(`  (미반영) ${s}`)
  if (rows.length === 0 && localFiles.length > 0) {
    console.log('\n⚠️ DB 0건인데 로컬 초안은 있다. "케이스 없음"이 아니라 "아직 안 올렸다"다.')
  }
}

async function show() {
  const slug = opt('slug')
  if (!slug) { console.error('사용: show --slug <slug>'); process.exit(2) }
  const study = await fetchStudy(slug)
  if (!study) {
    console.error(`✗ 음성: DB 에 slug=${slug} 가 없다 (테이블 조회 자체는 성공했다)`)
    process.exit(1)
  }
  console.log(`${study.brand_name} (${study.slug})`)
  console.log(`  검수 ${study.review_status} · 결말 ${study.outcome_status}`)
  console.log(`  ${study.bottleneck ?? '병목없음'} / ${study.business_model ?? '-'} / `
    + `${study.buyer_type ?? '-'} / ${study.price_band ?? '-'}`)
  if (study.summary) console.log(`  ${study.summary}`)

  const moves = await fetchMoves(study.id)
  console.log(`\n무브 ${moves.length}건 (--move 인덱스는 아래 번호다)`)
  moves.forEach((m, i) => {
    const metric = m.metric_after === null ? '수치 없음'
      : `${m.metric_name}: ${m.metric_before ?? '?'} → ${m.metric_after}${m.metric_unit ?? ''}`
    console.log(`  ${i}. [${m.review_status}|${m.evidence_grade}] ${m.lever} (${m.outcome_direction})`)
    console.log(`     ${m.claim}`)
    console.log(`     ${metric} · 관측 ${m.observed_period_start ?? '?'}~${m.observed_period_end ?? '?'}`)
  })

  const ev = must(
    await supabase.from('case_evidence')
      .select('url, source_tier, is_self_reported, published_at, case_move_id')
      .eq('case_study_id', study.id),
    'case_evidence 조회',
  ) ?? []
  console.log(`\n근거 ${ev.length}건`)
  for (const e of ev) {
    const idx = moves.findIndex(m => m.id === e.case_move_id)
    console.log(`  [${e.source_tier}${e.is_self_reported ? '·자기보고' : ''}] `
      + `${e.published_at ?? '시점없음'} · move ${idx >= 0 ? idx : '-'} · ${e.url}`)
  }
}

// ────────────────────────────────────────────────────────────
// approve / reject
// ────────────────────────────────────────────────────────────
async function decide(status) {
  const slug = opt('slug')
  const by = opt('by')
  const moveArg = opt('move')
  if (!slug || !by) {
    console.error(`사용: ${status === 'approved' ? 'approve' : 'reject'} --slug <slug> --by <이름> [--move <n> | --case]`)
    console.error('  --by 는 필수다. 누가 승인했는지 없는 승인은 검수가 아니다.')
    process.exit(2)
  }
  if (moveArg === null && !flag('case') && !flag('all-moves')) {
    console.error('✗ 대상을 정해라: --move <n> (무브 1개) / --all-moves (무브 전부) / --case (케이스)')
    process.exit(2)
  }
  const study = await fetchStudy(slug)
  if (!study) { console.error(`✗ 음성: slug=${slug} 없음`); process.exit(1) }
  const moves = await fetchMoves(study.id)

  if (moveArg !== null || flag('all-moves')) {
    let targets
    if (flag('all-moves')) targets = moves
    else {
      const i = Number(moveArg)
      if (!Number.isInteger(i) || i < 0 || i >= moves.length) {
        console.error(`✗ move 인덱스 범위 밖: ${moveArg} (무브 ${moves.length}개)`)
        process.exit(1)
      }
      targets = [moves[i]]
    }
    for (const m of targets) {
      must(
        await supabase.from('case_moves').update({ review_status: status }).eq('id', m.id).select('id'),
        'case_moves UPDATE',
      )
      // 아래 --case 경고가 이 스냅샷을 다시 읽는다. 갱신해 두지 않으면 방금 승인한
      // 무브를 "아직 draft 다"라고 보고한다 — 거짓 경보도 오보다(§7.1).
      m.review_status = status
      console.log(`✅ ${status} — [${m.evidence_grade}] ${m.lever}: ${m.claim.slice(0, 50)}`)
      if (status === 'approved' && m.outcome_direction === 'negative' && m.evidence_grade !== 'A') {
        console.log(`   ⚠️ 부정 사례인데 등급 ${m.evidence_grade} 다. 승인은 됐지만 발행 대상은 아니다.`)
      }
    }
  }

  if (flag('case')) {
    must(
      await supabase.from('case_studies')
        .update({ review_status: status, reviewed_by: by, reviewed_at: new Date().toISOString() })
        .eq('id', study.id).select('id'),
      'case_studies UPDATE',
    )
    console.log(`✅ 케이스 ${status} — ${study.brand_name} (검수자 ${by})`)
    const pending = moves.filter(m => m.review_status === 'draft').length
    if (status === 'approved' && pending > 0) {
      console.log(`   ⚠️ 아직 draft 인 무브가 ${pending}건 있다. 케이스가 승인돼도 이 무브들은 안 쓰인다.`)
      console.log('      "케이스 승인 = 무브 전부 승인"이 아니다.')
    }
  }
}

switch (cmd) {
  case 'commit': await commit(); break
  case 'list': await list(); break
  case 'show': await show(); break
  case 'approve': await decide('approved'); break
  case 'reject': await decide('rejected'); break
  default:
    console.error('명령: commit | list | show | approve | reject')
    process.exit(2)
}
