import { useEffect, useMemo, useRef, useState } from 'react'

import { createJoinLink, joinCodeFromUrl } from '../application/joinLinks'
import { commandForReportAttempt, commandForResolveAttempt, type PendingReportCommand, type PendingResolveCommand } from '../application/reporting'
import {
  CreateSessionError, FinalizeGameError, JoinSessionError, RecordScoreError, ReopenGameError,
  ReportScoreError, ResolveScoreReportError, StartSessionError,
  type CurrentSession, type RecentSession, type ScoreEntry,
} from '../application/sessions'
import { firebaseAuthentication } from '../infrastructure/firebase/authentication'
import { firebaseSessionCreation } from '../infrastructure/firebase/sessions'
import { translate } from './i18n'
import { applyTheme, loadLocale, loadTheme, saveLocale, saveTheme, type Locale, type Theme } from './preferences'
import { useAuthentication } from './useAuthentication'

function App() {
  const authentication = useAuthentication(firebaseAuthentication)
  const googleOutcome = firebaseAuthentication.getGoogleAuthenticationOutcome()
  const authenticatedUid = authentication.status === 'authenticated' ? authentication.identity.uid : undefined
  const identityKind = authentication.status === 'authenticated' ? authentication.identity.kind : undefined
  const [locale, setLocale] = useState<Locale>(() => loadLocale())
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const [displayName, setDisplayName] = useState('')
  const [targetScore, setTargetScore] = useState(200)
  const [joinCode, setJoinCode] = useState(() => joinCodeFromUrl(globalThis.location?.href ?? '') ?? '')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [currentSession, setCurrentSession] = useState<CurrentSession>()
  const [recentSessions, setRecentSessions] = useState<readonly RecentSession[]>([])
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  const [syncError, setSyncError] = useState(false)
  const [points, setPoints] = useState('')
  const [shareFallback, setShareFallback] = useState<string>()
  const [reopenReason, setReopenReason] = useState('')
  const [reportingEntry, setReportingEntry] = useState<ScoreEntry>()
  const [reportReason, setReportReason] = useState('')
  const [proposedPoints, setProposedPoints] = useState('')
  const [resolvingEntry, setResolvingEntry] = useState<ScoreEntry>()
  const [resolvingReportId, setResolvingReportId] = useState<string>()
  const [correctedScore, setCorrectedScore] = useState('')
  const [resolutionReason, setResolutionReason] = useState('')
  const pendingScoreCommand = useRef<string | undefined>(undefined)
  const pendingFinalizeCommand = useRef<string | undefined>(undefined)
  const pendingReopenCommand = useRef<string | undefined>(undefined)
  const pendingReportCommand = useRef<PendingReportCommand | undefined>(undefined)
  const pendingResolveCommand = useRef<PendingResolveCommand | undefined>(undefined)

  useEffect(() => { applyTheme(theme); saveTheme(theme) }, [theme])
  useEffect(() => { saveLocale(locale) }, [locale])

  useEffect(() => {
    if (!activeSessionId || !authenticatedUid) return
    setSyncError(false)
    return firebaseSessionCreation.subscribeToSession(
      activeSessionId,
      authenticatedUid,
      (session) => { setCurrentSession(session); setSyncError(false) },
      () => setSyncError(true),
    )
  }, [activeSessionId, authenticatedUid])

  useEffect(() => {
    if (!authenticatedUid || identityKind !== 'permanent') {
      setRecentSessions([])
      return
    }
    let cancelled = false
    void firebaseSessionCreation.listRecentSessions(authenticatedUid).then(async (sessions) => {
      await Promise.allSettled(sessions.map((session) => firebaseSessionCreation.preserveSession(session.sessionId)))
      if (!cancelled) setRecentSessions(sessions)
    }).catch(() => { if (!cancelled) setRecentSessions([]) })
    return () => { cancelled = true }
  }, [authenticatedUid, identityKind])

  const isHost = authentication.status === 'authenticated' && currentSession?.hostUid === authentication.identity.uid
  const currentUid = authenticatedUid
  const winner = currentSession?.players.find((player) => player.uid === currentSession.winnerUid)
  const statusLabel = currentSession ? t(currentSession.status === 'lobby' ? 'lobby' : currentSession.status === 'finished' ? 'finished' : 'active') : ''
  const ownEntries = useMemo(() => currentSession?.scoreEntries.filter((entry) => entry.ownerUid === currentUid) ?? [], [currentSession, currentUid])

  function resetError() { setError(undefined) }

  async function createSession() {
    if (busy) return
    setBusy('create'); resetError()
    try {
      if (authentication.status === 'signedOut') await firebaseAuthentication.ensureAnonymousIdentity()
      const session = await firebaseSessionCreation.createSession({ displayName, targetScore })
      setActiveSessionId(session.sessionId)
    } catch (cause) {
      setError(t(cause instanceof CreateSessionError && cause.code === 'invalid-input' ? 'invalidCreate' : 'createError'))
    } finally { setBusy(undefined) }
  }

  async function joinSession() {
    if (busy) return
    setBusy('join'); resetError()
    try {
      if (authentication.status === 'signedOut') await firebaseAuthentication.ensureAnonymousIdentity()
      const session = await firebaseSessionCreation.joinSession({ code: joinCode, displayName: joinDisplayName })
      setActiveSessionId(session.sessionId)
    } catch (cause) {
      const messages: Partial<Record<JoinSessionError['code'], string>> = {
        'invalid-code': t('invalidCode'), 'session-not-found': t('sessionNotFound'),
        'session-full': t('sessionFull'), 'display-name-taken': t('nameTaken'), 'session-not-joinable': t('sessionStarted'),
      }
      setError(cause instanceof JoinSessionError ? messages[cause.code] ?? t('joinError') : t('joinError'))
    } finally { setBusy(undefined) }
  }

  async function startSession() {
    if (!currentSession || busy) return
    setBusy('start'); resetError()
    try { await firebaseSessionCreation.startSession({ sessionId: currentSession.sessionId }) }
    catch (cause) { setError(t(cause instanceof StartSessionError && cause.code === 'not-enough-players' ? 'needPlayers' : 'startError')) }
    finally { setBusy(undefined) }
  }

  async function recordScore() {
    if (!currentSession || busy) return
    const numericPoints = Number(points)
    if (!Number.isInteger(numericPoints) || numericPoints <= 0 || numericPoints % 5 !== 0) { setError(t('invalidPoints')); return }
    const commandId = pendingScoreCommand.current ?? crypto.randomUUID(); pendingScoreCommand.current = commandId
    setBusy('score'); resetError()
    try {
      await firebaseSessionCreation.recordScore({ sessionId: currentSession.sessionId, points: numericPoints, commandId })
      pendingScoreCommand.current = undefined; setPoints('')
    } catch (cause) {
      setError(t(cause instanceof RecordScoreError && cause.code === 'session-not-active' ? 'inactiveGame' : 'scoreError'))
    } finally { setBusy(undefined) }
  }

  async function finalizeGame() {
    if (!currentSession || busy) return
    const commandId = pendingFinalizeCommand.current ?? crypto.randomUUID(); pendingFinalizeCommand.current = commandId
    setBusy('finalize'); resetError()
    try { await firebaseSessionCreation.finalizeGame({ sessionId: currentSession.sessionId, commandId }); pendingFinalizeCommand.current = undefined }
    catch (cause) { setError(t(cause instanceof FinalizeGameError && cause.code === 'open-score-reports' ? 'openReports' : 'finalizeError')) }
    finally { setBusy(undefined) }
  }

  async function reopenGame() {
    if (!currentSession || busy) return
    const reason = reopenReason.trim()
    if (!reason) { setError(t('reopenRequired')); return }
    const commandId = pendingReopenCommand.current ?? crypto.randomUUID(); pendingReopenCommand.current = commandId
    setBusy('reopen'); resetError()
    try {
      await firebaseSessionCreation.reopenGame({ sessionId: currentSession.sessionId, reason, commandId })
      pendingReopenCommand.current = undefined; setReopenReason('')
    } catch (cause) { setError(t(cause instanceof ReopenGameError && cause.code === 'not-host' ? 'hostOnlyReopen' : 'reopenError')) }
    finally { setBusy(undefined) }
  }

  async function reportScore() {
    if (!currentSession || !reportingEntry || busy) return
    const reason = reportReason.trim(); const proposed = proposedPoints === '' ? undefined : Number(proposedPoints)
    if (!reason || (proposed !== undefined && (!Number.isInteger(proposed) || proposed < 0 || proposed % 5 !== 0))) { setError(t('invalidReport')); return }
    const payload = { scoreOwnerUid: reportingEntry.ownerUid, scoreEntryId: reportingEntry.entryId, reason, ...(proposed === undefined ? {} : { proposedPoints: proposed }) }
    const command = commandForReportAttempt(pendingReportCommand.current, payload, () => crypto.randomUUID()); pendingReportCommand.current = command
    setBusy('report'); resetError()
    try {
      await firebaseSessionCreation.reportScore({ sessionId: currentSession.sessionId, ...payload, commandId: command.commandId })
      pendingReportCommand.current = undefined; setReportingEntry(undefined); setReportReason(''); setProposedPoints('')
    } catch (cause) { setError(t(cause instanceof ReportScoreError && cause.code === 'open-report-exists' ? 'reportExists' : 'reportError')) }
    finally { setBusy(undefined) }
  }

  async function resolveReport(outcome: 'accepted' | 'rejected') {
    if (!currentSession || !resolvingEntry || !resolvingReportId || busy) return
    const score = outcome === 'accepted' ? Number(correctedScore) : undefined; const reason = resolutionReason.trim() || undefined
    if (outcome === 'accepted' && (!Number.isInteger(score) || score! < 0 || score! % 5 !== 0)) { setError(t('invalidCorrection')); return }
    const payload = { reportId: resolvingReportId, outcome, ...(score === undefined ? {} : { correctedScore: score }), ...(reason ? { reason } : {}) } as const
    const command = commandForResolveAttempt(pendingResolveCommand.current, payload, () => crypto.randomUUID()); pendingResolveCommand.current = command
    setBusy('resolve'); resetError()
    try {
      await firebaseSessionCreation.resolveScoreReport({ sessionId: currentSession.sessionId, ...payload, commandId: command.commandId })
      pendingResolveCommand.current = undefined; setResolvingEntry(undefined); setResolvingReportId(undefined); setCorrectedScore(''); setResolutionReason('')
    } catch (cause) { setError(t(cause instanceof ResolveScoreReportError && cause.code === 'not-score-owner' ? 'ownerOnlyResolve' : 'resolveError')) }
    finally { setBusy(undefined) }
  }

  async function shareSession() {
    if (!currentSession) return
    const link = createJoinLink(globalThis.location.href, currentSession.code)
    try {
      if (navigator.share) await navigator.share({ title: 'Cinque', text: `${t('joinSession')}: ${currentSession.code}`, url: link })
      else if (navigator.clipboard) await navigator.clipboard.writeText(link)
      else setShareFallback(link)
    } catch { setShareFallback(link) }
  }

  function leaveCurrentView() { setActiveSessionId(undefined); setCurrentSession(undefined); setSyncError(false); resetError() }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={leaveCurrentView}>Cinque</button>
        <div className="preferences">
          <label><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="es">ES</option><option value="en">EN</option></select></label>
          <label><span className="sr-only">{t('theme')}</span><select aria-label={t('theme')} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="dark">{t('dark')}</option><option value="light">{t('light')}</option></select></label>
        </div>
      </header>

      {authentication.status === 'error' && <section className="panel"><p role="alert">{t('authError')}</p><button onClick={() => firebaseAuthentication.retry()}>{t('retry')}</button></section>}
      {authentication.status !== 'error' && !activeSessionId && (
        <div className="home-grid">
          <section className="panel" aria-label={t('createSession')}>
            <h1>{t('createSession')}</h1>
            <label>{t('playerName')}<input value={displayName} maxLength={24} autoComplete="nickname" onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label>{t('targetScore')}<input type="number" min="200" max="1000" step="5" value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} /></label>
            <button className="primary" disabled={!!busy} onClick={() => void createSession()}>{busy === 'create' ? t('loading') : t('createSession')}</button>
          </section>
          <section className="panel" aria-label={t('joinSession')}>
            <h2>{t('joinSession')}</h2>
            <label>{t('sessionCode')}<input className="code-input" value={joinCode} maxLength={6} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label>
            <label>{t('playerName')}<input value={joinDisplayName} maxLength={24} autoComplete="nickname" onChange={(event) => setJoinDisplayName(event.target.value)} /></label>
            <button className="primary" disabled={!!busy} onClick={() => void joinSession()}>{busy === 'join' ? t('loading') : t('joinSession')}</button>
          </section>
          {authentication.status === 'authenticated' && authentication.identity.kind === 'permanent' && <section className="panel recent-panel" aria-label={t('recentSessions')}><h2>{t('recentSessions')}</h2>{recentSessions.length === 0 ? <p>{t('noRecentSessions')}</p> : <ul className="recent-list">{recentSessions.map((session) => <li key={session.sessionId}><button onClick={() => { setDisplayName(session.displayName); setActiveSessionId(session.sessionId) }}><strong>{session.code}</strong><span>{session.displayName} · {session.status}</span></button></li>)}</ul>}</section>}
          <section className="auth-card">{authentication.status === 'signedOut' ? <button onClick={() => void firebaseAuthentication.continueWithGoogle()}>{t('signInGoogle')}</button> : authentication.status === 'authenticated' && authentication.identity.kind === 'anonymous' ? <button onClick={() => void firebaseAuthentication.continueWithGoogle()}>{t('linkGoogle')}</button> : null}{googleOutcome.status === 'failed' && googleOutcome.code === 'auth/credential-already-in-use' && <p role="status">{t('linkedAccount')}</p>}{googleOutcome.status === 'failed' && googleOutcome.code !== 'auth/credential-already-in-use' && <p role="status">{t('authFailed')}{googleOutcome.code ? ` (${googleOutcome.code})` : ''}</p>}</section>
        </div>
      )}

      {activeSessionId && !currentSession && <section className="panel loading-panel"><p>{syncError ? t('syncError') : t('loading')}</p>{syncError && <button onClick={() => { setActiveSessionId(undefined); queueMicrotask(() => setActiveSessionId(activeSessionId)) }}>{t('retry')}</button>}</section>}
      {currentSession && <div className="game-layout">
        <section className="session-header panel"><div><p className="eyebrow">{statusLabel}</p><h1 className="session-code">{currentSession.code}</h1><p>{t('targetScore')}: {currentSession.targetScore}</p></div><div className="session-actions"><button onClick={() => void shareSession()}>{t('share')}</button><button aria-label={t('closeGame')} onClick={leaveCurrentView}>×</button></div>{shareFallback && <output className="share-link">{shareFallback}</output>}</section>
        {winner && <section className="winner-banner" role="status">🏆 {t('winner')}: <strong>{winner.displayName}</strong> · {currentSession.winningTotalScore}</section>}
        <section className="players-grid" aria-label={t('players')}>{currentSession.players.map((player) => <article className={`player-card${player.uid === currentSession.winnerUid ? ' winner' : ''}`} key={player.uid}><div><h2>{player.displayName}</h2><small>{player.uid === currentUid ? t('you') : player.uid === currentSession.hostUid ? t('host') : ''}</small></div><strong className="total">{player.totalScore}</strong><div className="recent-scores">{currentSession.scoreEntries.filter((entry) => entry.ownerUid === player.uid).slice(-4).map((entry) => <span key={entry.entryId}>+{entry.points}</span>)}</div></article>)}</section>
        <section className="controls panel">
          {currentSession.status === 'lobby' && isHost && <button className="primary" disabled={!!busy || currentSession.playerCount < 2} onClick={() => void startSession()}>{t('startGame')}</button>}
          {currentSession.status === 'lobby' && !isHost && <p>{t('waitingHost')} · {currentSession.playerCount}/4</p>}
          {currentSession.status === 'active' && <form className="score-form" onSubmit={(event) => { event.preventDefault(); void recordScore() }}><label>{t('score')}<input inputMode="numeric" type="number" min="5" step="5" value={points} onChange={(event) => { setPoints(event.target.value); pendingScoreCommand.current = undefined }} /></label><button className="primary" disabled={!!busy}>{busy === 'score' ? t('loading') : t('recordScore')}</button></form>}
          {currentSession.status === 'active' && isHost && currentSession.winnerUid && <button disabled={!!busy} onClick={() => void finalizeGame()}>{t('finishGame')}</button>}
          {currentSession.status === 'finished' && isHost && <form className="reopen-form" onSubmit={(event) => { event.preventDefault(); void reopenGame() }}><label>{t('reopenReason')}<input value={reopenReason} maxLength={280} onChange={(event) => { setReopenReason(event.target.value); pendingReopenCommand.current = undefined }} /></label><button disabled={!!busy}>{t('reopenGame')}</button></form>}
        </section>
        <section className="panel ledger" aria-label={t('history')}><h2>{t('history')}</h2>{currentSession.scoreEntries.length === 0 ? <p>—</p> : <ol>{[...currentSession.scoreEntries].reverse().map((entry) => { const openReport = entry.reports?.find((report) => report.status === 'open'); return <li key={`${entry.ownerUid}-${entry.entryId}`}><span><strong>{entry.ownerDisplayName}</strong> +{entry.effectivePoints ?? entry.points}{entry.isCorrected && <small> ({entry.originalPoints})</small>}</span><span>{openReport ? <>{t('pending')}{entry.ownerUid === currentUid && <button onClick={() => { setResolvingEntry(entry); setResolvingReportId(openReport.reportId) }}>{t('resolve')}</button>}</> : entry.ownerUid !== currentUid && currentSession.status === 'active' ? <button onClick={() => setReportingEntry(entry)}>{t('report')}</button> : null}</span></li> })}</ol>}</section>
        {reportingEntry && <section className="panel modal-card"><h2>{t('reports')}</h2><p>{reportingEntry.ownerDisplayName}: {reportingEntry.points}</p><label>{t('reportReason')}<input aria-label={t('reportReason')} maxLength={280} value={reportReason} onChange={(event) => setReportReason(event.target.value)} /></label><label>{t('proposedScore')}<input aria-label={t('proposedScore')} type="number" min="0" step="5" value={proposedPoints} onChange={(event) => setProposedPoints(event.target.value)} /></label><div><button className="primary" disabled={!!busy} onClick={() => void reportScore()}>{t('send')}</button><button onClick={() => setReportingEntry(undefined)}>{t('cancel')}</button></div></section>}
        {resolvingEntry && <section className="panel modal-card"><h2>{t('resolveReport')}</h2><label>{t('correctedScore')}<input aria-label={t('correctedScore')} type="number" min="0" step="5" value={correctedScore} onChange={(event) => setCorrectedScore(event.target.value)} /></label><label>{t('optionalReason')}<input aria-label={t('resolutionReason')} maxLength={280} value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} /></label><div><button className="primary" disabled={!!busy} onClick={() => void resolveReport('accepted')}>{t('accept')}</button><button disabled={!!busy} onClick={() => void resolveReport('rejected')}>{t('reject')}</button><button onClick={() => setResolvingEntry(undefined)}>{t('cancel')}</button></div></section>}
        {ownEntries.length > 0 && <p className="sr-only">{ownEntries.length}</p>}
      </div>}
      {(error || syncError) && <div className="toast" role="alert">{error ?? t('offline')}</div>}
    </main>
  )
}

export default App
