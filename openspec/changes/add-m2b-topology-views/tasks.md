# Tasks

## 1. Topology model (core)

- [ ] 1.1 Implement `buildTopology` (nodes, clusters, request edges, return lanes per `returnMessages`, self-loops, message → edge map); verify unit tests for aggregation counts, returns in all three modes and boxes

## 2. Layout engines (webview)

- [ ] 2.1 Add `elkjs` and `d3-force`; copy the ELK worker into `dist/webview/workers/` and start it through the blob shim; verify the build output and a harness check that a layout returns under the production CSP
- [ ] 2.2 Implement the layered layout (direction, seed, first-call order, clusters, hints, edge styles); verify determinism with a harness check comparing two runs
- [ ] 2.3 Implement the seeded force layout; verify a unit test that two runs produce identical positions
- [ ] 2.4 Implement manual layout (drag, placement of unknown nodes, reset); verify harness drag check

## 3. Topology rendering (renderer)

- [ ] 3.1 Implement `topologySceneAt` (played edges, pulses per current message, activity rings, focus); verify scene unit tests including "same position in both views"
- [ ] 3.2 Implement `TopologySvgRenderer` with typed node shapes, clusters, badges, weighted widths, return lanes and loop arcs in the token CSS; verify harness screenshots in Ivory, Graphite and HC
- [ ] 3.3 Edge hover list with seek links and node click → focus; verify harness check

## 4. Views and morph (webview)

- [ ] 4.1 Add view slots to the controller, the toolbar segmented control, `T`/`S`, `view.default` and `@animator view=`; verify harness check that step and focus are preserved on switch
- [ ] 4.2 Implement `morphAt` and the `MorphRenderer` with the spec §8.4 windows and the reduced-motion cross-fade; verify unit tests at 0, 300 and 640 ms and a harness frame mid-morph
- [ ] 4.3 Implement the split view (responsive grid, shared player, independent cameras) and cross-highlighting; verify harness checks at 1200 px and 900 px

## 5. Minimap (webview)

- [ ] 5.1 Implement the minimap (simplified drawing, viewport rectangle, current-step dot, auto/always/never, hidden while presenting) with drag and click navigation; verify harness check on the long-flow fixture

## 6. Host integration

- [ ] 6.1 Contribute the view commands, *Reset Topology Layout* and the new settings with English/Spanish strings; route `setView`/`toggleView`; verify the localisation parity test and an integration test that *Show Split View* reaches the webview
- [ ] 6.2 Persist manual layouts via `layout/save` in workspace state and include them in `document/load`; verify an integration test round-trip
- [ ] 6.3 Add `ThirdPartyNotices.txt` generation covering elkjs (EPL-2.0), d3 (ISC), Mermaid (MIT), fonts (OFL) and codicons; verify it is included in the VSIX listing

## 7. Integration checks

- [ ] 7.1 Run lint, typecheck, unit and integration suites (development and production builds); verify all pass
- [ ] 7.2 Measure layered layout time for a 50-participant diagram in the harness (NFR-PERF-08 < 300 ms) and record the result in the design notes
- [ ] 7.3 Update the product specification and README where the implementation differs; verify documented shortcuts match the keyboard handler
