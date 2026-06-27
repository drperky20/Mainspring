import fs from 'node:fs'
import path from 'node:path'
import WebSocket from 'ws'
import {
  GatewayRunDispatchSchema,
  RunIntentSchema,
  mailboxSessionIdFromSessionKey,
  resolveSessionMailboxPaths,
  runtimeErrorMessage,
  type GatewayRunDispatch,
} from '#protocol'
import {
  MAINSPRING_CHANNEL_PROTOCOL_VERSION,
  TURN_EVENT_SCHEMA_VERSION,
  bridgeRuntimeEventToTurnEvents,
  parseChannelDownMessage,
  type ChannelDownMessage,
  type ChannelUpMessage,
  type TurnDispatch,
  type TurnEvent,
} from '#control'
import { MainspringMailbox } from '../mailbox/SqliteMailbox.js'

// Channel bridge: the runtime dials OUT to the control plane.
// Down: dispatch_turn / cancel_turn / approval_resolved / resume_turn.
// Up: hello + sequenced TurnEvent batches + heartbeat status frames.
//
// The local SQLite mailbox is the durable journal: inbound rows feed the
// untouched RuntimeKernel poll loop; the events_out table provides replay
// (unACKed events are re-read by local seq and resent on reconnect).
// Turn seq = dispatch.seqBase + local events_out seq; collision-free with
// control-plane pre-dispatch events and idempotent under replay.

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const EVENT_PUMP_INTERVAL_MS = 250
const STATUS_FRAME_INTERVAL_MS = 30_000
const TERMINAL_TURN_RETENTION_MS = 10 * 60 * 1000

type TurnState = {
  turnId: string
  mailboxSessionId: string
  seqBase: number
  ackedSeq: number
  lastLocalSeq: number
  pendingApprovalIds: string[]
  terminalAt?: number
}

type BridgeState = {
  turns: Record<string, TurnState>
}

export type ChannelBridgeOptions = {
  channelUrl: string
  token: string
  sessionsRoot: string
  log?: (event: string, fields?: Record<string, unknown>) => void
}

function defaultLog(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event: `mainspring.channel.${event}`, ...fields }))
}

export function gatewayDispatchFromTurnDispatch(turn: TurnDispatch): GatewayRunDispatch {
  const sessionKey = `session:${turn.sessionId}`
  const intent = RunIntentSchema.parse({
    workspaceId: turn.workspaceId,
    agentId: turn.agentId,
    message: turn.input.message,
    ...(turn.systemPrompt?.trim() ? { systemPrompt: turn.systemPrompt.trim() } : {}),
    sessionKey,
    mode: 'task',
    approvalPolicy: turn.approvalPolicy,
    runtimeOptions: {
      browser: turn.policy.allowBrowser,
      memory: turn.policy.allowMemory,
      tools: turn.policy.allowedTools,
    },
  })
  return GatewayRunDispatchSchema.parse({
    runId: turn.turnId,
    ownerId: turn.ownerId,
    computerId: 'channel',
    workspaceId: turn.workspaceId,
    agentId: turn.agentId,
    sessionKey,
    runtimeProfile: turn.runtimeProfile,
    intent,
    policy: turn.policy,
    trace: { requestId: turn.traceId, source: turn.source === 'console' ? 'console' : 'api' },
  })
}

export class ChannelBridge {
  private socket: WebSocket | null = null
  private running = false
  private reconnectDelayMs = RECONNECT_BASE_MS
  private pumpTimer: ReturnType<typeof setInterval> | null = null
  private statusTimer: ReturnType<typeof setInterval> | null = null
  private state: BridgeState = { turns: {} }
  private readonly statePath: string
  private readonly mailboxes = new Map<string, MainspringMailbox>()
  private readonly log: (event: string, fields?: Record<string, unknown>) => void

  constructor(private readonly options: ChannelBridgeOptions) {
    this.statePath = path.join(options.sessionsRoot, '.channel-state.json')
    this.log = options.log ?? defaultLog
    this.loadState()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.connect()
    this.pumpTimer = setInterval(() => this.pumpEvents(), EVENT_PUMP_INTERVAL_MS)
    this.statusTimer = setInterval(() => this.sendStatus(), STATUS_FRAME_INTERVAL_MS)
  }

  stop(): void {
    this.running = false
    if (this.pumpTimer) clearInterval(this.pumpTimer)
    if (this.statusTimer) clearInterval(this.statusTimer)
    this.pumpTimer = null
    this.statusTimer = null
    this.socket?.close(1000, 'mainspring shutdown')
    this.socket = null
  }

  // --- state journal -------------------------------------------

  private loadState(): void {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8')
      const parsed = JSON.parse(raw) as BridgeState
      if (parsed && typeof parsed === 'object' && parsed.turns) this.state = parsed
    } catch {
      this.state = { turns: {} }
    }
  }

  private saveState(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true })
      const tmp = `${this.statePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.state))
      fs.renameSync(tmp, this.statePath)
    } catch (error) {
      this.log('state_write_failed', { message: runtimeErrorMessage(error, 'state write failed') })
    }
  }

  private mailboxFor(mailboxSessionId: string): MainspringMailbox {
    let mailbox = this.mailboxes.get(mailboxSessionId)
    if (!mailbox) {
      mailbox = new MainspringMailbox(
        resolveSessionMailboxPaths(path.join(this.options.sessionsRoot, mailboxSessionId)),
      )
      this.mailboxes.set(mailboxSessionId, mailbox)
    }
    return mailbox
  }

  // --- connection ----------------------------------------------

  private connect(): void {
    if (!this.running) return
    const socket = new WebSocket(this.options.channelUrl, {
      headers: { authorization: `Bearer ${this.options.token}` },
    })
    this.socket = socket

    socket.on('open', () => {
      this.reconnectDelayMs = RECONNECT_BASE_MS
      this.log('connected')
      this.send({
        t: 'hello',
        protocolVersion: MAINSPRING_CHANNEL_PROTOCOL_VERSION,
        cellId: this.cellIdFromUrl(),
        activeTurns: this.activeTurnSnapshots(),
      })
    })

    socket.on('message', (raw: WebSocket.RawData) => {
      try {
        this.handleDown(parseChannelDownMessage(JSON.parse(String(raw))))
      } catch (error) {
        this.log('bad_frame', { message: runtimeErrorMessage(error, 'invalid frame') })
      }
    })

    const scheduleReconnect = () => {
      if (!this.running) return
      const jitter = Math.floor(Math.random() * 250)
      const delay = Math.min(this.reconnectDelayMs, RECONNECT_MAX_MS) + jitter
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS)
      setTimeout(() => this.connect(), delay)
    }

    socket.on('close', () => {
      this.log('disconnected')
      if (this.socket === socket) this.socket = null
      scheduleReconnect()
    })
    socket.on('error', (error: Error) => {
      this.log('socket_error', { message: runtimeErrorMessage(error, 'socket error') })
      socket.close()
    })
  }

  private cellIdFromUrl(): string {
    const segments = this.options.channelUrl.split('/').filter(Boolean)
    return segments.at(-1) ?? 'unknown'
  }

  private send(message: ChannelUpMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private activeTurnSnapshots() {
    return Object.values(this.state.turns)
      .filter((turn) => !turn.terminalAt)
      .map((turn) => ({
        turnId: turn.turnId,
        lastSeq: turn.seqBase + turn.lastLocalSeq,
        pendingApprovalIds: turn.pendingApprovalIds,
      }))
  }

  // --- downstream handling --------------------------------------

  private handleDown(message: ChannelDownMessage): void {
    if (message.t === 'hello_ack') return
    if (message.t === 'event_ack') {
      const turn = this.state.turns[message.turnId]
      if (turn && message.seq > turn.ackedSeq) {
        turn.ackedSeq = message.seq
        this.saveState()
      }
      return
    }
    if (message.t === 'dispatch_turn' || message.t === 'resume_turn') {
      const dispatch = message.turn
      const mailboxSessionId = mailboxSessionIdFromSessionKey(`session:${dispatch.sessionId}`)
      const existing = this.state.turns[dispatch.turnId]
      const lastAcked = message.t === 'resume_turn' ? message.lastAckedSeq : dispatch.seqBase
      this.state.turns[dispatch.turnId] = {
        turnId: dispatch.turnId,
        mailboxSessionId,
        seqBase: dispatch.seqBase,
        ackedSeq: Math.max(existing?.ackedSeq ?? 0, lastAcked),
        lastLocalSeq: existing?.lastLocalSeq ?? 0,
        pendingApprovalIds: existing?.pendingApprovalIds ?? [],
      }
      this.saveState()

      // resume_turn for a turn the kernel already journaled: do not re-feed
      // the prompt; replay of unACKed events happens via the pump.
      if (message.t === 'resume_turn' && existing) {
        this.log('resume', { turnId: dispatch.turnId })
        return
      }

      const mailbox = this.mailboxFor(mailboxSessionId)
      mailbox.writeInbound({
        runId: dispatch.turnId,
        sessionId: mailboxSessionId,
        kind: 'task',
        content: JSON.stringify(gatewayDispatchFromTurnDispatch(dispatch)),
      })
      this.log('dispatched', { turnId: dispatch.turnId })
      return
    }
    if (message.t === 'cancel_turn') {
      const turn = this.state.turns[message.turnId]
      if (!turn) return
      this.mailboxFor(turn.mailboxSessionId).writeInbound({
        runId: message.turnId,
        sessionId: turn.mailboxSessionId,
        kind: 'run_cancel',
        content: JSON.stringify({
          type: 'run_cancel',
          runId: message.turnId,
          reason: message.reason ?? 'cancelled by control plane',
        }),
      })
      return
    }
    if (message.t === 'approval_resolved') {
      const turn = this.state.turns[message.turnId]
      if (!turn) return
      turn.pendingApprovalIds = turn.pendingApprovalIds.filter((id) => id !== message.approvalId)
      this.saveState()
      this.mailboxFor(turn.mailboxSessionId).writeInbound({
        runId: message.turnId,
        sessionId: turn.mailboxSessionId,
        kind: 'approval_response',
        content: JSON.stringify({
          type: 'approval_response',
          runId: message.turnId,
          approvalId: message.approvalId,
          decision: message.decision === 'approved' ? 'approved' : 'denied',
          ...(message.reason ? { reason: message.reason } : {}),
        }),
      })
      return
    }
    if (message.t === 'shutdown') {
      this.log('shutdown_requested', { reason: message.reason })
      this.stop()
    }
  }

  // --- upstream event pump ---------------------------------------

  private pumpEvents(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const now = Date.now()
    let stateDirty = false

    for (const turn of Object.values(this.state.turns)) {
      if (turn.terminalAt && now - turn.terminalAt > TERMINAL_TURN_RETENTION_MS) {
        delete this.state.turns[turn.turnId]
        stateDirty = true
        continue
      }

      const mailbox = this.mailboxFor(turn.mailboxSessionId)
      const afterLocalSeq = Math.max(turn.ackedSeq - turn.seqBase, 0)
      let rows
      try {
        rows = mailbox.readEventsAfterSeq({
          sessionId: turn.mailboxSessionId,
          runId: turn.turnId,
          afterSeq: afterLocalSeq,
        })
      } catch (error) {
        this.log('pump_read_failed', {
          turnId: turn.turnId,
          message: runtimeErrorMessage(error, 'event read failed'),
        })
        continue
      }
      if (rows.length === 0) continue

      const events: TurnEvent[] = []
      for (const row of rows) {
        for (const bridged of bridgeRuntimeEventToTurnEvents(row.event)) {
          events.push({
            v: TURN_EVENT_SCHEMA_VERSION,
            turnId: turn.turnId,
            seq: turn.seqBase + row.seq,
            type: bridged.type,
            at: row.timestamp,
            payload: bridged.payload,
          } as TurnEvent)
        }
        // multiple TurnEvents can share a source row only when the bridge
        // fans out; keep 1:1 by design so seq stays unique
        if (row.event.type === 'approval.requested') {
          const record = row.event.approval as Record<string, unknown> | null
          const approvalId =
            record && typeof record === 'object'
              ? ((record.approvalId ?? record.id ?? record.requestId) as string | undefined)
              : undefined
          if (approvalId && !turn.pendingApprovalIds.includes(approvalId)) {
            turn.pendingApprovalIds.push(approvalId)
            stateDirty = true
          }
        }
        if (
          row.event.type === 'run.status' &&
          ['completed', 'failed', 'cancelled', 'canceled', 'aborted'].includes(
            row.event.status.trim().toLowerCase(),
          )
        ) {
          turn.terminalAt = now
          stateDirty = true
        }
        turn.lastLocalSeq = Math.max(turn.lastLocalSeq, row.seq)
      }

      if (events.length > 0) {
        this.send({ t: 'events', turnId: turn.turnId, events })
      }
      stateDirty = true
    }

    if (stateDirty) this.saveState()
  }

  private sendStatus(): void {
    this.send({
      t: 'status',
      at: new Date().toISOString(),
      activeTurns: this.activeTurnSnapshots(),
    })
  }
}
