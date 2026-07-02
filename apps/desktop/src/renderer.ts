export type DesktopFallbackPageInput = {
  csp: string
  consolePath: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderDesktopFallbackHtml(input: DesktopFallbackPageInput): string {
  const consolePath = escapeHtml(input.consolePath)
  const csp = escapeHtml(input.csp)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mainspring Desktop</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, Arial, sans-serif;
        background: #111111;
        color: #f4efe4;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #111111;
      }
      main {
        width: min(720px, calc(100vw - 48px));
        border: 1px solid #3c382f;
        padding: 24px;
        background: #171511;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.5;
      }
      code {
        font-family: "Cascadia Code", Consolas, monospace;
        color: #d1b06b;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Mainspring Desktop</h1>
      <p>The desktop shell is installed, but the console bundle was not found.</p>
      <p>Build the console first, then relaunch the app.</p>
      <p>Expected console entry: <code>${consolePath}</code></p>
    </main>
  </body>
</html>`
}
