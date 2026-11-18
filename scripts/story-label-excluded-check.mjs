#!/usr/bin/env node
// [v71ct-4 §2] "사례 없는 글 사전 제외" 검증: 제외 기준(전문 1,500자 미만)에 걸린 스토리 중 30편을 상위 모델(Opus)이 읽고
// "구체적인 사업 행동(+결과)이 한 건이라도 있는가"를 판정한다. 제외가 정당한 비율(=정말 사례 없음)을 보고한다. 구독 경로, 읽기 전용.
import fs from 'node:fs'
import os from 'node:os'
import zlib from 'node:zlib'
import path from 'node:path'
import crypto from 'node:crypto'
import { runCli } from '../lib/story-label/cli.mjs'
import { firstJson } from '../lib/story-label/core.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const st = zlib.gunzipSync(fs.readFileSync(path.join(os.homedir(), 'sa-private/ground/starterstory/starterstory_stories_3314.jsonl.gz'))).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const short = st.filter((s) => s.full_text && s.full_text.length > 0 && s.full_text.length < 1500)
const empty = st.filter((s) => !s.full_text || s.full_text.length === 0)
const h = (x) => crypto.createHash('md5').update(x + 'excl').digest('hex')
const pick = short.sort((a, b) => (h(a.slug) < h(b.slug) ? -1 : 1)).slice(0, 30)
const system = `당신은 인터뷰·기사 본문을 읽고 "사례 라벨링 대상인가"를 판정한다. ${UNTRUSTED_INPUT_NOTICE}
대상 = 본문에 창업자가 한 **구체적인 사업 행동**(무엇을 했는지)이 한 건 이상 있고 그 행동의 **결과나 이유**가 적혀 있는 글. 광고·목록·소개문·제목뿐인 글·업데이트 공지는 대상이 아니다.
입력은 "번호|제목|본문". 출력은 JSON 하나만: {"1":{"case":true|false,"why":"한 줄"},...}`
const user = pick.map((s, i) => `${i + 1}|${s.title}|${s.full_text.replace(/\s+/g, ' ')}`).join('\n')
const r = await runCli({ system, user, model: 'claude-opus-5-5', effort: 'medium' })
const j = firstJson(r.text) ?? {}
const rows = pick.map((s, i) => ({ slug: s.slug, chars: s.full_text.length, case: j[String(i + 1)]?.case, why: j[String(i + 1)]?.why }))
const judged = rows.filter((x) => typeof x.case === 'boolean')
const hasCase = judged.filter((x) => x.case).length
const res = { excluded_short_total: short.length, excluded_empty_total: empty.length, sampled: pick.length, judged: judged.length, actually_has_case: hasCase, exclusion_correct_rate: judged.length ? Number((1 - hasCase / judged.length).toFixed(3)) : null, wrongly_excluded: rows.filter((x) => x.case).map((x) => ({ slug: x.slug, chars: x.chars, why: x.why })) }
fs.writeFileSync('reports/2026-11-18/story-label-excluded-check.json', JSON.stringify(res, null, 1))
console.log(JSON.stringify(res, null, 1))
