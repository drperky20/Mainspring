import { useEffect, useState } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import type { LocalGatewayClient } from './localGatewayClient'
import { ProviderBadge, providerCatalog } from './ConsoleProviderCatalog'
import type { SetupState } from './ConsoleSetup'
import type { ConsoleConnectionState } from './OperatorConsoleScreens'
import './ConsoleSettings.css'

type HealthAuth = Awaited<ReturnType<LocalGatewayClient['health']>>['auth']
type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

export function SettingsScreen({
  auth,
  connectionError,
  connectionState,
  gatewayUrl,
  lastUpdatedAt,
  providers,
  selectedProviderId,
  setup,
  onGatewayUrl,
  onNewProvider,
  onProvider,
  onResetSetup,
}: {
  auth?: HealthAuth
  connectionError?: string
  connectionState: ConsoleConnectionState
  gatewayUrl: string
  lastUpdatedAt?: string
  providers: SnapshotProvider[]
  selectedProviderId?: string
  setup: SetupState
  onGatewayUrl: (value: string) => void
  onNewProvider: () => void
  onProvider: (profileId: string) => void
  onResetSetup: () => void
}) {
  const [gatewayDraft, setGatewayDraft] = useState(gatewayUrl)

  useEffect(() => {
    setGatewayDraft(gatewayUrl)
  }, [gatewayUrl])

  return (
    <section className="settings-screen">
      <header className="screen-header">
        <div>
          <p>{setup.accountName}</p>
          <h1>Settings</h1>
        </div>
        <button className="simple-secondary" type="button" onClick={onNewProvider}>Connect service</button>
      </header>
      <div className="settings-grid">
        <section className="settings-section">
          <h2>Gateway</h2>
          <label>
            Local gateway URL
            <span className="settings-inline-field">
              <input value={gatewayDraft} onChange={(event) => setGatewayDraft(event.target.value)} />
              <button
                className="simple-secondary"
                disabled={gatewayDraft.trim().replace(/\/+$/, '') === gatewayUrl}
                type="button"
                onClick={() => onGatewayUrl(gatewayDraft)}
              >
                Apply
              </button>
            </span>
          </label>
          <InfoRow label="Connection" value={connectionState} />
          <InfoRow label="Auth mode" value={auth?.authMode ?? 'local-dev'} />
          <InfoRow label="Signed in" value={!auth || auth.authenticated || auth.authMode === 'local-dev' ? 'yes' : 'no'} />
          <InfoRow label="Gateway role" value={auth?.user?.role ?? (auth?.authMode === 'hosted' ? 'signed out' : 'local admin')} />
          <InfoRow label="Last snapshot" value={lastUpdatedAt ?? 'Not loaded'} />
          {connectionError ? <p className="settings-error" role="status">{connectionError}</p> : null}
          <button className="simple-text" type="button" onClick={onResetSetup}>Run setup again</button>
        </section>
        <section className="settings-section">
          <div className="mini-head">
            <h2>Connected services</h2>
            <button className="simple-text" type="button" onClick={onNewProvider}>Add</button>
          </div>
          {providers.length === 0 ? (
            <p>No services connected yet.</p>
          ) : providers.map((profile) => (
            <button
              className={profile.profileId === selectedProviderId ? 'provider-row active' : 'provider-row'}
              key={profile.profileId}
              type="button"
              onClick={() => onProvider(profile.profileId)}
            >
              <ProviderBadge providerId={profile.providerId} />
              <span>
                <strong>{profile.label}</strong>
                <small>{profile.providerId} | {profile.credentialState}</small>
              </span>
              <em>{profile.defaultModelId ?? 'model unset'}</em>
            </button>
          ))}
        </section>
        <section className="settings-section wide">
          <h2>Provider paths</h2>
          <div className="provider-catalog-grid">
            {providerCatalog.map((provider) => (
              <article className="catalog-card" key={provider.id}>
                <ProviderBadge providerId={provider.id} />
                <div>
                  <strong>{provider.label}</strong>
                  <span>{provider.setup}</span>
                  <p>{provider.note}</p>
                </div>
                <small>{provider.status}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
