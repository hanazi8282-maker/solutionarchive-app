#!/usr/bin/env node
// lib/threads/external-post.ts 셀프테스트 — 네트워크·DB·env 없음.
//
// 고정하는 것:
//   1. 입력 검증 — 두 칸 비면 기존 사후 기록, 하나만 있으면 거절, id 는 숫자 15~20자리, 링크는 threads.net/com 게시물 URL
//   2. 중복 — 같은 external_id / 같은 단축코드 퍼머링크(net↔com·쿼리 차이 무시) 거절, 조회 실패는 확인 불가(저장 안 함)
//   3. 행 모양 — 000022 백필 4건과 같은 키·값(published_via='external', status='published', notes '[external]')
//   4. 경계면(소스 정적) — createPost 가 이 경로를 타고 발행 API 를 부르지 않는다, 매처·성과 수집이 보는 필터가 그대로다

import fs from 'node:fs'
import { parseExternalInput, shortcodeOf, checkDuplicate, externalFields } from '../lib/threads/external-post.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}

// 1) 입력 검증 — 000022 의 실제 값으로 양성
const ID = '18109270787178013'
const LINK = 'https://www.threads.com/@solution_arch_/post/DdowYdGmsVO'
t('둘 다 빔 → none', parseExternalInput('  ', ''), { kind: 'none' })
t('000022 값 → external', parseExternalInput(ID, LINK), { kind: 'external', externalId: ID, permalink: LINK, shortcode: 'DdowYdGmsVO' })
t('쿼리·끝 슬래시 제거', parseExternalInput(ID, `${LINK}/?xmt=AQF0abc#x`).permalink, LINK)
t('threads.net 도 허용', parseExternalInput(ID, 'https://threads.net/@a.b_c/post/Ddqzu22mqd2').kind, 'external')
t('id 만 → invalid', parseExternalInput(ID, '').kind, 'invalid')
t('링크만 → invalid', parseExternalInput('', LINK).kind, 'invalid')
t('id 에 단축코드 → invalid', parseExternalInput('DdowYdGmsVO', LINK).kind, 'invalid')
t('id 너무 짧음 → invalid', parseExternalInput('12345', LINK).kind, 'invalid')
t('http → invalid', parseExternalInput(ID, LINK.replace('https', 'http')).kind, 'invalid')
t('다른 도메인 → invalid', parseExternalInput(ID, 'https://www.instagram.com/@a/post/DdowYdGmsVO').kind, 'invalid')
t('프로필 URL → invalid', parseExternalInput(ID, 'https://www.threads.com/@solution_arch_').kind, 'invalid')
t('사칭 도메인 → invalid', parseExternalInput(ID, 'https://threads.com.evil.io/@a/post/DdowYdGmsVO').kind, 'invalid')
t('shortcodeOf', [shortcodeOf(LINK), shortcodeOf(null), shortcodeOf('https://x/')], ['DdowYdGmsVO', null, null])

// 2) 중복 — or() 필터 문자열과 JS 재확인
let lastOr = null
const mock = (r) => ({ from: () => ({ select: () => ({ or: (f) => { lastOr = f; return Promise.resolve(r) } }) }) })
const ext = parseExternalInput(ID, LINK)
t('기존 행 없음 → clear', (await checkDuplicate(mock({ data: [], error: null }), ext)).status, 'clear')
t('or 필터가 id·단축코드 둘 다 본다', lastOr, `external_id.eq.${ID},permalink.ilike.*/post/DdowYdGmsVO*`)
t('같은 external_id → duplicate', (await checkDuplicate(mock({ data: [{ id: 'p', external_id: ID, permalink: null }], error: null }), ext)).status, 'duplicate')
t('같은 게시물 threads.net 링크 → duplicate', (await checkDuplicate(mock({ data: [{ id: 'p', external_id: '1', permalink: 'https://www.threads.net/@solution_arch_/post/DdowYdGmsVO' }], error: null }), ext)).status, 'duplicate')
t('ilike 와일드카드 오탐(다른 코드) → clear', (await checkDuplicate(mock({ data: [{ id: 'p', external_id: '1', permalink: 'https://www.threads.com/@x/post/DdowYdGmsVOx' }], error: null }), ext)).status, 'clear')
t('조회 실패 → unknown(저장 안 함)', (await checkDuplicate(mock({ data: null, error: { message: 'boom' } }), ext)).status, 'unknown')

// 3) 행 모양 — 000022 의 컬럼 값 규약
const f = externalFields(ext, 'a@b.c')
t('external 필드 키', Object.keys(f).sort(), ['external_id', 'notes', 'permalink', 'published_via'])
t('published_via', f.published_via, 'external')
t('external_id·permalink 그대로', [f.external_id, f.permalink], [ID, LINK])
t('notes 가 [external] 로 시작(000022 와 같은 태그)', f.notes.startsWith('[external] '), true)

// 4) 경계면 — 소스 정적 확인
const actions = fs.readFileSync(new URL('../app/dashboard/actions.ts', import.meta.url), 'utf8')
const createPost = actions.slice(actions.indexOf('export async function createPost'), actions.indexOf('export async function createSnapshot'))
t('createPost 가 requireAllowedUser', createPost.includes('await requireAllowedUser()'), true)
t('createPost 가 external 파서·중복확인·필드를 쓴다', ['parseExternalInput(', 'checkDuplicate(', 'externalFields('].every((s) => createPost.includes(s)), true)
t('createPost 는 발행 API·토큰을 부르지 않는다', /publishTextPost|loadThreadsToken/.test(createPost), false)
// 000022 와 같은 나머지 키: channel_id(self)·published_at·body·char_count·status='published'
t('insert 에 000022 공통 키', ['channel_id:', 'published_at:', 'body,', 'char_count:', "status: 'published'"].every((s) => createPost.includes(s)), true)
t('중복 확인이 insert 앞', createPost.indexOf('checkDuplicate(') < createPost.indexOf(".from('posts').insert("), true)

const rd = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
t('매처: external_id 있는 행을 기연결로 뺀다', rd('app/api/threads/match-posts/route.ts').includes(".not('external_id', 'is', null)"), true)
t('성과 수집: status=published 로 고른다', rd('app/api/threads/collect-metrics/route.ts').includes(".eq('status', 'published')"), true)
t('답글 수집: published ∧ external_id', /\.eq\('status', 'published'\)\s*\n\s*\.not\('external_id', 'is', null\)/.test(rd('app/api/threads/collect-replies/route.ts')), true)

console.log(`threads-external-post selftest: ${pass} pass / ${fail} fail`)
if (fail) process.exit(1)
