// PMF B 입구 셀프테스트(v71f L-18) — 파싱·결과·로그에 원문이 새지 않는지.
import { parseEntry, resultOf, logLine, CONCLUSION_HREF, IDEA_MAX } from '../lib/pmf-b/entry.ts'
let fail = 0
const t = (n, ok) => { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}`) }
const fd = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

t('빈 아이디어 거절', !parseEntry(fd({ idea: '  ', area: 'a1' })).ok)
t('201자 거절', !parseEntry(fd({ idea: 'x'.repeat(IDEA_MAX + 1), area: 'a1' })).ok)
t('영역 없음/모르는 값 거절', !parseEntry(fd({ idea: 'a' })).ok && !parseEntry(fd({ idea: 'a', area: 'zz' })).ok)
const ok = parseEntry(fd({ idea: '회의  녹음\n자동 요약', area: 'a1', audience: '영업팀', q0: '노션' }))
t('정상 파싱·공백 정리', ok.ok && ok.entry.idea === '회의 녹음 자동 요약' && ok.entry.answers[0] === '노션' && ok.entry.answers.length === 5)
t('영역 밖은 안내만', resultOf(parseEntry(fd({ idea: 'a', area: 'out' })).entry).kind === 'outside')
t('결론서 없으면 준비 중', Object.keys(CONCLUSION_HREF).length > 0 || resultOf(ok.entry).kind === 'pending')
t('로그에 원문·답변 없음', (() => { const l = logLine(ok.entry); return l.includes('idea_len=') && !l.includes('회의') && !l.includes('영업팀') && !l.includes('노션') })())
process.exit(fail ? 1 : 0)
