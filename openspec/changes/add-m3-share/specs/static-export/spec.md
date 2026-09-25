# Spec Delta

## ADDED Requirements

### Requirement: Insert reference
After an image export (PNG, SVG, animated SVG, GIF) of a diagram in a Markdown or MDX document, the completion notification SHALL offer *Insert below diagram*, which inserts `![<diagram title or file name>](<relative path>)` on the line after the closing fence — or, for a light/dark animated SVG pair, a `<picture>` element whose dark source uses `media="(prefers-color-scheme: dark)"`.

#### Scenario: Insert an image reference
- **WHEN** the user exports `checkout.anim.svg` next to `README.md` and chooses *Insert below diagram*
- **THEN** `![Checkout — happy path](./checkout.anim.svg)` is inserted after the diagram's closing fence

#### Scenario: Picture element for a pair
- **WHEN** a light/dark pair was exported
- **THEN** a `<picture>` element with a dark `<source>` and a light `<img>` is inserted
