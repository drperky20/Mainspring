# Context Codec

Mainspring's ContextCodec is a model-aware context projection layer. It keeps
source blocks canonical and recoverable, then chooses a cheaper representation
for the model under a fidelity budget.

The design treats image compression as a memory tier, not as a text replacement.
Lossy projections are safe only because exact source bytes remain behind a
`recoverableId` and can be rehydrated when the agent needs to edit, quote,
compare hashes, inspect tool arguments, or answer an exact question.

## Implemented Layer

The first runtime layer lives in `src/context` and exports:

- `ContextCodec`: classifies blocks, chooses encodings, estimates token ROI, and
  emits deterministic `context.encoded` payloads.
- `compileContextModelSpec`: compiles provider/model metadata into a
  `VisionModelProfile`, including frontier presets and text-only failover.
- `ContextPromptCompiler`: assembles encoded blocks into a provider-agnostic
  prompt bundle with text parts, image projection parts, rehydrate hints, and a
  text fallback.
- `VisionModelProfile`: per-model image cost, resize rule, tokenizer, prompt
  cache, and calibration metadata.
- `InMemoryRecoverableContextStore`: canonical byte storage for tests and local
  planners.
- `createContextRehydrateTool`: runtime tool for exact byte recovery by
  `recoverableId`.
- `extractPrecisionFacts`: sparse precision token extraction for paths, hashes,
  IDs, versions, counts, commands, and dotted symbols.
- `serializeContextPromptForProvider`: converts compiled prompt parts into
  provider-shaped payloads for OpenAI Responses, OpenAI-compatible chat, xAI,
  Anthropic Messages, Gemini interactions, or text-only fallback.
- `planContextRehydration`: decides when compressed blocks must be rehydrated
  before exact operations.
- `ContextRendererRegistry`: extension point for concrete PNG/WebP renderers.
- `createDeterministicSvgContextRenderer`: dependency-free SVG text renderer for
  deterministic canary-bearing image artifacts.
- `serializeRenderedContextPromptForProvider`: renders image projections and
  serializes provider payloads with data URI image bindings.
- `InMemoryContextUsageLedger`: records savings, rehydrate frequency,
  corrections, and acceptance rates by model profile and encoding.
- `analyzeContextBudget` and `rankContextBudgetDowngrades`: advisory budget
  checks for image count, visual tokens, prompt tokens, and downgrade order.
- `planContextPromptCache`: prompt-cache eligibility decisions for compiled
  context parts.
- `fetchProviderModelSpec`: provider metadata fetch hook, currently with
  deterministic OpenRouter Models API conversion and safe stubs elsewhere.
- `buildContextSpanIndex`: builds line anchors and byte spans for targeted
  rehydration of text records.
- `reviewContextBlockSecurity` and `sanitizeFactsForTrustBoundary`: exactness,
  taint, credential-like text, and prompt-injection posture helpers.
- `inspectCompiledContext`: UI-ready inspection rows for compressed blocks,
  facts, image pages, savings, and recoverable ids.
- `runContextCalibrationTournament`, `runContextOcrCheck`, and
  `createSyntheticContextEvalCorpus`: local calibration, visual-canary, and
  synthetic-eval harnesses.
- `recommendContextPlannerAdjustments`: ledger-based planner recommendations.

The public encoding union is:

```ts
type ContextEncoding =
  | { kind: 'text'; reason: 'exact' | 'recent' | 'policy' }
  | { kind: 'image'; level: 'readable' | 'dense' | 'ultra-dense'; recoverableId: string }
  | { kind: 'image+factsheet'; recoverableId: string; facts: PrecisionFact[] }
  | { kind: 'summary+rehydrate'; summary: string; recoverableId: string }
```

Every block is stored in the recoverable store before projection. The
`context.encoded` RunEvent payload contains ids, hashes, byte counts, encoding
metadata, facts, summaries, and image layout metadata. It does not carry the
full canonical source text.

## Encoding Policy

The codec keeps these blocks as exact text:

- Current user intent.
- System prompts and policy surfaces.
- Tool arguments.
- Approval records.
- Patch hunks and file contents before edits.
- Blocks marked `exactSensitive`, `risk: 'exact'`, `risk: 'secret'`, or
  `risk: 'policy'`.

The codec prefers `image+factsheet` for old tool results, logs, search output,
and long docs when the selected model profile estimates positive savings. The
image tier carries structure and gist; the factsheet carries sparse precision
tokens such as paths, hashes, ticket IDs, versions, counts, and commands.

The codec uses `summary+rehydrate` when the selected profile is text-only, image
cost is unavailable, or the estimated savings are too small.

Tainted blocks and binary-like byte blocks also force `summary+rehydrate`.
Tainted content should remain navigational until exact source is explicitly
rehydrated, and binary content keeps its media type so rehydration returns
base64 instead of lossy UTF-8 text.

## Model Profiles

Model profiles are deliberately separate from the planner because Anthropic and
OpenAI price and resize images differently, Gemini has its own image token
rules, and xAI currently documents image prompts without publishing an exact
image-token formula.

Current built-in profiles include:

- Anthropic high-resolution profiles using 28px visual patches, high-resolution
  long-edge and visual-token limits, and `anthropic-v5` tokenizer labeling.
- Anthropic standard profiles using the standard 28px patch limits.
- OpenAI GPT-5 tile profiles using detail-aware 512px tile math.
- OpenAI patch profiles for GPT-5.5, GPT/Codex, and mini/nano-style models
  using 32px patch budgets and model multipliers.
- Gemini 3 media-resolution profiles using low, medium, high, and ultra-high
  token tiers.
- Gemini tile profiles for earlier Gemini image-token behavior.
- xAI Grok frontier profiles using conservative declared fixed-detail costs
  because xAI documents image-token billing but not a public formula.
- OpenRouter routed-model profiles that infer the upstream provider family from
  model IDs such as `anthropic/claude-*`, `openai/gpt-*`, `google/gemini-*`, or
  `x-ai/grok-*`.
- A text-only fallback profile that forces `summary+rehydrate`.

The current formulas are based on the provider docs for
[Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision)
and
[OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision).
Gemini image rules come from
[Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding),
[Gemini token counting](https://ai.google.dev/gemini-api/docs/tokens), and
[Gemini media resolution](https://ai.google.dev/gemini-api/docs/media-resolution).
xAI behavior is grounded in
[xAI image understanding](https://docs.x.ai/developers/model-capabilities/images/understanding)
and [xAI model pricing](https://docs.x.ai/developers/models/grok-4.3).
OpenRouter behavior is grounded in
[OpenRouter image inputs](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding),
[OpenRouter model metadata](https://openrouter.ai/docs/guides/overview/models), and
[OpenRouter model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks).
Re-check those docs before changing default profile constants.

The profile shape already has calibration curves for exactness by cell size,
gist accuracy by density, and confabulation risk. The current curves are
explicitly uncalibrated placeholders so the tournament layer can replace them
with measured per-model results.

## Provider Spec Compilation

The codec can start from a provider model record instead of a hard-coded
profile:

```ts
const model = compileContextModelSpec({
  providerId: 'openrouter',
  modelId: 'anthropic/claude-fable-5',
  inputModalities: ['text', 'image'],
  contextWindowTokens: 200_000,
})
```

The compiler accepts provider IDs for `openai`, `anthropic`, `google`, `xai`,
`openrouter`, and custom providers. It also accepts a custom
`imageTokenization` rule when the provider returns richer metadata than the
built-in preset knows.

For OpenRouter, `providerModelSpecFromOpenRouterModel` converts a Models API
record into `ProviderModelSpec` by reading the model ID, input/output
modalities, tokenizer, context length, cache-pricing hints, and provider
metadata.

`fetchProviderModelSpec` can fetch the OpenRouter Models API and return the
matching `ProviderModelSpec`. Provider adapters can use that before compilation
when they want live metadata instead of only built-in frontier presets. For
providers without a metadata fetcher, it returns a caller-supplied stub rather
than inventing unsupported details.

For OpenRouter, the compiler treats OpenRouter as a routing layer rather than a
single vision model. If the routed model ID exposes an upstream family, the
compiled profile inherits that family's token math. If OpenRouter ultimately
falls back to another model at request time, the caller should recompile using
the returned model ID before reusing historical ROI data.

If a model cannot prove vision support, or if it declares image input without a
usable image-token rule, the compiler returns a text-only profile. That failover
preserves summaries, factsheets, and rehydrate IDs while emitting no image
parts.

## Prompt Compilation

`ContextPromptCompiler` combines model compilation, block encoding, and
provider-agnostic prompt assembly:

```ts
const compiled = new ContextPromptCompiler().compile({
  providerId: 'google',
  modelId: 'gemini-3.5-flash',
  blocks,
})
```

The output has:

- `parts`: ordered text and image projection parts for an adapter to serialize.
- `textFallback`: a single text prompt usable for non-vision or degraded lanes.
- `requiredTools`: currently `context.rehydrate`.
- `warnings`: model-spec or failover warnings.
- `stats`: estimated text tokens, visual tokens, savings, and image-part count.

Adapters should serialize image parts according to the provider surface:

- OpenAI Responses: text parts plus `input_image` objects.
- OpenAI-compatible chat and xAI: user `content` arrays with `input_text` and
  `input_image`.
- Anthropic Messages: image blocks before related text when possible.
- Gemini Interactions: text items and image items with optional resolution.
- Text-only models: use `textFallback`.

The prompt compiler always includes rehydrate hints beside lossy projections.
This is the safety valve that lets images carry cheap gist without pretending
the model can quote tiny text perfectly.

`serializeContextPromptForProvider` is the adapter-facing bridge from compiler
output to request payloads. It keeps rendered image bindings separate from the
payload so a provider adapter can attach URLs, file handles, or base64 assets
without losing the source `recoverableId`.

`analyzeContextBudget` checks compiled prompts against image count, visual-token,
and estimated prompt-token limits. `rankContextBudgetDowngrades` returns image
blocks ordered by cheapest downgrade first so adapters can shed visual context
before failing a run.

`planContextPromptCache` marks deterministic exact context, summaries,
factsheets, and image projections as cache-eligible when the profile supports
prompt caching. Task-specific instructions remain uncached.

## Auto-Rehydrate Policy

Use `planContextRehydration` before exact operations. Rehydration is required
for lossy blocks when the intended operation is quoting, editing, comparing
hashes, path-sensitive work, approvals, or security analysis. It is recommended
for compressed blocks that carry precision facts or for summaries that are not
source text.

The policy intentionally treats compressed context as a navigation aid. Exact
bytes remain available through `context.rehydrate`, and the harness should route
there before making claims that depend on byte-level recall.

## RunLog Integration

`RunLogExecutor` accepts an optional `contextCodec`. When supplied, it emits
idempotent `context.encoded` events for the current user intent and system prompt
before provider execution:

```ts
new RunLogExecutor({
  store,
  providerRouter,
  contextCodec: new ContextCodec({ store: recoverableContextStore }),
})
```

The event is `artifact-only` by default because facts and summaries can contain
paths or other precise operational material. Existing runs are unchanged unless
a codec is configured.

`projectRunLogRun` includes a `contextEncodings` array so replay and UI layers
can inspect the emitted context plan without scanning generic event payloads.

## Rehydration

Register `createContextRehydrateTool(store)` with the runtime tool registry to
let agents request exact bytes:

```ts
const tools = [
  createContextRehydrateTool(recoverableContextStore),
]
```

Tool input:

```json
{
  "recoverableId": "ctx_...",
  "startLine": 20,
  "endLine": 40,
  "maxBytes": 65536
}
```

The tool supports byte spans or line spans. Large responses are capped unless
the caller asks for a bounded span.

`buildContextSpanIndex` can derive line anchors and byte offsets from a
recoverable text record so prompts and UIs can request exact spans rather than
rehydrating whole historical blocks.

The tool also accepts optional governance settings: `requireReason` forces the
caller to explain why exact bytes are needed, `maxBytesDefault` and
`maxBytesLimit` bound output size, and `audit` receives completed or failed
rehydration events for RunLog or operator review.

## Renderer Boundary

This first layer does not bundle a native PNG/WebP raster font renderer. Image encodings return
deterministic image-page descriptors with dimensions, detail mode, visual token
estimate, density tier, canary, and recoverable id. A renderer can use those
descriptors plus the recoverable store to produce provider-ready PNG/WebP pages.

`ContextRendererRegistry` defines that boundary. Renderers receive the
projection plus canonical recoverable bytes and return a concrete artifact with
media type, renderer id, font id, density, dimensions, canary, and bytes.

`createDeterministicSvgContextRenderer` is the first concrete renderer. It emits
`image/svg+xml` artifacts with canaries, recoverable ids, source hashes, and
monospace text layout. It is dependency-free and useful for local verification
and provider paths that accept SVG/data URI image input. PNG/WebP raster output
remains a separate renderer so native image dependencies do not leak into the
compiler layer.

`serializeRenderedContextPromptForProvider` combines compiled prompt parts,
recoverable storage, the renderer registry, and provider serialization. The
result is an adapter-facing bundle containing rendered artifacts plus a
provider-shaped payload whose image references are attached as data URIs.

That boundary is intentional:

- The font tournament should be per model, not global.
- Some models prefer crisp bitmap glyphs; others may do better with
  anti-aliased strokes.
- Raster output needs golden-image inspection and provider-specific calibration,
  which should not be hidden inside the first planner API.

`InMemoryContextUsageLedger` is the first feedback-loop contract. It records
estimated savings, visual spend, rehydrate rate, corrections, and acceptance by
model/profile/encoding so a future planner can lower density, force summaries,
or disable image compression when a model performs poorly.

## Completed Production Roadmap

The retired production roadmap is now implemented in code rather than tracked as
a living backlog. The completed layer includes canonical storage, exactness
guards, tainted-block degradation, text failover, provider/model compilation,
OpenRouter routed-model reconciliation, provider payload serialization,
rendered provider bundles, deterministic SVG rendering, prompt-cache planning,
budget analysis, rehydrate governance, usage-ledger feedback, fact ranking,
binary/media routing, span indexes, inspection reports, security posture
helpers, pagination, calibration and OCR harnesses, font/layout tournaments,
cross-model profile defaults, learned planner recommendations, and a synthetic
eval corpus.

Native PNG/WebP rendering and provider-specific live calibration can still be
added as renderer or adapter plugins, but the roadmap artifact itself is no
longer a source of truth.
