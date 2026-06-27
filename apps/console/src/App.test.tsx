import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentSpec, Dashboard, RunTrace, Skills } from './App'
import type { DashboardViewModel } from './dashboardViewModel'
import type { RunTraceViewModel } from './runTraceViewModel'

describe('Dashboard', () => {
  it('renders the status strip for populated dashboard views', () => {
    const viewModel: DashboardViewModel = {
      source: 'gateway-projection',
      providerReady: false,
      providerState: 'unverified',
      clients: [
        {
          id: 'client_1',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          statusLabel: 'Provider unverified',
          providerReady: false,
          activeRunCount: 0,
          pendingApprovalCount: 1,
        },
      ],
      statusStrip: [
        '1 client',
        'Provider unverified',
        '0 active runs',
        '1 pending approval',
      ],
      activeRunCount: 0,
      pendingApprovalCount: 1,
    }

    const markup = renderToStaticMarkup(
      <Dashboard
        viewModel={viewModel}
        onNewClient={() => undefined}
        onOpenClient={() => undefined}
        onGuide={() => undefined}
        notice=""
      />,
    )

    expect(markup).toContain('Northline Dental')
    expect(markup).toContain('Provider unverified')
    expect(markup).toContain('1 pending approval')
    expect(markup).toContain('dashboard-status-strip')
  })

  it('renders every computed client row instead of flattening to the first client', () => {
    const viewModel: DashboardViewModel = {
      source: 'gateway-projection',
      providerReady: true,
      providerState: 'ready',
      clients: [
        {
          id: 'client_northline',
          name: 'Northline Dental',
          subtitle: 'Front desk assistant',
          activeRunSummary: 'OpenRouter | anthropic/claude-sonnet-4',
          statusLabel: 'Approval needed',
          providerReady: true,
          activeRunCount: 1,
          pendingApprovalCount: 1,
        },
        {
          id: 'client_lumen',
          name: 'Lumen Repair',
          subtitle: 'Repair intake assistant',
          activeRunSummary: 'OpenAI | gpt-4.1-mini',
          statusLabel: 'Running',
          providerReady: true,
          activeRunCount: 1,
          pendingApprovalCount: 0,
        },
      ],
      statusStrip: ['2 clients', 'Provider ready', '2 active runs', '1 pending approval'],
      activeRunCount: 2,
      pendingApprovalCount: 1,
    }

    const markup = renderToStaticMarkup(
      <Dashboard
        viewModel={viewModel}
        onNewClient={() => undefined}
        onOpenClient={() => undefined}
        onGuide={() => undefined}
        notice=""
      />,
    )

    expect(markup).toContain('Northline Dental')
    expect(markup).toContain('Lumen Repair')
    expect(markup).toContain('Approval needed')
    expect(markup).toContain('Running')
    expect(markup).toContain('OpenRouter | anthropic/claude-sonnet-4')
    expect(markup).toContain('OpenAI | gpt-4.1-mini')
  })
})

describe('selected client and agent labels', () => {
  it('renders existing-agent context in the agent-spec breadcrumb and title', () => {
    const markup = renderToStaticMarkup(
      <AgentSpec
        client={{
          id: 'client_lumen',
          name: 'Lumen Repair',
          contact: 'Austin',
          workspace: 'E:\\Mainspring\\workspaces\\lumen-repair',
          billingLabel: 'retainer',
        }}
        existingAgent={{
          id: 'agent_repair_intake',
          clientId: 'client_lumen',
          name: 'Repair intake assistant',
          outcome: 'Handle repair intake',
          instructions: 'Stay careful.',
          voice: 'Plain, careful, friendly',
          model: 'Saved model: default chat',
          approvalMode: 'Balanced',
          skills: {
            'File tools': true,
            Memory: true,
          },
        }}
        providerState="unverified"
        onSave={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant')
    expect(markup).toContain('Edit agent')
    expect(markup).not.toContain('Lumen Repair / New agent')
    expect(markup).toContain('Provider auth')
    expect(markup).toContain('unverified')
  })

  it('renders the selected client name in the skills breadcrumb', () => {
    const markup = renderToStaticMarkup(
      <Skills
        clientName="Lumen Repair"
        agent={{
          id: 'agent_repair_intake',
          clientId: 'client_lumen',
          name: 'Repair intake assistant',
          outcome: 'Handle repair intake',
          instructions: 'Stay careful.',
          voice: 'Plain, careful, friendly',
          model: 'Saved model: default chat',
          approvalMode: 'Balanced',
          skills: {
            'File tools': true,
            Memory: true,
          },
        }}
        providerReady={false}
        providerState="unverified"
        onSettings={() => undefined}
        onBack={() => undefined}
        onSave={() => undefined}
        onLaunch={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant')
    expect(markup).not.toContain('Northline Dental / Repair intake assistant')
  })

  it('renders the selected client and agent names in the run-trace breadcrumb', () => {
    const trace: RunTraceViewModel = {
      source: 'prototype-sample',
      clientName: 'Lumen Repair',
      agentName: 'Repair intake assistant',
      intro: 'Sample trace only. This view is not connected to events_out yet.',
      events: [
        {
          time: '10:42:01',
          label: 'Prompt assembled',
          detail: {
            Title: 'Prompt assembled',
            Context: 'Agent spec, workspace policy, and client memory',
          },
        },
      ],
      footer: ['Artifacts: none'],
    }

    const markup = renderToStaticMarkup(
      <RunTrace
        trace={trace}
        selectedEvent={0}
        setSelectedEvent={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Lumen Repair / Repair intake assistant / Run')
    expect(markup).not.toContain('Northline Dental / Front desk assistant / Run')
  })

  it('renders gateway trace preview context without claiming a live events_out trace', () => {
    const trace: RunTraceViewModel = {
      source: 'gateway-projection-preview',
      clientName: 'Northline Dental',
      agentName: 'Front desk assistant',
      intro:
        'Gateway snapshot preview only. This view reuses read-only run metadata and is not connected to events_out yet.',
      events: [
        {
          time: '17:59:00',
          label: 'Run waiting for approval',
          detail: {
            Title: 'Run waiting for approval',
            Run: 'run_1',
            Session: 'session_1',
            Status: 'waiting_approval',
            Events: '7',
          },
        },
        {
          time: '17:59:00',
          label: 'Provider context',
          detail: {
            Title: 'Provider context',
            Route: 'OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions',
          },
        },
      ],
      footer: ['Trace source: gateway snapshot preview'],
    }

    const markup = renderToStaticMarkup(
      <RunTrace
        trace={trace}
        selectedEvent={1}
        setSelectedEvent={() => undefined}
        onBack={() => undefined}
      />,
    )

    expect(markup).toContain('Gateway snapshot preview only')
    expect(markup).toContain('Provider context')
    expect(markup).toContain('OpenRouter | anthropic/claude-sonnet-4 | openrouter-chat-completions')
    expect(markup).toContain('Back to dashboard')
    expect(markup).not.toContain('Back to agent')
  })
})
