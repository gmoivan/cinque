import type { Locale } from './preferences'

export const messages = {
  es: {
    createSession: 'Crear partida', joinSession: 'Unirse a partida', playerName: 'Nombre', sessionCode: 'Código de partida', targetScore: 'Meta',
    startGame: 'Iniciar partida', recordScore: 'Anotar puntos', score: 'Puntos', recentSessions: 'Partidas recientes', noRecentSessions: 'No hay partidas recientes.',
    players: 'Jugadores', history: 'Historial', reports: 'Reportes', winner: 'Ganador', finishGame: 'Finalizar partida', reopenGame: 'Reabrir partida',
    reopenReason: 'Motivo de reapertura', share: 'Compartir', copyLink: 'Copiar enlace', copied: 'Enlace copiado', language: 'Idioma', theme: 'Tema',
    dark: 'Oscuro', light: 'Claro', english: 'English', spanish: 'Español', lobby: 'Sala', active: 'En juego', finished: 'Finalizada',
    anonymous: 'Invitado', linkGoogle: 'Vincular Google', signInGoogle: 'Continuar con Google', loading: 'Cargando…', retry: 'Reintentar',
    closeGame: 'Cerrar partida', you: 'Tú', host: 'Anfitrión', waitingHost: 'Esperando al anfitrión', pending: 'Pendiente', resolve: 'Resolver',
    report: 'Reportar', reportReason: 'Motivo del reporte', proposedScore: 'Puntuación propuesta', send: 'Enviar', cancel: 'Cancelar',
    resolveReport: 'Resolver reporte', correctedScore: 'Puntuación corregida', optionalReason: 'Motivo opcional', resolutionReason: 'Motivo de resolución',
    accept: 'Aceptar', reject: 'Rechazar', authError: 'No se pudo iniciar la autenticación.', authFailed: 'No se pudo completar la autenticación con Google.', syncError: 'No se pudo sincronizar la partida.',
    offline: 'Sin conexión con la partida.', linkedAccount: 'Esa cuenta ya está vinculada.', invalidCreate: 'Revisa el nombre y la meta.',
    createError: 'No se pudo crear la partida.', invalidCode: 'Usa un código válido de seis caracteres.', sessionNotFound: 'No encontramos esa partida.',
    sessionFull: 'La partida está llena.', nameTaken: 'Ese nombre ya está en uso.', sessionStarted: 'La partida ya comenzó.', joinError: 'No se pudo unir a la partida.',
    needPlayers: 'Se necesitan al menos dos jugadores.', startError: 'No se pudo iniciar la partida.', invalidPoints: 'Anota un múltiplo positivo de 5.',
    inactiveGame: 'La partida no está activa.', scoreError: 'No se pudo registrar la puntuación.', openReports: 'Resuelve los reportes pendientes antes de finalizar.',
    finalizeError: 'No se pudo finalizar la partida.', reopenRequired: 'Indica por qué se reabre la partida.', hostOnlyReopen: 'Solo el anfitrión puede reabrir.',
    reopenError: 'No se pudo reabrir la partida.', invalidReport: 'Indica un motivo y una propuesta válida.', reportExists: 'Ya existe un reporte abierto.',
    reportError: 'No se pudo enviar el reporte.', invalidCorrection: 'Indica cero o un múltiplo de 5.', ownerOnlyResolve: 'Solo quien anotó puede resolver.',
    resolveError: 'No se pudo resolver el reporte.',
  },
  en: {
    createSession: 'Create game', joinSession: 'Join game', playerName: 'Name', sessionCode: 'Game code', targetScore: 'Target',
    startGame: 'Start game', recordScore: 'Record score', score: 'Score', recentSessions: 'Recent games', noRecentSessions: 'No recent games.',
    players: 'Players', history: 'History', reports: 'Reports', winner: 'Winner', finishGame: 'Finish game', reopenGame: 'Reopen game',
    reopenReason: 'Reopening reason', share: 'Share', copyLink: 'Copy link', copied: 'Link copied', language: 'Language', theme: 'Theme',
    dark: 'Dark', light: 'Light', english: 'English', spanish: 'Español', lobby: 'Lobby', active: 'Playing', finished: 'Finished',
    anonymous: 'Guest', linkGoogle: 'Link Google', signInGoogle: 'Continue with Google', loading: 'Loading…', retry: 'Retry',
    closeGame: 'Close game', you: 'You', host: 'Host', waitingHost: 'Waiting for the host', pending: 'Pending', resolve: 'Resolve',
    report: 'Report', reportReason: 'Report reason', proposedScore: 'Proposed score', send: 'Send', cancel: 'Cancel',
    resolveReport: 'Resolve report', correctedScore: 'Corrected score', optionalReason: 'Optional reason', resolutionReason: 'Resolution reason',
    accept: 'Accept', reject: 'Reject', authError: 'Authentication could not start.', authFailed: 'Google authentication could not be completed.', syncError: 'The game could not be synchronized.',
    offline: 'Connection to the game was lost.', linkedAccount: 'That account is already linked.', invalidCreate: 'Check the name and target.',
    createError: 'The game could not be created.', invalidCode: 'Use a valid six-character code.', sessionNotFound: 'That game was not found.',
    sessionFull: 'The game is full.', nameTaken: 'That name is already in use.', sessionStarted: 'The game has already started.', joinError: 'The game could not be joined.',
    needPlayers: 'At least two players are required.', startError: 'The game could not be started.', invalidPoints: 'Enter a positive multiple of 5.',
    inactiveGame: 'The game is not active.', scoreError: 'The score could not be recorded.', openReports: 'Resolve pending reports before finishing.',
    finalizeError: 'The game could not be finished.', reopenRequired: 'Explain why the game is being reopened.', hostOnlyReopen: 'Only the host can reopen the game.',
    reopenError: 'The game could not be reopened.', invalidReport: 'Enter a reason and a valid proposal.', reportExists: 'An open report already exists.',
    reportError: 'The report could not be sent.', invalidCorrection: 'Enter zero or a multiple of 5.', ownerOnlyResolve: 'Only the scorer can resolve this.',
    resolveError: 'The report could not be resolved.',
  },
} as const

export type MessageKey = keyof typeof messages.es

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key]
}
