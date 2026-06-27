export const defaultLocalGatewayUrl = 'http://127.0.0.1:8787'

export function localGatewayUrlFromEnv(): string {
  const configured = import.meta.env.VITE_MAINSPRING_GATEWAY_URL?.trim()
  return configured || defaultLocalGatewayUrl
}
