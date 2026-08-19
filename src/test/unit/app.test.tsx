import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('../../infrastructure/firebase/authentication', () => ({
  firebaseAuthentication: {
    getGoogleAuthenticationOutcome: () => ({ status: 'idle' }),
    continueWithGoogle: vi.fn(),
    ensureAnonymousIdentity: vi.fn(),
  },
}))

vi.mock('../../infrastructure/firebase/sessions', () => ({
  firebaseSessionCreation: {
    createSession: vi.fn(async () => ({ sessionId: 'session-1', code: 'ABCDEF', status: 'lobby', targetScore: 200 })),
    getSession,
  },
}))

vi.mock('../../app/useAuthentication', () => ({
  useAuthentication: () => ({ status: 'authenticated', identity: { uid: 'winner', kind: 'anonymous' } }),
}))

import App from '../../app/App'

afterEach(() => cleanup())

describe('App', () => {
  it('renders the initial placeholder screen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Cinque' })).toBeInTheDocument()
    expect(screen.getByText('Fundación inicial del proyecto lista.')).toBeInTheDocument()
  })

  it('renders a finished game and removes score entry controls', async () => {
    getSession.mockResolvedValueOnce({
      sessionId: 'session-1', hostUid: 'winner', status: 'finished', playerCount: 2, totalScore: 200,
      winnerUid: 'winner', winningTotalScore: 200, winningScoreCommandId: '123e4567-e89b-42d3-a456-426614174000',
    })
    render(<App />)

    fireEvent.change(screen.getAllByLabelText('Player name')[0], { target: { value: 'Winner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
    await screen.findByText(/Current session: lobby/)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Game finished. You won.')
    expect(screen.getByText('Final winning score: 200.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Score')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record score' })).not.toBeInTheDocument()
  })
})
