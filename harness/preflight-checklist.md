# Harness Preflight Checklist

Run this checklist before any long-context model execution.

## Long-context trigger

Treat a run as long-context when either condition is true:
- Requested context window is greater than 120000 tokens.
- `max_output_tokens` is greater than 12000.

## Credit preflight (required)

1. Estimate total requested tokens:
   - `estimated_total_tokens = prompt_tokens + max_output_tokens`
2. Check available credits/budget for the target model before execution.
3. If credits are insufficient for the estimate, do not run.
4. Mitigate by one of:
   - Reduce `max_output_tokens`.
   - Reduce prompt/context size.
   - Switch to a lower-cost model.
5. Record the decision in the issue comment before launching the run.

## Launch gate

Do not start long-context execution until all required preflight steps above are complete.
