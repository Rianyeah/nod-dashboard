import json
from pathlib import Path


WORKFLOW_PATH = Path(__file__).resolve().parents[2] / "n8n" / "workflows" / "capture-site-detail.json"


def load_workflow():
    return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))


def node(workflow, name):
    return next(item for item in workflow["nodes"] if item["name"] == name)


def test_capture_workflow_is_inactive_and_declares_tool_inputs():
    workflow = load_workflow()

    assert workflow["name"] == "capture_site_detail"
    assert workflow["active"] is False
    trigger = node(workflow, "Execute Sub-workflow Trigger")
    values = trigger["parameters"]["workflowInputs"]["values"]
    assert {(item["name"], item["type"], item["required"]) for item in values} == {
        ("site_id", "string", True),
        ("chat_id", "string", True),
    }


def test_capture_workflow_mints_site_scoped_url_and_waits_for_the_exact_marker():
    workflow = load_workflow()
    validate = node(workflow, "Validate Site ID")["parameters"]["jsCode"]
    mint = node(workflow, "Mint Capture Token")
    browserless = node(workflow, "Browserless Capture")
    prepare = node(workflow, "Prepare Browserless")["parameters"]["jsCode"]

    assert r"^[A-Z0-9][A-Z0-9_-]{1,31}$" in validate
    assert mint["parameters"]["method"] == "POST"
    assert "/api/v1/integrations/n8n/site-detail-capture-token" in mint["parameters"]["url"]
    assert mint["parameters"]["authentication"] == "genericCredentialType"
    assert mint["credentials"]["httpHeaderAuth"]["name"] == "NOD Capture API Key"
    assert "/chromium/bql" in browserless["parameters"]["url"]
    assert browserless["parameters"]["method"] == "POST"
    assert "viewport(width: 1200, height: 1000, deviceScaleFactor: 1.5)" in prepare
    assert "[data-capture-state=\"ready\"][data-capture-site-id=\"" in prepare
    assert 'selector: ".site-detail-modal"' in prepare
    assert "captureBeyondViewport: true" in prepare


def test_capture_workflow_validates_png_and_sends_a_document_without_returning_it():
    workflow = load_workflow()
    converter = node(workflow, "Validate PNG and Create Binary")["parameters"]["jsCode"]
    telegram = node(workflow, "Send Telegram Document")
    final_status = node(workflow, "Return Capture Status")["parameters"]["jsCode"]

    assert "89504e470d0a1a0a" in converter
    assert "mimeType: 'image/png'" in converter
    assert "readUInt32BE(16)" in converter
    assert "readUInt32BE(20)" in converter
    assert "50 * 1024 * 1024" in converter
    assert "CAPTURE_PNG_CROPPED" in converter
    assert "binary" in converter and "data" in converter
    assert telegram["parameters"]["resource"] == "message"
    assert telegram["parameters"]["operation"] == "sendDocument"
    assert telegram["parameters"]["binaryData"] is True
    assert telegram["parameters"]["binaryPropertyName"] == "data"
    assert telegram["retryOnFail"] is True
    assert telegram["maxTries"] == 2
    assert "base64" not in final_status
    assert "binary" not in final_status


def test_capture_workflow_has_bounded_transient_retry_and_no_embedded_credential_values():
    workflow = load_workflow()
    browserless = node(workflow, "Browserless Capture")
    workflow_text = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert browserless["retryOnFail"] is True
    assert browserless["maxTries"] == 2
    assert "Capture Failure" in {item["name"] for item in workflow["nodes"]}
    assert "token=[A-Za-z0-9_-]{16,}" not in workflow_text
    assert '"value": "' not in json.dumps(
        [item.get("credentials", {}) for item in workflow["nodes"]]
    )
