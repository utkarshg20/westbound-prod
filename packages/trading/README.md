# Lane C — Trading (Phase 2+)

Phase 1 provides **schema only** in `infra/supabase/migrations/20260517000002_trading_schema.sql`.

## Rules

- No imports from `@westbound/studio` or `@westbound/sync-engine`.
- Use `trading.*` tables only.
- Share: Supabase instance, Redis, logging patterns from `@westbound/platform`.

## Future package layout

```
packages/trading/
  src/
    accounts.ts
    execution.ts    # not implemented in phase 1
    strategies.ts
```

When adding execution, use separate worker queue name `westbound-trading-jobs`.
