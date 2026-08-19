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
