Standard table for lists (재고 낱개 현황, 팀원 목록, 부자재).

```jsx
<DataTable
  columns={[
    { key: "name", header: "제품명" },
    { key: "qty", header: "현재고", align: "right", numeric: true },
    { key: "status", header: "상태", render: (v) => <StatusBadge status={v} /> },
    { key: "go", header: "", align: "right", render: () => <Icon name="arrow-right" /> },
  ]}
  data={rows}
  onRowClick={(row) => openTimeline(row)}
/>
```

Columns: `key`, `header`, `align`, `width`, `numeric`, `wrap`, `render(value,row,i)`. Use `render` to drop in StatusBadge/Button/icons.
