import { useSyncExternalStore } from 'react'

import type { AuthenticationService } from '../application/authentication'

export function useAuthentication(authentication: AuthenticationService) {
  return useSyncExternalStore(
    (listener) => authentication.subscribe(listener),
    () => authentication.getSnapshot(),
    () => authentication.getSnapshot(),
  )
}
