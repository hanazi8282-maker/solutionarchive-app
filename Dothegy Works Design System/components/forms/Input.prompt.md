Single-line input. Match height to adjacent buttons/selects.

```jsx
<Input placeholder="직접 입력" type="number" min={1} max={60} affix="개월" />
<Input leftIcon={<Icon name="search" />} placeholder="제품 검색" />
<Input invalid value="" />
```

Props: `size` sm/md/lg, `leftIcon`, `affix` (trailing unit), `invalid`, plus all native input attrs.
