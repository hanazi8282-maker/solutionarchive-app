// S14 회사 추천표 셀프테스트 — 순수 함수만(네트워크·DB 없음).
import { criteria, passesCriteria, passesLegacy, thinReasons, toRow, shouldSkipThin, skipThinEnabled, LEGACY_CRITERIA, NEW_CRITERIA } from '../lib/consult/company-table.ts'
let fail = 0
const t = (n, ok) => { if (!ok) { fail++; console.log('FAIL', n) } }
const s = (o) => ({ total: 500, ko: 60, low_total: 160, ko_low: 20, low1: 80, low2: 80, ...o })

t('기존 상수 보존', LEGACY_CRITERIA.koMin === 100 && LEGACY_CRITERIA.koLowMin === 30)
t('기본은 새 기준', criteria({}).lowTotalMin === 150 && criteria({}).koMin === 50 && NEW_CRITERIA.koMin === 50)
t('env 로 조정', criteria({ COMPANY_MIN_KO: '80' }).koMin === 80)
t('경계 통과(150/50)', passesCriteria(s({ low_total: 150, ko: 50 })))
t('전체 1~2점 149 탈락', !passesCriteria(s({ low_total: 149 })))
t('한국어 49 탈락', !passesCriteria(s({ ko: 49 })))
t('기준 미달은 행 없음', toRow(s({ ko: 0 })) === null)
t('legacy 경계', passesLegacy(s({ ko: 100, ko_low: 30 })) && !passesLegacy(s({ ko: 99, ko_low: 30 })) && !passesLegacy(s({ ko: 100, ko_low: 29 })))
t('얇음 아님', thinReasons(s({})).length === 0 && toRow(s({})).thin_evidence === false)
t('얇음: 한국어 1~2점 9', toRow(s({ ko_low: 9 })).thin_evidence === true)
t('경계 한국어 1~2점 10은 충분', thinReasons(s({ ko_low: 10 })).length === 0)
t('얇음: 점수 쏠림', thinReasons(s({ low1: 150, low2: 10 })).some((x) => x.startsWith('score_skew')))
t('표본 20 미만 쏠림은 무시', thinReasons(s({ low1: 19, low2: 0 })).length === 0)
t('건너뛰기 ON + 얇음 = skip', shouldSkipThin({ thin_evidence: true }, true))
t('깃발 OFF 면 skip 안 함', !shouldSkipThin({ thin_evidence: true }, false) && !skipThinEnabled({}))
t('표에 없거나 얇지 않으면 skip 안 함', !shouldSkipThin(null, true) && !shouldSkipThin({ thin_evidence: false }, true) && !shouldSkipThin({ thin_evidence: null }, true))
console.log(fail ? `${fail} 실패` : 'company-table-selftest 통과')
process.exit(fail ? 1 : 0)
