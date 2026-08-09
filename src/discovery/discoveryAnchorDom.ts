export function findVisibleAnchor(anchorIds: readonly string[]): HTMLElement | null {
  for (const anchorId of anchorIds) {
    const candidates = document.querySelectorAll<HTMLElement>(
      `[data-discovery-anchor="${anchorId}"]`,
    )
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect()
      const style = window.getComputedStyle(candidate)
      if (
        rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
      ) {
        return candidate
      }
    }
  }
  return null
}
