import { useEffect, useState } from 'react'
import type { ConsoleGatewaySnapshot } from 'mainspring/gateway'
import anthropicLogo from './assets/providers/anthropic.png'
import deepseekLogo from './assets/providers/deepseek.ico'
import geminiLogo from './assets/providers/gemini.svg'
import groqLogo from './assets/providers/groq.svg'
import mistralLogo from './assets/providers/mistral.ico'
import openaiLogo from './assets/providers/openai.svg'
import openrouterLogo from './assets/providers/openrouter.ico'
import type { GatewayProviderModel, LocalGatewayClient } from './localGatewayClient'

export type ProviderStatus = 'live' | 'connector' | 'catalog'

export type ProviderCatalogItem = {
  id: string
  label: string
  badge: string
  status: ProviderStatus
  profileProviderId?: 'openrouter' | 'openai' | 'codex'
  defaultModelId: string
  models: Array<{ id: string; label: string }>
  setup: string
  note: string
}

export type ProviderProfileDraft = {
  catalogId: string
  label: string
  modelId: string
  secretMode: 'ref' | 'value'
  secretRef: string
  secretValue: string
}

type SnapshotProvider = ConsoleGatewaySnapshot['providerProfiles'][number]

export const providerCatalog: ProviderCatalogItem[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'OR',
    status: 'live',
    profileProviderId: 'openrouter',
    defaultModelId: 'openrouter/auto',
    setup: 'API key or managed secret reference',
    note: 'Uses the existing Mainspring OpenRouter provider profile.',
    models: [
      { id: 'openrouter/auto', label: 'Auto router' },
      { id: 'openrouter/free', label: 'Free router' },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet via OpenRouter' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini Flash via OpenRouter' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat via OpenRouter' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    badge: 'AI',
    status: 'live',
    profileProviderId: 'openai',
    defaultModelId: 'gpt-4.1-mini',
    setup: 'API key or managed secret reference',
    note: 'Uses the existing Mainspring OpenAI provider profile.',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT 4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT 4.1' },
      { id: 'o4-mini', label: 'o4 mini' },
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    badge: 'CX',
    status: 'live',
    profileProviderId: 'codex',
    defaultModelId: 'codex-auto',
    setup: 'Codex CLI with mounted Codex home auth',
    note: 'Uses the backend Codex CLI provider path with ChatGPT auth from CODEX_HOME.',
    models: [
      { id: 'codex-auto', label: 'Codex account default' },
      { id: 'gpt-5-codex-mini', label: 'GPT 5 Codex mini' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    badge: 'CL',
    status: 'connector',
    defaultModelId: 'anthropic/claude-sonnet-4',
    setup: 'Direct API adapter needed',
    note: 'Use OpenRouter today. Subscription credential reuse is not presented as third-party client auth.',
    models: [
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet via OpenRouter' },
      { id: 'anthropic/claude-opus-4', label: 'Claude Opus via OpenRouter' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    badge: 'GM',
    status: 'catalog',
    defaultModelId: 'google/gemini-2.5-flash',
    setup: 'Available through OpenRouter catalog today',
    note: 'Direct Gemini provider support can be added behind the same profile UI later.',
    models: [{ id: 'google/gemini-2.5-flash', label: 'Gemini Flash via OpenRouter' }],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    badge: 'MI',
    status: 'catalog',
    defaultModelId: 'mistralai/mistral-small-3.2-24b-instruct',
    setup: 'Available through OpenRouter catalog today',
    note: 'Use an OpenRouter profile until Mainspring has a direct adapter.',
    models: [{ id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small via OpenRouter' }],
  },
  {
    id: 'groq',
    label: 'Groq',
    badge: 'GQ',
    status: 'catalog',
    defaultModelId: 'meta-llama/llama-3.3-70b-instruct',
    setup: 'Available through OpenRouter catalog today',
    note: 'Direct Groq provider support can reuse the provider profile pattern.',
    models: [{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B via OpenRouter' }],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    badge: 'DS',
    status: 'catalog',
    defaultModelId: 'deepseek/deepseek-chat',
    setup: 'Available through OpenRouter catalog today',
    note: 'Shown as catalog routing until a direct DeepSeek provider exists.',
    models: [{ id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat via OpenRouter' }],
  },
]

const providerLogoSources: Record<string, string> = {
  anthropic: anthropicLogo,
  codex: openaiLogo,
  deepseek: deepseekLogo,
  google: geminiLogo,
  groq: groqLogo,
  mistral: mistralLogo,
  openai: openaiLogo,
  openrouter: openrouterLogo,
}

export function providerModels(): Array<{ id: string; label: string }> {
  const seen = new Set<string>()
  return providerCatalog.flatMap((provider) => provider.models).filter((model) => {
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })
}

export function ProviderBadge({ providerId }: { providerId: string }) {
  const catalog = providerCatalog.find((provider) => provider.id === providerId || provider.profileProviderId === providerId)
  const logo = providerLogoSources[catalog?.id ?? providerId]
  return (
    <span className={logo ? 'provider-badge has-logo' : 'provider-badge'} title={catalog?.label ?? providerId}>
      {logo ? <img alt="" src={logo} /> : (catalog?.badge ?? providerId.slice(0, 2).toUpperCase())}
    </span>
  )
}

export function ProviderForm({
  compact = false,
  gatewayClient,
  providerProfiles,
  onCancel,
  onSubmit,
}: {
  compact?: boolean
  gatewayClient: LocalGatewayClient
  providerProfiles: SnapshotProvider[]
  onCancel: () => void
  onSubmit: (input: ProviderProfileDraft) => Promise<void>
}) {
  const [catalogId, setCatalogId] = useState('openrouter')
  const catalogItem = providerCatalog.find((provider) => provider.id === catalogId) ?? providerCatalog[0]
  const [label, setLabel] = useState(catalogItem.label)
  const [modelId, setModelId] = useState(catalogItem.defaultModelId)
  const [secretMode, setSecretMode] = useState<'ref' | 'value'>('ref')
  const [secretRef, setSecretRef] = useState(secretRefForProvider(catalogItem.profileProviderId))
  const [secretValue, setSecretValue] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [liveModels, setLiveModels] = useState<GatewayProviderModel[]>([])
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  function selectCatalog(nextId: string) {
    const next = providerCatalog.find((provider) => provider.id === nextId) ?? providerCatalog[0]
    setCatalogId(next.id)
    setLabel(next.label)
    setModelId(next.defaultModelId)
    setSecretRef(secretRefForProvider(next.profileProviderId))
  }

  useEffect(() => {
    if (catalogItem.id !== 'openrouter') {
      setLiveModels([])
      setModelStatus('idle')
      return
    }
    let canceled = false
    setModelStatus('loading')
    gatewayClient.openRouterModels({ q: modelSearch, limit: 80 })
      .then((result) => {
        if (canceled) return
        setLiveModels(result.models)
        setModelStatus('ready')
        setModelId((current) =>
          result.models.some((model) => model.id === current) ? current : result.models[0]?.id ?? current,
        )
      })
      .catch(() => {
        if (canceled) return
        setLiveModels([])
        setModelStatus('error')
      })
    return () => {
      canceled = true
    }
  }, [catalogItem.id, gatewayClient, modelSearch])

  const modelOptions =
    catalogItem.id === 'openrouter' && liveModels.length > 0
      ? liveModels.map((model) => ({ id: model.id, label: model.name }))
      : catalogItem.models

  return (
    <form
      className={compact ? 'provider-form compact' : 'provider-form'}
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit({ catalogId, label, modelId, secretMode, secretRef, secretValue })
      }}
    >
      <div className="provider-picker">
        {providerCatalog.map((provider) => (
          <button
            className={provider.id === catalogId ? 'provider-tile active' : 'provider-tile'}
            key={provider.id}
            type="button"
            onClick={() => selectCatalog(provider.id)}
          >
            <ProviderBadge providerId={provider.id} />
            <span>
              <strong>{provider.label}</strong>
              <small>{provider.status}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="field-grid">
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Model
          {catalogItem.id === 'openrouter' ? (
            <input
              placeholder="Search OpenRouter models"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
            />
          ) : null}
          <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </label>
        <label>
          Secret mode
          <select value={secretMode} onChange={(event) => setSecretMode(event.target.value as 'ref' | 'value')}>
            <option value="ref">Use environment or secret ref</option>
            <option value="value">Store managed secret</option>
          </select>
        </label>
        {secretMode === 'ref' ? (
          <label>
            Secret ref
            <input value={secretRef} onChange={(event) => setSecretRef(event.target.value)} />
          </label>
        ) : (
          <label>
            API key
            <input
              autoComplete="off"
              placeholder="Stored by the gateway secret store"
              type="password"
              value={secretValue}
              onChange={(event) => setSecretValue(event.target.value)}
            />
          </label>
        )}
      </div>
      <div className="provider-note">
        <strong>{catalogItem.setup}</strong>
        <span>{catalogItem.note}</span>
        {catalogItem.id === 'openrouter' ? (
          <em>
            {modelStatus === 'loading'
              ? 'Loading OpenRouter models'
              : modelStatus === 'ready'
                ? `${modelOptions.length} model${modelOptions.length === 1 ? '' : 's'} available`
                : modelStatus === 'error'
                  ? 'Using fallback model list'
                  : 'OpenRouter model catalog'}
          </em>
        ) : null}
        {providerProfiles.some((profile) => profile.providerId === catalogItem.profileProviderId) ? <em>Already connected</em> : null}
      </div>
      <div className="dialog-actions">
        <button className="simple-primary" type="submit">
          {catalogItem.profileProviderId ? 'Connect service' : 'Show connector'}
        </button>
        <button className="simple-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function secretRefForProvider(providerId?: ProviderCatalogItem['profileProviderId']): string {
  if (providerId === 'openai') return 'env:OPENAI_API_KEY'
  if (providerId === 'codex') return 'env:CODEX_HOME'
  return 'env:OPENROUTER_API_KEY'
}
