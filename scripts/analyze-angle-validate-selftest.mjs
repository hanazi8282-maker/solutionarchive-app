#!/usr/bin/env node
// parseValidateAngleBody 셀프테스트. 네트워크·DB 없음.
//
// 이 함수가 POST /api/analyze/angle/validate 의 400 판정 전부를 담당한다.
// 404(앵글/프로젝트 없음)는 DB 조회 이후에만 판단 가능해 여기서 다루지 않는다
// (route.ts 의 `if (!angle) return 404` / `if (!project) return 404` 자체는
// 앵글 생성 POST 핸들러의 동일 패턴을 그대로 따른 것이라 별도 로직이 없다).

import { parseValidateAngleBody } from '../lib/analysis/validate-angle.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 통과 ──────────────────────────────────────────────────────
{
  const r = parseValidateAngleBody({ angle_id: '  abc-123  ', outcome_note: '  전환율 올랐다  ' })
  ok('정상 바디 → ok', r.ok)
  if (r.ok) {
    t('angle_id trim', r.angleId, 'abc-123')
    t('outcome_note trim', r.outcomeNote, '전환율 올랐다')
    t('validated_by 없으면 null', r.validatedBy, null)
  }
}
{
  const r = parseValidateAngleBody({ angle_id: 'abc', outcome_note: 'x', validated_by: '  남헌  ' })
  ok('validated_by 있으면 trim해서 채움', r.ok && r.validatedBy === '남헌')
}

// ── 거절(400) ─────────────────────────────────────────────────
for (const [name, body] of [
  ['본문 없음(null)', null],
  ['본문이 객체 아님(문자열)', 'x'],
  ['angle_id 없음', { outcome_note: 'x' }],
  ['angle_id 빈 문자열', { angle_id: '', outcome_note: 'x' }],
  ['angle_id 공백뿐', { angle_id: '   ', outcome_note: 'x' }],
  ['angle_id 문자열 아님(숫자)', { angle_id: 42, outcome_note: 'x' }],
  ['outcome_note 없음', { angle_id: 'abc' }],
  ['outcome_note 빈 문자열', { angle_id: 'abc', outcome_note: '' }],
  ['outcome_note 공백뿐', { angle_id: 'abc', outcome_note: '   ' }],
]) {
  const r = parseValidateAngleBody(body)
  ok(`거절: ${name}`, r.ok === false && typeof r.error === 'string' && r.error.length > 0)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('실전 채택 표시 바디 검증이 틀렸다 — 400 이 새거나 정상 요청이 막힌다.')
  process.exitCode = 1
} else {
  console.log('실전 채택 표시 바디 검증 정상 — 필수값 없으면 명확히 거절, 있으면 trim해서 통과.')
}
