# Cosmos Health — original page linked to project JSON

This package keeps the supplied `Cosmos_Health_Body_check.html` visual design and connects its existing slider controls to `data/cosmos-health-data.json`. The original upload is preserved unchanged at `original/Cosmos_Health_Body_check.html`. `index.html` and the connected `Cosmos_Health_Body_check.html` are identical copies of the supplied page with one additional script reference.

## Run on Windows

1. Extract the ZIP.
2. In File Explorer, open the extracted folder, type `powershell` in the address bar, and run:

   ```powershell
   py -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000). Do not open the HTML with `file://`, because the browser must fetch the JSON file. Keep `data` and `js` beside the HTML.

## What is connected

- **Inputs:** The page uses the original slider bars only. Labels, units, defaults, ranges, and increments come from the JSON. Moving a slider immediately recalculates the feedback and diagram; values are shown beside the original controls. Slider color runs green to amber to red by distance from the JSON demo default. Inputs are synthetic demo values. Optional prompts have no effect while unchanged at their defaults.
- **Diagram:** The original five-axis hazard pentagram and hazard list remain in the original section. Its plotted values are project-authored normalized deviations, not probabilities, clinical limits, or evidence of cause.
- **Feedback:** The original feedback card is retained. It shows the calculated top simulated match or a no-linked-match state; it does not diagnose or generate real medical instructions.
- **Body view:** The original front/back illustrations and their original hotspot coordinates are retained, but only body topics with JSON-backed indicators or sourced hazard links are displayed. Unsupported body hotspots and list buttons are omitted. Supported region buttons glow according to the averaged deviation of their listed inputs from their JSON demo defaults. A visible color key clarifies that green–amber–red means synthetic input deviation only, not health, risk, or a medical limit. The existing detail card shows indicator bars, cited spaceflight context, calculated matches, and demo feedback. Hazard selection displays its source details in this same card.
- **Symptom log:** A standalone section appears immediately below the body map and before the pentagram and its neighboring hazard-detail panel. Selecting a supported body region reveals four project-authored 0–10 slider prompts about sensation intensity, activity impact, frequency, and change. Responses are shown as entered in a timestamped, per-region page-session log. The log can be cleared, is not saved to local storage or a database, and is cleared when the page reloads or closes. These prompts produce no score, diagnosis, cause attribution, treatment advice, hazard match, or change to the pentagram/body colors. Urgent-symptom messaging is displayed independently of the answers.
- **References:** Hazard summaries and body-topic relationships are taken from registered source IDs in the JSON. Unsupported references are omitted.

## Calculation and limitations

For each original daily-check-in slider changed from its JSON default, the demo calculates the absolute deviation normalized to that slider's JSON control span, on a 0–100 display scale. The green–amber–red slider and body colors represent distance from project demo defaults within the slider spans; they do not label a reading as healthy or unhealthy. Symptom-log answers are stored separately in page memory and do not enter this calculation. The simulation links daily-check-in inputs only to hazard IDs recorded on a cited NASA risk record for the corresponding JSON body topic, or to an explicit project-authored mapping in the JSON. A hazard's displayed value is the mean of its linked, changed inputs; the diagram is a visual summary of that model.

This is a fictional educational simulation—not a medical device, clinical decision system, validated astronaut-monitoring system, or NASA-endorsed product. Symptom questions are not validated assessments. Slider ranges are interface controls, not safe/unsafe limits or NASA thresholds. Highlighting indicates a simulated association, not an individual risk or a cause. Do not use this output for real medical care or mission operations.

The original page includes profile and local-save/optional `claude` database hooks; they are retained because the supplied HTML is kept intact. Depending on the host, those existing hooks may store profile or input data. **Use synthetic demo entries only; do not enter real names, contact details, or health information.**

## Files

```text
index.html                             Runnable connected copy
Cosmos_Health_Body_check.html          Same connected copy under the supplied filename
original/Cosmos_Health_Body_check.html Exact uploaded HTML, unchanged
js/cosmos-health-data-link.js          JSON integration and calculation adapter
data/cosmos-health-data.json            Runtime data, sources, mappings, and model
tests/test_prototype.py                 Lightweight unittest/Playwright regression checks
README.md                               Setup, structure, and limitations
```

The supplied decorative 3D scene remains and may require an internet connection for its external Three.js dependency. The static JSON-backed controls can be tested through the local server above.

## Verification

The original file was checked byte-for-byte against the upload; both runnable HTML files differ from it only by the adapter reference. The adapter passes `node --check`, and the runtime JSON parses. Chromium checks cover JSON-derived slider setup, slider-driven recalculation, hazard selection and citations, supported body-region filtering, visible deviation legend, slider and body-button color/glow changes, the body-map → standalone symptom-section → pentagram/detail order, four-question symptom entry and clear/reload behavior, keyboard focus, narrow-screen width, use of the original diagram/feedback/body detail containers, and a missing-JSON failure state that disables unavailable controls. Manual test: serve the folder with `py -m http.server 8000`, open `http://localhost:8000`, move one or more daily sliders, select each displayed hazard and supported body region, enter and clear a synthetic symptom log, use Tab/Enter to operate controls, and repeat at a narrow mobile viewport. Verify symptom values do not alter hazard matches and all log entries disappear after reload.

## Automated regression tests

The tests use Python's standard `unittest` runner and Playwright. Install Playwright and its Chromium browser once (`py -m pip install playwright` and `py -m playwright install chromium` on Windows), then run `py -m unittest discover -s tests -v` from the project folder. On Linux, set `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is installed at a nonstandard path. The app itself remains static and does not require Python packages to run.
