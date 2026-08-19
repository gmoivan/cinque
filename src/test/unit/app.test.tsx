import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSession, reportScore } = vi.hoisted(() => ({ getSession: vi.fn(), reportScore: vi.fn() }))

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
    reportScore,
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

  it('offers reporting only for another player score and suppresses an already open report', async () => {
    getSession.mockResolvedValueOnce({ sessionId: 'session-1', hostUid: 'winner', status: 'active', playerCount: 2, totalScore: 0, scoreEntries: [
      { ownerUid: 'winner', ownerDisplayName: 'Winner', entryId: 'own', points: 5 },
      { ownerUid: 'guest', ownerDisplayName: 'Guest', entryId: 'other', points: 10 },
      { ownerUid: 'guest', ownerDisplayName: 'Guest', entryId: 'reported', points: 15, openReport: { reportId: 'report-1', reporterUid: 'winner', reason: 'Wrong' } },
    ] })
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Player name')[0], { target: { value: 'Winner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
    await screen.findByText(/Current session: lobby/)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }))
    expect(await screen.findByRole('button', { name: 'Reportar puntuación' })).toBeInTheDocument()
    expect(screen.getByText(/Reportado: pendiente/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reportar puntuación' }))
    expect(screen.getByLabelText('Motivo del reporte')).toBeInTheDocument()
  })

  it('reuses a failed report command for the unchanged retry', async () => {
    const session = { sessionId: 'session-1', hostUid: 'winner', status: 'active', playerCount: 2, totalScore: 0, scoreEntries: [
      { ownerUid: 'guest', ownerDisplayName: 'Guest', entryId: 'other', points: 10 },
    ] }
    getSession.mockResolvedValue(session)
    reportScore.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValueOnce({ status: 'open' })
    const commandId = vi.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-42d3-a456-426614174111')
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Player name')[0], { target: { value: 'Winner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
    await screen.findByText(/Current session: lobby/)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar puntuación' }))
    fireEvent.change(screen.getByLabelText('Motivo del reporte'), { target: { value: 'Incorrecta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))
    await vi.waitFor(() => expect(reportScore).toHaveBeenCalledTimes(2))
    expect(reportScore.mock.calls[0][0].commandId).toBe(reportScore.mock.calls[1][0].commandId)
    expect(commandId).toHaveBeenCalledOnce()
    commandId.mockRestore()
  })
})
