import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import App from '../App'

// Stub localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  vi.restoreAllMocks()
})

// Helper: open the auth modal via the nav "Sign in" button
function openSignInModal() {
  // The nav button is the only Sign in button before the modal is open
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
}

// Helper: get the submit button inside the modal form (not the nav / tab buttons)
function getModalSubmitButton() {
  const form = document.querySelector('.auth-form') as HTMLElement
  return within(form).getByRole('button')
}

// Helper: get the modal card element
function getModalCard() {
  return document.querySelector('.auth-card') as HTMLElement
}

describe('Landing page (unauthenticated)', () => {
  it('renders the brand name', () => {
    render(<App />)
    expect(screen.getAllByText('Recharge').length).toBeGreaterThan(0)
  })

  it('shows Sign in and Try free nav buttons', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try free/i })).toBeInTheDocument()
  })

  it('shows hero headline', () => {
    render(<App />)
    expect(screen.getByText(/know your limits/i)).toBeInTheDocument()
  })

  it('shows features section with all three cards', () => {
    render(<App />)
    expect(screen.getByText('Risk Score')).toBeInTheDocument()
    expect(screen.getByText('8-Week Forecast')).toBeInTheDocument()
    expect(screen.getByText('Key Contributors')).toBeInTheDocument()
  })

  it('does not show the auth form by default', () => {
    render(<App />)
    expect(screen.queryByPlaceholderText(/you@company.com/i)).not.toBeInTheDocument()
  })
})

describe('Auth modal', () => {
  it('opens when the nav "Sign in" button is clicked', async () => {
    render(<App />)
    openSignInModal()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/you@company.com/i)).toBeInTheDocument()
    )
  })

  it('opens in signup mode when "Try free" is clicked', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /try free/i }))
    await waitFor(() => {
      const submit = getModalSubmitButton()
      expect(submit).toHaveTextContent(/create account/i)
    })
  })

  it('closes when the overlay backdrop is clicked', async () => {
    render(<App />)
    openSignInModal()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/you@company.com/i)).toBeInTheDocument()
    )
    fireEvent.click(document.querySelector('.modal-overlay')!)
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/you@company.com/i)).not.toBeInTheDocument()
    )
  })

  it('closes when the × button is clicked', async () => {
    render(<App />)
    openSignInModal()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/you@company.com/i)).toBeInTheDocument()
    )
    fireEvent.click(document.querySelector('.modal-close')!)
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/you@company.com/i)).not.toBeInTheDocument()
    )
  })

  it('switches between Sign In and Sign Up tabs', async () => {
    render(<App />)
    openSignInModal()
    await waitFor(() => expect(getModalCard()).toBeInTheDocument())

    const modal = getModalCard()
    const signUpTab = within(modal).getByRole('button', { name: /^sign up$/i })
    fireEvent.click(signUpTab)
    expect(getModalSubmitButton()).toHaveTextContent(/create account/i)

    const signInTab = within(modal).getByRole('button', { name: /^sign in$/i })
    fireEvent.click(signInTab)
    expect(getModalSubmitButton()).toHaveTextContent(/^sign in$/i)
  })

  it('shows an error message when login returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Incorrect email or password' }), { status: 401 })
    )
    render(<App />)
    openSignInModal()
    await waitFor(() => expect(getModalCard()).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/min. 6 characters/i), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(getModalSubmitButton())

    await waitFor(() =>
      expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument()
    )
  })

  it('closes modal and shows dashboard after successful login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'fake-jwt-token', token_type: 'bearer' }),
        { status: 200 }
      )
    )
    render(<App />)
    openSignInModal()
    await waitFor(() => expect(getModalCard()).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/you@company.com/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText(/min. 6 characters/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(getModalSubmitButton())

    await waitFor(() =>
      expect(screen.getByText(/burnout risk assessment/i)).toBeInTheDocument()
    )
    expect(screen.queryByPlaceholderText(/you@company.com/i)).not.toBeInTheDocument()
  })
})

describe('Dashboard (authenticated)', () => {
  beforeEach(() => {
    localStorageMock.setItem('recharge_access_token', 'fake-jwt-token')
  })

  it('renders the assessment form', () => {
    render(<App />)
    expect(screen.getByText(/burnout risk assessment/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze burnout risk/i })).toBeInTheDocument()
  })

  it('shows Sign out button in nav', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('returns to landing page after sign out', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() =>
      expect(screen.getByText(/know your limits/i)).toBeInTheDocument()
    )
  })

  it('shows empty state before first analysis', () => {
    render(<App />)
    expect(screen.getByText(/your results will appear here/i)).toBeInTheDocument()
  })

  it('displays risk score and cleaned contributor labels after analysis', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          risk_score: 0.9,
          risk_band: 'high',
          contributors: [
            {
              feature: 'mental_fatigue_score',
              label: 'cat Mental Fatigue Score High',
              shap: 0.3,
              share: 34,
              direction: 'increases_risk',
            },
          ],
          days_to_high_risk: 0,
          projected_weekly_risk: [
            { day: 0, risk_score: 0.9 },
            { day: 7, risk_score: 0.95 },
          ],
          warning_level: 'critical',
          warning_message: 'High burnout risk now.',
          disclaimer: 'Not a medical diagnosis.',
        }),
        { status: 200 }
      )
    )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /analyze burnout risk/i }))

    await waitFor(() =>
      expect(screen.getAllByText('90%').length).toBeGreaterThanOrEqual(1)
    )
    expect(screen.getByText('High burnout risk now.')).toBeInTheDocument()
    // Raw "cat Mental Fatigue Score High" should be cleaned to "Mental Fatigue"
    expect(screen.getByText('Mental Fatigue')).toBeInTheDocument()
    // 8-week forecast bars should render
    expect(screen.getByText('D0')).toBeInTheDocument()
    expect(screen.getByText('D7')).toBeInTheDocument()
  })
})
