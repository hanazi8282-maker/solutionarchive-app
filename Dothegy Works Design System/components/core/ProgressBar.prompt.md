Horizontal progress track with achievement-aware colouring.

```jsx
<ProgressBar value={38} showLabel />            {/* auto → red */}
<ProgressBar value={82} />                      {/* auto → amber */}
<ProgressBar value={104} />                     {/* auto → green */}
<ProgressBar value={2721} max={2500} tone="info" />
```

`tone="auto"` (default) applies the 0–69 red / 70–99 amber / 100+ green rule. Export `achievementTone(pct)` is reused by StatGauge and StatusBadge.
