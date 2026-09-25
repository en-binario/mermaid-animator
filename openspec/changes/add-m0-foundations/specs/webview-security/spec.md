# Spec Delta

## Purpose

Guarantees that the animator webview executes only the extension's own bundled code, loads only bundled resources and never reaches the network, protecting users from diagram-borne content injection.

## ADDED Requirements

### Requirement: Nonce-based Content Security Policy
The webview document SHALL carry a Content Security Policy with `default-src 'none'`, scripts allowed only by a per-render random nonce or from the extension's webview resource origin, styles only from that origin or by nonce, images from that origin plus `data:` and `blob:`, fonts from that origin plus `data:`, workers from that origin plus `blob:`, and `connect-src 'none'`.

#### Scenario: Policy present and nonce fresh
- **WHEN** the animator panel's HTML is generated twice
- **THEN** each document contains the policy above and the two nonces differ and are at least 128 bits of randomness

#### Scenario: Injected inline script is blocked
- **WHEN** content containing an inline `<script>` element without the nonce is inserted into the webview document
- **THEN** the script does not execute

### Requirement: Restricted local resources
The webview SHALL only be permitted to load local resources from the extension's bundled output and media directories.

#### Scenario: Resource roots
- **WHEN** the animator panel is created
- **THEN** its local resource roots are exactly the extension's `dist` and `media` directories

### Requirement: No network access
The webview SHALL NOT load remote fonts, scripts, styles or images and SHALL NOT make network requests.

#### Scenario: Offline operation
- **WHEN** the animator panel opens on a machine with no network connection
- **THEN** the shell, fonts and icons render completely and no request leaves the machine
