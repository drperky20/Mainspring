# Cost Model

Mainspring tracks cost at the same level it tracks operational truth: organization, client, workspace, agent, session, turn, and run event.

## Per-Run Formula

```text
run_cost =
  input_tokens / 1_000_000 * model_input_price
+ cached_input_tokens / 1_000_000 * cached_input_price
+ output_tokens / 1_000_000 * model_output_price
+ embedding_tokens / 1_000_000 * embedding_price
+ sandbox_seconds * (vcpu_count * vcpu_second_price + memory_gb * gb_second_price)
+ artifact_gb_month * storage_gb_month_price
+ log_gb * log_ingest_price
+ retry_count * average_retry_overhead
```

## Monthly Formula

```text
monthly_cost =
  fixed_platform_cost
+ sum(run_cost)
+ database_cost
+ object_storage_cost
+ queue_cache_cost
+ observability_cost
+ bandwidth_cost
```

## Deployment Bands

| Scale | Shape | Typical monthly infrastructure before model tokens |
| --- | --- | --- |
| Local single user | Laptop or desktop, local Postgres/Docker, local files | $0-$30 |
| Small hosted beta | One API, one console deployment, one worker, managed Postgres, object storage | $75-$300 |
| 100 active users | Multiple workers, warm sandbox pool, managed Postgres, Redis/SQS, object storage, observability | $750-$3,500 |
| 1,000 active users | Autoscaled workers, separated runner pools, stronger DB tier, larger log budget, microVM pool for risky workloads | $6,000-$35,000+ |

Model tokens usually dominate once users are active. Sandbox time dominates browser-heavy or code-heavy agents. Logs dominate when raw tool output is retained without redaction and sampling.

## Cost Controls

- Cache stable prompt prefixes and workspace instructions.
- Summarize old run traces instead of replaying full logs into context.
- Cap per-run model tokens, tool calls, retries, sandbox minutes, and artifact size.
- Use cheaper models for classification, routing, summarization, and low-risk tool output repair.
- Record cached input tokens separately from fresh input tokens.
- Put budget limits on organizations, clients, agents, and turns.
- Store large artifacts in object storage and keep Postgres rows as indexes.
- Redact and sample verbose logs before shipping them to paid observability systems.
