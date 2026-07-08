# Provider Logo and Model Catalog Sources

Date: 2026-07-07

This registry tracks provider identity sources for the console UI. Use official brand assets where available. If only third-party icon repositories are available, use them as temporary development placeholders and keep the source marked as provisional.

## Model Catalog

- OpenRouter models API: https://openrouter.ai/docs/guides/overview/models
  - Status: official documentation.
  - Notes: documents a public `data` array response with standardized model metadata.
- OpenRouter API reference: https://openrouter.ai/docs/api/reference/overview
  - Status: official documentation.
  - Notes: links OpenAPI YAML and JSON specs.

## Provider Runtime Status

- OpenRouter: first-class backend provider ID `openrouter`.
- OpenAI: first-class backend provider ID `openai`.
- Codex: first-class backend provider ID `codex`, backed by the official `@openai/codex` CLI in Docker with a writable Docker `CODEX_HOME` volume. ChatGPT-auth sessions should be injected intentionally through an operator-owned local compose override, not by a public default bind mount. The default model is `codex-auto`, which lets the CLI choose the account-supported Codex model. The old OpenAI Responses `codex-proxy` path is available only when explicitly requested with `MAINSPRING_CODEX_TRANSPORT=openai-responses-codex-proxy`.
- Anthropic, Gemini, Mistral, Groq, DeepSeek: visible as setup/catalog choices; direct adapters are not yet implemented and should route through OpenRouter until direct backend provider IDs exist.

## Provider Marks

| Provider | Source | Status | Use in UI |
| --- | --- | --- | --- |
| OpenAI / Codex | https://openai.com/brand/ | Official brand guidelines | Use OpenAI mark for OpenAI and Codex provider paths unless an official Codex-specific mark is published. |
| OpenRouter | https://openrouter.ai/about | Official product site | Use site/app mark when available from the app shell or favicon; no official downloadable brand kit found yet. |
| Anthropic / Claude | https://www.anthropic.com/company | Official company site | Use official site mark; no public downloadable kit found in this pass. |
| Google / Gemini | https://design.google/library/gemini-ai-visual-design | Official Google Design article | Use Gemini mark only under Google brand usage limits; prefer text label if asset permission is unclear. |
| Mistral | https://mistral.ai/brand/ | Official brand kit | Download and use the official Mistral brand kit assets. |
| Groq | https://groq.humain.ai/brand-guidelines/ | Official brand guidelines | Use official Groq-approved language/assets from the brand page. |
| DeepSeek | https://github.com/deepseek-ai/DeepSeek-LLM/blob/main/images/logo.svg | Official GitHub organization repository | Use repository SVG as provisional official asset for DeepSeek-branded models. |

## Local Console Assets

Assets are stored under `apps/console/src/assets/providers/`.

| Provider | Local asset | Source URL used |
| --- | --- | --- |
| OpenRouter | `openrouter.ico` | https://openrouter.ai/favicon.ico |
| Anthropic | `anthropic.png` | https://cdn.prod.website-files.com/67ce28cfec624e2b733f8a52/681d52619fec35886a7f1a70_favicon.png |
| Google Gemini | `gemini.svg` | https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg |
| Mistral | `mistral.ico` | https://mistral.ai/favicon.ico |
| Groq | `groq.svg` | https://groq.com/favicon.svg |
| DeepSeek | `deepseek.ico` | https://www.deepseek.com/favicon.ico |
| OpenAI / Codex | `openai.svg` | https://commons.wikimedia.org/wiki/Special:Redirect/file/OpenAI%20logo%202025.svg |

OpenAI direct favicon and common CDN asset URLs returned 403/404 during this pass, so the local OpenAI/Codex mark uses the public SVG mirror while the primary provenance remains the OpenAI brand guideline page above.

## Trademark Guardrails

- Provider marks are identifiers only; the Mainspring brand must remain visually primary.
- Do not recolor provider logos unless their guidelines allow it.
- Do not imply sponsorship, certification, resale partnership, or endorsement.
- If a provider source has no public asset license, show a text label until an approved asset is added.
