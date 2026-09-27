# Spec Delta

## Purpose

Renders the inline HTML formatting that Mermaid supports in labels (`<b>`, `<strong>`, `<i>`, `<em>`) as bold and italic text instead of showing the tags literally.

## ADDED Requirements

### Requirement: Inline formatting tags
In any label, `<b>…</b>` and `<strong>…</strong>` SHALL render as bold and `<i>…</i>` and `<em>…</em>` SHALL render as italic. Tag names SHALL be matched case-insensitively, and the tags SHALL accept optional whitespace before `>`. Nested tags SHALL combine: text in both SHALL render bold italic. Formatting SHALL continue across `<br>` line breaks and wrapped lines. An unmatched opening tag SHALL format to the end of the label, and an unmatched closing tag SHALL be ignored. The tags themselves SHALL never appear as text. Other HTML-like text SHALL be shown as it is today.

#### Scenario: Bold class name
- **WHEN** a flowchart node label is `<b>FirmaDigitalService</b><br/>iniciarFirma()`
- **THEN** the node shows `FirmaDigitalService` in bold on the first line and `iniciarFirma()` in regular weight on the second, with no `<b>` or `</b>` text

#### Scenario: Italic inside a label
- **WHEN** a label is `SseHub<br/><i>Sinks.Many</i> (optional)`
- **THEN** `Sinks.Many` is italic and ` (optional)` is regular

#### Scenario: Unclosed tag
- **WHEN** a message label is `<b>lock DR`
- **THEN** the label shows `lock DR` in bold

### Requirement: Formatting in every engine
Inline formatting SHALL apply to:
- diagrams rendered through Mermaid (node, edge, cluster and other text labels);
- native sequence diagrams (participant headers, message labels, notes, fragment and branch labels, box labels);
- topology node labels and the transient message label;
- the participant rail and arrow-end name tags.

Label wrapping and box sizes SHALL be computed from the formatted text, so bold text SHALL fit inside its box and tags SHALL NOT cause extra line breaks.

#### Scenario: No stray line breaks
- **WHEN** a Mermaid-rendered node label starts with `<b>` followed by a long word
- **THEN** the node does not show an empty or tag-only line, and the bold word stays inside the node's border

#### Scenario: Native sequence message
- **WHEN** a sequence message is `A->>B: <b>POST</b> /firma-dr/iniciar`
- **THEN** the message label shows `POST` in bold, followed by ` /firma-dr/iniciar`

### Requirement: Formatting in exports
SVG, PNG, GIF, video, animated SVG and HTML player exports SHALL render inline formatting as the panel does.

#### Scenario: PNG export
- **WHEN** the user exports a PNG of a diagram whose labels contain `<b>` tags
- **THEN** those labels are bold in the PNG and no tag text appears

### Requirement: Plain text outside the drawing
Captions derived from labels, the transcript, search matching, the inspector's step list, tooltips, screen-reader announcements and exported file names SHALL use the label text with formatting tags removed.

#### Scenario: Search ignores tags
- **WHEN** a message label is `<b>atomic DR lock</b>` and the user searches for `atomic DR`
- **THEN** the step is found, and the transcript lists it as `atomic DR lock`
