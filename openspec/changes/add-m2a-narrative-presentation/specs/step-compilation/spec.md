# Spec Delta

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Fragment handling in M1
**Reason**: M1 limited loops to one iteration, `alt`/`critical` to their first branch and `par` to sequential lanes; M2a implements the full semantics of spec §8.8.
**Migration**: Replaced by *Fragment handling* and *Concurrent parallel lanes*. The M1 behaviour remains available as the defaults `loopIterations = 1`, `altBranches = first` and `parallel = sequential`.
