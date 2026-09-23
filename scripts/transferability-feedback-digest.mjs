#!/usr/bin/env node
// 이식성 반려 사유 하루치 다이제스트 — 사람이 채점 카드에 적은 "왜 못 옮기나"를 모아
// 다음 케이스 조사 프롬프트로 되돌린다. 설계: docs/transferability-feedback-loop.md
//
//   node scripts/transferability-feedback-digest.mjs             # 어제(KST) 분
//   node scripts/transferability-feedback-digest.mjs --date 2026-09-22
//   node scripts/transferability-feedback-digest.mjs --dry       # 파일을 쓰지 않고 stdout 만
//
// 왜 매 건 즉시가 아니라 하루치인가: 사유 1건은 표본이 아니라 일화다. 즉시 반영하면
// 어제 한 사람이 적은 한 줄이 오늘 조사 방향을 통째로 돌린다. 하루 모으면 반복되는
// 제약(자체 공장·규제·대규모 트래픽)이 보이고, 한 건짜리 변덕은 묻힌다.
//
// ⛔ 이 스크립트는 DB 를 **읽기만** 한다. UPDATE·INSERT 가 한 줄도 없다(CLAUDE.md §10.1).
//    커밋 대상은 `ops/state/` 프리픽스뿐이다 — 무인 루프 화이트리스트 안이다.
//
// ⚠️ 컬럼 미적용(마이그 20260930000005)은 "0건"이 아니라 **확인 불가**다. 종료코드 2 로
//    시끄럽게 닫고 파일을 쓰지 않는다. 0건 파일을 써 두면 다음 날 사람이 "어제 사유가
//    없었구나"로 읽는다 — 확인 실패를 음성으로 접는 정확히 그 사고다(CLAUDE.md §7.1).

import fs from 'node:fs'
import path from 'node:path'
import { kstDate } from '../lib/cases/grade-queue.ts'

export const OUT_DIR = path.join('ops', 'state', 'transferability-feedback')
/** latest.md 가 담는 기간. 14일이면 주 2회 채점 리듬에서 최소 4회분이 들어온다. */
export const LATEST_DAYS = 14

// ────────────────────────────────────────────────────────────
// 순수 함수 — 셀프테스트: scripts/transferability-digest-selftest.mjs
// ────────────────────────────────────────────────────────────

/** KST 달력 날짜(YYYY-MM-DD)에서 n일 이동. 달력 날짜를 UTC 자정으로 보고 더하므로 DST 영향이 없다. */
export function shiftDay(day, n) {
  const t = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * 하루치 항목 추출. 기준 시각은 `transferability_reason_at`(사유가 적힌 시각)이고
 * `reviewed_at`(승인 시각)이 아니다 — 옛 승인에 오늘 붙인 사유를 놓치지 않기 위해서다.
 * 사유가 빈 행은 버린다. 시각을 못 읽은 행도 그날 것으로 접지 않는다(§7.1).
 */
export function entriesForDay(rows, day) {
  return rows
    .filter((r) => String(r.transferability_reason ?? '').trim() !== '')
    .filter((r) => kstDate(r.transferability_reason_at) === day)
    .map((r) => ({
      brand: r.case_studies?.brand_name ?? '브랜드 미기재',
      slug: r.case_studies?.slug ?? '(슬러그 미상)',
      readerProblem: r.case_studies?.reader_problem ?? '미지정',
      lever: r.lever ?? '미기재',
      transferability: r.transferability ?? '미판정',
      reason: String(r.transferability_reason).trim(),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.lever.localeCompare(b.lever))
}

/** 하루치 마크다운. 0건이면 "0건"을 본문에 명시한다 — 파일 없음과 구분되게(§7.1). */
export function renderDay(day, entries) {
  const L = [
    `# 이식성 반려 사유 — ${day} (KST)`,
    '',
    '사람이 `/cases/grade` 카드에서 이식성을 LOW/MEDIUM 으로 고르며 적은 이유다.',
    '**규칙이 아니라 참고다** — 조사를 금지하는 목록이 아니고, 같은 제약을 또 주워 오지 말라는 신호다.',
    '',
  ]
  if (entries.length === 0) {
    L.push(`**0건** — 이 날(KST ${day}) 적힌 이식성 사유가 없다. 채점이 없었거나, 전부 HIGH 였거나, 이유를 비워 뒀다.`, '', '(파일이 없는 것과 다르다: 이 파일은 조회가 정상이었음을 뜻한다.)')
    return L.join('\n') + '\n'
  }
  L.push(`총 ${entries.length}건.`, '')
  for (const e of entries) {
    L.push(`- **${e.brand}** (\`${e.slug}\`) · 레버 ${e.lever} · 독자문제 ${e.readerProblem} · 이식성 ${e.transferability}`)
    L.push(`  - ${e.reason}`)
  }
  return L.join('\n') + '\n'
}

/**
 * 최근 N일 요약. `days` 는 `{ day, entries }` 배열(최신 먼저).
 * 프롬프트에 들어가는 파일이 이거다 — 그래서 맨 위 두 줄이 "이건 규칙이 아니다"여야 한다.
 */
export function renderLatest(days, through) {
  const all = days.flatMap((d) => d.entries)
  const byLevel = (lv) => all.filter((e) => e.transferability === lv).length
  const L = [
    `# 최근 이식성 반려 사유 (참고, 규칙 아님) — ${through} 기준 ${days.length}일`,
    '',
    '사람이 채점 카드에서 LOW/MEDIUM 을 고르며 적은 이유를 모았다. 조사 금지 목록이 아니다.',
    '여기 적힌 제약이 필수인 사례는 독자가 내일 옮길 수 없다 — 같은 종류를 또 고르지 않는 데 쓴다.',
    '',
    `총 ${all.length}건 (LOW ${byLevel('LOW')} · MEDIUM ${byLevel('MEDIUM')} · 그 밖 ${all.length - byLevel('LOW') - byLevel('MEDIUM')}).`,
    '',
  ]
  if (all.length === 0) {
    L.push(`**0건** — 최근 ${days.length}일간 적힌 사유가 없다. 조회는 정상이었다(§7.1: 확인 불가와 다르다).`)
    return L.join('\n') + '\n'
  }
  for (const d of days) {
    if (d.entries.length === 0) continue
    L.push(`## ${d.day} (${d.entries.length}건)`, '')
    for (const e of d.entries) L.push(`- ${e.reason}  — ${e.brand} · ${e.lever} · ${e.transferability}`)
    L.push('')
  }
  return L.join('\n').trimEnd() + '\n'
}

// ────────────────────────────────────────────────────────────
// 실행부 — 여기서만 DB·파일시스템을 만진다
// ────────────────────────────────────────────────────────────

const MISSING_COLUMN = new Set(['42703', 'PGRST204', 'PGRST202'])

/** 사유가 적힌 행 전부. `{ rows }` 또는 `{ error }` 또는 `{ missingColumn: true }`. */
export async function fetchReasonRows() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) return { error: 'Supabase 자격증명 미설정' }
  // ponytail: 전량 조회. 사유는 사람이 손으로 적는 값이라 연 단위로도 수백 행이다.
  //           수천 행이 되면 `.gte('transferability_reason_at', ...)` 로 좁힌다.
  const { data, error } = await sb
    .from('case_moves')
    .select('id, lever, transferability, transferability_reason, transferability_reason_at, case_studies(slug, brand_name, reader_problem)')
    .not('transferability_reason', 'is', null)
  if (error) {
    if (MISSING_COLUMN.has(error.code ?? '') || /transferability_reason/.test(error.message)) return { missingColumn: true, detail: `${error.code ?? ''} ${error.message}`.trim() }
    return { error: `${error.code ?? ''} ${error.message}`.trim() }
  }
  if (!Array.isArray(data)) return { error: '응답에 행 배열이 없다 — 확인 불가' }
  return { rows: data }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry')
  const at = argv.indexOf('--date')
  const today = kstDate(new Date().toISOString())
  const day = at >= 0 ? argv[at + 1] : shiftDay(today, -1)
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    console.error(`대상 날짜를 정하지 못했다: ${day} — 확인 불가로 종료한다.`)
    process.exit(2)
  }

  const res = await fetchReasonRows()
  if (res.missingColumn) {
    console.error(`확인 불가 — case_moves.transferability_reason 컬럼이 없다 (마이그 20260930000005 미적용). ${res.detail ?? ''}`)
    console.error('0건 파일을 쓰지 않는다. 컬럼을 적용한 뒤 다시 돌려라.')
    process.exit(2)
  }
  if (res.error) {
    console.error(`확인 불가 — ${res.error}. 파일을 쓰지 않는다.`)
    process.exit(2)
  }

  const dayDoc = renderDay(day, entriesForDay(res.rows, day))
  const window = Array.from({ length: LATEST_DAYS }, (_, i) => shiftDay(day, -i))
    .filter(Boolean)
    .map((d) => ({ day: d, entries: entriesForDay(res.rows, d) }))
  const latestDoc = renderLatest(window, day)

  const total = window.reduce((n, d) => n + d.entries.length, 0)
  console.log(`${day}: ${entriesForDay(res.rows, day).length}건 · 최근 ${LATEST_DAYS}일 ${total}건 (사유 있는 무브 전체 ${res.rows.length}행)`)

  if (dry) {
    console.log('--dry — 파일을 쓰지 않았다.\n')
    console.log(dayDoc)
    return
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUT_DIR, `${day}.md`), dayDoc, 'utf-8')
  fs.writeFileSync(path.join(OUT_DIR, 'latest.md'), latestDoc, 'utf-8')
  console.log(`썼다: ${path.join(OUT_DIR, `${day}.md`)} · ${path.join(OUT_DIR, 'latest.md')}`)
}

// 셀프테스트가 순수 함수만 가져다 쓸 수 있어야 한다 — import 만으로 DB 를 부르지 않는다.
if (process.argv[1] && process.argv[1].endsWith('transferability-feedback-digest.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
