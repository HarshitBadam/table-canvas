import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { useApp } from '@/state/AppContext'

interface MenuPosition {
  left: number
  top: number
  width: number
}

export function ProjectSwitcher() {
  const {
    projectId,
    projectName,
    projects,
    isSaving,
    createNewProject,
    loadProject,
    renameProject,
  } = useApp()
  const switcherRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(288, window.innerWidth - gutter * 2)
    setMenuPosition({
      left: Math.min(Math.max(rect.left, gutter), window.innerWidth - width - gutter),
      top: rect.bottom + 6,
      width,
    })
  }, [])

  const openMenu = useCallback(() => {
    updateMenuPosition()
    setMenuOpen(true)
  }, [updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !switcherRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setMenuOpen(false)
        setIsRenaming(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isRenaming) {
          setIsRenaming(false)
          return
        }
        setMenuOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    const handleViewportChange = () => updateMenuPosition()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [isRenaming, menuOpen, updateMenuPosition])

  const handleCreate = async () => {
    const nextName = name.trim()
    if (!nextName) return
    setIsCreating(true)
    setError(null)
    try {
      await createNewProject(nextName)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      setIsCreating(false)
    }
  }

  const handleRename = () => {
    const nextName = renameName.trim()
    if (!nextName || nextName === projectName) return
    renameProject(nextName)
    setIsRenaming(false)
  }

  const focusProjectOption = (position: 'first' | 'last' | 'active') => {
    requestAnimationFrame(() => {
      const options = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      )
      if (options.length === 0) return
      if (position === 'last') {
        options.at(-1)?.focus()
        return
      }
      if (position === 'active') {
        const active = options.find(option => option.getAttribute('aria-selected') === 'true')
        const optionToFocus = active ?? options[0]
        optionToFocus.focus()
        return
      }
      options[0].focus()
    })
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    )
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      options[(currentIndex + 1 + options.length) % options.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      options[(currentIndex - 1 + options.length) % options.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      options[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      options.at(-1)?.focus()
    }
  }

  return (
    <div className="w-[min(14rem,48vw)] min-w-0 shrink-0">
      <div ref={switcherRef} className="min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Current project"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          disabled={isSaving || projects.length === 0}
          onClick={() => {
            if (menuOpen) {
              setMenuOpen(false)
              setIsRenaming(false)
            } else {
              openMenu()
            }
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              openMenu()
              focusProjectOption(event.key === 'ArrowDown' ? 'active' : 'last')
            }
          }}
          className="group flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-green/10 text-accent-text">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6.5A2.5 2.5 0 016.5 4h4l2 2h5A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-text-tertiary">Project</span>
            <span className="block truncate text-sm font-semibold text-text-primary">{projectName}</span>
          </span>
          <svg className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
          </svg>
        </button>

        {menuOpen && menuPosition && createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-popover overflow-hidden rounded-lg border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
          >
            <div className="px-3 pb-1.5 pt-3">
              <span className="text-xs font-semibold text-text-secondary">Projects</span>
            </div>
            <div
              role="listbox"
              aria-label="Projects"
              className="max-h-56 overflow-y-auto px-1.5 pb-1.5"
              onKeyDown={handleMenuKeyDown}
            >
              {projects.map(project => {
                const active = project.id === projectId
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setMenuOpen(false)
                      setIsRenaming(false)
                      if (!active) void loadProject(project.id)
                    }}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'bg-accent-green/10 font-medium text-accent-text hover:bg-accent-green/15'
                        : 'text-text-primary hover:bg-surface-tertiary'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {active && (
                      <svg className="h-4 w-4 shrink-0 text-accent-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            {isRenaming ? (
              <form
                className="bg-surface-secondary/70 p-3"
                onSubmit={event => {
                  event.preventDefault()
                  handleRename()
                }}
              >
                <label htmlFor="rename-project-name" className="block text-xs font-medium text-text-secondary">
                  Rename project
                </label>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    id="rename-project-name"
                    value={renameName}
                    onChange={event => setRenameName(event.target.value)}
                    className="input h-9 min-w-0 flex-1 bg-surface px-2.5"
                    autoFocus
                    maxLength={100}
                    onFocus={event => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => setIsRenaming(false)}
                    className="btn btn-ghost h-9 px-2.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!renameName.trim() || renameName.trim() === projectName}
                    className="btn btn-primary h-9 px-2.5"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-1 bg-surface-secondary/70 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setRenameName(projectName)
                    setIsRenaming(true)
                  }}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                >
                  <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.5 4.5l3 3M4 16l.75-3 8.5-8.5a1.4 1.4 0 012 2L6.75 15 4 16z" />
                  </svg>
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setCreateOpen(true)
                  }}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
                >
                  <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 5v14m7-7H5" />
                  </svg>
                  New project
                </button>
              </div>
            )}
          </div>
          , document.body)}
      </div>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Create project
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-text-secondary">
              Start a separate workspace. Pending changes in this project will be saved first.
            </Dialog.Description>
            <label htmlFor="new-project-name" className="mt-5 block text-xs font-medium text-text-primary">
              Project name
            </label>
            <input
              id="new-project-name"
              value={name}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void handleCreate()
              }}
              className="input mt-2 bg-surface-secondary px-3 py-2"
              autoFocus
              maxLength={100}
            />
            {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost">Cancel</button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || isCreating}
                className="btn btn-primary"
              >
                {isCreating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
