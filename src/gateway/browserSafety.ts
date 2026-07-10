const providerCredentialEnvPrefixes = [
  'OPENAI',
  'OPENROUTER',
  'ANTHROPIC',
  'GOOGLE',
  'GEMINI',
  'MISTRAL',
  'COHERE',
  'TOGETHER',
  'GROQ',
  'AZURE_OPENAI',
] as const

const browserUnsafeTextMarkers = [
  'secretRef',
  'secretValue',
  'workspaceRoot',
  'sessionPath',
  'mailboxPath',
  'sessionsRoot',
  'gatewayToken',
  'artifactPath',
  'databasePath',
  'dbPath',
  'filePath',
  'remoteRoot',
  'envFilePath',
  'caddyConfigPath',
] as const

const browserUnsafeLiteralMarkers = [
  `BEGIN PRIVATE ${'KEY'}`,
] as const

const browserUnsafeBrowserAccessQueryKeyList = [
  'access-token',
  'access_token',
  ['api', 'key'].join('-'),
  ['api', 'key'].join('_'),
  'auth',
  'authorization',
  'bearer',
  'gateway-token',
  'gateway_token',
  'gatewaytoken',
  'id-token',
  'id_token',
  'oauth-token',
  'oauth_token',
  'password',
  'refresh-token',
  'refresh_token',
  'secret',
  'session-token',
  'session_token',
  'sessiontoken',
  'token',
] as const

export function browserUnsafeProviderCredentialMarkers(): string[] {
  const apiKey = `API_${'KEY'}`
  return providerCredentialEnvPrefixes.map((prefix) => `${prefix}_${apiKey}`)
}

export function browserUnsafeBrowserAccessQueryKeys(): string[] {
  return [...browserUnsafeBrowserAccessQueryKeyList]
}

export function isBrowserUnsafeBrowserAccessQueryKey(value: string): boolean {
  return browserUnsafeBrowserAccessQueryKeyList.includes(
    value.trim().toLowerCase() as (typeof browserUnsafeBrowserAccessQueryKeyList)[number],
  )
}

export function browserUnsafeGatewayTextMarkers(): string[] {
  return [
    ...browserUnsafeTextMarkers,
    ...browserUnsafeProviderCredentialMarkers(),
    ...browserUnsafeLiteralMarkers,
  ]
}

export function browserUnsafeProviderCredentialMarkerPattern(): RegExp {
  return new RegExp(
    `\\b(?:${browserUnsafeProviderCredentialMarkers().map(escapeRegExp).join('|')})\\b`,
    'gi',
  )
}

export function redactBrowserUnsafeProviderCredentialMarkers(
  value: string,
  replacement = '[redacted]',
): string {
  return value.replace(browserUnsafeProviderCredentialMarkerPattern(), replacement)
}

export function redactBrowserUnsafeGatewayText(value: string, replacement = '[redacted]'): string {
  return redactBrowserUnsafeProviderCredentialMarkers(value, replacement)
    .replace(browserUnsafeLiteralMarkerPattern(), replacement)
    .replace(browserUnsafeMarkerAssignmentPattern(), replacement)
    .replace(/(^|[^a-zA-Z])([a-zA-Z]:[\\/][^\s'"`]+)/g, `$1${replacement}`)
    .replace(/\\\\[^\s'"`]+/g, replacement)
    .replace(/(^|[\s'"`=])\/(?!\/)[^\s'"`<>]+/g, `$1${replacement}`)
}

export function containsBrowserUnsafeGatewayText(value: string): boolean {
  return redactBrowserUnsafeGatewayText(value) !== value
}

function browserUnsafeMarkerAssignmentPattern(): RegExp {
  return new RegExp(
    `\\b(?:${browserUnsafeTextMarkers.map(escapeRegExp).join('|')})\\s*=\\s*\\S+`,
    'gi',
  )
}

function browserUnsafeLiteralMarkerPattern(): RegExp {
  return new RegExp(browserUnsafeLiteralMarkers.map(escapeRegExp).join('|'), 'gi')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
