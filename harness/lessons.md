# Lessons

## AGE-105 — Credit preflight for long token runs

- Source: AGE-104
- Trigger condition: A long-context request was started without confirming the token budget against available credits.
- Rule: Before any long-context run, complete a credit-aware preflight comparing estimated token demand with available credits for the chosen model.
- Enforcement: If preflight fails, reduce token demand or use a lower-cost model before execution.
