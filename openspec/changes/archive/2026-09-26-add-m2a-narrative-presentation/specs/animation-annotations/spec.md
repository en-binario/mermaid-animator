# Spec Delta

## ADDED Requirements

### Requirement: Directive effects
The directives `@animator`, `@id`, `@title`, `@step-id`, `@skip`, `@pause`, `@duration`, `@speed`, `@emphasis`, `@with-next`, `@type`, `@caption`, `@chapter`, `@latency`, `@focus`, `@iterations`, `@branch` and `@collapse` SHALL take effect: captions and chapters are shown (see `narrative`), `@latency` is shown in the inspector, `@focus` frames the listed participants for its step in Cinematic and Follow modes, `@iterations` and `@branch` drive fragment handling (see `step-compilation`), and `@collapse` is accepted and reserved for fragment collapsing; the topology and flowchart directives (`@group`, `@order`, `@path`, `@start`, `@choose`, `@events`) SHALL be accepted without warnings and take effect in later milestones.

#### Scenario: Caption shown
- **WHEN** `%% @caption "Retrying once."` precedes a message
- **THEN** the caption strip shows "Retrying once." while that message is the current step

#### Scenario: Focus framing
- **WHEN** the camera mode is `cinematic` and a step is annotated `%% @focus Gateway, Auth`
- **THEN** the camera frames the Gateway and Auth lifelines for that step

## REMOVED Requirements

### Requirement: Step-shaping directives in M1
**Reason**: M1 applied only a subset of directives; M2a applies captions, chapters, latency, focus, iterations and branch selection too.
**Migration**: Replaced by *Directive effects*; every directive that took effect in M1 keeps its behaviour.
