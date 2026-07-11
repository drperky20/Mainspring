import { expect, test, type Page } from '@playwright/test'

const gatewayUrl = process.env.MAINSPRING_E2E_GATEWAY_URL ?? 'http://127.0.0.1:8787'

function consoleUrl(path = ''): string {
  const url = new URL(path || '/', process.env.MAINSPRING_E2E_CONSOLE_URL ?? 'http://127.0.0.1:5173')
  url.searchParams.set('mainspringGatewayUrl', gatewayUrl)
  return url.toString()
}

function consoleUrlWithGateway(url: string): string {
  const target = new URL('/', process.env.MAINSPRING_E2E_CONSOLE_URL ?? 'http://127.0.0.1:5173')
  target.searchParams.set('mainspringGatewayUrl', url)
  return target.toString()
}

async function finishFirstRun(page: Page) {
  await page.goto(consoleUrl())
  await page.evaluate(() => window.localStorage.removeItem('mainspring.console.setup.v2'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Set up your account' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Connect a service' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.getByRole('heading', { name: 'Ready for clients' })).toBeVisible()
  await page.getByRole('button', { name: 'Open dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Mainspring control room' })).toBeVisible()
}

test.describe('operator console', () => {
  test('connects a first-run workspace and records a durable run to completion', async ({ page }) => {
    await finishFirstRun(page)

    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Northline Dental' })).toBeVisible()

    const composer = page.locator('textarea').first()
    await composer.fill('Reply with a short local status update.')
    const started = page.waitForResponse((response) =>
      response.url().endsWith('/runs/start') && response.status() === 202,
    )
    await page.getByRole('button', { name: 'Send' }).click()
    const startedRun = (await (await started).json()).run as { runId: string }
    await expect(page.getByText(/Run [a-z0-9_-]+ started\./i)).toBeVisible()

    // The worker publishes state asynchronously. Poll the durable gateway projection rather
    // than sleeping, then reload the renderer to prove the operator surface rebuilds from it.
    await expect.poll(async () => {
      const snapshot = await page.request.get(`${gatewayUrl}/snapshot`)
      const body = await snapshot.json() as { runLog?: { runs?: Array<{ runId: string; status: string }> } }
      return body.runLog?.runs?.find((run) => run.runId === startedRun.runId)?.status
    }, { timeout: 15_000 }).toBe('completed')

    await page.reload()
    const activityPage = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/runlog/runs'
        && url.searchParams.get('limit') === '25'
        && response.status() === 200
    })
    await page.getByRole('button', { name: 'Activity', exact: true }).click()
    await activityPage
    await page.getByRole('button', { name: 'Runs', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible()
    const runRow = page.locator('.control-run-row').first()
    await expect(runRow.getByText('completed', { exact: true })).toBeVisible({ timeout: 15_000 })
    await runRow.click()
    await expect(page.locator('code').getByText(startedRun.runId, { exact: true })).toBeVisible()
  })

  test('shows a clear offline state when the selected local gateway cannot be reached', async ({ page }) => {
    await page.goto(consoleUrlWithGateway('http://127.0.0.1:9'))
    await expect(page.getByRole('heading', { name: 'Local gateway unavailable' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible()
  })

  test('keeps Activity and dialog controls usable at a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await finishFirstRun(page)

    await page.getByRole('button', { name: 'Activity', exact: true }).click()
    const activityNavigation = page.getByRole('navigation', { name: 'Activity views' })
    for (const name of ['Runs', 'Tools', 'Approvals', 'Usage', 'Artifacts', 'Audit', 'Memory']) {
      await expect(activityNavigation.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false)

    const toolHistory = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/runlog/tool-calls'
        && url.searchParams.get('limit') === '25'
        && response.status() === 200
    })
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
    await toolHistory
    await expect(page.getByRole('heading', { name: 'Tool calls', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Memory', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible()

    const correctMemory = page.getByRole('button', { name: 'Correct', exact: true })
    await correctMemory.click()
    const correctionDialog = page.getByRole('dialog', { name: 'Correct memory' })
    await expect(correctionDialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await correctionDialog.getByRole('textbox').first().fill('Weekly intake handoff was completed.')
    const corrected = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return /\/memory-history\/memory_[A-Za-z0-9_-]+\/correct$/.test(url.pathname)
        && response.status() === 200
    })
    await correctionDialog.getByRole('button', { name: 'Save correction', exact: true }).click()
    await corrected
    await expect(page.getByText('Memory correction saved.', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const deletionDialog = page.getByRole('dialog', { name: 'Delete memory' })
    const deleted = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return /\/memory-history\/memory_[A-Za-z0-9_-]+\/delete$/.test(url.pathname)
        && response.status() === 200
    })
    await deletionDialog.getByRole('button', { name: 'Delete memory', exact: true }).click()
    await deleted
    await expect(page.getByText('Memory deleted.', { exact: true })).toBeVisible()
    await expect(page.getByText('No memory recorded', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false)

    await page.getByRole('button', { name: 'Workspaces', exact: true }).click()
    const opener = page.getByRole('button', { name: 'New client', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Add new client' })
    const close = dialog.getByRole('button', { name: 'Close' })
    await expect(close).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => page.evaluate(
      () => Boolean(document.activeElement?.closest('[role="dialog"]')),
    )).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })
})
