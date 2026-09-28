// 칼럼 고쳐쓰기·연재 편 떼기 프롬프트 — 한 벌의 문체 규칙 (남헌 2026-09-29 결정 3건).
//
// 정본은 문서다: content/guides/케이스-작성-가이드.md §7-2(AI 티)·§7-3(읽기 수준)·§8-2(출처 흘려 쓰기),
// voice-guide.md §7(편 자족성). 여기서는 그 절을 **파일에서 그대로 잘라** 프롬프트에 넣는다 — 문장을
// 여기 복사해 두면 문서와 갈라져도 아무 증상이 없다. 절 제목이 바뀌면 guideSection 이 빈 문자열을
// 돌려주고 scripts/column-style-selftest.mjs 가 그 자리에서 실패한다.
//
// 두 프롬프트(칼럼·편)가 같은 STYLE_RULES 를 쓰는 게 요점이다. 칼럼 → 편 파생이 다른 문체 규칙을
// 타면 "칼럼은 쉬운데 편은 딱딱한" 글이 나온다 — 그게 이 파일이 두 함수를 한 곳에 두는 이유다.
//
// ⚠️ scripts/*.mjs 가 Node 타입 스트립으로 직접 import 한다. 다른 .ts 모듈은 값으로 import 하지 마라.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const GUIDE_PATH = 'content/guides/케이스-작성-가이드.md'
export const VOICE_PATH = 'content/guides/voice-guide.md'

/**
 * 마크다운에서 `### 7-3.` 같은 절 하나를 잘라 낸다 — 같은 깊이나 더 얕은 제목이 나오면 끝.
 * 못 찾으면 빈 문자열. 부르는 쪽이 빈 문자열을 "없음"으로 접지 않게 selftest 가 절 3개를 고정한다.
 */
export function guideSection(markdown: string, headingPrefix: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start < 0) return ''
  const depth = (lines[start].match(/^#+/) ?? [''])[0].length
  const out: string[] = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/)
    if (m && m[1].length <= depth) break
    out.push(lines[i])
  }
  return out.join('\n').trim()
}

const read = (root: string, rel: string): string => {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

/** 모델이 어기면 산출물이 버려지는 하드 규칙. 칼럼·편 공통. 검사기(lib/threads/voice-check.ts)와 같은 문장이다. */
export const STYLE_RULES: readonly string[] = [
  '읽는 사람은 고등학교 1~2학년이라고 가정한다. 처음 읽어도 막히지 않게, 쉽고 잘 읽히고 재미있게 쓴다. 문장은 40자 안팎, 90자를 넘는 문장은 둘로 자른다. 한 문단은 3문장 안팎.',
  '영문 약어·업계 개념어(ARR, GDPR, LTV, 코호트, 유닛 이코노믹스 같은 말)는 처음 나올 때 같은 문장이나 바로 다음 문장에서 우리말로 풀어 준다. 한 번 풀었으면 그 뒤로는 그냥 쓴다.',
  '출처를 설명하는 문장을 쓰지 않는다 — "이 근거는 ~에서 나왔다", "출처는 ~", "이 수치는 ~에 있다" 류는 전부 지운다. 출처는 문장의 행위자로 자연스럽게 흘리거나("태트는 출시 글에서 이렇게 썼다") 그냥 사실로 서술한다. 귀속 표현("~에 따르면", "~고 밝혔다", "회사가 밝힌")은 칼럼 1,000자당 1회 안팎, 스레드 한 편에 1회까지. 등급 C 수치의 귀속(CG-1)이 필요하면 그 1회를 여기에 쓴다.',
  '숫자·날짜·고유명사·인용문은 한 글자도 바꾸지 않고 빼지도 않는다. 원문에 없는 사실·숫자·발언을 새로 넣지 않는다.',
  '문체: 구어체에 가까운 자연스러운 서술. 전신형 단문(명사 종결 반복), 기호(→ ⇒ — ·), 경구·격언투, 영어 투 직역, 내부 용어(케이스/무브/코퍼스/승인/게이트/등급/처방/S-1/8-K/10-K/제3자 검증)를 없앤다. 태도는 드러낸다 — 이 사례에서 뭐가 재밌고 뭐가 이상한지.',
  '독자가 자기 작업에 옮길 행동이 분명한 문단이 하나는 있어야 한다.',
]

/** 편 자족성 — 편을 뗄 때만 더해지는 하드 규칙(voice-guide §7). */
export const SELF_CONTAINED_RULES: readonly string[] = [
  '편 하나는 그 편만 읽은 사람에게 인사이트가 온전히 전해져야 한다. 다른 편을 가리키는 말("1편에서", "앞서 말한", "이어서")을 쓰지 않는다(SC-1).',
  '첫 문장은 "그 회사는", "이 결정은" 같은 지시어로 시작하지 않는다. 회사·사람 이름을 앞 40% 안에 실명으로 세운다(SC-2·SC-3).',
  '그 인사이트를 이해하는 데 꼭 필요한 배경(무슨 회사가 무엇을 팔았고 어디서 막혔나)을 두 문장 안에 압축해 편 안에 넣는다. 500자에 안 들어가면 인사이트를 둘로 쪼개 편을 하나 더 만든다 — 배경을 앞 편에 두고 뒷 편에서 생략하는 분할은 금지다.',
  '마지막 문단은 독자에게 넘기는 문장(질문·정리·행동)으로 닫는다(SC-4). 본문은 500자 이하, 200자 이상(SC-5).',
  '근거 URL·출처 목록은 본문이 아니라 자기답글에 둔다.',
]

/** 칼럼 전수검수(scripts/column-review-claude.mjs)의 시스템 프롬프트. */
export function columnRevisePrompt(root = process.cwd()): string {
  const guide = read(root, GUIDE_PATH)
  return [
    '너는 한국어 칼럼 편집자다. 아래 칼럼 초안을 **문체와 가독성 위주로 고쳐 써서 전문을 돌려준다.**',
    '지키는 것(어기면 수정본은 버려진다):',
    '1. 파일 첫머리의 "독자: …" 줄과 "판단 이유: …" 줄, 제목(# 로 시작하는 한 줄), 절 제목(## ) 구조는 유지한다. 절을 합치거나 없애지 않는다.',
    ...STYLE_RULES.map((r, i) => `${i + 2}. ${r}`),
    `${STYLE_RULES.length + 2}. 근거 메모·자체 점검 절이 있으면 그대로 둔다(고치지 않는다). 본문이 쉬워질수록 근거 메모는 그대로 정확해야 한다.`,
    '출력 형식: 먼저 "<<<SUMMARY>>>" 한 줄 뒤에 무엇을 왜 고쳤는지 3~6문장, 그 다음 "<<<BODY>>>" 한 줄 뒤에 수정본 전문. 그 밖의 말은 쓰지 않는다.',
    '',
    '[문체 규칙 정본 발췌 — content/guides/케이스-작성-가이드.md]',
    guideSection(guide, '### 7-3.'),
    '',
    guideSection(guide, '### 8-2.'),
    '',
    guideSection(guide, '### 7-2.'),
  ].join('\n')
}

/**
 * 칼럼 → 연재 편 파생(scripts/column-review-claude.mjs --threads). 기존 편이 있으면 같은 인사이트를
 * 자족성 규칙으로 다시 쓰고, 500자에 안 들어가는 편은 둘로 쪼갠다. 편 수는 늘어도 된다.
 */
export function threadDerivePrompt(root = process.cwd()): string {
  const guide = read(root, GUIDE_PATH)
  const voice = read(root, VOICE_PATH)
  return [
    '너는 한국어 콘텐츠 작가다. 아래 칼럼에서 뗀 Threads 연재 편을 **편마다 그 편만으로 인사이트가 서게** 다시 쓴다.',
    '입력은 칼럼 전문과 기존 편(있으면)이다. 기존 편의 인사이트(제목)는 유지하되, 본문은 아래 규칙으로 새로 쓴다. 500자에 안 들어가면 그 인사이트를 둘로 쪼개 편을 하나 더 만든다.',
    '지키는 것(어기면 그 편은 버려진다):',
    ...STYLE_RULES.map((r, i) => `${i + 1}. ${r}`),
    ...SELF_CONTAINED_RULES.map((r, i) => `${STYLE_RULES.length + i + 1}. ${r}`),
    `${STYLE_RULES.length + SELF_CONTAINED_RULES.length + 1}. 어미는 3인칭 평어체(~있었다/~택했다), 마무리는 평어체 질문 또는 한 줄 정리(voice-guide §0 모드 A).`,
    '출력 형식: 편마다 아래 블록을 반복한다. 그 밖의 말은 쓰지 않는다.',
    '## N편. <인사이트 한 줄 제목>',
    '- 주체: <이 편의 회사 또는 사람 이름 — 본문 앞부분에 실명으로 나와야 한다>',
    '- 마무리 유형: 질문 | 정리',
    '```text',
    '<본문 500자 이하>',
    '```',
    '자기답글:',
    '```text',
    '<근거 URL·출처·자기보고 여부>',
    '```',
    '',
    '[편 자족성 정본 발췌 — content/guides/voice-guide.md]',
    guideSection(voice, '## 7.'),
    '',
    '[문체 규칙 정본 발췌 — content/guides/케이스-작성-가이드.md]',
    guideSection(guide, '### 7-3.'),
    '',
    guideSection(guide, '### 8-2.'),
  ].join('\n')
}
