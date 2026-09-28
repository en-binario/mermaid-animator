## MODIFIED Requirements

### Requirement: Overview framing
At step 0 with the overview shown, camera modes `follow` and `cinematic` (including `auto` resolving to `follow`) and presentation mode SHALL fit the whole diagram in the view. When playback leaves step 0, `follow` and presentation mode SHALL move the camera to frame step 1 at the session zoom of the current mode (camera *Session play zoom*: `mermaidAnimator.camera.playZoom`, default `100`, or `mermaidAnimator.camera.presentationZoom`, default `150`, until the user zooms), subject to camera *Wide-step zoom-out* and *Framing stays on the drawing*. `cinematic` outside presentation mode SHALL frame step 1 as it frames any step. `fit` and `manual` SHALL behave as they do for any other step.

#### Scenario: Long diagram in follow mode
- **WHEN** a sequence diagram too tall to fit at 75 % opens in `auto` camera mode
- **THEN** step 0 shows the whole diagram fitted to the view, and at step 1 the camera zooms in to frame the first message

#### Scenario: User zoom kept when leaving the overview
- **WHEN** the camera is in `follow` mode at step 0 and the user zooms to 150 % before pressing `→`
- **THEN** the camera frames step 1 at 150 %

#### Scenario: Overview exit zoom matrix

| # | Presenting | User zoom since load | Step 0 shows | Step 1 framed at |
| :--- | :--- | :--- | :--- | :--- |
| R1 | No | None | **Whole diagram fitted** | **100 %** |
| R2 | No | 150 %, while not presenting | **Whole diagram fitted** | **150 %** |
| R3 | Yes | None | **Whole diagram fitted** | **150 %** |
| R4 | Yes | 200 %, while presenting | **Whole diagram fitted** | **200 %** |
