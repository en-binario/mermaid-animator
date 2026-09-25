# Spec Delta

## Purpose

Produces the single canonical, ordered list of animation steps that drives every view, control, export and synchronisation path, with identities that stay stable while the source is edited.

## ADDED Requirements

### Requirement: One step per message
Each message SHALL produce exactly one step in document order; each note SHALL produce its own step.

#### Scenario: Messages and a note
- **WHEN** a diagram has three messages and one note between the second and third
- **THEN** the step list has four steps in source order

### Requirement: Activation merging
An explicit `activate X` SHALL merge into the immediately preceding message when `X` is its target or sender and that message did not already activate `X`, otherwise into the immediately following message when `X` is its sender; `deactivate` statements SHALL merge into the immediately preceding message; an activation with no eligible neighbour SHALL become its own step.

#### Scenario: Activate after the triggering message
- **WHEN** `User->>Gateway: login` is followed by `activate Gateway`
- **THEN** the activation of Gateway belongs to the step for `User->>Gateway: login`

### Requirement: Create and destroy merging
`create participant X` SHALL merge into the immediately following message that targets `X`, and `destroy X` SHALL merge into the adjacent message involving `X`; otherwise each becomes its own step.

#### Scenario: Created participant
- **WHEN** `create participant Log` is followed by `App->>Log: open`
- **THEN** Log's header appears during the step for `App->>Log: open`

### Requirement: Fragment handling in M1
`loop` content SHALL play once; `alt` and `critical` SHALL play their first branch while other branches remain visible as unplayed; `opt`, `break` and `rect` content SHALL play; `par` and `par_over` branches SHALL play one after another; every step SHALL record the path of enclosing fragments and branches.

#### Scenario: Alt second branch
- **WHEN** an `alt` has branches `valid` (2 messages) and `invalid` (1 message)
- **THEN** the step list contains the two `valid` messages and not the `invalid` one

### Requirement: Contiguous indices
Step indices SHALL be contiguous from 0 with `steps[i].index` equal to `i`, and compiling the same model with the same configuration SHALL produce identical output.

#### Scenario: Determinism
- **WHEN** a diagram is compiled twice
- **THEN** the two step lists are deeply equal

### Requirement: Stable identities
Each step SHALL have a `structuralId` derived from its kind, endpoints, fragment path and occurrence, and an `id` derived additionally from its normalised label (or equal to an explicit `@step-id`); inserting an unrelated statement SHALL NOT change the identities of other steps, and editing a label SHALL change only that step's `id`, not its `structuralId`.

#### Scenario: Label edit
- **WHEN** a message label changes from `Auth` to `Authorise`
- **THEN** its `structuralId` is unchanged and every other step's `id` is unchanged

### Requirement: Layout-invariant timing
Each step's transition duration SHALL be `clamp(280, 220 + 95 × Δcol, 900)` ms, where Δcol is the absolute difference of the sender's and receiver's participant column indices (1 for self-messages and non-message steps), scaled by `@duration`/`@speed`; the dwell after it SHALL be adaptive, `clamp(600, 250 + 230 × words, 4000)` ms over the words of the label and caption, unless `@pause` sets it.

#### Scenario: Adjacent columns
- **WHEN** a message goes from column 0 to column 1 with the label `POST /login` and no caption
- **THEN** its transition is 315 ms and its dwell is 710 ms
