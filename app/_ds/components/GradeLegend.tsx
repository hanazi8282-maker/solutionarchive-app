/**
 * 등급 범례 — "무엇이 A 인가"를 화면에서 답한다.
 *
 * 왜 필요한가: 배지에 A/B/C/D 만 떠 있으면 읽는 사람은 그게 학점인지 신선도인지 모른다.
 * 이 아카이브에서 등급은 **세 축**이고 셋은 다른 질문이다 — 그걸 모르면 "사실확인 C"를
 * "쓸모없는 사례"로 읽는다. 배지를 강화하는 것보다 이 한 칸이 싸다.
 *
 * ★ 2026-09-23: 화면 배지의 1순위가 **PMF 등급**으로 바뀌었다(`displayGrade` =
 *   `pmf_grade ?? evidence_grade`). 앞의 두 축은 없어지지 않았다 — 인사이트는 "옮길 게
 *   적혀 있나", 사실확인은 "믿을 수 있나", PMF 는 "얼마나 됐고 내가 옮길 수 있나"다.
 *
 * ⚠️ 산식은 **여기에 적지 않는다.** 정본은 `docs/evidence-rules.md §3`(사실확인) ·
 *    `lib/cases/draft.ts` 의 `gradeMove`(인사이트) · `pmfGrade`(PMF) 이고, 재채점으로
 *    바뀌는 규칙이라 화면에 복사해 두면 조용히 옛말이 된다(_principles.md §4). 요약만 둔다.
 *
 * ⚠️ 초록·빨강을 쓰지 않는다. 그 색은 감성/판정 전용이라(app/_ds/tokens/colors.css `--sent-*`)
 *    등급에 쓰면 "C" 가 나쁜 사람으로 읽힌다. 등급은 감성이 아니라 분류다 → 정보 톤.
 */
const ROW: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }

const PMF: [string, string][] = [
  ['A', '크게 움직였고(신호 강함) 내일 옮길 수 있다'],
  ['B', '둘 중 하나가 아쉽다 — 크게 됐지만 전제가 무겁거나, 작지만 그대로 옮긴다'],
  ['C', '변화가 작거나, 옮기려면 자본·규제·규모가 필요하다'],
  ['D', '결과가 불분명하다(수치 없음) — 검색·매칭에서 빠진다'],
]

const INSIGHT: [string, string][] = [
  ['A', '옮길 행동 + 그 전제 + 뒷받침 근거가 다 있다'],
  ['B', '옮길 행동은 구체적인데 전제(무엇이 있어야 되나)가 비어 있다'],
  ['C', '행동이 짧거나 다른 사례에도 붙는 일반론이다'],
  ['D', '옮길 행동이 안 적혀 있다 — 사실이 맞아도 가져갈 게 없다'],
]

const FACT: [string, string][] = [
  ['A', '법정 공시이거나, 결제사 자동집계 공개 대시보드이거나, 당사자가 아닌 1차 출처이거나, 서로 다른 원 관측 2개 이상'],
  ['B', '당사자가 말한 1차 출처 + 다른 관측 하나'],
  ['C', '근거는 있으나 위에 못 미친다 — 인용할 때 출처를 본문에 밝혀야 한다'],
  ['D', '수치 자체가 없다. 서술만 있다'],
]

function List({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <p style={{ ...ROW, color: 'var(--text-body)', fontWeight: 600 }}>{title}</p>
      {rows.map(([g, text]) => (
        <p key={g} style={ROW}><b style={{ fontFamily: 'var(--font-mono)' }}>{g}</b> — {text}</p>
      ))}
    </div>
  )
}

export function GradeLegend() {
  return (
    <details className="dgy-details">
      <summary>등급이 무슨 뜻인가 (A~D 범례)</summary>
      <div style={{ display: 'grid', gap: 10, padding: '8px 0 0' }}>
        <p style={ROW}>
          등급은 <b>세 축</b>이다. 카드에 크게 붙는 배지가 <b>PMF 등급</b> — &quot;그래서 얼마나
          됐고, 내가 내일 옮길 수 있나&quot;. <b>인사이트 등급</b>은 &quot;옮길 행동이 적혀 있나&quot;,
          <b> 사실확인 등급</b>은 &quot;그 수치를 믿을 수 있나&quot;. 한 무브가 PMF C · 인사이트 A ·
          사실확인 C 일 수 있다.
        </p>
        <List title="PMF 등급 (배지에 나오는 축)" rows={PMF} />
        <p style={ROW}>
          배지 옆 <b>↑ / ↓ / ↕</b> 는 성과 방향이다. <b>실패한 사례도 A 가 될 수 있다</b> —
          크게 틀린 이야기는 크게 된 이야기만큼 가져갈 게 많다. 등급만 보고 성공 사례로 읽지 않도록
          방향을 같이 붙인다. <b>잠정</b> 표시는 &quot;신호 강도·이식성을 사람이 아직 확정하지 않았다&quot;는
          뜻이고, &quot;등급이 낮다&quot;가 아니다.
        </p>
        <List title="인사이트 등급" rows={INSIGHT} />
        <List title="사실확인 등급" rows={FACT} />
        <p style={ROW}>
          요약이다. 산식 정본은 <code>docs/evidence-rules.md §3</code>(사실확인) ·
          <code> lib/cases/draft.ts gradeMove</code>(인사이트) ·
          <code> pmfGrade</code>(PMF, <code>docs/case-study-pipeline-design.md §10</code>) 이고,
          재채점으로 바뀐다. 등급 D 무브는 검색 결과에서 아예 빠진다.
        </p>
      </div>
    </details>
  )
}
