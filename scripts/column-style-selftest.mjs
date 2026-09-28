#!/usr/bin/env node
// 칼럼·편 문체 한 벌(남헌 2026-09-29 결정 3건) 셀프테스트 — 네트워크·DB·LLM 없음.
//   node scripts/column-style-selftest.mjs
//
// 고정하는 것:
//   1. 프롬프트가 가이드 정본 절(§7-3 읽기 수준 · §8-2 출처 흘려 쓰기 · voice-guide §7 자족성)을 **실제로 싣는다.**
//      절 제목을 바꾸면 guideSection 이 빈 문자열을 주고 프롬프트는 멀쩡해 보인다 — 여기서 잡는다(§7.1).
//   2. 칼럼 프롬프트와 편 프롬프트가 같은 STYLE_RULES 를 쓴다(한 알고리즘).
//   3. 검사기: 출처 설명 문장은 오류, 귀속 1회는 통과(CG-1 과 충돌 없음), 2회는 경고, 편 자족성 SC-1~SC-5, 읽기 수준.
//   4. 실제 초안 1건(조선미녀 1편)이 통과한다 — 남헌이 기준 예시로 지목한 글이 새 규칙에 걸리면 규칙이 틀린 것이다.
//   5. 배선: column-review-claude.mjs 가 lib 프롬프트를 쓰고 자기 SYSTEM 을 안 만든다, column-threads-stage.mjs 가 SC 를 건다,
//      build-check.yml 이 이 파일을 돌린다.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { columnRevisePrompt, threadDerivePrompt, guideSection, STYLE_RULES, GUIDE_PATH, VOICE_PATH } from '../lib/columns/style-prompt.ts'
import { checkCitation, checkThreadPost, checkThreadSelfContained, readability } from '../lib/threads/voice-check.ts'
import { checkColumn, checkThreads } from './column-check.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
const fails = []
const ok = (name, cond, detail = '') => { if (cond) pass++; else fails.push(`${name}${detail ? ` — ${detail}` : ''}`) }

// ── 1. 프롬프트가 정본 절을 싣는다 ─────────────────────────────
const guide = readFileSync(join(root, GUIDE_PATH), 'utf8')
const voice = readFileSync(join(root, VOICE_PATH), 'utf8')
for (const [file, text, head] of [[GUIDE_PATH, guide, '### 7-3.'], [GUIDE_PATH, guide, '### 8-2.'], [GUIDE_PATH, guide, '### 7-2.'], [VOICE_PATH, voice, '## 7.']]) {
  const sec = guideSection(text, head)
  ok(`${file} 에 "${head}" 절이 있고 비어 있지 않다`, sec.length > 200, `${sec.length}자`)
}
ok('guideSection 은 같은 깊이 제목에서 끊는다', !guideSection(guide, '### 7-3.').includes('## 8.'))

const col = columnRevisePrompt(root)
const thr = threadDerivePrompt(root)
ok('칼럼 프롬프트에 고1·고2 기준', /고등학교 1~2학년/.test(col))
ok('칼럼 프롬프트에 출처 설명 문장 금지', /에서 나왔다/.test(col) && /출처를 설명하는 문장을 쓰지 않는다/.test(col))
ok('칼럼 프롬프트에 §7-3 절 본문', /### 7-3\./.test(col) && /90자/.test(col))
ok('칼럼 프롬프트에 §8-2 절 본문', /### 8-2\./.test(col))
ok('칼럼 프롬프트가 숫자·인용문 불변 규칙을 유지', /한 글자도 바꾸지 않고/.test(col))
ok('칼럼 프롬프트 출력 마커', col.includes('<<<SUMMARY>>>') && col.includes('<<<BODY>>>'))
ok('편 프롬프트에 자족성 SC 규칙', /SC-1/.test(thr) && /500자에 안 들어가면/.test(thr))
ok('편 프롬프트에 voice-guide §7 절 본문', /## 7\. 칼럼에서 뗀 편/.test(thr))
ok('편 프롬프트에 주체 줄 형식', /- 주체:/.test(thr))
for (const r of STYLE_RULES) ok(`STYLE_RULES 가 두 프롬프트에 똑같이 실린다: ${r.slice(0, 18)}…`, col.includes(r) && thr.includes(r))

// ── 2. 검사기 — 출처 흘려 쓰기 ─────────────────────────────────
const NOW = new Date().toISOString()
ok('출처 설명 문장은 오류', checkCitation('이 근거는 회사 블로그에서 나왔다.').meta !== null)
ok('"출처는 ~" 도 오류', checkCitation('출처는 2022년 회고 글이다.').meta !== null)
ok('"이 수치는 10-K 에 있다" 도 오류', checkCitation('이 수치는 10-K 에 있다.').meta !== null)
ok('흘려 쓴 귀속은 오류 아님', checkCitation('태트는 2019년 출시 글에서 이렇게 썼다.').meta === null)
ok('CG-1 귀속 1회는 통과(오류·경고 없음)', (() => { const r = checkThreadPost('회사가 밝힌 자체 집계 기준으로 고객은 두 배가 됐다.', NOW); return r.errors.length === 0 && !r.warns.some((w) => w.includes('귀속')) })())
ok('귀속 2회는 경고', checkThreadPost('회사가 밝힌 수치다. 보도에 따르면 그 뒤 두 배가 됐다.', NOW).warns.some((w) => w.includes('귀속 표현 2회')))
ok('checkThreadPost 가 출처 설명 문장을 오류로', checkThreadPost('이 근거는 회사 블로그에서 나왔다.', NOW).errors.some((e) => e.includes('출처 설명 문장')))

// ── 3. 검사기 — 편 자족성 SC ────────────────────────────────────
const sc = (b, o) => checkThreadSelfContained(b, o)
ok('SC-1 다른 편 참조는 오류', sc('조선미녀는 1편에서 본 대로 갔다.').errors.some((e) => e.startsWith('SC-1')))
ok('SC-1 "앞서 말한" 도 오류', sc('조선미녀는 앞서 말한 이유로 미국을 골랐다.').errors.some((e) => e.startsWith('SC-1')))
ok('SC-2 지시어 시작은 오류', sc('그 회사는 반대로 갔다. 조선미녀 얘기다.').errors.some((e) => e.startsWith('SC-2')))
ok('SC-3 subject 가 앞 40% 밖이면 오류', sc('가'.repeat(300) + ' 조선미녀는 반대로 갔다.', { subject: '조선미녀' }).errors.some((e) => e.startsWith('SC-3')))
ok('SC-3 subject 가 앞에 있으면 통과', sc('조선미녀는 반대로 갔다. ' + '가'.repeat(300), { subject: '조선미녀' }).errors.length === 0)
ok('SC-3 subject 없고 이름 단서도 없으면 경고만', (() => { const r = sc('가나다라 마바사 아자차. ' + '가'.repeat(300)); return r.errors.length === 0 && r.warns.some((w) => w.startsWith('SC-3')) })())
ok('SC-4 마무리 질문이 없으면 경고', sc('조선미녀는 반대로 갔다. ' + '가'.repeat(250)).warns.some((w) => w.startsWith('SC-4')))
ok('SC-5 200자 미만은 경고', sc('조선미녀는 반대로 갔다.').warns.some((w) => w.startsWith('SC-5')))

// ── 4. 실제 초안 — 남헌이 기준 예시로 지목한 조선미녀 1편은 통과해야 한다 ─
const bojPath = join(root, 'drafts/columns/2026-09-15-beauty-of-joseon.threads.md')
if (existsSync(bojPath)) {
  const eps = checkThreads(readFileSync(bojPath, 'utf8'))
  ok('조선미녀 .threads.md 편 3개 파싱', eps.length === 3, String(eps.length))
  for (const t of eps) ok(`조선미녀 ${t.n}편 오류 0 (기준 예시)`, t.errors.length === 0, t.errors.join(' / '))
  ok('조선미녀 1편 SC-3 주체 통과(조선미녀)', sc(eps[0].body, { subject: '조선미녀' }).errors.length === 0)
} else {
  fails.push('drafts/columns/2026-09-15-beauty-of-joseon.threads.md 가 없어 실제 초안 검사를 못 했다(확인 불가)')
}

// ── 5. 읽기 수준 ─────────────────────────────────────────────────
const rd = readability('짧다. ' + '이 문장은 아주 길어서 고등학생이 한 번에 읽기 어렵고 숫자와 이름이 계속 이어지며 끝날 줄을 모르고 이어지는 문장으로 구십 자를 훌쩍 넘긴다고 봐야 하는데 그래도 계속 이어진다.')
ok('90자 넘는 문장을 센다', rd.long.length === 1 && rd.max > 90, `${rd.max}`)
ok('인용문 안은 세지 않는다', readability('"' + '가'.repeat(120) + '" 라고 썼다.').long.length === 0)
ok('풀이 없는 약어를 잡는다', readability('ARR 이 100만 달러를 넘겼다.').acronyms.includes('ARR'))
ok('풀이 붙은 약어는 넘긴다', readability('ARR(연 반복 매출)이 100만 달러를 넘겼다.').acronyms.length === 0)
const longCol = `독자: 창업자\n\n# 제목\n\n${'이 문장은 아주 길어서 고등학생이 한 번에 읽기 어렵고 숫자와 이름이 계속 이어지며 끝날 줄을 모르고 이어지는 문장으로 구십 자를 훌쩍 넘긴다고 봐야 하는데 그래도 계속 이어진다. '.repeat(40)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검\n0. 예`
ok('칼럼 90자 문장은 "확인"(경고)', checkColumn(longCol).warns.some((w) => w.includes('90자')))

// ── 6. 배선 ──────────────────────────────────────────────────────
const review = readFileSync(join(root, 'scripts/column-review-claude.mjs'), 'utf8')
ok('column-review-claude 가 lib 프롬프트를 쓴다', /columnRevisePrompt\(\)/.test(review) && /threadDerivePrompt\(\)/.test(review))
ok('column-review-claude 가 자기 SYSTEM 문장을 안 만든다', !/너는 한국어 칼럼 편집자다/.test(review))
ok('column-review-claude --threads 는 DB 에 안 쓴다', /threads\.revised\.md/.test(review) && !/threads_revised/.test(review))
ok('column-threads-stage 가 SC 를 건다', /checkThreadSelfContained/.test(readFileSync(join(root, 'scripts/column-threads-stage.mjs'), 'utf8')))
const ci = readFileSync(join(root, '.github/workflows/build-check.yml'), 'utf8')
ok('build-check.yml 이 이 셀프테스트를 돌린다', ci.includes('scripts/column-style-selftest.mjs'))

if (fails.length) {
  console.error(`❌ column-style-selftest — ${pass} pass / ${fails.length} fail`)
  for (const f of fails) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`✅ column-style-selftest — ${pass} pass / 0 fail`)
