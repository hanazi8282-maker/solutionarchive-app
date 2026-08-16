Standard surface for grouping content. Optional header with title/subtitle and a right-aligned action.

```jsx
<Card title="개인별 달성률" subtitle="담당자별 KPI" action={<Button size="sm" variant="outline">전체</Button>}>
  …chart…
</Card>
```

Use `padded={false}` for edge-to-edge bodies (tables). White fill, hairline `--border`, `--shadow-sm`.
