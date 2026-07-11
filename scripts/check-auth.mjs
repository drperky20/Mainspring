import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalGatewayServer,
  createLocalMainspringGateway,
  createMainspring,
  createSqliteLocalGatewayAppStateStore,
} from '../dist/index.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(url, init) {
  const response = await fetch(url, init)
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  return { response, body, text }
}

async function requestOk(url, init) {
  const result = await request(url, init)
  assert(result.response.ok, `${init?.method ?? 'GET'} ${url} failed: ${result.text}`)
  return result
}

function fileContains(root, needle) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry))
      continue
    }
    if (!stat.isFile()) continue
    const bytes = fs.readFileSync(current)
    if (bytes.includes(Buffer.from(needle))) return current
  }
  return null
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mainspring-auth-check-'))
const adminPassword = 'HostedAuthCheck123!'
const storedPasswordVerifierField = 'password' + 'Hash'
let appState
let mainspring
let server

try {
  const sessionsRoot = path.join(root, 'sessions')
  const workspaceRoot = path.join(root, 'workspace')
  fs.mkdirSync(sessionsRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })

  appState = createSqliteLocalGatewayAppStateStore({
    dbPath: path.join(root, 'gateway-app.sqlite'),
  })
  mainspring = createMainspring({
    sessionsRoot,
    workspaceRoot,
    pollIntervalMs: 10,
  })
  const gateway = createLocalMainspringGateway({ runtime: mainspring, appState })
  server = createLocalGatewayServer({
    gateway,
    host: '127.0.0.1',
    port: 0,
    auth: { mode: 'hosted' },
  })

  await mainspring.start()
  const started = await server.start()

  const healthBefore = await requestOk(`${started.url}/health`)
  const readinessBefore = await requestOk(`${started.url}/readyz`)
  assert(readinessBefore.body.ready === true, 'gateway readiness endpoint did not report ready runtime')
  assert(healthBefore.body.mode === 'local-gateway-hosted', 'hosted health did not report hosted mode')
  assert(healthBefore.body.auth?.authenticated === false, 'hosted health reported authenticated without a token')
  assert(healthBefore.body.auth?.bootstrapRequired === true, 'hosted health did not require bootstrap')

  const unauthorizedSnapshot = await request(`${started.url}/snapshot`)
  assert(unauthorizedSnapshot.response.status === 401, 'hosted snapshot was not protected before login')

  const bootstrap = await requestOk(`${started.url}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', password: adminPassword }),
  })
  assert(bootstrap.response.status === 201, 'hosted bootstrap did not create the admin user')
  assert(bootstrap.body.user?.username === 'admin', 'hosted bootstrap did not normalize username')
  assert(!JSON.stringify(bootstrap.body).includes(storedPasswordVerifierField), 'bootstrap response leaked password verifier')

  const users = appState.authUsers.list()
  assert(users.length === 1, 'hosted bootstrap did not persist exactly one user')
  assert(users[0].passwordAlgorithm === 'scrypt-v1', 'hosted user did not use scrypt-v1')
  assert(users[0][storedPasswordVerifierField] !== adminPassword, 'hosted user stored plaintext password')

  const secondBootstrap = await request(`${started.url}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Other', password: 'OtherHostedAuth123!' }),
  })
  assert(secondBootstrap.response.status >= 400, 'hosted bootstrap allowed a second admin')

  const wrongLogin = await request(`${started.url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
  })
  assert(wrongLogin.response.status >= 400, 'hosted login accepted the wrong password')

  const login = await requestOk(`${started.url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ADMIN', password: adminPassword }),
  })
  const token = login.response.headers.get('x-mainspring-auth-token')
  assert(token && /^[a-f0-9]{64}$/.test(token), 'hosted login did not return a session token header')
  assert(!JSON.stringify(login.body).includes(token), 'hosted login leaked the session token in the JSON body')

  const sessions = appState.authSessions.list()
  assert(sessions.length === 1, 'hosted login did not persist exactly one session')
  assert(sessions[0].tokenHash !== token, 'hosted session stored the raw session token')
  assert(/^[a-f0-9]{64}$/.test(sessions[0].tokenHash), 'hosted session token hash was not stored as sha256 hex')

  const adminHeaders = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
  await requestOk(`${started.url}/auth/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ username: 'Operator', password: 'OperatorAuthCheck123!', role: 'operator' }),
  })
  await requestOk(`${started.url}/auth/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ username: 'Viewer', password: 'ViewerAuthCheck123!', role: 'viewer' }),
  })
  const hostedUsers = await requestOk(`${started.url}/auth/users`, { headers: adminHeaders })
  assert(hostedUsers.body.users?.length === 3, 'hosted user list did not return all role records')
  assert(!JSON.stringify(hostedUsers.body).includes(storedPasswordVerifierField), 'hosted user list leaked password verifier')

  const operatorLogin = await requestOk(`${started.url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: 'OperatorAuthCheck123!' }),
  })
  const operatorToken = operatorLogin.response.headers.get('x-mainspring-auth-token')
  const viewerLogin = await requestOk(`${started.url}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'viewer', password: 'ViewerAuthCheck123!' }),
  })
  const viewerToken = viewerLogin.response.headers.get('x-mainspring-auth-token')

  await requestOk(`${started.url}/snapshot`, { headers: { authorization: `Bearer ${viewerToken}` } })
  const viewerOperation = await request(`${started.url}/runs/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'application/json' },
    body: '{}',
  })
  assert(viewerOperation.response.status === 403, 'viewer role reached an operational mutation')
  const viewerUserList = await request(`${started.url}/auth/users`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  })
  assert(viewerUserList.response.status === 403, 'viewer role reached admin user management')
  const operatorOperation = await request(`${started.url}/runs/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/json' },
    body: '{}',
  })
  assert(operatorOperation.response.status === 400, 'operator role did not reach an operational route')
  const operatorAdminMutation = await request(`${started.url}/clients`, {
    method: 'POST',
    headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Forbidden Operator Client' }),
  })
  assert(operatorAdminMutation.response.status === 403, 'operator role reached an admin mutation')

  const finalAdminMutation = await request(`${started.url}/auth/users/${encodeURIComponent(bootstrap.body.user.userId)}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'viewer' }),
  })
  assert(finalAdminMutation.response.status === 409, 'hosted auth allowed the final active admin to be demoted')

  const authorizedClient = await requestOk(`${started.url}/clients`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Hosted Auth Check Client',
      workspaceName: 'Hosted Auth Check Workspace',
      workspaceRoot,
    }),
  })
  assert(authorizedClient.body.client?.clientId, 'authorized client creation did not return a client id')
  assert(authorizedClient.body.session?.sessionId, 'authorized client creation did not return a session id')
  appState.runs.upsert({
    runId: 'auth_check_run',
    sessionId: authorizedClient.body.session.sessionId,
    workspaceId: authorizedClient.body.workspace?.workspaceId,
  })
  // Artifact downloads are intentionally accepted only from the runtime artifact
  // root. Keep this hosted-auth fixture on the same production-shaped boundary
  // instead of granting the gateway an arbitrary temporary-file path.
  const artifactPath = path.join(mainspring.storage.artifactStore.rootPath, 'auth_check_report')
  fs.writeFileSync(artifactPath, '# hosted artifact ticket check\n')
  appState.projections.artifacts.create({
    artifactId: 'auth_check_report',
    runId: 'auth_check_run',
    sessionId: authorizedClient.body.session.sessionId,
    workspaceId: authorizedClient.body.workspace?.workspaceId,
    kind: 'report',
    label: 'auth-check-report',
    path: artifactPath,
    mediaType: 'text/markdown',
  })

  const authorizedSnapshot = await requestOk(`${started.url}/snapshot`, {
    headers: { authorization: `Bearer ${token}` },
  })
  assert(authorizedSnapshot.body.counts?.clients === 1, 'authorized snapshot did not include the created client')
  assert(!JSON.stringify(authorizedSnapshot.body).includes(token), 'authorized snapshot leaked session token')

  const queryTokenSnapshot = await request(`${started.url}/snapshot?sessionToken=${encodeURIComponent(token)}`)
  assert(queryTokenSnapshot.response.status === 401, 'hosted JSON route accepted a query-string session token')

  const queryTokenArtifact = await request(`${started.url}/artifacts/auth_check_report?sessionToken=${encodeURIComponent(token)}`)
  assert(queryTokenArtifact.response.status === 401, 'hosted artifact route accepted a query-string session token')

  const unauthorizedBrowserAccess = await request(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'artifact', artifactId: 'auth_check_report' }),
  })
  assert(unauthorizedBrowserAccess.response.status === 401, 'hosted browser-access ticket route did not require bearer auth')

  const browserAccess = await requestOk(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ kind: 'artifact', artifactId: 'auth_check_report' }),
  })
  assert(browserAccess.body.kind === 'artifact', 'browser-access response did not preserve artifact kind')
  assert(typeof browserAccess.body.url === 'string', 'browser-access response did not include a URL')
  assert(browserAccess.body.url.includes('/artifacts/auth_check_report?ticket='), 'browser-access URL did not use a scoped ticket')
  assert(!browserAccess.body.url.includes(token), 'browser-access URL leaked the raw hosted session token')

  const missingArtifactBrowserAccess = await request(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ kind: 'artifact', artifactId: 'missing_auth_check_report' }),
  })
  assert(
    missingArtifactBrowserAccess.response.status === 404,
    'hosted browser-access ticket route minted a URL for an unknown artifact',
  )
  assert(
    !JSON.stringify(missingArtifactBrowserAccess.body).includes('ticket'),
    'unknown artifact browser-access response exposed ticket material',
  )

  const streamAccess = await requestOk(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'event-stream',
      sessionId: authorizedClient.body.session.sessionId,
      runId: 'auth_check_run',
    }),
  })
  assert(streamAccess.body.kind === 'event-stream', 'event-stream browser-access response did not preserve kind')
  assert(streamAccess.body.url.includes('/events/stream?sessionId='), 'event-stream browser-access URL did not target SSE')
  assert(streamAccess.body.url.includes('runId=auth_check_run'), 'event-stream browser-access URL did not include run id')
  assert(streamAccess.body.url.includes('ticket='), 'event-stream browser-access URL did not use a scoped ticket')
  assert(!streamAccess.body.url.includes(token), 'event-stream browser-access URL leaked the raw hosted session token')

  const missingStreamSessionAccess = await request(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ kind: 'event-stream', sessionId: 'missing_auth_session' }),
  })
  assert(
    missingStreamSessionAccess.response.status === 404,
    'hosted browser-access ticket route minted an SSE URL for an unknown session',
  )
  assert(
    !JSON.stringify(missingStreamSessionAccess.body).includes('ticket'),
    'unknown session browser-access response exposed ticket material',
  )

  const missingStreamRunAccess = await request(`${started.url}/auth/browser-access`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'event-stream',
      sessionId: authorizedClient.body.session.sessionId,
      runId: 'missing_auth_run',
    }),
  })
  assert(
    missingStreamRunAccess.response.status === 404,
    'hosted browser-access ticket route minted an SSE URL for an unknown run',
  )
  assert(
    !JSON.stringify(missingStreamRunAccess.body).includes('ticket'),
    'unknown run browser-access response exposed ticket material',
  )

  const ticketArtifact = await requestOk(browserAccess.body.url)
  assert(ticketArtifact.text.includes('# hosted artifact ticket check'), 'ticketed artifact request did not return artifact content')

  const wrongTicketArtifact = await request(browserAccess.body.url.replace('/artifacts/auth_check_report', '/artifacts/other_report'))
  assert(wrongTicketArtifact.response.status === 401, 'artifact browser-access ticket authorized a different artifact')

  const sessionView = await requestOk(`${started.url}/auth/session`, {
    headers: { authorization: `Bearer ${token}` },
  })
  assert(sessionView.body.auth?.authenticated === true, 'auth session did not resolve valid token')
  assert(sessionView.body.auth?.user?.username === 'admin', 'auth session returned wrong user')

  const logout = await requestOk(`${started.url}/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  assert(logout.body.loggedOut === true, 'hosted logout did not return loggedOut=true')

  const revokedSnapshot = await request(`${started.url}/snapshot`, {
    headers: { authorization: `Bearer ${token}` },
  })
  assert(revokedSnapshot.response.status === 401, 'revoked hosted session still authorized snapshot access')
  assert(appState.authSessions.list()[0].status === 'revoked', 'hosted logout did not revoke persisted session')

  const tokenLeakPath = fileContains(root, token)
  assert(!tokenLeakPath, `raw hosted session token leaked into local files: ${tokenLeakPath}`)

  console.log('MAINSPRING_AUTH_CHECK_OK')
} finally {
  if (server) await server.stop()
  if (mainspring) await mainspring.stop()
  appState?.close()
  fs.rmSync(root, { recursive: true, force: true })
}
