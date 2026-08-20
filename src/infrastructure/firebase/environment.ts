export type FirebaseEnvironmentName = 'local' | 'staging' | 'production'

export interface FirebaseEnvironmentVariables {
  readonly VITE_FIREBASE_ENVIRONMENT?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string
  readonly VITE_USE_FIREBASE_EMULATORS?: string
}

export interface FirebaseEnvironment {
  readonly name: FirebaseEnvironmentName
  readonly useEmulators: boolean
  readonly appCheckSiteKey?: string
  readonly config: {
    readonly apiKey: string
    readonly authDomain: string
    readonly projectId: string
    readonly storageBucket: string
    readonly messagingSenderId: string
    readonly appId: string
  }
}

const localProjectId = 'demo-cinque'
const stagingProjectId = 'cinque-staging-gmoiv'

function required(value: string | undefined, variableName: string) {
  if (!value?.trim()) throw new Error(`Missing required Firebase environment variable: ${variableName}.`)
  return value.trim()
}

function resolveEnvironmentName(value: string | undefined, isProductionBuild: boolean): FirebaseEnvironmentName {
  if (!value && !isProductionBuild) return 'local'
  if (value === 'local' || value === 'staging' || value === 'production') return value
  throw new Error('VITE_FIREBASE_ENVIRONMENT must be local, staging, or production.')
}

export function resolveFirebaseEnvironment(
  variables: FirebaseEnvironmentVariables,
  isProductionBuild: boolean,
): FirebaseEnvironment {
  const name = resolveEnvironmentName(variables.VITE_FIREBASE_ENVIRONMENT, isProductionBuild)
  const useEmulators = name === 'local'
    ? variables.VITE_USE_FIREBASE_EMULATORS !== 'false'
    : variables.VITE_USE_FIREBASE_EMULATORS === 'true'

  if (name === 'local') {
    if (isProductionBuild) throw new Error('Production builds cannot target the local Firebase environment.')
    if (!useEmulators) throw new Error('The local Firebase environment requires emulators.')
    const projectId = variables.VITE_FIREBASE_PROJECT_ID?.trim() || localProjectId
    if (projectId !== localProjectId) throw new Error('Local Firebase must use the demo-cinque project ID.')
    return {
      name,
      useEmulators,
      config: {
        apiKey: variables.VITE_FIREBASE_API_KEY?.trim() || 'demo-api-key',
        authDomain: variables.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${localProjectId}.firebaseapp.com`,
        projectId,
        storageBucket: variables.VITE_FIREBASE_STORAGE_BUCKET?.trim() || `${localProjectId}.appspot.com`,
        messagingSenderId: variables.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || 'demo-sender-id',
        appId: variables.VITE_FIREBASE_APP_ID?.trim() || 'demo-app-id',
      },
    }
  }

  if (!isProductionBuild) throw new Error(`${name} Firebase configuration is allowed only in production builds.`)
  if (useEmulators) throw new Error(`${name} Firebase builds cannot enable emulators.`)

  const projectId = required(variables.VITE_FIREBASE_PROJECT_ID, 'VITE_FIREBASE_PROJECT_ID')
  if (projectId === localProjectId) throw new Error('Cloud builds cannot use the demo-cinque project ID.')
  if (name === 'staging' && projectId !== stagingProjectId) {
    throw new Error(`Staging builds must use ${stagingProjectId}.`)
  }
  if (name === 'production' && projectId === stagingProjectId) {
    throw new Error('Production builds cannot use the staging Firebase project.')
  }

  return {
    name,
    useEmulators,
    appCheckSiteKey: required(variables.VITE_FIREBASE_APP_CHECK_SITE_KEY, 'VITE_FIREBASE_APP_CHECK_SITE_KEY'),
    config: {
      apiKey: required(variables.VITE_FIREBASE_API_KEY, 'VITE_FIREBASE_API_KEY'),
      authDomain: required(variables.VITE_FIREBASE_AUTH_DOMAIN, 'VITE_FIREBASE_AUTH_DOMAIN'),
      projectId,
      storageBucket: required(variables.VITE_FIREBASE_STORAGE_BUCKET, 'VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: required(
        variables.VITE_FIREBASE_MESSAGING_SENDER_ID,
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
      ),
      appId: required(variables.VITE_FIREBASE_APP_ID, 'VITE_FIREBASE_APP_ID'),
    },
  }
}
