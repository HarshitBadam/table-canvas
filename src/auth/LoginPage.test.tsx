import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = vi.hoisted(() => ({
  continueAsGuest: vi.fn(),
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
      name: 'Continue as guest',
    }))

    await waitFor(() => expect(auth.continueAsGuest).toHaveBeenCalledOnce())
    expect(screen.getByText(/Guest work stays on this device/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('opens the legal documents from the consent notice', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Terms of Service' }))
    expect(screen.getByRole('dialog', { name: 'Terms of Service' })).toBeVisible()
    expect(screen.getByText('Using Table Canvas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Privacy Policy' }))
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeVisible()
    expect(screen.getByText('Guest sessions')).toBeInTheDocument()
  })
})
