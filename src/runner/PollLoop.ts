import type { InboundMessage } from '../mailbox/SqliteMailbox.js'
import {
  formatRuntimeInboundPrompt,
  RuntimeKernel,
  type RuntimeKernelOptions,
  type RuntimeKernelResult,
} from './RuntimeKernel.js'

export type PollLoopResult = RuntimeKernelResult
export type MainspringPollLoopOptions = RuntimeKernelOptions

export function formatInboundPrompt(
  message: InboundMessage,
): ReturnType<typeof formatRuntimeInboundPrompt> {
  return formatRuntimeInboundPrompt(message)
}

export class MainspringPollLoop {
  private readonly kernel: RuntimeKernel

  constructor(options: MainspringPollLoopOptions) {
    this.kernel = new RuntimeKernel(options)
  }

  async runOnce(): Promise<PollLoopResult> {
    const result = await this.kernel.runOnce()
    await this.kernel.waitForActiveQueries()
    return result
  }
}
