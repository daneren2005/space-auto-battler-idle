# Agent Instructions

- Read [docs/architecture.md](docs/architecture.md) first for a map of the codebase (structure, ECS/worker model, extension points) before exploring source files.
- Keep the documentation up to date: whenever you make an architectural change (new/removed system, component, entry point, data-flow or convention change), update [docs/architecture.md](docs/architecture.md) in the same change so it never goes stale.
- Keep comments concise and rare. Only comment non-obvious things: a hidden gotcha, an invariant, or the reason code must work a certain way. Never restate what the code already says, and don't narrate what a function does when its name and body make it clear. Prefer one short line over a paragraph.
- Never cast types to `any`
- Always check there are no lint or type errors after editing a file
- Do not ever use @ts-nocheck
- Use "npm run type-check" and "npm run lint" after changes to verify type and formatting is correct
- Most changes should add or update tests
- Do not run git commands
- Do not modify NOTES.md
