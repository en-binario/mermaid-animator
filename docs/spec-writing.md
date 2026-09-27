# Spec writing

> **Applies to:** every capability spec in `openspec/specs/` and every spec delta in `openspec/changes/`
> **Enforced by:** `openspec validate --strict` and review (§11)
> **Project rules:** [`openspec/config.yaml`](../openspec/config.yaml) `rules.specs` and `rules.tasks`

This standard governs how a requirement and its scenarios are written. A spec has two readers: a person reviewing a
proposal, and an agent turning the spec into tests and code. Both need every outcome stated exactly and every
combination of conditions visible.

The central rule is: **when an outcome depends on two or more conditions, write a decision table, not a list of
WHEN/THEN scenarios** (§4). Typical conditions in this extension are a setting value, a camera mode, the playback state
(playing, paused, at step 0), the diagram engine (native or Mermaid) and the view (sequence, topology, split).

Existing specs conform the next time a change edits them. §9 explains what a delta can and cannot change once a
capability has been archived.

## 1. Anatomy of a capability spec

```markdown
## Purpose
One or two sentences: what this capability is for.

**Non-goals:**
- Behaviour X, owned by `<other-capability>`.

## ADDED Requirements

### Requirement: <observable behaviour, stated as a sentence>
The system SHALL …

**Constraints:**
- …

#### Scenario: <unique name>
…
```

| Part | Rule |
|---|---|
| `## Purpose` | Written only in the delta that **creates** the capability. A later delta cannot change it; edit `openspec/specs/<capability>/spec.md` directly instead |
| `**Non-goals:**` | Goes inside `## Purpose`. Never add a separate `## Non-Goals` section: archive copies only the Purpose from a creating delta and drops any other section. Each bullet names the capability that owns the excluded behaviour |
| Requirement | One observable behaviour: what the user sees or does, what a setting changes, or which message crosses the host and webview boundary. Never a class, function, library or file path |
| Scenario | At least one per requirement. Every failure path has its own scenario or table row |

## 2. RFC 2119 keywords

Normative keywords are uppercase, including their negation: **MUST**, **MUST NOT**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **MAY**. Never write `SHALL not`.

- The requirement body contains SHALL or MUST (`openspec validate --strict` fails otherwise).
- A `SHOULD` names its permitted exception in the same sentence. If it has none, it is a `MUST`.
- Scenarios and table cells describe outcomes, not obligations, so they contain no RFC keywords.

## 3. Choosing the form

Decide the form before writing the scenarios. Prefer a table wherever one is possible.

| The outcome depends on | Form |
|---|---|
| Two or more independent conditions (settings, modes, playback state, engine, view) | **Decision table** (§4) |
| Whether an optional or newly added input is present (a new setting, annotation or message field) | **Decision table** with that input as a condition column |
| A single condition | GIVEN/WHEN/THEN (§5) |
| A sequence over time (play, then zoom, then resume) | GIVEN/WHEN/THEN with `AND WHEN` / `AND THEN` (§5) |

Reasons for choosing a table:

- **No combinatorial blind spots.** A missing combination shows up as a missing row that a reviewer can see.
  Scattered WHEN/THEN scenarios hide it.
- **Direct test mapping.** Each row becomes one case of a table-driven test (§10).
- **Schema compatible.** OpenSpec parses only the `### Requirement:` and `#### Scenario:` headers. A table under a
  scenario header passes `openspec validate --strict` and survives `openspec archive` byte for byte, which was verified
  with OpenSpec 1.13.2.

## 4. Decision tables

### Rules

1. The table sits directly under a `#### Scenario:` header (exactly four `#`), and the scenario is named `… matrix` or `… table`.
2. **The first column is `#`** and holds a stable row id: `R1`, `R2`, … Ids are never reused or renumbered, so a removed row leaves a gap. Tasks and reviews cite rows by id.
3. **Condition columns come next, then outcome columns**, then an optional `Notes` column last.
4. **One row per distinct combination.** Cover every combination. Collapse rows only with an explicit `*Any*` (the condition does not matter) or `*N/A*` (the condition does not apply). **Leave no blank cells.**
5. **Outcome values are bold** (`**Shown**`, `**Paused**`, `` **`annotation/invalid-arguments`** ``) so they stand out from conditions at a glance.
6. **Short-circuit rows come first**, in the order the implementation checks them. For example, a setting that is `off` comes before any row that depends on the view.
7. The requirement text stays normative and states the rule. The table illustrates it and MUST NOT contradict it. If they disagree, the requirement text is wrong.

### Example: a setting and a view condition

```markdown
### Requirement: Arrow-end name tags
`mermaidAnimator.display.arrowEndNames` SHALL accept `off`, `auto` (default) and `always`. Tags SHALL name the
sender at the arrow's start and the receiver at its end, and SHALL be shown only for messages of the current step.

#### Scenario: Arrow-end tag matrix

| # | `arrowEndNames` | Message's step | Participant's header in view | Tag for that participant |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `off` | *Any* | *Any* | **Hidden** |
| R2 | *Any* | Played or unplayed | *Any* | **Hidden** |
| R3 | `auto` | Current | Yes | **Hidden** |
| R4 | `auto` | Current | No | **Shown** |
| R5 | `always` | Current | *Any* | **Shown** |
```

Prose scenarios for the same behaviour usually cover `always` and one `auto` case. The table forces every setting value
to appear, and that is where a wrong default or a missed `off` shows up.

### Example: an optional input

```markdown
#### Scenario: Initial overview matrix

| # | `@animator overview=` | `playback.initialOverview` | Step 0 shows |
| :--- | :--- | :--- | :--- |
| R1 | Absent | `true` (default) | **The complete diagram** |
| R2 | Absent | `false` | **The pre-reveal state** |
| R3 | `false` | *Any* | **The pre-reveal state** |
| R4 | `true` | *Any* | **The complete diagram** |
```

Rows R1 and R2 describe the behaviour when the annotation is absent. Because the annotation is a column, the table
states that case without a separate "without the annotation" scenario.

### When not to use a table

- **One condition:** use GIVEN/WHEN/THEN. A one-column table is noise.
- **A sequence over time:** use GIVEN/WHEN/THEN.

## 5. GIVEN, WHEN, THEN

Every bullet under a `#### Scenario:` header that is not a table starts with `**GIVEN**`, `**WHEN**`, `**THEN**` or
`**AND**`. An event sequence continues with `**AND WHEN**` / `**AND THEN**`. Put the state first, the trigger second and
the outcome last. Never bury a state inside the trigger.

```markdown
#### Scenario: Resume after zooming during playback
- **GIVEN** autoplay is running with following on, at step 6
- **WHEN** the user zooms to 150 % with `Ctrl` + wheel
- **THEN** playback is paused and following is still on
- **AND WHEN** the user presses `Space`
- **THEN** the camera frames step 6 at 150 % before playback continues
```

## 6. Outcomes and errors

Every outcome names a value a test can check. Examples:

- the step counter (`0 of 12`);
- the zoom percentage (`120 %`);
- the pressed state of a toolbar button;
- an element's opacity at a given time on the timeline;
- the exact message sent across the host and webview boundary.

Failure outcomes name what this extension actually produces:

| Failure | Name in the spec |
|---|---|
| A problem in the diagram source | The diagnostic **code and severity** shown in the Problems panel (`annotation/invalid-arguments`, error), and its source range |
| An invalid host ↔ webview message | That it is rejected and logged, and that nothing else happens |
| A user-facing refusal or notice | The exact English string, and its catalogue key when it has one (`banner.unbound`) |
| An export that cannot complete | What is written (nothing, or the partial file) and the notification text |

These phrases are banned in `THEN` lines and outcome cells, because none of them can fail a test:

| Banned | Write instead |
|---|---|
| "is refused", "is rejected", "fails" | The diagnostic code, the logged rejection, or the unchanged state |
| "an error is shown", "shows a message" | The exact string or diagnostic code |
| "appropriate", "correct", "properly", "as expected", "smoothly", "successfully" | The value, duration or limit |
| "etc.", "and so on", "…" in an enumeration | The full list, or `*Any*` |

Specify user-facing copy only when the words are the behaviour, such as a banner, an announcement or an empty state.
Then quote the English text verbatim. Log levels are not specified: they are mechanism and belong in `design.md`.

## 7. Constraints

Numeric limits, enumerations, durations and ordering rules that hold across every scenario go in a
`**Constraints:**` list under the requirement text:

```markdown
### Requirement: Toolbar zoom group
The panel toolbar SHALL show zoom out, the current zoom as a percentage, and zoom in.

**Constraints:**
- Range: `10 %`–`800 %`; a button at its limit is disabled
- Step: the same factor as the `+` / `-` keys (`1.2`)
- Presets: `25`, `50`, `75`, `100`, `150`, `200`, `400` %, then *Fit*
```

Every constraint MUST be exercised by at least one scenario or table row. A constraint that no scenario touches is
prose that nobody tests.

## 8. Settings, annotations and messages

- **Settings.** Never write "the configured value". Name the key, its default and its annotation short name if it has one: ``the initial overview (`mermaidAnimator.playback.initialOverview`, default `true`; `@animator overview=`)``. State the precedence when both apply: annotations override sidecar settings, and sidecar settings override VS Code settings.
- **Protocol messages.** Name the message type and direction (``webview → host `settings/open` ``) and only the payload fields the scenario asserts. The full payload type lives in `packages/protocol`; do not restate it.
- **Timings.** Write durations as numbers with units (`240 ms`), and name the motion token when one exists (`DURATION.base`). Also state what happens under reduced motion.

## 9. Names, citation and deltas

- **Scenario names are unique within a capability.** They are identifiers, so name the table or the situation (`Arrow-end tag matrix`), never a generic `Works`.
- **Cite a table row by id:** `<capability> :: <scenario> :: R3`.
- **What a delta can and cannot do.** The table below was verified with OpenSpec 1.13.2:

| Intent | Delta | Works? |
|---|---|---|
| Change requirement text and keep every scenario | `MODIFIED`, with every scenario copied verbatim | **Yes** |
| Add a scenario or a table | `MODIFIED`, with the old scenarios copied and the new one appended | **Yes** |
| Drop, rename or convert a scenario (for example WHEN/THEN → table) | `MODIFIED` | **No.** Validation fails: "omits scenario(s) the current spec still has" |
| Drop, rename or convert a scenario, keeping the requirement name | `REMOVED` in one change, archive, then `ADDED` in a second change | **Yes** |
| Drop, rename or convert a scenario under a new requirement name | `REMOVED` + `ADDED` in one change, with `> **Supersedes:** <old name>` in the new block | **Yes** |
| `REMOVED` + `ADDED` of the same name in one change | — | **No.** Validation fails: "Requirement present in both ADDED and REMOVED" |
| Add or change `## Purpose` after creation | Any delta | **No.** The Purpose is copied only when the capability is created |

When a change removes or renames behaviour, search `openspec/specs/` for other requirements that mention it and give
each one a `MODIFIED` delta in the same change. Otherwise the synced specs contradict each other.

## 10. Tables → tasks → tests

For every decision table in a delta, `tasks.md` carries one task that names the table and the test that implements it,
with one case per row:

```markdown
- [ ] 2.3 `Arrow-end tag matrix` (participant-orientation) → `packages/webview/test/orientation.test.ts`, one case per R1–R5
```

- **Pure logic** (`packages/core`, the renderer's scene functions, webview models): write a Vitest table-driven test with `it.each`, one entry per row. The row's conditions are the inputs and its outcomes the expected values.
- **Host behaviour** (commands, settings, messages): write an integration test in `packages/extension/test/suite`, one case per row.
- **Only verifiable in the running panel** (gestures, visual output): check each row in the webview harness (`node scripts/serve-harness.mjs`, then `packages/webview/harness/`) or the Extension Development Host. Record a manual checklist in `tasks.md`, one line per row id.

Test names describe the row in plain words (`hides tags when the header is in view`). Do not put the row id in the test
name: the row → test mapping lives in `tasks.md`.

## 11. Review checklist

No lint enforces this standard yet. Before approving a proposal, check each delta against this list.

| Check | What to look for |
|---|---|
| Form | An outcome that depends on two or more conditions is a table, not several WHEN/THEN scenarios (§3) |
| RFC casing | No `SHALL not`, `MUST not`, `Shall`, or normative lowercase `must`/`should`; no keywords in scenarios or cells (§2) |
| Scenario bullets | Every non-table bullet starts with `**GIVEN**`/`**WHEN**`/`**THEN**`/`**AND**` (§5) |
| Scenario names | Unique within the capability; no generic names (§9) |
| Table shape | Header and separator; first column `#`; `R<n>` ids unique and never reused; no blank cells; outcome cells bold (§4) |
| Coverage | Every combination has a row or an explicit `*Any*`/`*N/A*`; short-circuit rows come first (§4) |
| Vague outcomes | No banned phrase in `THEN` lines or outcome cells (§6) |
| Failures | A failure names its diagnostic code, logged rejection, exact string or unchanged state (§6) |
| Constraints | Every constraint is exercised by a row or a scenario (§7) |
| Settings | No "the configured …" without the key, its default and its annotation name (§8) |
| Reduced motion | Any animated outcome states what happens under reduced motion (§8) |
| Cross-references | Removed or renamed behaviour is not still mentioned by other specs (§9) |
| Non-goals | No `## Non-Goals` section (§1) |
| Tasks | Every table has a task naming its test, with one case per row (§10) |

## Decision log

- 2026-09-27: Adopted, adapted from the team's service-oriented spec-writing standard. Decision tables replace lists
  of WHEN/THEN scenarios wherever an outcome depends on two or more conditions. HTTP status codes and access matrices
  were dropped because this extension has none. Failures instead name diagnostic codes, logged message rejections or
  exact strings. The delta limits in §9 were re-verified against OpenSpec 1.13.2.
