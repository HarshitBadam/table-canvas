let beforeRelease: (() => Promise<void>) | null = null

export function setBeforeTabRelease(handler: (() => Promise<void>) | null): void {
  beforeRelease = handler
}

export async function prepareForTabRelease(): Promise<void> {
  await beforeRelease?.()
}
