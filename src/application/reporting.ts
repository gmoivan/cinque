export interface ReportCommandPayload {
  readonly scoreOwnerUid: string
  readonly scoreEntryId: string
  readonly reason: string
  readonly proposedPoints?: number
}

export interface PendingReportCommand {
  readonly payload: ReportCommandPayload
  readonly commandId: string
}

export function commandForReportAttempt(
  pending: PendingReportCommand | undefined,
  payload: ReportCommandPayload,
  createCommandId: () => string,
): PendingReportCommand {
  return pending?.payload.scoreOwnerUid === payload.scoreOwnerUid &&
    pending.payload.scoreEntryId === payload.scoreEntryId &&
    pending.payload.reason === payload.reason &&
    pending.payload.proposedPoints === payload.proposedPoints
    ? pending
    : { payload, commandId: createCommandId() }
}

export interface ResolveCommandPayload { readonly reportId: string; readonly outcome: 'accepted' | 'rejected'; readonly correctedScore?: number; readonly reason?: string }
export interface PendingResolveCommand { readonly payload: ResolveCommandPayload; readonly commandId: string }
export function commandForResolveAttempt(pending: PendingResolveCommand | undefined, payload: ResolveCommandPayload, createCommandId: () => string): PendingResolveCommand {
  return pending?.payload.reportId === payload.reportId && pending.payload.outcome === payload.outcome && pending.payload.correctedScore === payload.correctedScore && pending.payload.reason === payload.reason ? pending : { payload, commandId: createCommandId() }
}
