import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { status: 'authenticated', identity: { uid: 'host', kind: 'anonymous' } } as unknown,
  createSession: vi.fn(),
  reopenGame: vi.fn(),
  listRecentSessions: vi.fn(),
  preserveSession: vi.fn(),
  subscribeToSession: vi.fn(),
  onSession: undefined as undefined | ((session: unknown) => void),
  unsubscribe: vi.fn(),
}))

vi.mock('../../infrastructure/firebase/authentication', () => ({
  firebaseAuthentication: {
    getGoogleAuthenticationOutcome: () => ({ status: 'idle' }),
    continueWithGoogle: vi.fn(), ensureAnonymousIdentity: vi.fn(), retry: vi.fn(),
  },
}))

vi.mock('../../infrastructure/firebase/sessions', () => ({
  firebaseSessionCreation: {
    createSession: mocks.createSession,
    joinSession: vi.fn(), startSession: vi.fn(), finalizeGame: vi.fn(), recordScore: vi.fn(),
    reopenGame: mocks.reopenGame, reportScore: vi.fn(), resolveScoreReport: vi.fn(),
    listRecentSessions: mocks.listRecentSessions, preserveSession: mocks.preserveSession,
    subscribeToSession: mocks.subscribeToSession,
  },
}))

vi.mock('../../app/useAuthentication', () => ({ useAuthentication: () => mocks.auth }))

import App from '../../app/App'

const activeSession = {
  sessionId: 'session-1', code: 'ABC234', hostUid: 'host', status: 'active', targetScore: 200,
  playerCount: 2, totalScore: 20, players: [
    { uid: 'host', displayName: 'Ana', totalScore: 20 },
    { uid: 'guest', displayName: 'Luis', totalScore: 10 },
  ],
  scoreEntries: [{ ownerUid: 'guest', ownerDisplayName: 'Luis', entryId: '123e4567-e89b-42d3-a456-426614174700', points: 10, sequence: 1 }],
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState({}, '', '/')
  mocks.auth = { status: 'authenticated', identity: { uid: 'host', kind: 'anonymous' } }
  mocks.createSession.mockResolvedValue({ sessionId: 'session-1', code: 'ABC234', status: 'lobby', targetScore: 200 })
  mocks.reopenGame.mockResolvedValue({ sessionId: 'session-1', status: 'active' })
  mocks.listRecentSessions.mockResolvedValue([])
  mocks.preserveSession.mockResolvedValue(undefined)
  mocks.unsubscribe.mockReset()
  mocks.onSession = undefined
  mocks.subscribeToSession.mockImplementation((_sessionId, _uid, onSession) => {
    mocks.onSession = onSession
    return mocks.unsubscribe
  })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('App MVP', () => {
  it('defaults to Spanish/dark, preloads a join link, and persists individual switches', () => {
    history.replaceState({}, '', '/?join=ABC234')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Crear partida' })).toBeInTheDocument()
    expect(screen.getByLabelText('Código de partida')).toHaveValue('ABC234')
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    expect(screen.getByRole('heading', { name: 'Create game' })).toBeInTheDocument()
    expect(localStorage.getItem('cinque.locale')).toBe('en')
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('cinque.theme')).toBe('light')
  })

  it('uses realtime state after creation and unsubscribes on leaving the game', async () => {
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Nombre')[0], { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear partida' }))
    await vi.waitFor(() => expect(mocks.subscribeToSession).toHaveBeenCalledWith('session-1', 'host', expect.any(Function), expect.any(Function)))
    mocks.onSession?.(activeSession)
    expect(await screen.findByRole('heading', { name: 'ABC234' })).toBeInTheDocument()
    expect(screen.getAllByText('Luis')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar partida' }))
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('offers auditable reopening only to the host of a finished game', async () => {
    const commandId = '123e4567-e89b-42d3-a456-426614174701'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(commandId)
    render(<App />)
    fireEvent.change(screen.getAllByLabelText('Nombre')[0], { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear partida' }))
    await vi.waitFor(() => expect(mocks.onSession).toBeTypeOf('function'))
    mocks.onSession?.({ ...activeSession, status: 'finished', winnerUid: 'host', winningTotalScore: 200, winningScoreCommandId: '123e4567-e89b-42d3-a456-426614174700' })
    fireEvent.change(await screen.findByLabelText('Motivo de reapertura'), { target: { value: 'Corregir el resultado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir partida' }))
    await vi.waitFor(() => expect(mocks.reopenGame).toHaveBeenCalledWith({ sessionId: 'session-1', reason: 'Corregir el resultado', commandId }))
  })

  it('shows recoverable recent sessions only for a persistent identity', async () => {
    mocks.auth = { status: 'authenticated', identity: { uid: 'host', kind: 'permanent' } }
    mocks.listRecentSessions.mockResolvedValue([{ sessionId: 'old-1', code: 'OLD234', displayName: 'Ana', role: 'host', targetScore: 300, status: 'finished' }])
    render(<App />)
    expect(await screen.findByText('OLD234')).toBeInTheDocument()
    expect(mocks.preserveSession).toHaveBeenCalledWith('old-1')
  })
})
