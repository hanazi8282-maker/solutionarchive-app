// 무료 초안 신청·완성본 입력 셀프테스트(v71co 개정) — 네트워크·DB 없이 도는 순수 함수만.
import { SITUATION, parseSituation } from '../lib/consult/situation.ts'
import { priceOf, isPaidStatus, payInstructionsOn } from '../lib/consult/lead-pay.ts'
import { parseOptout, normalizeEmail, OPTOUT_REASONS } from '../lib/consult/optout.ts'
import { parseLeadForm, parseCompletion, funnel, mailDraft, leadOwner, validateCompletionResult, TOKEN_RE } from '../lib/consult/leads.ts'
let pass = 0, fail = 0
const t = (name, ok) => { if (ok) pass++; else { fail++; console.log('❌', name) } }

const good = { url: 'https://example.com', email: 'Kim@Example.com', consent: 'on' }
t('정상 접수', parseLeadForm(good).ok && parseLeadForm(good).email === 'kim@example.com')
t('동의 없으면 거절', parseLeadForm({ ...good, consent: undefined }).code === 'consent')
t('숨김 칸이 차 있으면 봇', parseLeadForm({ ...good, website: 'x' }).code === 'bot')
t('메일 형식 오류', parseLeadForm({ ...good, email: 'a@b' }).code === 'email')
t('내부 도메인 메일 거절', parseLeadForm({ ...good, email: 'x@solutionarch.internal' }).code === 'email')
t('내부망 주소 거절', parseLeadForm({ ...good, url: 'http://localhost:3000' }).code === 'url')
t('IP 주소 거절', parseLeadForm({ ...good, url: 'http://10.0.0.1' }).code === 'url')
t('변형 a/b/c 외는 a', parseLeadForm({ ...good, v: 'zzz' }).variant === 'a' && parseLeadForm({ ...good, v: 'B' }).variant === 'b')

const c = { visits: '1,200', signups: '60', paid: '3', source: '광고', pain: '와서 가입을 안 한다', tried: ['광고', '값 조정'] }
t('완성본 정상', parseCompletion(c).ok && parseCompletion(c).c.visits === 1200)
t('방문<가입이면 order', parseCompletion({ ...c, signups: '2000' }).code === 'order')
t('가입<유료면 order', parseCompletion({ ...c, paid: '61' }).code === 'order')
t('방문 0 거절', parseCompletion({ ...c, visits: '0', signups: '0', paid: '0' }).code === 'nums')
t('소수·음수 거절', parseCompletion({ ...c, paid: '1.5' }).code === 'nums' && parseCompletion({ ...c, paid: '-1' }).code === 'nums')
t('목록 밖 선택 거절', parseCompletion({ ...c, source: '임의' }).code === 'choice' && parseCompletion({ ...c, tried: ['임의'] }).code === 'choice')
t('해 본 것 비면 거절', parseCompletion({ ...c, tried: [] }).code === 'choice')

const f = funnel({ visits: 1200, signups: 60, paid: 3 })
t('깔때기 계산', f.visitToSignup === 5 && f.signupToPaid === 5 && f.visitToPaid === 0.3)
t('0 으로 나누지 않음', funnel({ visits: 10, signups: 0, paid: 0 }).signupToPaid === null)

const tok = 'a'.repeat(32)
t('토큰 형식', TOKEN_RE.test(tok) && !TOKEN_RE.test('a'.repeat(31)) && !TOKEN_RE.test('A'.repeat(32)) && !TOKEN_RE.test('../etc'))
const m = mailDraft({ host: 'example.com', token: tok, base: 'https://x.test' })
t('메일 문안: 열람 주소·수신 거부 문구', m.includes(`https://x.test/d/${tok}`) && m.includes('수신 거부'))
t('리드 소유자는 내부 도메인(실제 로그인 메일과 겹칠 수 없다)', leadOwner(tok).endsWith('@solutionarch.internal'))

const okR = { stage: 'pay', reason: '이유', paths: [1, 2, 3].map((i) => ({ title: `길${i}`, why: 'w', first_step: 's' })) }
t('완성본 결과 검증 통과', validateCompletionResult(okR, 3).paths.length === 3)
t('stage 오류 거절', (() => { try { validateCompletionResult({ ...okR, stage: 'x' }, 3); return false } catch { return true } })())
t('길이 모자라면 거절', (() => { try { validateCompletionResult({ ...okR, paths: okR.paths.slice(0, 2) }, 3); return false } catch { return true } })())

t('수신 거부: 정상(소문자 정리·이유 선택)', (() => { const r = parseOptout({ email: ' Kim@Example.com ', reason: 'too_many' }); return r.ok && r.email === 'kim@example.com' && r.reason === 'too_many' })())
t('수신 거부: 이유 없어도 통과(필수 아님)', parseOptout({ email: 'a@b.co' }).ok && parseOptout({ email: 'a@b.co' }).reason === null)
t('수신 거부: 목록 밖 이유는 null', parseOptout({ email: 'a@b.co', reason: 'zzz' }).reason === null)
t('수신 거부: 메일 형식 오류·봇', parseOptout({ email: 'x' }).code === 'email' && parseOptout({ email: 'a@b.co', website: 'x' }).code === 'bot')
t('수신 거부: 이유 4종', Object.keys(OPTOUT_REASONS).length === 4 && normalizeEmail('A@B.CO') === 'a@b.co')
t('메일 문안에 수신 거부·개인정보 주소', mailDraft({ host: 'x.io', token: tok, base: 'https://x.test' }).includes('https://x.test/unsubscribe') && mailDraft({ host: 'x.io', token: tok, base: 'https://x.test' }).includes('https://x.test/privacy'))
// 5·6번: 값 시험·입금 확인 판정·상황 질문
t('값 시험: 기본 49,000 · ?p=99 만 99,000 · 그 밖은 기본', priceOf(undefined) === 49000 && priceOf('99') === 99000 && priceOf('123') === 49000 && priceOf('49') === 49000)
t('입금 확인 전에는 열리지 않음: requested·rejected·ended 는 미결제, active 만 결제', !isPaidStatus([]) && !isPaidStatus([{ status: 'requested' }]) && !isPaidStatus([{ status: 'rejected' }, { status: 'ended' }]) && isPaidStatus([{ status: 'requested' }, { status: 'active' }]))
t('입금 안내 문구는 기본 꺼짐(LEAD_PAY_INSTRUCTIONS=1 일 때만)', !payInstructionsOn())
t('상황 질문: 14개·꼬리표 공유 5개·키 중복 없음', SITUATION.length === 14 && SITUATION.filter((q) => q.tagged).length === 5 && new Set(SITUATION.map((q) => q.key)).size === 14)
const pick = (over = {}) => (k) => { if (k in over) return over[k]; const q = SITUATION.find((x) => x.key === k); return q ? [q.options[0]] : [] }
t('상황 질문: 전부 답하면 통과(메모는 선택)', parseSituation(pick()).ok && parseSituation(pick({ note: [''] })).ok)
t('상황 질문: 하나라도 비면 어느 칸인지 알려 줌', (() => { const r = parseSituation(pick({ goal: [] })); return !r.ok && r.missing === 'goal' })())
t('상황 질문: 목록 밖 값·단일 질문에 둘 거절', !parseSituation(pick({ stage: ['임의'] })).ok && !parseSituation(pick({ stage: [SITUATION[0].options[0], SITUATION[0].options[1]] })).ok)
t('상황 질문: 여러 개 가능한 질문은 중복 제거·하나 이상', (() => { const r = parseSituation(pick({ tried: ['광고', '광고', '값 조정'] })); return r.ok && r.answers.tried.length === 2 })() && !parseSituation(pick({ tried: [] })).ok)
t('상황 질문: 메모 300자 제한', (() => { const r = parseSituation(pick({ note: ['가'.repeat(500)] })); return r.ok && r.answers.note.length === 300 })())
console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 무료 초안 접수·완성본 입력·깔때기·메일 문안·토큰`)
process.exit(fail ? 1 : 0)
