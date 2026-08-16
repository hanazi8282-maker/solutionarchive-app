'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type GroupAvg = { label: string; avg: number; n: number }

const BAR_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function ChartCard({ title, data }: { title: string; data: GroupAvg[] }) {
  return (
    <div style={{ flex: '1 1 320px', minWidth: 300 }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>{title}</h3>
      {data.length === 0 ? (
        <div
          style={{
            height: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed #cbd5e1',
            borderRadius: 8,
            color: '#64748b',
            fontSize: '0.9rem',
          }}
        >
          집계할 reply_rate 데이터가 아직 없습니다.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(3)} (n=${item?.payload?.n ?? '?'})`,
                '평균 reply_rate',
              ]}
            />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function InsightCharts({
  patternData,
  hookData,
}: {
  patternData: GroupAvg[]
  hookData: GroupAvg[]
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
      <ChartCard title="패턴(pattern)별 평균 reply_rate" data={patternData} />
      <ChartCard title="훅 유형(hook_type)별 평균 reply_rate" data={hookData} />
    </div>
  )
}
