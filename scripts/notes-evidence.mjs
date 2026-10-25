#!/usr/bin/env node
// 노트·지식관리('notes') 근거 측정 — 읽기 전용. 남헌 v53 §5 2-B(2026-10-12): 노트는 v71bg(10-26)에서 ⑤ 에 합쳐졌다 — 이 측정은 합치기 근거 재료로 남긴다(⑧ 은 업무관리).
//
// 대상: 'notes' 프로젝트 = analysis_projects.area_evidence 'notes:' 접두(candidate-register-draft.mjs 가 쓴다) ∪ 타깃 라벨 'notes:' 접두.
//       비교 기준 = 영역 ① 프로젝트(area_code='1'). 폐기 원문(purged_at·raw_text NULL)은 뺀다.
// 잰다:
//   1) 회의 맥락 언급 비율 — "회의록·미팅 노트·meeting notes·정리·transcript" 류(MEETING_RE)가 나온 글 ÷ 전체 글. 영역 ① 도 같은 식으로(기준선).
//   2) 불만 유형 태그(S/V/N) — 정의를 docs 에서 찾아 따른다. 정의 문서가 없으면 '확인 불가'(지어내지 않는다).
//   3) 영역 ① 과의 키워드 겹침 — 각 코퍼스 문서빈도 상위 K 키워드 집합의 겹침 비율(notes 기준)·자카드 + 겹친 키워드.
// 출력: --run 일 때만 reports/<KST 날짜>/notes-evidence.md(.gitignore — 커밋하지 않는다). 원문 인용은 넣지 않는다.
// notes 글이 0건이면 표를 만들지 않고 던진다(§7.1 — 등록 마이그 미적용·수집 전을 "0%"로 접지 않는다).
//
//   node scripts/notes-evidence.mjs            # 콘솔 요약만
//   node scripts/notes-evidence.mjs --run      # 파일 생성
//   옵션: --date=YYYY-MM-DD · --top=K(기본 100)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { kstDate, loadConfig, stripHeader } from './product-name-candidates.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const REPORTS_DIR = path.join(repoRoot, 'reports')
const DOCS_DIR = path.join(repoRoot, 'docs')

export const MEETING_RE = /회의록|회의\s*내용|미팅\s*노트|미팅\s*기록|meeting\s*(notes?|minutes|recap|summar)|정리|transcri(pt|be|ption)|녹취|받아\s*적/i
const SVN_RE = /\bS\s*[/·]\s*V\s*[/·]\s*N\b/

/** docs 에서 S/V/N 불만 유형 정의를 찾는다 → 파일 목록. 못 읽으면 던진다(§7.1). */
export function findSvnDefinition(dir = DOCS_DIR) {
  const hits = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md') && SVN_RE.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(repoRoot, p).replace(/\\/g, '/'))
    }
  }
  walk(dir)
  return hits
}

/** 글 → 키워드 집합(영문 3자↑ 소문자 · 한글 2자↑ 어절, config common_words 제외). */
export function keywords(text, stop) {
  const out = new Set()
  for (const m of stripHeader(text).toLowerCase().matchAll(/[a-z][a-z0-9]{2,}|[가-힣]{2,}/g)) if (!stop.has(m[0])) out.add(m[0])
  return out
}

/** 문서빈도 상위 K. 동수면 사전순(재현성). */
export function topK(texts, stop, k) {
  const df = new Map()
  for (const t of texts) for (const w of keywords(t, stop)) df.set(w, (df.get(w) ?? 0) + 1)
  return [...df.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([w]) => w)
}

/** 순수 함수: 측정. notes·area1 = 원문 배열. area1 이 0건이면 겹침은 null(확인 불가). */
export function measure({ notes, area1, stop, k = 100 }) {
  const ratio = (xs) => (xs.length ? xs.filter((t) => MEETING_RE.test(t)).length / xs.length : null)
  const tn = topK(notes, stop, k)
  const ta = area1.length ? new Set(topK(area1, stop, k)) : null
  const shared = ta ? tn.filter((w) => ta.has(w)) : null
  return {
    n_notes: notes.length,
    n_area1: area1.length,
    meeting_notes: ratio(notes),
    meeting_notes_hits: notes.filter((t) => MEETING_RE.test(t)).length,
    meeting_area1: ratio(area1),
    overlap: shared && tn.length ? shared.length / tn.length : null,
    jaccard: shared ? shared.length / new Set([...tn, ...ta]).size : null,
    shared: shared ?? [],
    k,
  }
}

const pct = (x) => (x == null ? '확인 불가' : `${(x * 100).toFixed(1)}%`)

export function renderMarkdown(m, meta) {
  const small = m.n_notes < 30 ? ` ⚠️ 표본 작음(n=${m.n_notes} < 30) — 비율은 참고만.` : ''
  return [
    `# 노트·지식관리(notes) 근거 측정 — ${meta.date}`,
    '',
    `읽기 전용(SELECT 만) · LLM 0회. notes 프로젝트 ${meta.notesProjects}개(${meta.notesNames.join(', ') || '-'}) · 글 ${m.n_notes}건 / 영역 ① 프로젝트 ${meta.area1Projects}개 · 글 ${m.n_area1}건 · 폐기 제외 ${meta.purged}건.${small}`,
    `notes 판정: area_evidence 'notes:' 접두 ∪ 타깃 라벨 'notes:' 접두(영역 ①~⑤ 밖, 남헌 v53). 노트는 v71bg(10-26)에서 ⑤ 에 합쳐졌다 — 이 측정은 합치기 근거 재료로 남긴다(⑧ 은 업무관리).`,
    '',
    '## 1. 회의 맥락 언급 비율',
    '',
    '| 코퍼스 | 글 | 회의 맥락 언급 글 | 비율 |',
    '|---|---|---|---|',
    `| notes | ${m.n_notes} | ${m.meeting_notes_hits} | ${pct(m.meeting_notes)} |`,
    `| 영역 ①(기준선) | ${m.n_area1} | ${m.meeting_area1 == null ? '-' : Math.round(m.meeting_area1 * m.n_area1)} | ${pct(m.meeting_area1)} |`,
    '',
    `패턴: \`${MEETING_RE.source}\` — "정리" 는 넓은 말이라 과대 추정 쪽이다(상한으로 읽는다).`,
    '',
    '## 2. 불만 유형 태그(S/V/N)',
    '',
    meta.svnDocs.length
      ? `정의 문서 발견: ${meta.svnDocs.join(', ')} — 이 스크립트에 태깅 규칙이 아직 없다 → **확인 불가**(규칙을 옮긴 뒤 다시 잰다).`
      : `**확인 불가** — docs/ 에서 S/V/N 정의를 찾지 못했다(패턴 \`${SVN_RE.source}\`). 정의 없이 태그를 지어내지 않는다.`,
    '',
    `## 3. 영역 ① 과의 키워드 겹침(문서빈도 상위 ${m.k})`,
    '',
    `- 겹침 비율(notes 상위 ${m.k} 중 영역 ① 상위 ${m.k} 에도 있는 비율): ${pct(m.overlap)}`,
    `- 자카드: ${pct(m.jaccard)}`,
    `- 겹친 키워드(notes 문서빈도 순 상위 30): ${m.shared.slice(0, 30).join(', ') || (m.n_area1 ? '없음' : '확인 불가(영역 ① 글 0건)')}`,
    '',
  ].join('\n')
}

// ── DB 포트(SELECT 만) ──────────────────────────────────────────────────
async function supabasePort() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  const pages = async (build, what) => {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error) throw new Error(`${what} 조회 실패: ${error.message}`)
      rows.push(...(data ?? []))
      if ((data ?? []).length < 1000) return rows
    }
  }
  return {
    loadProjects: () => pages(() => sb.from('analysis_projects').select('id, product_elevator_pitch, area_code, area_evidence').order('id'), 'analysis_projects'),
    loadTargets: () => pages(() => sb.from('review_targets').select('project_id, label').order('id'), 'review_targets'),
    async loadInputs(pids) {
      const out = []
      for (let i = 0; i < pids.length; i += 20) out.push(...(await pages(() => sb.from('analysis_inputs').select('id, project_id, raw_text, purged_at').in('project_id', pids.slice(i, i + 20)).order('id'), 'analysis_inputs')))
      return out
    },
  }
}

export async function main(argv, { port, now = new Date(), reportsDir = REPORTS_DIR, docsDir = DOCS_DIR, cfg = loadConfig(), log = console.log } = {}) {
  const run = argv.includes('--run')
  const date = argv.find((a) => a.startsWith('--date='))?.slice(7) ?? kstDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date 형식 YYYY-MM-DD: ${date}`)
  const k = Number(argv.find((a) => a.startsWith('--top='))?.slice(6) ?? 100)
  if (!Number.isInteger(k) || k < 1) throw new Error('--top 은 1 이상 정수')
  const db = port ?? (await supabasePort())

  const [projects, targets] = await Promise.all([db.loadProjects(), db.loadTargets()])
  const notesIds = new Set(projects.filter((p) => String(p.area_evidence ?? '').startsWith('notes:')).map((p) => p.id))
  for (const t of targets) if (t.project_id && String(t.label ?? '').startsWith('notes:')) notesIds.add(t.project_id)
  const area1Ids = new Set(projects.filter((p) => p.area_code === '1' && !notesIds.has(p.id)).map((p) => p.id))
  if (notesIds.size === 0) throw new Error("notes 프로젝트 0개(area_evidence·타깃 라벨 'notes:' 없음) — 등록 마이그(candidate_register) 미적용? 측정하지 않는다")

  const inputs = await db.loadInputs([...notesIds, ...area1Ids])
  let purged = 0
  const live = inputs.filter((i) => (i.purged_at || !i.raw_text ? (purged++, false) : true))
  const notes = live.filter((i) => notesIds.has(i.project_id)).map((i) => i.raw_text)
  const area1 = live.filter((i) => area1Ids.has(i.project_id)).map((i) => i.raw_text)
  if (notes.length === 0) throw new Error(`notes 프로젝트 ${notesIds.size}개의 글 0건(폐기 ${purged}) — 수집 전이다. 0% 로 내지 않는다`)

  const stop = new Set(cfg.common_words.map((w) => w.toLowerCase()))
  const m = measure({ notes, area1, stop, k })
  const notesNames = projects.filter((p) => notesIds.has(p.id)).map((p) => String(p.product_elevator_pitch ?? '').split(' — ')[0].slice(0, 40))
  const meta = { date, notesProjects: notesIds.size, notesNames, area1Projects: area1Ids.size, purged, svnDocs: findSvnDefinition(docsDir) }
  log(`notes ${notesIds.size}개·글 ${m.n_notes} · 영역① ${area1Ids.size}개·글 ${m.n_area1} · 회의 맥락 ${pct(m.meeting_notes)}(①: ${pct(m.meeting_area1)}) · 겹침 ${pct(m.overlap)} · 자카드 ${pct(m.jaccard)} · S/V/N ${meta.svnDocs.length ? '정의 있음·규칙 미구현(확인 불가)' : '정의 없음(확인 불가)'}`)
  let file = null
  if (run) {
    const dir = path.join(reportsDir, date)
    fs.mkdirSync(dir, { recursive: true })
    file = path.join(dir, 'notes-evidence.md')
    fs.writeFileSync(file, renderMarkdown(m, meta))
    log(`파일: ${file}`)
  }
  return { m, meta, file }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  })
}
