# static-export Specification

## Purpose
Lets users take the current frame of a diagram out of the editor as a self-contained vector or raster image, or straight to the clipboard.

## Requirements

### Requirement: SVG export
*Export as SVG* SHALL save the current frame as a standalone SVG with resolved colours, embedded fonts, no scripts or external references, an 8% horizontal size buffer on boxes and `textLength` with `lengthAdjust="spacing"` on text so fallback fonts cannot overflow.

#### Scenario: Standalone file
- **WHEN** the exported SVG is opened in a browser with no network access
- **THEN** it renders the same frame with the diagram's colours and no missing resources

### Requirement: PNG export
*Export as PNG* SHALL save the current frame at 1×, 2× (default) or 3× scale with either the theme's canvas colour or a transparent background.

#### Scenario: 2× export
- **WHEN** a diagram whose frame is 800 × 600 CSS pixels is exported at 2×
- **THEN** the PNG is 1600 × 1200 pixels

### Requirement: Save location
Exports SHALL be written through a save dialog proposing `<diagram id or file name>.<ext>` in the source file's folder, and the user SHALL be offered to open or reveal the saved file.

#### Scenario: Cancel
- **WHEN** the user cancels the save dialog
- **THEN** nothing is written

### Requirement: Copy image
*Copy Image* SHALL place a PNG of the current frame on the system clipboard from within the webview; if the clipboard write fails, the user SHALL be offered *Save as PNG…* instead.

#### Scenario: Paste into a document
- **WHEN** the user runs *Copy Image* and pastes into an image-accepting application
- **THEN** the current frame is pasted as an image
