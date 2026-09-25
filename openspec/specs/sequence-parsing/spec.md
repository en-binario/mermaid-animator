# sequence-parsing Specification

## Purpose
Turns Mermaid sequence-diagram text into a source-ranged structural model that the animator can play, reporting problems precisely instead of failing, and recognises which Mermaid diagram type any source contains.

## Requirements

### Requirement: Diagram type detection
The parser SHALL determine a diagram's type from its first statement after optional YAML front matter, `%%{…}%%` directives and comments, recognising at least `sequenceDiagram`, `flowchart`, `graph`, `stateDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gantt`, `journey`, `gitGraph`, `pie`, `mindmap`, `timeline`, `quadrantChart`, `requirementDiagram`, `C4Context`, `sankey-beta`, `xychart-beta`, `block-beta`, `packet-beta`, `architecture-beta`, `kanban` and `radar-beta`; any other first word SHALL yield type `unknown`.

#### Scenario: Front matter before keyword
- **WHEN** the source starts with a `---` front-matter block followed by `sequenceDiagram`
- **THEN** the detected type is `sequence` and the front matter is available to the model

### Requirement: Sequence syntax coverage
The sequence parser SHALL accept every statement form of the pinned Mermaid 12 sequence grammar: `participant`/`actor` declarations with `as` aliases and `@{…}` metadata (including the `type` values actor, boundary, control, entity, database, collections, queue), `create` and `destroy`, `box … end`, messages with every arrow form (`->`, `-->`, `->>`, `-->>`, `<<->>`, `<<-->>`, `-x`, `--x`, `-)`, `--)` and the sixteen half-arrow forms), `+`/`-` activation shorthands, central connections `()`, `activate`/`deactivate`, notes (`left of`, `right of`, `over` one or two participants), `loop`, `alt`/`else`, `opt`, `par`/`and`, `par_over`, `critical`/`option`, `break`, `rect`, `autonumber` (with start, step and `off`), `title`, `accTitle`, `accDescr` (single and multi-line), `links`, `link`, `properties`, `details`, `;` statement separators and `%`/`#` comments. Keywords SHALL be case-insensitive.

#### Scenario: Half arrow
- **WHEN** the source contains `Alice-|\Bob: hi`
- **THEN** the model has one message from Alice to Bob with arrow kind `halfTop`, not dotted

#### Scenario: Implicit participants
- **WHEN** a message references `Carol` who was never declared
- **THEN** `Carol` is added as a participant in order of first appearance

### Requirement: Source ranges
Every participant, message, note, activation, create/destroy statement, fragment and fragment branch in the model SHALL carry its source range expressed in the host document's line/column coordinates.

#### Scenario: Range inside Markdown
- **WHEN** a diagram starts on line 10 of a Markdown file and its first message is the diagram's third line
- **THEN** that message's range starts on document line 12

### Requirement: Labels
Message, note and fragment labels SHALL have Mermaid entity codes (`#name;` and `#number;`) decoded, `<br>`/`<br/>` treated as line breaks, and `:wrap:`/`:nowrap:` prefixes removed; text after an unencoded `#` SHALL be treated as a comment.

#### Scenario: Entity code
- **WHEN** a message label is `I #9829; Mermaid`
- **THEN** the model label is `I ♥ Mermaid`

### Requirement: Error recovery and diagnostics
The parser SHALL never throw on any input; it SHALL report each problem as a diagnostic with a message, severity and source range, recover at the next statement, and return the partial model.

#### Scenario: Unclosed fragment
- **WHEN** a `loop` block has no matching `end`
- **THEN** an error diagnostic is reported on the `loop` line and the statements inside it are still present in the model

#### Scenario: Stray end
- **WHEN** an `end` appears with no open block
- **THEN** an error diagnostic is reported on that line and parsing continues

### Requirement: Agreement with Mermaid
For every file in the repository's sequence-diagram conformance corpus, the native parser SHALL report no error diagnostics exactly when Mermaid 12's own parser accepts the file.

#### Scenario: Corpus parity
- **WHEN** the conformance test runs over the corpus
- **THEN** acceptance agrees with Mermaid for every file

### Requirement: Mermaid configuration passthrough
Front matter (`title`, `config`) and `%%{init: …}%%` directives SHALL be parsed and exposed to the renderer; the diagram title SHALL come from front-matter `title` or a `title` statement.

#### Scenario: Title from statement
- **WHEN** the diagram contains `title Checkout flow`
- **THEN** the model title is `Checkout flow`

### Requirement: Parsing performance
Parsing a 1,000-line sequence diagram SHALL take less than 30 ms on reference hardware.

#### Scenario: Large diagram
- **WHEN** a generated 1,000-message diagram is parsed in the performance test
- **THEN** the median of repeated parses is under 30 ms
