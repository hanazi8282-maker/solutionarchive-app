Standard no-data surface. Use instead of bare "데이터 없음" text.

```jsx
<EmptyState
  icon={<Icon name="trending-up" size={24} />}
  title="아직 수집된 매출이 없습니다"
  description="상단 [지금 수집]을 누르면 채널별 매출을 불러옵니다."
  action={<Button variant="primary" size="sm">지금 수집</Button>}
  tone="info"
/>
```

Props: `icon`, `title`, `description`, `action`, `tone` (neutral/info/warning/danger), `compact`.
