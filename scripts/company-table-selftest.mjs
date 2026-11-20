// S14 회사 추천표 셀프테스트 — 순수 함수만(네트워크·DB 없음).
import { criteria, passesCriteria, passesLegacy, thinReasons, toRow, nameNeedsFix, shouldSkipThin, skipThinEnabled, LEGACY_CRITERIA, NEW_CRITERIA } from '../lib/consult/company-table.ts'
let fail = 0
const t = (n, ok) => { if (!ok) { fail++; console.log('FAIL', n) } }
const s = (o) => ({ total: 500, ko: 60, low_total: 160, ko_low: 20, low1: 80, low2: 80, ...o })

t('기존 상수 보존', LEGACY_CRITERIA.koMin === 100 && LEGACY_CRITERIA.koLowMin === 30)
t('기본은 새 기준', criteria({}).lowTotalMin === 150 && criteria({}).koMin === 50 && NEW_CRITERIA.koMin === 50)
t('env 로 조정', criteria({ COMPANY_MIN_KO: '80' }).koMin === 80)
const AND = { lowTotalMin: 150, koMin: 50, mode: 'and' }
t('기본 mode=or, env and 선택', criteria({}).mode === 'or' && criteria({ COMPANY_CRITERIA_MODE: 'and' }).mode === 'and')
t('or: 전체 1~2점 150 단독 통과', passesCriteria(s({ low_total: 150, ko: 0 })))
t('or: 한국어 50 단독 통과', passesCriteria(s({ low_total: 0, ko: 50 })))
t('or: 149/49 탈락', !passesCriteria(s({ low_total: 149, ko: 49 })))
t('and: 150/50 통과', passesCriteria(s({ low_total: 150, ko: 50 }), AND))
t('and: 149/50, 150/49 탈락', !passesCriteria(s({ low_total: 149, ko: 50 }), AND) && !passesCriteria(s({ low_total: 150, ko: 49 }), AND))
t('기준 미달은 행 없음', toRow(s({ ko: 0, low_total: 0 })) === null)
t('legacy 경계', passesLegacy(s({ ko: 100, ko_low: 30 })) && !passesLegacy(s({ ko: 99, ko_low: 30 })) && !passesLegacy(s({ ko: 100, ko_low: 29 })))
t('얇음 아님', thinReasons(s({})).length === 0 && toRow(s({})).thin_evidence === false)
t('얇음: 한국어 1~2점 9 & 전체 <150', toRow(s({ ko_low: 9, low_total: 100, low1: 50, low2: 50 })).thin_evidence === true)
t('한국어 1~2점 9여도 전체 150+ 면 충분', thinReasons(s({ ko_low: 9, low_total: 160 })).length === 0)
t('얇음: Judge.me형(ko1626, low3)', toRow({ total: 2081, ko: 1626, low_total: 3, ko_low: 0, low1: 2, low2: 1 }).thin_evidence === true)
t('얇음 경계: low_total 19 얇음, 20 아님', thinReasons(s({ ko: 50, low_total: 19, ko_low: 15, low1: 10, low2: 9 })).some((x) => x.startsWith('ko_only')) && !thinReasons(s({ ko: 50, low_total: 20, ko_low: 15, low1: 10, low2: 10 })).some((x) => x.startsWith('ko_only')))
t('이름 코드 표시', nameNeedsFix('candidate:abc') && !nameNeedsFix('https://x.com'))
t('경계 한국어 1~2점 10은 충분', thinReasons(s({ ko_low: 10, low_total: 100, low1: 50, low2: 50 })).length === 0)
t('얇음: 점수 쏠림', thinReasons(s({ low1: 150, low2: 10 })).some((x) => x.startsWith('score_skew')))
t('표본 20 미만 쏠림은 무시', thinReasons(s({ low1: 19, low2: 0 })).length === 0)
t('건너뛰기 ON + 얇음 = skip', shouldSkipThin({ thin_evidence: true }, true))
t('깃발 OFF 면 skip 안 함', !shouldSkipThin({ thin_evidence: true }, false) && !skipThinEnabled({}))
t('표에 없거나 얇지 않으면 skip 안 함', !shouldSkipThin(null, true) && !shouldSkipThin({ thin_evidence: false }, true) && !shouldSkipThin({ thin_evidence: null }, true))
console.log(fail ? `${fail} 실패` : 'company-table-selftest 통과')
process.exit(fail ? 1 : 0)
