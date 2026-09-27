# Spec Delta

## MODIFIED Requirements

### Requirement: Labels
Message, note, fragment, participant and box labels SHALL have Mermaid entity codes (`#name;` and `#number;`) decoded, `<br>`/`<br/>` treated as line breaks, and `:wrap:`/`:nowrap:` prefixes removed; text after an unencoded `#` SHALL be treated as a comment. The inline formatting tags `<b>`, `<strong>`, `<i>` and `<em>` (and their closing tags) SHALL be recognized as formatting (see label-formatting). Each label SHALL be available both as formatted runs for drawing and as plain text without the tags. An entity-encoded `<` (such as `#lt;b>`) SHALL remain literal text and SHALL NOT start a tag.

#### Scenario: Entity code
- **WHEN** a message label is `I #9829; Mermaid`
- **THEN** the model label is `I ♥ Mermaid`

#### Scenario: Bold run
- **WHEN** a message label is `<b>reserve</b> DR number`
- **THEN** the label's runs are `reserve` (bold) and ` DR number` (regular), and its plain text is `reserve DR number`

#### Scenario: Escaped tag stays literal
- **WHEN** a note label is `use #lt;b> for bold`
- **THEN** the plain text is `use <b> for bold` and no run is bold
