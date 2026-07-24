const GUEST_SCOPE = 'guest'

let activeStorageScope = GUEST_SCOPE

export const GUEST_STORAGE_SCOPE = GUEST_SCOPE

export function accountStorageScope(userId: string): string {
  if (!userId.trim()) throw new Error('A user id is required for account storage')
  return `account:${userId}`
}

export function getStorageScope(): string {
  return activeStorageScope
}

export function setStorageScope(scope: string): void {
  if (!scope.trim()) throw new Error('Storage scope cannot be empty')
  activeStorageScope = scope
}

const KEY_SEPARATOR = '\u001f'

export function scopedStorageKey(scope: string, entityId: string): string {
  return `${scope}${KEY_SEPARATOR}${entityId}`
}

export function isLegacyRecord(ownerId: string | undefined): boolean {
  return ownerId == null
}
