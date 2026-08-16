Native select styled to match Input, with a chevron.

```jsx
<Select
  placeholder="구분 선택"
  value={kind}
  onChange={(e) => setKind(e.target.value)}
  options={["생산(+)", "출고(-)", "실재고파악", "입고(+)", "폐기(-)"]}
/>
<Select options={[{value:"3pl",label:"3PL창고"},{value:"factory",label:"공장"}]} />
```

Options accept strings or `{value,label}`. Sizes sm/md/lg.
