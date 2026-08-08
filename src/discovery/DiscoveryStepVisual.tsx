import type { DiscoveryVisual } from './discoveryTourDefinitions'

export function DiscoveryStepVisual({ visual }: { visual?: DiscoveryVisual }) {
  if (!visual) return null

  if (visual === 'connection') return <ConnectionVisual />
  if (visual === 'workspace') return <WorkspaceVisual />
  if (visual === 'report-components') return <ReportComponentsVisual />
  if (visual === 'suggestions') return <SuggestionsVisual />
  return <FormulaVisual />
}

function ConnectionVisual() {
  return (
    <div className="relative mb-4 h-24 overflow-hidden rounded-xl bg-surface-secondary px-4" aria-hidden="true">
      <div className="absolute left-4 top-5 w-24 rounded-lg bg-surface px-3 py-2">
        <div className="h-2 w-12 rounded-full bg-accent-green/70" />
        <div className="mt-2 h-1.5 w-16 rounded-full bg-surface-tertiary" />
        <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-surface bg-accent-green ring-4 ring-accent-green/15" />
      </div>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 96" fill="none">
        <path
          d="M116 39 C152 39 164 39 200 39"
          stroke="var(--edge-color)"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          className="motion-safe:animate-pulse"
        />
        <path d="m194 33 7 6-7 6" stroke="var(--edge-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="absolute right-4 top-5 w-24 rounded-lg bg-surface px-3 py-2">
        <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-surface bg-accent-purple" />
        <div className="h-2 w-14 rounded-full bg-accent-purple/70" />
        <div className="mt-2 h-1.5 w-12 rounded-full bg-surface-tertiary" />
      </div>
    </div>
  )
}

function WorkspaceVisual() {
  const items = [
    ['Canvas', 'Build workflows'],
    ['Dashboard', 'Understand the project'],
    ['Report', 'Share the result'],
  ]
  return (
    <div className="mb-4 grid grid-cols-3 gap-2" aria-hidden="true">
      {items.map(([label, detail], index) => (
        <div
          key={label}
          className={`rounded-lg px-2.5 py-3 ${
            index === 0
              ? 'bg-accent-green/10'
              : 'bg-surface-secondary'
          }`}
        >
          <div className="text-xs font-semibold text-text-primary">{label}</div>
          <div className="mt-1 text-[10px] leading-4 text-text-tertiary">{detail}</div>
        </div>
      ))}
    </div>
  )
}

function ReportComponentsVisual() {
  const components = [
    { label: 'Linked table', path: 'M4 6h16v12H4zM4 10h16M10 10v8' },
    { label: 'Chart', path: 'M5 20V10m7 10V4m7 16v-7' },
    { label: 'Callout', path: 'M5 5h14v11H9l-4 4V5z' },
    { label: 'Toggle', path: 'm9 7 5 5-5 5' },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-2" aria-hidden="true">
      {components.map(component => (
        <div key={component.label} className="flex items-center gap-2.5 rounded-lg bg-surface-secondary px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-accent-text">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d={component.path} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </span>
          <span className="text-xs font-medium text-text-primary">{component.label}</span>
        </div>
      ))}
    </div>
  )
}

function SuggestionsVisual() {
  return (
    <div className="mb-4 rounded-xl bg-surface-secondary p-3" aria-hidden="true">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-green/15 text-accent-text">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M9.7 17h4.6M12 3v1m6.4 1.6-.8.8M21 12h-1M4 12H3m3.3-5.7-.7-.7m2.9 9.9a5 5 0 1 1 7 0c-.9.8-1.5 1.8-1.5 3H10c0-1.2-.6-2.2-1.5-3Z" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-text-primary">Standardize date values</span>
          <span className="mt-1 block text-[11px] leading-4 text-text-secondary">3 formats detected in Order Date</span>
        </span>
        <span className="rounded-md bg-accent-green px-2 py-1 text-[10px] font-semibold text-white">Apply</span>
      </div>
    </div>
  )
}

function FormulaVisual() {
  return (
    <div className="mb-4 rounded-xl bg-accent-green/10 p-3" aria-hidden="true">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-text">Suggested formula</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-text-primary">Total Price</div>
          <code className="mt-1 block text-[11px] text-text-secondary">[unit_price] × [quantity]</code>
        </div>
        <span className="rounded-md bg-surface px-2 py-1 font-mono text-[10px] text-accent-text">fx</span>
      </div>
    </div>
  )
}
