// 콜드메일 본문 3줄 + 인스타 CTA — 순수 함수(import 없음). 발송은 사람이 한다(자동 발송 금지, 발송 시간 09~18시).
// v71ci §1 Q-B = 아니오: "비슷한 회사 k곳이 같은 선택을 했을 때 일어난 일도 적었습니다" 문장은 본문에 넣지 않는다.
export const CTA = '60초 진단'
export const TALLY_URL = 'https://tally.so/r/X55kqL'

export function coldMailLines(i: { company: string; headline: string; reportUrl: string }): string[] {
  const name = i.company.trim() || '귀사'
  return [
    `${name}의 공개 자료를 읽고 한 줄로 진단했습니다. ${i.headline.trim().replace(/[.。]$/, '')}.`,
    `손실 범위와 산식, 발전 방향 후보, 경쟁 지도까지 결론서 한 부에 담았습니다. ${i.reportUrl}`,
    `맞는지 틀린지 한 달 무료로 직접 확인해 보세요. ${TALLY_URL}`,
  ]
}

/** 발송 가능 시간(KST 09:00~18:00, 상한 미포함). 서버 시계가 UTC 여도 KST 로 바꿔 판정한다. */
export function inSendWindow(now: Date): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24
  return kstHour >= 9 && kstHour < 18
}

/**
 * 발송 이력(ops/state/dm-log-reconstructed-*.md 의 표) 에서 같은 회사가 이미 있는지 본다. 같은 회사에 결론서를 두 번 보내지 않기 위한 대조(v71ci 7(d)).
 * 표의 행은 "| 발송 | 수신 | 회사 | ... |" 꼴이고 회사 칸(세 번째)을 정규화해 비교한다. 이름이 비면 판단하지 않는다(빈 이름은 모든 행과 부분 일치하므로).
 */
export function alreadySent(logText: string, company: string): { sent: boolean; rows: string[] } {
  const norm = (x: string) => x.replace(/[\s·.,()\-_/]/g, '').toLowerCase()
  const key = norm(company)
  if (key.length < 2) return { sent: false, rows: [] }
  const rows = logText.split('\n').filter((l) => l.startsWith('|') && !/^\|[-\s|]+\|?$/.test(l) && !l.includes('발송(KST)')).filter((l) => {
    const cell = l.split('|')[3]
    return cell !== undefined && (norm(cell).includes(key) || key.includes(norm(cell)))
  })
  return { sent: rows.length > 0, rows: rows.map((r) => r.trim()) }
}
