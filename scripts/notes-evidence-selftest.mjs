#!/usr/bin/env node
// notes-evidence.mjs 셀프테스트 — DB 없이. 가짜 포트 → main → 측정·파일 경계, 0건 실패, S/V/N 확인 불가, 쓰기 SQL 0.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { main, measure, keywords, topK, MEETING_RE, findSvnDefinition } from './notes-evidence.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => {
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${name}`)
  }
}
const quiet = () => {}
const stop = new Set(['the', 'and', 'app'])

t('MEETING_RE: 회의록·미팅 노트·meeting notes·정리·transcript', ['회의록 쓰기', '미팅 노트', 'my meeting notes', '메모 정리', 'auto transcript'].every((s) => MEETING_RE.test(s)) && !MEETING_RE.test('grocery list'))
t('keywords: 영문 3자↑·한글 2자↑·불용어 제외·머리 표식 제거', JSON.stringify([...keywords('[YouTube 댓글 · AbC123] The sync and 동기화 느림 ok', stop)].sort()) === JSON.stringify(['sync', '느림', '동기화']))
t('topK: 문서빈도·동수 사전순', JSON.stringify(topK(['sync tags', 'sync search', 'tags'], stop, 2)) === JSON.stringify(['sync', 'tags']))
const m = measure({ notes: ['meeting notes sync', 'tags sync', 'search tags', 'sync slow'], area1: ['meeting transcript sync', 'transcript accuracy'], stop, k: 3 })
t('measure: 회의 맥락 1/4 · 영역① 2/2', m.meeting_notes === 0.25 && m.meeting_notes_hits === 1 && m.meeting_area1 === 1)
// notes 상위 3 = sync·tags·meeting(동수 사전순) / 영역① 상위 3 = transcript·accuracy·meeting → 겹침 meeting 1개.
t('measure: 겹침 = notes 상위 K 중 영역① 상위 K 에 있는 비율', m.shared.join() === 'meeting' && Math.abs(m.overlap - 1 / 3) < 1e-9 && m.jaccard === 1 / 5)
const m0 = measure({ notes: ['x notes'], area1: [], stop })
t('measure: 영역① 0건 → 겹침·기준선 확인 불가(null)', m0.overlap === null && m0.jaccard === null && m0.meeting_area1 === null)

// 경계: 가짜 포트 → main
const P = (id, area_code, area_evidence, pitch) => ({ id, area_code, area_evidence, product_elevator_pitch: pitch })
const projects = [P('n1', null, 'notes:evernote', 'Evernote — 승인 후보'), P('n2', null, null, 'Bear — x'), P('a1', '1', 'label:otter', 'Otter — y'), P('x', '2', 'manual', 'HubSpot CRM — z')]
const targets = [{ project_id: 'n2', label: 'notes:us|bear' }, { project_id: 'a1', label: '1:otter' }]
const inputs = [
  { id: 'i1', project_id: 'n1', raw_text: '회의록 정리용으로 씁니다', purged_at: null },
  { id: 'i2', project_id: 'n1', raw_text: 'sync is slow', purged_at: null },
  { id: 'i3', project_id: 'n2', raw_text: 'tags are great', purged_at: null },
  { id: 'i4', project_id: 'n2', raw_text: null, purged_at: '2026-10-01' },
  { id: 'i5', project_id: 'a1', raw_text: 'meeting transcript sync', purged_at: null },
  { id: 'i6', project_id: 'x', raw_text: 'should not be read', purged_at: null },
]
const calls = {}
const port = (over = {}) => ({
  loadProjects: async () => projects,
  loadTargets: async () => targets,
  loadInputs: async (pids) => ((calls.pids = pids), inputs.filter((i) => pids.includes(i.project_id))),
  ...over,
})
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nev-'))
const docs = path.join(tmp, 'docs')
fs.mkdirSync(docs)
fs.writeFileSync(path.join(docs, 'a.md'), '# nothing here')
const opts = (o = {}) => ({ port: port(o), reportsDir: tmp, docsDir: docs, log: quiet, now: new Date('2026-10-12T03:00:00Z') })

const dry = await main([], opts())
t('notes 판정: area_evidence notes: ∪ 타깃 라벨 notes: · 영역 ① 따로 · 그 밖은 안 읽는다', JSON.stringify([...calls.pids].sort()) === '["a1","n1","n2"]')
t('dry: 파일 안 씀 · 폐기 제외', dry.file === null && dry.m.n_notes === 3 && dry.meta.purged === 1 && dry.m.n_area1 === 1)
t('회의 맥락: notes 1/3', Math.abs(dry.m.meeting_notes - 1 / 3) < 1e-9)
t('S/V/N: 정의 없음 → 확인 불가(빈 목록)', dry.meta.svnDocs.length === 0)
const run = await main(['--run'], opts())
const md = fs.readFileSync(run.file, 'utf8')
t('--run: reports/<KST>/notes-evidence.md', run.file === path.join(tmp, '2026-10-12', 'notes-evidence.md'))
t('표: 세 절 · S/V/N 확인 불가 · 표본 작음 경고 · 원문 인용 없음', md.includes('## 1. 회의 맥락 언급 비율') && md.includes('## 2. 불만 유형 태그(S/V/N)') && md.includes('**확인 불가** — docs/') && md.includes('표본 작음') && !md.includes('회의록 정리용으로'))
fs.writeFileSync(path.join(docs, 'svn.md'), '불만 유형 S/V/N 정의')
t('S/V/N: 정의 문서가 생기면 찾는다(그래도 규칙 미구현 → 확인 불가 표기)', findSvnDefinition(docs).length === 1 && (await main(['--run', '--date=2026-10-13'], opts())).meta.svnDocs.length === 1 && fs.readFileSync(path.join(tmp, '2026-10-13', 'notes-evidence.md'), 'utf8').includes('정의 문서 발견'))

// 0건은 실패(§7.1)
t('notes 프로젝트 0개 → 던진다', await main([], opts({ loadProjects: async () => projects.filter((p) => !p.area_evidence?.startsWith('notes:')), loadTargets: async () => [] })).then(() => false, (e) => /notes 프로젝트 0개/.test(e.message)))
t('notes 글 0건 → 던진다(0% 로 내지 않음)', await main([], opts({ loadInputs: async () => [] })).then(() => false, (e) => /글 0건/.test(e.message)))
t('--top·--date 검사', await main(['--top=0'], opts()).then(() => false, () => true) && await main(['--date=2026/10/12'], opts()).then(() => false, () => true))
fs.rmSync(tmp, { recursive: true, force: true })

// 정적: 쓰기 없음
const src = fs.readFileSync(new URL('./notes-evidence.mjs', import.meta.url), 'utf8')
const WRITE = [/\.(insert|update|upsert|delete|rpc)\s*\(/i, /\b(INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE)\b/i]
t('정적: 쓰기 SQL·메서드 0 · DB 는 .select 만', !WRITE.some((re) => re.test(src)) && (src.match(/\.from\('/g) ?? []).length === (src.match(/\.from\('[a-z_]+'\)\.select\(/g) ?? []).length)
t('정적: 파일 쓰기는 보고서 한 곳', (src.match(/writeFileSync\(/g) ?? []).length === 1)

console.log(`\n${fail === 0 ? '✅' : '❌'} notes 근거 측정 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
