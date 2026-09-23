#!/usr/bin/env node
// 방법론 공개 페이지 셀프테스트 — 네트워크·DB 없음.
//   node scripts/methodology-selftest.mjs
//
// 이 검사가 있는 이유: `/library/methodology` 는 **우리 산식을 외부에 공개하는 페이지**다.
// 코드가 바뀌었는데 페이지가 안 바뀌면, 우리는 하지 않는 약속을 공개적으로 하고 있는 상태가
// 된다. 그 드리프트는 화면상 아무 증상이 없다 — 표는 여전히 예쁘게 나온다. (CLAUDE.md §7.1)
//
// 고정하는 것:
//   1. 등급 합성표 ↔ 실제 산식 — `factCheckGrade`/`gradeMove` 를 대표 케이스 8건으로 돌려
//      표에 적힌 등급이 나오는지 본다. 문서와 코드가 갈리면 실패한다.
//   2. 표에 있는 등급은 전부 대표 케이스가 있다 — 등급 행을 추가하면 검사도 따라오게 강제한다.
//   3. PMF 축의 "코드 구현 없음" 주장 — `lib/cases/draft.ts` 에 `pmfGrade` 가 생기면 실패한다.
//   4. 독자 문제 표는 `config/reader-problems.json` 을 읽는다 (사본을 두지 않는다).
//   5. 섹션 형식 — 6개, 본문 300자 이내, 표 1개, 출처 1개 이상.
//   6. 화면에 적은 출처 경로가 **실제로 있는 파일**인지. 없는 파일을 정본이라고 공개하는 건
//      "확인 불가"를 "확인됨"으로 내는 것과 같다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'

import { factCheckGrade, gradeMove, READER_PROBLEMS, READER_PROBLEM_LABEL } from '../lib/cases/draft.ts'
import {
  GRADE_FIXTURES, GRADE_TABLE, PMF_GRADE_IMPLEMENTED, SECTIONS, UPDATED_AT,
} from '../lib/methodology/content.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 1. 등급 합성표 ↔ 실제 산식 ──────────────────────────────────
const RUN = {
  fact_check: (m, e) => factCheckGrade(m, e).grade,
  insight: (m, e) => gradeMove(m, e).grade,
}

for (const f of GRADE_FIXTURES) {
  const run = RUN[f.axis]
  ok(`축 이름이 실제 산식과 연결된다 — ${f.axis}`, typeof run === 'function')
  if (typeof run !== 'function') continue
  t(`산식 ${f.axis} / ${f.label}`, run(f.move, f.evidence), f.expect)

  // 그 등급이 페이지의 표에 실제로 적혀 있나. 표에서 행을 지우면 여기서 걸린다.
  const heads = GRADE_TABLE[f.axis].rows.map((r) => r[0])
  ok(`표에 등급 행이 있다 — ${f.axis} ${f.expect} (표: ${heads.join('/')})`, heads.includes(f.expect))
}

// ── 2. 표의 등급 전부에 대표 케이스가 있다 ─────────────────────
for (const [axis, table] of Object.entries(GRADE_TABLE)) {
  const heads = table.rows.map((r) => r[0])
  t(`${axis} 표는 등급 4단계`, heads.join(','), 'A,B,C,D')
  for (const g of heads) {
    ok(`${axis} ${g} 에 대표 케이스가 있다`,
      GRADE_FIXTURES.some((f) => f.axis === axis && f.expect === g))
  }
  for (const row of table.rows) {
    ok(`${axis} ${row[0]} 조건 칸이 비어 있지 않다`, String(row[1] ?? '').trim().length > 0)
    t(`${axis} ${row[0]} 칸 수가 머리글과 같다`, row.length, table.head.length)
  }
}

// ── 3. PMF 축 — "코드 구현 없음" 주장이 아직 참인가 ──────────────
// content.ts 가 PMF 표를 "설계"라고 적는 근거는 draft.ts 에 산식이 없다는 것뿐이다.
// 누가 pmfGrade 를 구현하면 그 문장이 거짓이 되고, 이 검사가 그때 막는다.
const draftSrc = readFileSync(join(repoRoot, 'lib/cases/draft.ts'), 'utf8')
const hasPmfGrade = /export\s+function\s+pmfGrade\b/.test(draftSrc)
t('PMF_GRADE_IMPLEMENTED 가 코드 실물과 같다', PMF_GRADE_IMPLEMENTED, hasPmfGrade)
const pmf = SECTIONS.find((s) => s.id === 'pmf')
ok('PMF 섹션이 있다', Boolean(pmf))
ok('PMF 섹션은 S×T 두 축을 말한다', /신호 강도 S/.test(pmf.body) && /이식성 T/.test(pmf.body))
ok('PMF 섹션은 미판정을 LOW 로 접지 않는다고 적는다', /잠정/.test(pmf.body))
ok('PMF 섹션은 실패 사례도 A 가 될 수 있다고 적는다', /실패 사례도 A/.test(pmf.body))
ok('PMF 표 자체가 설계임을 밝힌다', /구현은 아직 없다|설계/.test(pmf.table.caption))

// ── 4. 독자 문제 표는 어휘 정본을 읽는다 ────────────────────────
const readerRows = SECTIONS.find((s) => s.id === 'case-unit').table.rows
const vocab = JSON.parse(readFileSync(join(repoRoot, 'config/reader-problems.json'), 'utf8'))
t('독자 문제 코드가 config 파일과 개수까지 같다', readerRows.length, vocab.problems.length)
t('독자 문제 코드 순서·값이 config 와 같다',
  readerRows.map((r) => r[0]).join(','), vocab.problems.map((p) => p.code).join(','))
t('독자 문제 코드가 draft.ts 어휘와 같다',
  readerRows.map((r) => r[0]).join(','), READER_PROBLEMS.join(','))
ok('라벨이 전부 채워져 있다 (사본이 아니라 정본을 읽었다)',
  readerRows.every((r) => r[1] === READER_PROBLEM_LABEL[r[0]] && r[1].length > 0))

// ── 5. 섹션 형식 ────────────────────────────────────────────────
t('섹션 6개', SECTIONS.length, 6)
t('섹션 id 가 전부 다르다', new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length)
for (const s of SECTIONS) {
  ok(`${s.id} 본문 300자 이내 (실제 ${s.body.length}자)`, s.body.length > 0 && s.body.length <= 300)
  ok(`${s.id} 표 1개에 행이 있다`, s.table.rows.length > 0 && s.table.head.length >= 2)
  ok(`${s.id} 출처 1개 이상`, s.sources.length > 0)
  ok(`${s.id} 제목이 있다`, s.title.trim().length > 0)
}
ok('최종 갱신일이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(UPDATED_AT))

// ── 6. 출처 경로가 실제로 있는 파일인가 ─────────────────────────
// 'docs/evidence-rules.md §1·§3' → 'docs/evidence-rules.md',
// 'lib/cases/draft.ts factCheckGrade' → 'lib/cases/draft.ts'
for (const s of SECTIONS) {
  for (const src of s.sources) {
    const path = src.split(/\s+/)[0]
    ok(`출처 파일이 실제로 있다 — ${path} (${s.id})`, existsSync(join(repoRoot, path)))
  }
}

// ── 7. 페이지가 content.ts 만 쓰고 _ds 를 끌어오지 않는다 ────────
// A2 가 껍데기를 `_pub` 으로 갈아 끼울 때 content.ts 를 안 건드리게 하는 경계다.
const pageSrc = readFileSync(join(repoRoot, 'app/library/methodology/page.tsx'), 'utf8')
ok('페이지가 content.ts 를 읽는다', /lib\/methodology\/content/.test(pageSrc))
ok('페이지가 app/_ds 를 import 하지 않는다', !/_ds/.test(pageSrc.replace(/^\s*\*.*$/gm, '')))
ok('페이지가 전용 css 한 장만 쓴다', /'\.\/methodology\.css'/.test(pageSrc))
ok('최종 갱신 한 줄이 화면에 나간다', /최종 갱신 \{UPDATED_AT\}/.test(pageSrc))

console.log(`\n${fail === 0 ? '✅' : '❌'} methodology-selftest — ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
