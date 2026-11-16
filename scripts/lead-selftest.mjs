// 무료 초안 신청·완성본 입력 셀프테스트(v71co 개정) — 네트워크·DB 없이 도는 순수 함수만.
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

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 무료 초안 접수·완성본 입력·깔때기·메일 문안·토큰`)
process.exit(fail ? 1 : 0)
