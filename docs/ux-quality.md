# UX release contract

UX is release-blocking. A change passes only when `npm run test:release` is green with
committed visual baselines. Updating a screenshot is a product decision, not a way to
silence a failure.

## Supported experience

- Chromium desktop at 1024×768 through 1440×900.
- Light and dark themes.
- Keyboard and pointer input.
- WCAG 2.1 A/AA rules covered by axe, plus explicit focus and keyboard journeys.
- Tables up to the product limit, with a deterministic 2,000-row browser fixture.

Smaller touch layouts are not currently a supported product surface. Expanding that
support requires adding viewports and baselines before changing the claim.

## Binary gates

| Gate | Required result |
| --- | --- |
| Critical journeys | Import/edit, clean/undo/redo/reload, join/reload, report/embed/edit/export, and project switch/reopen all pass |
| Accessibility | Zero axe WCAG A/AA violations in the shell, dialogs, grid, suggestions, report, and join flow |
| Keyboard | Dialog focus return, menus, grid edit, and history actions work without a pointer |
| Visual | All committed light/dark, dialog, grid, suggestions, and report screenshots match within 1% pixels |
| Responsive | No page overflow or clipped shell, dialog, grid, or report controls at supported viewports |
| Main thread | No measured interaction task reaches 250 ms; at most one reaches 100 ms |
| Large data | A 2,000-row grid renders fewer than 500 cells, 3,500 body elements, and 5,000 DOM nodes |
| Memory | Main-page JavaScript heap remains below 128 MiB in the large-table fixture |
| Runtime errors | Critical UX tests allow zero uncaught errors and zero `console.error` calls |
| Production signals | The production build records FCP, TTFB, CLS, INP, and LCP through `web-vitals` |

Performance gates intentionally use bounded work and long tasks rather than total
wall-clock duration, which varies with CI hardware.

## Commands

```bash
npm run test:ux
npm run test:release
```

Use `npm run test:ux:update` only after reviewing every changed image. CI runs the full
Playwright suite, which includes the UX contract.

## Production telemetry

`src/observability/frontendTelemetry.ts` keeps the latest 100 events in
`window.__tableCanvasTelemetry`, emits `tablecanvas:telemetry`, and records:

- CLS, FCP, INP, LCP, and TTFB
- uncaught errors
- unhandled promise rejections
- React error-boundary failures

Set `VITE_TELEMETRY_ENDPOINT` in production to send the same structured envelopes to
the monitoring collector with `sendBeacon`/keepalive fetch. The payload contains no
table contents, cell values, email addresses, or project names.

## Review rule

The automated contract is necessary but does not prove that UX is universally
“perfect.” Any newly supported browser, viewport, input method, or user journey must
first be expressed as a reproducible gate. Subjective usability findings become
release requirements only after they are converted into an observable behavior or
reviewed visual baseline.
