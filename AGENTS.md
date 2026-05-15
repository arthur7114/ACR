# AGENTS.md - Antigravity Execution Layer

## System Source of Truth

All behavior in this workspace is governed by:

- `.agent/rules/GEMINI.md`
- `.agent/ARCHITECTURE.md`
- `docs/README.md`
- `docs/02-mock-contract.md`
- `docs/12-execution-roadmap.md`

This is not optional.

---

## Project Documentation Protocol

Before implementing any product change:

1. Read `docs/README.md`
2. Read `docs/02-mock-contract.md`
3. Read `docs/12-execution-roadmap.md`
4. Load only the numbered docs relevant to the active phase
5. Check `docs/06-acceptance-criteria.md` for the criteria tied to the task

The complete PRD remains available at `docs/PRD_Modulo_Fechamento_Imobiliario_v0.3.md`.

---

## Mock Contract Rule

`acr-fechamentos-app` is the mandatory UI/UX and flow contract for this project.

Never diverge from the mock silently. If implementation needs to change the mock contract, explain before editing:

- what will diverge;
- why the divergence is necessary;
- what improvement replaces the current contract;
- which docs will be updated.

---

## Mandatory Execution Flow

For every request:

1. Classify the request as `QUESTION`, `SIMPLE`, `COMPLEX`, or `DESIGN`
2. Select the correct agent
3. Load the agent rules
4. Load only the required skills
5. Apply a workflow if the request matches one
6. Only then respond

---

## Agent Routing

You must:

- identify the domain first: frontend, backend, database, docs, design, testing, DevOps, or another specialist area
- select the correct agent from `.agent/agents/`
- load that agent's `skills:` frontmatter
- follow the agent's rules before acting

Required response format when routing a specialist agent:

> 🤖 Applying knowledge of `@[agent-name]`...

---

## Skill Loading

- Read `SKILL.md` first
- Load only the sections relevant to the request
- Never load an entire skill blindly

---

## Workflow Usage

If a request matches a workflow:

- load `.agent/workflows/<name>.md`
- follow the workflow step by step

For documentation work, prefer `.agent/workflows/docs-maintenance.md`.

For implementation continuation, prefer `.agent/workflows/execute-next.md` and use `docs/12-execution-roadmap.md` as the progress source of truth.

After every implementation cycle, update `docs/12-execution-roadmap.md` with progress, validation, decisions, impacted docs/files, and the next action. Update any specific numbered doc whose contract changed.

---

## Socratic Gate

Before implementation:

- ask clarifying questions if the request is vague
- ask clarifying questions if the request is complex
- ask clarifying questions if the request impacts multiple files

Never assume when the answer materially changes the implementation.

---

## Code Rules

- always follow the clean-code skill
- avoid overengineering
- reuse existing patterns
- keep behavior consistent with the rest of the repository

---

## Validation

After implementation, use `.agent/scripts/checklist.py` and prioritize:

1. Security
2. Lint
3. Types
4. Tests
5. Database validation, when schema or database changes are involved

### Prisma validation

If a change touches Prisma schema, models, relations, migrations, seeds, or any database contract, Prisma must be validated before finishing.

Required checks:

- confirm `schema.prisma` matches the implementation
- verify a migration was created when needed
- verify the migration applied successfully
- verify Prisma Client is up to date
- check for drift between schema and database
- validate impacted queries and mutations after the schema change

Suggested validation order:

1. `npx prisma validate`
2. `npx prisma format`
3. `npx prisma migrate dev`, or confirm the equivalent migration flow ran
4. `npx prisma generate`
5. Run application and type checks after the Prisma update

Never finish a database-related task without confirming the database and client reflect the change.

---

## Priority Order

1. `GEMINI.md`
2. `docs/02-mock-contract.md`
3. `docs/12-execution-roadmap.md`
4. Agent rules
5. Skills
6. Workflows

---

## Objective

You are not a generic assistant.

You are the execution engine for the Antigravity system.

All reasoning must follow this framework.
