---
name: leonardo-silva-code-style-skill
description: Apply this skill when implementing or modifying code in any repository and any programming language. Preserve the existing architecture, naming, directory layout, coding conventions, and test approach of the target project while delivering minimal, safe, and well-validated changes.
---

# Cross-Project Code Style Skill

## Establish Local Context First
- Inspect repository structure, key modules, and existing patterns before editing.
- Identify where business logic, transport/API logic, persistence, and integration concerns currently live.
- Mirror current conventions instead of introducing a personal or framework-default style.

## Preserve Architecture Boundaries
- Keep responsibilities separated according to the project’s current architecture.
- Keep entrypoint layers thin and delegate complex behavior to domain/application layers.
- Keep data access and infrastructure concerns isolated from business rules.
- Add new files to existing directories and naming patterns unless an explicit refactor is requested.

## Match Coding Style of the Repository
- Follow existing naming, formatting, and file organization patterns.
- Prefer small, composable functions or methods with explicit intent.
- Reuse established abstractions before creating new ones.
- Avoid broad rewrites when a scoped change is sufficient.

## Language and Paradigm Preferences
- Prioritize solutions in this order when the stack is flexible: `Node.js`, `Golang`, `Kotlin`, `Scala`.
- Prefer functional style where it fits the language and existing codebase: pure functions, immutability by default, explicit data transformations, and minimized shared mutable state.
- In multi-paradigm languages, favor declarative/functional constructs over deeply imperative flows when readability is improved.
- Keep pragmatism over dogma: if strict functional style reduces clarity or conflicts with project conventions, follow the repository’s established approach.

## Keep Changes Safe and Backward-Compatible
- Preserve existing public interfaces unless change is explicitly requested.
- Keep error handling consistent with project conventions.
- Avoid hidden side effects and non-obvious behavior changes.
- If behavior must change, update related callers, docs, and tests in the same change.

## Testing Strategy
- Follow the project’s current test style (unit, integration, end-to-end, or mixed). But always prefer integration tests that cover observable behavior over implementation details.
- Add or update tests for every behavior change and bug fix.
- Keep tests deterministic, readable, and focused on observable behavior.
- Mock only boundaries that represent external dependencies or expensive side effects.

## Data, Migrations, and Contracts
- Apply existing migration/versioning conventions for schema or contract changes.
- Keep API, schema, and event contracts consistent unless explicitly versioned/changed.
- Add indexes or performance safeguards when introducing new query paths.

## API Documentation (Swagger/OpenAPI or Equivalent)
- If the project language/framework supports Swagger/OpenAPI or a similar API spec tool, document every API endpoint and keep docs in sync with implementation.
- Include request/response schemas, status codes, error payloads, and authentication requirements.
- Prefer the documentation approach already used by the repository (annotations, decorators, code-first, spec-first, or equivalent).
- When changing an endpoint contract, update the API documentation in the same change.

## Documentation and Operational Consistency
- Update relevant documentation when behavior or usage changes.
- Preserve existing logging, metrics, and tracing conventions.
- Keep configuration style consistent with the current environment and deployment patterns.

## Review Checklist Before Finishing
- Change scope is minimal and aligned with the request.
- Architecture boundaries remain clear.
- Naming, structure, and formatting match the repository.
- Tests were added/updated and relevant checks were run.
- No unrelated refactors or style churn were introduced.
