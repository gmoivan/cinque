import { firebaseAuthentication } from '../infrastructure/firebase/authentication'
import { firebaseSessionCreation } from '../infrastructure/firebase/sessions'
import { CreateSessionError, FinalizeGameError, JoinSessionError, RecordScoreError, ReportScoreError, ResolveScoreReportError, StartSessionError, type CreatedSession, type CurrentSession, type JoinedSession, type ScoreEntry } from '../application/sessions'
import { commandForReportAttempt, commandForResolveAttempt, type PendingReportCommand, type PendingResolveCommand } from '../application/reporting'

import { useAuthentication } from './useAuthentication'
import { useRef, useState } from 'react'

function App() {
  const authentication = useAuthentication(firebaseAuthentication)
  const googleOutcome = firebaseAuthentication.getGoogleAuthenticationOutcome()
  const [displayName, setDisplayName] = useState('')
  const [targetScore, setTargetScore] = useState(200)
  const [creating, setCreating] = useState(false)
  const [createdSession, setCreatedSession] = useState<CreatedSession | undefined>()
  const [createError, setCreateError] = useState<string | undefined>()
  const [currentSession, setCurrentSession] = useState<CurrentSession | undefined>()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | undefined>()
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | undefined>()
  const [joinCode, setJoinCode] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinedSession, setJoinedSession] = useState<JoinedSession | undefined>()
  const [joinError, setJoinError] = useState<string | undefined>()
  const [points, setPoints] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordError, setRecordError] = useState<string | undefined>()
  const [reportingEntry, setReportingEntry] = useState<ScoreEntry | undefined>()
  const [reportReason, setReportReason] = useState('')
  const [proposedPoints, setProposedPoints] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportError, setReportError] = useState<string | undefined>()
  const [resolvingEntry, setResolvingEntry] = useState<ScoreEntry | undefined>()
  const [resolvingReportId, setResolvingReportId] = useState<string | undefined>()
  const [correctedScore, setCorrectedScore] = useState('')
  const [resolutionReason, setResolutionReason] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | undefined>()
  const pendingCommandId = useRef<string | undefined>(undefined)
  const pendingFinalizeCommandId = useRef<string | undefined>(undefined)
  const pendingReportCommand = useRef<PendingReportCommand | undefined>(undefined)
  const pendingResolveCommand = useRef<PendingResolveCommand | undefined>(undefined)

  async function createSession() {
    if (creating || authentication.status === 'error') return
    setCreating(true)
    setCreateError(undefined)
    setCreatedSession(undefined)
    try {
      const identity = authentication.status === 'signedOut'
        ? await firebaseAuthentication.ensureAnonymousIdentity()
        : authentication.status === 'authenticated' ? authentication.identity : undefined
      const result = await firebaseSessionCreation.createSession({ displayName, targetScore })
      setCreatedSession(result)
      setCurrentSession({ sessionId: result.sessionId, hostUid: identity?.uid ?? '', status: result.status, playerCount: 1, totalScore: 0, scoreEntries: [] })
    } catch (error) {
      setCreateError(error instanceof CreateSessionError && error.code === 'invalid-input'
        ? 'Check the player name and target score.'
        : 'Session creation is unavailable. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function refreshCurrentSession() {
    if (!currentSession) return
    setStartError(undefined)
    try {
      if (authentication.status !== 'authenticated') throw new Error('Authentication unavailable')
      setCurrentSession(await firebaseSessionCreation.getSession(currentSession.sessionId, authentication.identity.uid))
    } catch {
      setStartError('Session state is unavailable. Please try again.')
    }
  }

  async function startSession() {
    if (!currentSession || starting) return
    setStarting(true)
    setStartError(undefined)
    try {
      const result = await firebaseSessionCreation.startSession({ sessionId: currentSession.sessionId })
      setCurrentSession({ ...currentSession, status: result.status, playerCount: result.playerCount })
    } catch (error) {
      const messages: Record<StartSessionError['code'], string> = {
        'authentication-required': 'Authentication is unavailable. Please try again.',
        'invalid-input': 'Session is unavailable.',
        'session-not-found': 'Session not found.',
        'not-enough-players': 'At least two players are required to start.',
        'not-host': 'Only the host can start this session.',
        'session-not-startable': 'This session cannot be started.',
        unavailable: 'Starting the session is unavailable. Please try again.',
      }
      setStartError(error instanceof StartSessionError ? messages[error.code] : messages.unavailable)
    } finally {
      setStarting(false)
    }
  }

  async function finalizeGame() {
    if (!currentSession || finalizing) return
    const commandId = pendingFinalizeCommandId.current ?? crypto.randomUUID()
    pendingFinalizeCommandId.current = commandId
    setFinalizing(true)
    setFinalizeError(undefined)
    try {
      const result = await firebaseSessionCreation.finalizeGame({ sessionId: currentSession.sessionId, commandId })
      setCurrentSession({ ...currentSession, status: result.status, winnerUid: result.winnerUid, winningTotalScore: result.winningTotalScore, winningScoreCommandId: result.winningScoreCommandId })
      pendingFinalizeCommandId.current = undefined
    } catch (error) {
      const messages: Record<FinalizeGameError['code'], string> = {
        'authentication-required': 'La autenticación no está disponible.', 'invalid-input': 'No se pudo finalizar la sesión.', 'session-not-found': 'No se encontró la sesión.', 'not-host': 'Solo el anfitrión puede finalizar el juego.', 'no-winner-detected': 'Aún no se detectó un ganador.', 'open-score-reports': 'Resuelve los reportes pendientes antes de finalizar la partida.', 'session-finalized': 'El juego ya está finalizado.', 'idempotency-conflict': 'Esta finalización entra en conflicto con una existente.', unavailable: 'No se pudo finalizar el juego. Inténtalo de nuevo.',
      }
      setFinalizeError(error instanceof FinalizeGameError ? messages[error.code] : messages.unavailable)
    } finally {
      setFinalizing(false)
    }
  }

  async function joinSession() {
    if (joining || authentication.status === 'error') return
    setJoining(true)
    setJoinError(undefined)
    setJoinedSession(undefined)
    try {
      const identity = authentication.status === 'signedOut'
        ? await firebaseAuthentication.ensureAnonymousIdentity()
        : authentication.status === 'authenticated' ? authentication.identity : undefined
      const result = await firebaseSessionCreation.joinSession({ code: joinCode, displayName: joinDisplayName })
      setJoinedSession(result)
      setCurrentSession({ sessionId: result.sessionId, hostUid: '', status: result.status, playerCount: result.playerCount, totalScore: 0, scoreEntries: [] })
      if (identity) setCurrentSession(await firebaseSessionCreation.getSession(result.sessionId, identity.uid))
    } catch (error) {
      const messages: Record<JoinSessionError['code'], string> = {
        'authentication-required': 'Authentication is unavailable. Please try again.',
        'invalid-code': 'Enter a valid six-character session code.',
        'session-not-found': 'Session not found.',
        'session-full': 'This session is full.',
        'display-name-taken': 'That player name is already in use for this session.',
        'session-not-joinable': 'This session is no longer available to join.',
        unavailable: 'Joining the session is unavailable. Please try again.',
      }
      setJoinError(error instanceof JoinSessionError ? messages[error.code] : messages.unavailable)
    } finally {
      setJoining(false)
    }
  }

  async function recordScore() {
    if (!currentSession || recording || authentication.status !== 'authenticated') return
    const numericPoints = Number(points)
    if (!Number.isInteger(numericPoints) || numericPoints <= 0 || numericPoints % 5 !== 0) {
      setRecordError('Enter a positive score in multiples of 5.')
      return
    }
    const commandId = pendingCommandId.current ?? crypto.randomUUID()
    pendingCommandId.current = commandId
    setRecording(true)
    setRecordError(undefined)
    try {
      const result = await firebaseSessionCreation.recordScore({ sessionId: currentSession.sessionId, points: numericPoints, commandId })
      setCurrentSession({ ...currentSession, totalScore: result.totalScore, winnerUid: result.winnerUid, winningTotalScore: result.winningTotalScore, winningScoreCommandId: result.winningScoreCommandId })
      setPoints('')
      pendingCommandId.current = undefined
    } catch (error) {
      const messages: Record<RecordScoreError['code'], string> = {
        'authentication-required': 'Authentication is unavailable. Please try again.',
        'invalid-input': 'Enter a positive score in multiples of 5.',
        'session-not-active': 'This session is not active.',
        'not-session-member': 'You are not a member of this session.',
        'idempotency-conflict': 'That score submission conflicts with an existing entry.',
        unavailable: 'Score recording is unavailable. Please try again.',
      }
      setRecordError(error instanceof RecordScoreError ? messages[error.code] : messages.unavailable)
    } finally {
      setRecording(false)
    }
  }

  async function reportScore() {
    if (!currentSession || !reportingEntry || reporting || authentication.status !== 'authenticated') return
    const reason = reportReason.trim()
    const proposed = proposedPoints === '' ? undefined : Number(proposedPoints)
    if (!reason || Array.from(reason).length > 280 || (proposed !== undefined && (!Number.isInteger(proposed) || proposed < 0 || proposed % 5 !== 0))) {
      setReportError('Indica un motivo y, si propones una puntuación, usa cero o múltiplos de 5.')
      return
    }
    const payload = { scoreOwnerUid: reportingEntry.ownerUid, scoreEntryId: reportingEntry.entryId, reason, ...(proposed === undefined ? {} : { proposedPoints: proposed }) }
    const command = commandForReportAttempt(pendingReportCommand.current, payload, () => crypto.randomUUID())
    pendingReportCommand.current = command
    setReporting(true)
    setReportError(undefined)
    try {
      await firebaseSessionCreation.reportScore({ sessionId: currentSession.sessionId, ...payload, commandId: command.commandId })
      setReportingEntry(undefined)
      setReportReason('')
      setProposedPoints('')
      pendingReportCommand.current = undefined
      await refreshCurrentSession()
    } catch (error) {
      const messages: Record<ReportScoreError['code'], string> = {
        'authentication-required': 'La autenticación no está disponible.', 'invalid-input': 'Revisa el reporte.', 'not-session-member': 'No perteneces a esta sesión.', 'score-not-found': 'La puntuación ya no está disponible.', 'cannot-report-own-score': 'No puedes reportar tu propia puntuación.', 'open-report-exists': 'Esta puntuación ya tiene un reporte pendiente.', 'session-finalized': 'No se pueden abrir reportes en una partida finalizada.', 'idempotency-conflict': 'Este reporte entra en conflicto con uno existente.', unavailable: 'No se pudo enviar el reporte. Inténtalo de nuevo.',
      }
      setReportError(error instanceof ReportScoreError ? messages[error.code] : messages.unavailable)
    } finally {
      setReporting(false)
    }
  }

  async function resolveScoreReport(outcome: 'accepted' | 'rejected') {
    if (!currentSession || !resolvingEntry || !resolvingReportId || resolving || authentication.status !== 'authenticated') return
    const score = outcome === 'accepted' ? Number(correctedScore) : undefined; const reason = resolutionReason.trim() || undefined
    if ((outcome === 'accepted' && (!Number.isInteger(score) || score! < 0 || score! % 5 !== 0)) || (reason && Array.from(reason).length > 280)) { setResolutionError('Para aceptar, indica cero o un múltiplo de 5.'); return }
    const payload = { reportId: resolvingReportId, outcome, ...(score === undefined ? {} : { correctedScore: score }), ...(reason === undefined ? {} : { reason }) } as const
    const command = commandForResolveAttempt(pendingResolveCommand.current, payload, () => crypto.randomUUID()); pendingResolveCommand.current = command; setResolving(true); setResolutionError(undefined)
    try { await firebaseSessionCreation.resolveScoreReport({ sessionId: currentSession.sessionId, ...payload, commandId: command.commandId }); setResolvingEntry(undefined); setResolvingReportId(undefined); setCorrectedScore(''); setResolutionReason(''); pendingResolveCommand.current = undefined; await refreshCurrentSession() } catch (error) { setResolutionError(error instanceof ResolveScoreReportError && error.code === 'not-score-owner' ? 'Solo quien anotó la puntuación puede resolver el reporte.' : error instanceof ResolveScoreReportError && error.code === 'session-finalized' ? 'La sesión finalizada debe reabrirse por el anfitrión antes de corregir puntuaciones.' : 'No se pudo resolver el reporte. Inténtalo de nuevo.') } finally { setResolving(false) }
  }

  return (
    <main className="app">
      <h1>Cinque</h1>
      <p>Fundación inicial del proyecto lista.</p>
      <p>Autenticación: {authentication.status}</p>
      {authentication.status === 'signedOut' && (
        <button type="button" onClick={() => void firebaseAuthentication.continueWithGoogle()}>
          Continue with Google
        </button>
      )}
      {authentication.status === 'authenticated' && authentication.identity.kind === 'anonymous' && (
        <button type="button" onClick={() => void firebaseAuthentication.continueWithGoogle()}>
          Link Google account
        </button>
      )}
      {googleOutcome.status === 'credential-already-in-use' && (
        <p>This Google account is already linked elsewhere. You can continue anonymously.</p>
      )}
      {googleOutcome.status === 'cancelled' && <p>Google authentication was cancelled.</p>}
      {googleOutcome.status === 'failed' && <p>Google authentication could not be completed.</p>}
      {authentication.status === 'error' && (
        <>
          <p>
            {authentication.code === 'identity-invariant-violation'
              ? 'Authentication could not be safely completed.'
              : 'No se pudo inicializar la autenticación local.'}
          </p>
          <button type="button" onClick={() => firebaseAuthentication.retry()}>
            Reintentar autenticación
          </button>
        </>
      )}
      <section aria-label="Create session">
        <h2>Create session</h2>
        <label>
          Player name
          <input value={displayName} maxLength={24} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <fieldset>
          <legend>Target score</legend>
          {[200, 300, 500].map((target) => (
            <button type="button" key={target} onClick={() => setTargetScore(target)}>{target}</button>
          ))}
          <label>
            Custom target
            <input type="number" min="200" max="1000" step="5" value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} />
          </label>
        </fieldset>
        <button type="button" disabled={creating || authentication.status === 'initializing' || authentication.status === 'error'} onClick={() => void createSession()}>
          {creating ? 'Creating session…' : 'Create session'}
        </button>
        {createError && <p role="alert">{createError}</p>}
        {createdSession && <p>Session created: code {createdSession.code}, ID {createdSession.sessionId}, target {createdSession.targetScore}.</p>}
        {currentSession && (
          <div>
            <p>Current session: {currentSession.status}, players {currentSession.playerCount}.</p>
            <button type="button" onClick={() => void refreshCurrentSession()}>Refresh session</button>
            {authentication.status === 'authenticated' && currentSession.hostUid === authentication.identity.uid && currentSession.status === 'lobby' && (
              <button type="button" disabled={starting || currentSession.playerCount < 2} onClick={() => void startSession()}>
                {starting ? 'Starting session…' : 'Start session'}
              </button>
            )}
            {startError && <p role="alert">{startError}</p>}
            {currentSession.status === 'active' && (
              <div>
                <p>Your total: {currentSession.totalScore}</p>
                <label>
                  Score
                  <input type="number" min="5" step="5" value={points} onChange={(event) => setPoints(event.target.value)} />
                </label>
                <button type="button" disabled={recording} onClick={() => void recordScore()}>
                  {recording ? 'Recording score…' : 'Record score'}
                </button>
                {recordError && <p role="alert">{recordError}</p>}
              </div>
            )}
            {authentication.status === 'authenticated' && currentSession.hostUid === authentication.identity.uid && currentSession.status === 'active' && currentSession.winnerUid && (
              <div>
                <button type="button" disabled={finalizing} onClick={() => void finalizeGame()}>{finalizing ? 'Finalizando juego…' : 'Finalizar juego'}</button>
                {finalizeError && <p role="alert">{finalizeError}</p>}
              </div>
            )}
            {authentication.status === 'authenticated' && (currentSession.scoreEntries?.length ?? 0) > 0 && (
              <section aria-label="Puntuaciones recientes">
                <h3>Puntuaciones recientes</h3>
                <ul>
                  {(currentSession.scoreEntries ?? []).map((entry) => (
                    <li key={`${entry.ownerUid}-${entry.entryId}`}>
                      {entry.ownerDisplayName}: {entry.effectivePoints ?? entry.points}{entry.isCorrected && <span> (original: {entry.originalPoints})</span>}
                      {(entry.reports ?? []).map((report) => report.status === 'open'
                        ? <span key={report.reportId}> — Reportado: pendiente {entry.ownerUid === authentication.identity.uid && <button type="button" onClick={() => { setResolvingEntry(entry); setResolvingReportId(report.reportId); pendingResolveCommand.current = undefined; setResolutionError(undefined) }}>Resolver</button>}</span>
                        : <span key={report.reportId}> — {report.outcome === 'accepted' ? 'Corregido' : 'Reporte rechazado'}</span>)}
                      {!(entry.reports ?? []).some((report) => report.status === 'open') && entry.ownerUid !== authentication.identity.uid && <button type="button" onClick={() => { setReportingEntry(entry); pendingReportCommand.current = undefined; setReportError(undefined) }}>Reportar puntuación</button>}
                    </li>
                  ))}
                </ul>
                {reportingEntry && (
                  <form onSubmit={(event) => { event.preventDefault(); void reportScore() }}>
                    <p>Reportar puntuación de {reportingEntry.ownerDisplayName}: {reportingEntry.points}</p>
                    <label>Motivo<input aria-label="Motivo del reporte" value={reportReason} maxLength={280} onChange={(event) => setReportReason(event.target.value)} /></label>
                    <label>Puntuación propuesta (opcional)<input aria-label="Puntuación propuesta" type="number" min="0" step="5" value={proposedPoints} onChange={(event) => setProposedPoints(event.target.value)} /></label>
                    <button type="submit" disabled={reporting}>{reporting ? 'Enviando reporte…' : 'Enviar reporte'}</button>
                    <button type="button" disabled={reporting} onClick={() => { setReportingEntry(undefined); pendingReportCommand.current = undefined }}>Cancelar</button>
                    {reportError && <p role="alert">{reportError}</p>}
                  </form>
                )}
                {resolvingEntry && (
                  <form onSubmit={(event) => { event.preventDefault(); void resolveScoreReport('accepted') }}>
                    <p>Resolver reporte de {resolvingEntry.ownerDisplayName}</p>
                    <label>Puntuación corregida<input aria-label="Puntuación corregida" type="number" min="0" step="5" value={correctedScore} onChange={(event) => setCorrectedScore(event.target.value)} /></label>
                    <label>Motivo (opcional)<input aria-label="Motivo de resolución" maxLength={280} value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} /></label>
                    <button type="submit" disabled={resolving}>{resolving ? 'Resolviendo…' : 'Aceptar corrección'}</button>
                    <button type="button" disabled={resolving} onClick={() => void resolveScoreReport('rejected')}>Rechazar</button>
                    <button type="button" disabled={resolving} onClick={() => { setResolvingEntry(undefined); setResolvingReportId(undefined); pendingResolveCommand.current = undefined }}>Cancelar</button>
                    {resolutionError && <p role="alert">{resolutionError}</p>}
                  </form>
                )}
              </section>
            )}
            {currentSession.winnerUid && authentication.status === 'authenticated' && (
              <div>
                <p role="status">
                  {currentSession.status === 'finished' ? 'Juego finalizado.' : 'Ganador detectado. La puntuación sigue activa.'} {currentSession.winnerUid === authentication.identity.uid ? 'Ganaste.' : 'Ganó otro jugador.'}
                </p>
                <p>Puntuación ganadora: {currentSession.winningTotalScore}.</p>
              </div>
            )}
          </div>
        )}
      </section>
      <section aria-label="Join session">
        <h2>Join session</h2>
        <label>
          Session code
          <input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
        </label>
        <label>
          Player name
          <input value={joinDisplayName} maxLength={24} onChange={(event) => setJoinDisplayName(event.target.value)} />
        </label>
        <button type="button" disabled={joining || authentication.status === 'initializing' || authentication.status === 'error'} onClick={() => void joinSession()}>
          {joining ? 'Joining session…' : 'Join session'}
        </button>
        {joinError && <p role="alert">{joinError}</p>}
        {joinedSession && <p>Joined session: code {joinedSession.code}, target {joinedSession.targetScore}, players {joinedSession.playerCount}.</p>}
      </section>
    </main>
  )
}

export default App
