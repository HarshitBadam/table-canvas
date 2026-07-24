import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  continueAsGuest: vi.fn(),
  login: vi.fn(),
  googleLogin: vi.fn(),
}))

vi.mock('@/state/AppContext', () => ({
  useApp: () => auth,
}))

describe('LoginPage guest entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.continueAsGuest.mockResolvedValue(undefined)
  })

  it('offers and starts an explicit local-only guest session', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Continue without an account',
    }))

    await waitFor(() => expect(auth.continueAsGuest).toHaveBeenCalledOnce())
    expect(screen.getByText(/Work stays in this browser/)).toBeInTheDocument()
  })
})
