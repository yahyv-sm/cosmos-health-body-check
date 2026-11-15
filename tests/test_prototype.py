import json
import os
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class CosmosHealthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            partial(QuietHandler, directory=str(ROOT)),
        )
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        chromium_path = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
        if not chromium_path and Path("/usr/bin/chromium").exists():
            chromium_path = "/usr/bin/chromium"
        cls.browser = cls.playwright.chromium.launch(
            headless=True,
            executable_path=chromium_path or None,
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def setUp(self):
        self.page = self.browser.new_page(viewport={"width": 1280, "height": 900})
        self.page_errors = []
        self.page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        self.page.goto(self.base_url + "/index.html", wait_until="networkidle")
        self.page.locator("#onodes [data-id]").first.wait_for()

    def tearDown(self):
        self.page.close()

    def test_json_ids_and_source_references_resolve(self):
        data = json.loads((ROOT / "data/cosmos-health-data.json").read_text(encoding="utf-8"))
        sources = {item["id"] for item in data["sources"]}
        hazards = {item["id"] for item in data["sourced"]["hazards"]}
        risks = {item["id"] for item in data["sourced"]["risks"]}
        inputs = {item["id"] for item in data["projectAuthored"]["inputs"]}
        panels = data["projectAuthored"]["bodyPanels"]
        symptom_questions = data["projectAuthored"]["symptomLog"]["questions"]
        self.assertEqual(len(hazards), 5)
        self.assertTrue(inputs)
        self.assertEqual(len(symptom_questions), 4)
        self.assertTrue(all((q["min"], q["max"], q["step"]) == (0, 10, 1) for q in symptom_questions))
        for panel in panels:
            self.assertTrue(set(panel.get("indicators", [])).issubset(inputs))
            for link in panel.get("riskRefs", []):
                self.assertIn(link["risk"], risks)
        for risk in data["sourced"]["risks"]:
            linked_hazards = {
                link.get("hazard") if isinstance(link, dict) else link
                for link in risk.get("hazardLinks", [])
            }
            self.assertTrue(linked_hazards.issubset(hazards))

        def check_source_fields(value):
            if isinstance(value, dict):
                for key in ("source", "sourceId", "sources", "whySource"):
                    refs = value.get(key, [])
                    refs = [refs] if isinstance(refs, str) else refs
                    if isinstance(refs, list):
                        for ref in refs:
                            if isinstance(ref, str):
                                for source_id in ref.split(","):
                                    source_id = source_id.strip()
                                    if source_id:
                                        self.assertIn(source_id, sources, f"Unknown source ID {source_id}")
                for child in value.values():
                    check_source_fields(child)
            elif isinstance(value, list):
                for child in value:
                    check_source_fields(child)

        check_source_fields(data)

    def test_only_supported_body_topics_render_and_key_is_visible(self):
        ids = self.page.locator("#onodes [data-id]").evaluate_all("els => els.map(el => el.dataset.id)")
        self.assertEqual(ids, ["brain", "eyes", "lungs", "heart", "meta", "immune", "bones"])
        self.assertEqual(self.page.locator("#ovF [data-o]").count(), 7)
        self.assertEqual(self.page.locator("#ovB [data-o]").count(), 8)
        key = self.page.locator("#cosmosBodySignalKey")
        self.assertTrue(key.is_visible())
        self.assertIn("not health", key.inner_text().lower())
        self.assertIn("not a health status", self.page.locator('#onodes [data-id="brain"]').get_attribute("aria-label"))

    def test_slider_recalculates_value_and_deviation_color(self):
        slider = self.page.locator("#i_mood")
        self.assertTrue(slider.is_enabled())
        before = self.page.locator("#w_mood").evaluate("el => getComputedStyle(el).getPropertyValue('--c').trim()")
        slider.evaluate("el => { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles: true})); }")
        after = self.page.locator("#w_mood").evaluate("el => getComputedStyle(el).getPropertyValue('--c').trim()")
        self.assertNotEqual(before, after)
        self.assertEqual(self.page.locator("#o_mood").inner_text().strip(), "1 /10")
        self.assertIn("not a health status", self.page.locator('#onodes [data-id="brain"]').get_attribute("aria-label"))

    def test_body_and_hazard_selection_reuse_existing_detail_card(self):
        self.page.locator('#onodes [data-id="brain"]').click()
        detail = self.page.locator("#pDetail")
        self.assertIn("BODY VIEW", detail.inner_text())
        self.assertIn("Inputs in this body area", detail.inner_text())
        self.page.locator("#hzl [data-h]").first.click()
        self.assertIn("HAZARD CONTEXT", detail.inner_text())
        self.assertIn("not a cause", detail.inner_text().lower())

    def test_symptom_log_is_four_slider_session_only_and_clearable(self):
        root = self.page.locator("#cosmosSymptomLog")
        section_order = self.page.locator("#body, #cosmosSymptomSection, #read").evaluate_all("els => els.map(el => el.id)")
        self.assertEqual(section_order, ["body", "cosmosSymptomSection", "read"])
        self.assertEqual(self.page.locator("#pDetail #cosmosSymptomLog").count(), 0)
        self.assertEqual(root.locator("[data-symptom-slider]").count(), 4)
        self.assertIn("page session's memory only", root.inner_text())
        self.assertIn("do not affect the hazard diagram", root.inner_text())
        root.locator('[data-symptom-action="add"]').click()
        self.assertIn("move each of the four sliders", root.locator("[data-symptom-status]").inner_text())

        values = [3, 4, 6, 7]
        for slider, value in zip(root.locator("[data-symptom-slider]").all(), values):
            slider.evaluate("(el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', {bubbles: true})); }", value)
        root.locator('[data-symptom-action="add"]').click()
        self.assertIn("Added your self-reported answers", self.page.locator("#cosmosSymptomLog [data-symptom-status]").inner_text())
        self.assertEqual(self.page.locator("#cosmosSymptomLog .cosmos-symptom-entry").count(), 1)
        entry_text = self.page.locator("#cosmosSymptomLog .cosmos-symptom-entry").inner_text()
        for value in values:
            self.assertIn(f"{value}/10", entry_text)

        self.page.locator('#onodes [data-id="lungs"]').click()
        self.assertEqual(self.page.locator("#cosmosSymptomLog .cosmos-symptom-entry").count(), 0)
        self.page.locator('#onodes [data-id="brain"]').click()
        self.assertEqual(self.page.locator("#cosmosSymptomLog .cosmos-symptom-entry").count(), 1)
        self.page.locator('#cosmosSymptomLog [data-symptom-action="clear"]').click()
        self.assertIn("Cleared this body's symptom draft", self.page.locator("#cosmosSymptomLog [data-symptom-status]").inner_text())
        self.assertEqual(self.page.locator("#cosmosSymptomLog .cosmos-symptom-entry").count(), 0)
        self.page.reload(wait_until="networkidle")
        self.page.locator("#cosmosSymptomLog").wait_for()
        self.assertIn("No symptom entries", self.page.locator("#cosmosSymptomLog").inner_text())

    def test_mobile_layout_and_keyboard_activation(self):
        mobile = self.browser.new_page(viewport={"width": 375, "height": 812}, reduced_motion="reduce")
        try:
            mobile.goto(self.base_url + "/index.html", wait_until="networkidle")
            mobile.locator('#onodes [data-id="brain"]').wait_for()
            self.assertLessEqual(mobile.evaluate("document.documentElement.scrollWidth"), 375)
            self.assertTrue(mobile.locator("#cosmosBodySignalKey").is_visible())
            brain = mobile.locator('#onodes [data-id="brain"]')
            brain.focus()
            mobile.keyboard.press("Enter")
            self.assertEqual(mobile.evaluate("document.activeElement.dataset.id"), "brain")
        finally:
            mobile.close()

    def test_json_failure_disables_unavailable_controls(self):
        page = self.browser.new_page()
        try:
            page.route("**/data/cosmos-health-data.json", lambda route: route.fulfill(status=404, body="missing"))
            page.goto(self.base_url + "/index.html", wait_until="networkidle")
            self.assertIn("Project JSON unavailable", page.locator("#banner").inner_text())
            self.assertEqual(page.locator('#sliders input[type="range"]').count(), 0)
            self.assertIn("unavailable", page.locator("#sliders").inner_text().lower())
            self.assertIn("unavailable", page.locator("#pDetail").inner_text().lower())
        finally:
            page.close()

    def test_app_loads_without_uncaught_page_errors(self):
        self.assertEqual(self.page_errors, [])


if __name__ == "__main__":
    unittest.main()
