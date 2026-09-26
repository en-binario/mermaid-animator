# step-compilation Specification

## Purpose
Produces the single canonical, ordered list of animation steps that drives every view, control, export and synchronisation path, with identities that stay stable while the source is edited.

## Requirements

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

### Requirement: Fragment handling
Every step SHALL record the path of enclosing fragments, branches and loop iterations. `loop` content SHALL play `@iterations n` times, else `mermaidAnimator.playback.loopIterations` (default 1) times, each repetition carrying `iteration` and `of`; when `mermaidAnimator.playback.compressRepeats` is true (default) repetitions after the first SHALL use half the transition and dwell. `alt` and `critical` SHALL play the branch chosen by, in order of precedence, the inspector choice, `@branch`, then `mermaidAnimator.playback.altBranches` (`first` default, `all` plays every branch in order, `ask` inserts a choice point that halts autoplay until a branch is chosen); unplayed branches SHALL remain visible as unplayed. `opt` SHALL play unless skipped by the inspector or `@branch skip`. `break` and `rect` content SHALL play.

#### Scenario: Three iterations
- **WHEN** a `loop` containing two messages is annotated `%% @iterations 3`
- **THEN** the step list contains six steps for it, labelled iterations 1 to 3 of 3, and iterations 2 and 3 are twice as fast

#### Scenario: Alt second branch by annotation
- **WHEN** an `alt` with branches `valid` and `invalid` is annotated `%% @branch 2`
- **THEN** the step list contains the `invalid` messages and not the `valid` ones

#### Scenario: Ask
- **WHEN** `playback.altBranches` is `ask` and autoplay reaches the `alt`
- **THEN** playback pauses and offers the branch labels as choices on the canvas

### Requirement: Concurrent parallel lanes
When `mermaidAnimator.playback.parallel` is `concurrent` (default), the branches of `par`/`par_over` SHALL be compiled as lanes zipped so that the k-th step of every lane forms one step whose `lanes` list each lane's targets and source and whose `sources` include every lane's range, with the transition lasting as long as the slowest lane; with `sequential`, lanes SHALL play one after another. Indices SHALL stay contiguous (`steps[i].index === i`).

#### Scenario: Two lanes
- **WHEN** a `par` has lanes of two and one messages and `parallel` is `concurrent`
- **THEN** the step list has two steps for it: the first animates the first message of both lanes, the second the remaining message

### Requirement: Stable fragment keys
Branch choices and iteration state SHALL be keyed by a fragment key derived from the fragment kind, label and occurrence among fragments with the same kind and label, so that choices survive edits elsewhere in the diagram.

#### Scenario: Choice survives an edit
- **WHEN** the user chose branch 2 of `alt ok` and then inserts a message above the fragment
- **THEN** branch 2 remains selected after the live reload
