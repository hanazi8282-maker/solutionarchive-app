// 기계 소유 가이드 파일의 초기 상태를 생성한다.
//
//   node scripts/insight-seed-guides.mjs
//
// 왜 손으로 안 쓰는가: 나이틀리 루프는 렌더 결과와 현재 파일 내용을 바이트로
// 비교해 다를 때만 커밋한다. 손으로 쓴 초기 파일이 렌더 출력과 1바이트라도
// 다르면 첫 실행이 "변경 없음"인데도 커밋을 만든다. 같은 함수로 생성해야
// 그 빈 커밋이 안 생긴다.

import fs from 'node:fs'
import {
  renderLearnedPatterns,
  renderRejectedPatterns,
  LEARNED_PATTERNS_PATH,
  REJECTED_PATTERNS_PATH,
} from '../lib/insight/patterns.ts'

fs.mkdirSync('content/corpus', { recursive: true })
fs.writeFileSync(LEARNED_PATTERNS_PATH, renderLearnedPatterns([]), 'utf8')
fs.writeFileSync(REJECTED_PATTERNS_PATH, renderRejectedPatterns([]), 'utf8')
console.log('seeded:', LEARNED_PATTERNS_PATH, '/', REJECTED_PATTERNS_PATH)
