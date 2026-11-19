// [v71cu S6/S6b] 수집 브리핑 md·Notion 요약 만들기(순수 함수 — DB 없음). 셀프테스트: scripts/collect-daily-report-selftest.mjs
export const SEC = { 1: '어제 새로 켠 소스·게시판', 2: '깔때기', 3: '차단', 4: '끌지 볼 곳', 5: '발굴', 6: '분야 진척', 7: '재고', 8: '판정', 9: '심장박동(26시간)', 10: '소스 카나리', 11: '깔때기 5숫자' }

export function renderBriefingMd(payload, briefDate) {
  const lines = payload.briefing ?? []
  let md = `# 수집 브리핑 ${briefDate}\n(생성 ${payload.generated_at})\n`
  for (const s of Object.keys(SEC)) {
    const rows = lines.filter((l) => String(l.section) === s)
    // 9~11 은 요약 줄(sort 0)이 늘 있어야 한다 — 없으면 "정상"이 아니라 집계 누락(§7.1)
    const empty = Number(s) >= 9 ? '- (집계 없음 — 확인 불가: 마이그 20261119000014 미적용?)' : '- (없음)'
    md += `\n## ${s}. ${SEC[s]}\n` + (rows.length ? rows.map((r) => `- ${r.label}: ${r.value}${r.delta ? ` (${r.delta})` : ''}${r.note ? ` — ${r.note}` : ''}`).join('\n') : empty) + '\n'
  }
  return md
}

// Notion "막힌것" 칸 한 줄
export function stabilitySummary(lines) {
  const sec = (n) => lines.filter((l) => l.section === n)
  const sum = (n, label) => sec(n).find((l) => l.label === label)
  const hb = sum(9, 'heartbeat_summary')
  const cn = sum(10, 'canary_summary')
  const fAlert = sec(11).filter((l) => String(l.note ?? '').includes('[경보]')).map((l) => l.label)
  return [
    `차단 ${sec(3).length}곳 · 끌지 볼 곳 ${sec(4).length}곳`,
    hb ? `심장박동 이상 ${hb.value}곳` : '심장박동 확인 불가',
    cn ? `카나리 이상 ${cn.value}곳` : '카나리 확인 불가',
    sec(11).length ? (fAlert.length ? `깔때기 경보 ${fAlert.join(',')}` : '깔때기 정상') : '깔때기 확인 불가',
  ].join(' · ')
}
