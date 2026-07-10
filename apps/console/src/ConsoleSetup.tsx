import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import { MainspringMark } from './ConsoleNavigation'
import { ProviderForm, type ProviderProfileDraft } from './ConsoleProviderCatalog'
import type { LocalGatewayClient } from './localGatewayClient'

export type ToastKind = 'ok' | 'error' | 'info'

export type ToastState = {
  kind: ToastKind
  text: string
}

export type SetupState = {
  complete: boolean
  accountName: string
  username: string
}

type HealthAuth = Awaited<ReturnType<LocalGatewayClient['health']>>['auth']
type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

export function ConsoleToast({ onDismiss, toast }: { onDismiss: () => void; toast: ToastState }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4200)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <button
      aria-live="polite"
      className={`simple-toast ${toast.kind}`}
      role="status"
      type="button"
      onClick={onDismiss}
    >
      {toast.text}
    </button>
  )
}

export function SetupWizard({
  auth,
  busy,
  gatewayClient,
  providerProfiles,
  toast,
  onBusy,
  onConnectProvider,
  onDone,
  onSessionToken,
  onToast,
}: {
  auth?: HealthAuth
  busy: boolean
  gatewayClient: LocalGatewayClient
  providerProfiles: SnapshotProvider[]
  toast?: ToastState
  onBusy: (value: boolean) => void
  onConnectProvider: (input: ProviderProfileDraft) => Promise<void>
  onDone: (setup: SetupState) => Promise<void>
  onSessionToken: (token: string | undefined) => void
  onToast: (toast: ToastState | undefined) => void
}) {
  const [step, setStep] = useState<'account' | 'providers' | 'finish'>('account')
  const [accountName, setAccountName] = useState('Mainspring HQ')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onBusy(true)
    try {
      if (auth?.authMode === 'hosted') {
        if (!password.trim()) throw new Error('Password is required for hosted auth.')
        if (auth.bootstrapRequired) {
          await gatewayClient.bootstrapAuth({ username: username.trim(), password })
        }
        await gatewayClient.login({ username: username.trim(), password })
        onSessionToken(gatewayClient.getSessionToken())
      }
      setStep('providers')
      onToast({ kind: 'ok', text: 'Account step complete.' })
    } catch (error) {
      onToast({ kind: 'error', text: errorMessage(error) })
    } finally {
      onBusy(false)
    }
  }

  async function finish() {
    await onDone({
      complete: true,
      accountName: accountName.trim() || 'Mainspring',
      username: username.trim() || 'admin',
    })
  }

  return (
    <div className="setup-scene">
      <div className="setup-brand">
        <MainspringMark />
        <span>Mainspring</span>
      </div>
      <section className="setup-card">
        <div className="setup-steps" aria-label="Setup steps">
          {['account', 'providers', 'finish'].map((item, index) => (
            <button
              className={step === item ? 'active' : ''}
              disabled={
                (item === 'providers' && step === 'account')
                || (item === 'finish' && step !== 'finish')
              }
              key={item}
              type="button"
              onClick={() => setStep(item as typeof step)}
            >
              <span>{index + 1}</span>
              {item}
            </button>
          ))}
        </div>
        {step === 'account' ? (
          <form className="setup-panel" onSubmit={submitAccount}>
            <div>
              <h1>Set up your account</h1>
              <p>Keep it simple: one owner account, then connect one model service.</p>
            </div>
            <label>
              Account name
              <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
            </label>
            <label>
              Username
              <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                autoComplete="new-password"
                placeholder={auth?.authMode === 'hosted' ? 'Required for hosted gateway' : 'Used only for hosted gateway setup'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="simple-primary" disabled={busy} type="submit">Continue</button>
          </form>
        ) : step === 'providers' ? (
          <div className="setup-panel">
            <div>
              <h1>Connect a service</h1>
              <p>OpenRouter and OpenAI API-key profiles are wired to the backend today. Other providers are shown as connector or catalog routes.</p>
            </div>
            <ProviderForm
              compact
              gatewayClient={gatewayClient}
              providerProfiles={providerProfiles}
              onCancel={() => setStep('finish')}
              onSubmit={async (input) => {
                await onConnectProvider(input)
                setStep('finish')
              }}
            />
            <button className="simple-text" type="button" onClick={() => setStep('finish')}>Skip for now</button>
          </div>
        ) : (
          <div className="setup-panel">
            <div>
              <h1>Ready for clients</h1>
              <p>The dashboard will start with one action: add a client. Each client gets a workspace and an agent.</p>
            </div>
            <div className="setup-summary">
              <span>{accountName}</span>
              <span>{providerProfiles.length} connected service{providerProfiles.length === 1 ? '' : 's'}</span>
              <span>Open-source local gateway</span>
            </div>
            <button className="simple-primary" disabled={busy} type="button" onClick={() => void finish()}>Open dashboard</button>
          </div>
        )}
      </section>
      {toast ? <ConsoleToast toast={toast} onDismiss={() => onToast(undefined)} /> : null}
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
