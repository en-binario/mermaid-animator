# Spec Delta

## Purpose

Presents the extension's interface, commands, settings, messages and announcements in the user's editor display language, starting with English and Spanish.

## ADDED Requirements

### Requirement: English and Spanish
All user-facing text — command titles, setting descriptions, notifications, CodeLens titles, webview labels, tooltips and live-region announcements — SHALL be available in English and Spanish, chosen from the editor's display language and defaulting to English.

#### Scenario: Spanish display language
- **WHEN** VS Code runs with display language `es`
- **THEN** the command palette shows *Mermaid Animator: Abrir vista previa animada* and the transport's play button is labelled *Reproducir*

### Requirement: No hard-coded strings
User-facing strings SHALL come from localisation bundles, and a test SHALL fail if the Spanish bundle lacks any key present in the English bundle.

#### Scenario: Missing translation
- **WHEN** a new English string is added without a Spanish entry
- **THEN** the localisation test fails
