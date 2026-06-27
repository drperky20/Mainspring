export class GatewayHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export function asGatewayHttpError(error: unknown): GatewayHttpError {
  if (error instanceof GatewayHttpError) return error
  if (error instanceof Error) return new GatewayHttpError(400, error.message)
  return new GatewayHttpError(500, 'Unknown gateway error.')
}
