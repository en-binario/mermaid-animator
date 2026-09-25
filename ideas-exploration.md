# Animated Mermaid sequence diagram viewer

**Parsing approach — don't fight Mermaid's DOM**
Mermaid's rendered SVG isn't really built for live manipulation. Two options:
- Use `mermaid.mermaidAPI` to parse the `.mmd` source into structured data (actors, ordered messages, activations), but render your own custom SVG so you have full control over every element for animation.
- Or go simpler: write a small parser yourself for the sequence syntax (`participant`, `->>`, `-->>`, `activate`/`deactivate`, `loop`/`alt`/`opt`, notes). It's a tiny grammar and gives you a clean JSON model to drive both the sequence view *and* the architecture view from the same data.

Either way, the key move is: one canonical "step list" (ordered messages) that everything else (scrubbing, autoplay, scroll, view mode) reads from.

**Animating the sequence view**
- Draw arrows progressively using `stroke-dasharray`/`stroke-dashoffset` (classic "line drawing itself" effect)
- A small dot/pulse traveling along the path from sender to receiver (like a packet), arriving right when the label fades in
- Activation bars grow/shrink with a quick scale animation instead of popping in
- Dim/desaturate everything except the active lifeline + current message; return messages get a distinct style (dashed, different color)
- Highlight the enclosing `loop`/`alt` box while its messages play, with an iteration counter

**Zoom & pan**
- Wrap the SVG in something like `d3-zoom` or `panzoom.js`
- Auto-camera: when autoplaying, smoothly pan/zoom to keep the active lifelines centered and readable (great for long diagrams)
- Click any message to zoom into just that interaction
- A minimap in the corner when zoomed in, so people don't get lost

**Sequence ↔ architecture toggle**
This is the most interesting part. Same step data, different layout:
- Participants become nodes (boxes/components), laid out with `d3-force` or a fixed grid instead of vertical swimlanes
- Messages become directed edges; repeated calls between the same two nodes collapse into one edge with a count badge instead of redrawing every time
- "Playing" the sequence in this mode = pulses traveling along edges in call order — essentially turns it into a live service-call/data-flow diagram (like a distributed tracing service map)
- Animate the *transition* between modes with FLIP-style tweening (each node/arrow interpolates from its sequence position to its architecture position) rather than a hard cut — makes the relationship between the two views obvious

**Playback modes**
- Autoplay: timer advances step index, configurable speed, pause on hover
- Scroll-driven: this is exactly what GSAP's `ScrollTrigger` is built for — map scroll position in a container to step index, so each step "pins" while the user scrolls through it (scrollytelling style)
- Scrubber bar with play/pause/step/speed, plus arrow-key stepping (nice for live walkthroughs/presentations)
- Optional caption panel showing plain-language text for the current step (turns it into a guided explainer, not just a diagram)

**Nice-to-haves**
- Click a participant to filter/dim everything not touching it
- Paste-your-own Mermaid source, live re-parse
- Export current animation as GIF/MP4, or a shareable link with the step position embedded in the URL
- Light/dark theme matching Mermaid's theming variables
