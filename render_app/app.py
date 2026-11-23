#!/usr/bin/env python3
"""Render-ready Multi-Window Web & API Number Fetcher (Pure Python 3 Stdlib).

Deploy directly on Render with Start Command: python3 app.py
Binds to 0.0.0.0 and reads PORT from the environment (default 10000).
"""

from __future__ import annotations

import html
import ipaddress
import json
import os
import re
import secrets
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

COMMON_COUNTRY_CODES = ("880", "91", "44", "61", "65", "60", "971", "966", "1")
DEMO_NUMBERS = [
    "+8801712345678",
    "+8801819876543",
    "+8801911223344",
    "+8801615556677",
    "+14155550142",
    "+447911123456",
]

SESSION_LOCK = threading.Lock()
SESSIONS: dict[str, dict[str, Any]] = {}


def validate_public_http_url(raw_url: str) -> str:
    """Validate that a URL is http/https and does not target local/private IPs."""
    candidate = (raw_url or "").strip()
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL must contain a valid hostname")

    lowered = hostname.lower()
    if lowered in ("localhost", "localhost.localdomain") or lowered.endswith(
        (".local", ".internal")
    ):
        raise ValueError("Local or internal hostnames are not permitted")

    try:
        addr_info = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve hostname: {hostname}") from exc

    for entry in addr_info:
        ip_str = entry[4][0]
        ip_obj = ipaddress.ip_address(ip_str)
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_multicast
            or ip_obj.is_reserved
            or ip_obj.is_unspecified
        ):
            raise ValueError("Private, loopback, or link-local IP addresses are blocked")

    return candidate


def validate_iframe_url(raw_url: str) -> str:
    """Validate that the browser target URL uses http or https safely."""
    candidate = (raw_url or "").strip()
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Browser link must be a valid http:// or https:// URL")
    return candidate


def strip_country_code(raw_number: str, country_code: str = "auto") -> str:
    """Return digits-only local phone number with the country code removed."""
    cleaned = re.sub(r"[^\d+]", "", (raw_number or "").strip())
    if not cleaned:
        return ""

    has_plus = cleaned.startswith("+")
    digits = cleaned.lstrip("+")

    if digits.startswith("00") and len(digits) > 4:
        digits = digits[2:]
        has_plus = True

    code = re.sub(r"\D", "", country_code or "")
    if code and country_code.lower() != "auto":
        if digits.startswith(code) and len(digits) > len(code):
            return digits[len(code) :]
        return digits

    if has_plus or len(digits) > 10:
        for prefix in COMMON_COUNTRY_CODES:
            if digits.startswith(prefix) and len(digits) > len(prefix) + 5:
                return digits[len(prefix) :]

    return digits


def extract_phone_from_payload(payload: Any) -> str:
    """Extract a phone number string from common JSON API shapes or plain text."""
    if isinstance(payload, str):
        text = payload.strip()
        if text:
            return text
    if isinstance(payload, dict):
        for key in ("number", "phone", "phone_number", "mobile", "msisdn", "tel"):
            val = payload.get(key)
            if isinstance(val, (str, int)) and str(val).strip():
                return str(val).strip()
        for nested_key in ("data", "result", "response"):
            nested = payload.get(nested_key)
            if isinstance(nested, (dict, list)):
                found = extract_phone_from_payload(nested)
                if found:
                    return found
    if isinstance(payload, list) and payload:
        return extract_phone_from_payload(payload[0])
    raise ValueError("API response did not contain a recognizable phone number field")


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Block HTTP redirects to prevent SSRF redirect bypasses."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        raise urllib.error.HTTPError(
            newurl, code, "Redirects are disabled for outbound API requests", headers, fp
        )


def fetch_number_from_api(base_url: str, api_key: str) -> str:
    """Perform a safe outbound GET request to the configured API Base URL."""
    validated_url = validate_public_http_url(base_url)
    request = urllib.request.Request(
        validated_url,
        method="GET",
        headers={
            "Accept": "application/json, text/plain;q=0.9",
            "Authorization": f"Bearer {api_key}",
            "X-API-Key": api_key,
            "User-Agent": "MultiWindowWorkspace/1.0",
        },
    )
    opener = urllib.request.build_opener(NoRedirectHandler())
    with opener.open(request, timeout=10) as response:
        body_bytes = response.read(65536)
        raw_text = body_bytes.decode("utf-8", errors="replace").strip()

    try:
        parsed_json = json.loads(raw_text)
        return extract_phone_from_payload(parsed_json)
    except json.JSONDecodeError:
        return extract_phone_from_payload(raw_text)


HTML_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MultiPane API Workspace</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0f766e;
      --accent-hover: #0d9488;
      --danger: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 24px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .brand { font-weight: 700; font-size: 16px; white-space: nowrap; }
    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn.active {
      background: #0f172a;
      border-color: #0f172a;
      color: #ffffff;
    }
    .login-wrap {
      max-width: 520px;
      margin: 48px auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .field input, .field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 14px;
    }
    .row-btns { display: flex; gap: 8px; }
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 24px;
      background: #f1f5f9;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .grid {
      display: grid;
      gap: 12px;
      padding: 12px;
      height: calc(100vh - 108px);
    }
    .grid-1 { grid-template-columns: 1fr; }
    .grid-2 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(3, 1fr); }
    .grid-4 { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
    .pane {
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      min-height: 260px;
    }
    .pane-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
    }
    .pane iframe {
      flex: 1;
      width: 100%;
      border: 0;
      background: #ffffff;
    }
    .error { color: var(--danger); font-size: 13px; margin-top: 8px; }
    .hidden { display: none; }
    @media (max-width: 900px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; grid-template-rows: auto; height: auto; }
      .pane { min-height: 360px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">MultiPane API Workspace</div>
    <div id="workspace-controls" class="controls hidden">
      <div class="row-btns" role="group" aria-label="Window count">
        <button type="button" class="btn win-opt" data-count="1">1 Window</button>
        <button type="button" class="btn win-opt" data-count="2">2 Windows</button>
        <button type="button" class="btn win-opt" data-count="3">3 Windows</button>
        <button type="button" class="btn win-opt active" data-count="4">4 Windows</button>
      </div>
      <button type="button" id="get-number-btn" class="btn btn-primary">Get Number</button>
      <button type="button" id="logout-btn" class="btn">Logout</button>
    </div>
  </header>

  <main id="login-view" class="login-wrap">
    <h1 style="margin:0 0 6px;font-size:20px;">API &amp; Window Setup</h1>
    <p style="margin:0 0 20px;font-size:13px;color:var(--muted);">
      Configure your API endpoint, key, browser link, and window layout.
    </p>
    <form id="login-form">
      <div class="field">
        <label for="windowCount">Number of Windows</label>
        <select id="windowCount" name="windowCount">
          <option value="1">1 Window</option>
          <option value="2">2 Windows</option>
          <option value="3">3 Windows</option>
          <option value="4" selected>4 Windows</option>
        </select>
      </div>
      <div class="field">
        <label for="baseUrl">API Base URL</label>
        <input id="baseUrl" type="password" placeholder="https://api.example.com/number" />
      </div>
      <div class="field">
        <label for="apiKey">API Key</label>
        <input id="apiKey" type="password" placeholder="Enter API key" />
      </div>
      <div class="field">
        <label for="browserUrl">Browser Link (Opened in All Windows)</label>
        <input id="browserUrl" type="url" value="https://example.com" required />
      </div>
      <div class="field">
        <label for="countryCode">Country Code to Strip</label>
        <select id="countryCode">
          <option value="auto">Auto-detect</option>
          <option value="880" selected>+880 (Bangladesh)</option>
          <option value="1">+1 (US / Canada)</option>
          <option value="44">+44 (UK)</option>
          <option value="91">+91 (India)</option>
        </select>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:8px;">
        <input id="demoMode" type="checkbox" style="width:auto;" />
        <label for="demoMode" style="margin:0;font-weight:500;">Use built-in Demo API (no external API required)</label>
      </div>
      <div class="row-btns">
        <button type="submit" class="btn btn-primary" style="flex:1;">Login &amp; Open Windows</button>
      </div>
      <div id="login-error" class="error"></div>
    </form>
  </main>

  <section id="workspace-view" class="hidden">
    <div class="status-bar">
      <div>
        <span>Fetched number: </span>
        <strong id="number-display" class="mono">None yet</strong>
        <span id="copy-status" style="margin-left:10px;color:var(--accent);"></span>
      </div>
      <button type="button" id="copy-again-btn" class="btn">Copy Number</button>
    </div>
    <div id="window-grid" class="grid grid-4"></div>
  </section>

  <script>
    let authToken = null;
    let currentBrowserUrl = "https://example.com";
    let currentWindowCount = 4;
    let lastLocalNumber = "";

    const loginView = document.getElementById("login-view");
    const workspaceView = document.getElementById("workspace-view");
    const workspaceControls = document.getElementById("workspace-controls");
    const windowGrid = document.getElementById("window-grid");
    const loginError = document.getElementById("login-error");
    const numberDisplay = document.getElementById("number-display");
    const copyStatus = document.getElementById("copy-status");

    function renderWindows() {
      windowGrid.className = "grid grid-" + currentWindowCount;
      windowGrid.innerHTML = "";
      document.querySelectorAll(".win-opt").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.count) === currentWindowCount);
      });
      for (let i = 1; i <= currentWindowCount; i++) {
        const pane = document.createElement("div");
        pane.className = "pane";
        const head = document.createElement("div");
        head.className = "pane-head";
        const title = document.createElement("span");
        title.textContent = "Window " + i;
        const reloadBtn = document.createElement("button");
        reloadBtn.type = "button";
        reloadBtn.className = "btn";
        reloadBtn.style.padding = "4px 8px";
        reloadBtn.style.fontSize = "11px";
        reloadBtn.textContent = "Reload";
        const frame = document.createElement("iframe");
        frame.title = "Window " + i;
        frame.src = currentBrowserUrl;
        frame.referrerPolicy = "no-referrer";
        reloadBtn.addEventListener("click", () => { frame.src = currentBrowserUrl; });
        head.appendChild(title);
        head.appendChild(reloadBtn);
        pane.appendChild(head);
        pane.appendChild(frame);
        windowGrid.appendChild(pane);
      }
    }

    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.textContent = "";
      const payload = {
        windowCount: Number(document.getElementById("windowCount").value),
        baseUrl: document.getElementById("baseUrl").value,
        apiKey: document.getElementById("apiKey").value,
        browserUrl: document.getElementById("browserUrl").value,
        countryCode: document.getElementById("countryCode").value,
        demoMode: document.getElementById("demoMode").checked
      };
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        authToken = data.token;
        currentBrowserUrl = data.browserUrl;
        currentWindowCount = data.windowCount;
        loginView.classList.add("hidden");
        workspaceView.classList.remove("hidden");
        workspaceControls.classList.remove("hidden");
        renderWindows();
      } catch (err) {
        loginError.textContent = err.message;
      }
    });

    document.querySelectorAll(".win-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentWindowCount = Number(btn.dataset.count);
        renderWindows();
      });
    });

    async function copyText(text) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyStatus.textContent = "Copied (without country code)";
      } catch {
        copyStatus.textContent = "Click Copy Number if clipboard prompt was blocked";
      }
    }

    document.getElementById("get-number-btn").addEventListener("click", async () => {
      if (!authToken) return;
      copyStatus.textContent = "Fetching...";
      try {
        const res = await fetch("/api/get-number", {
          method: "POST",
          headers: { "Authorization": "Bearer " + authToken }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch number");
        lastLocalNumber = data.localNumber;
        numberDisplay.textContent = data.localNumber + " (raw: " + data.rawNumber + ")";
        await copyText(data.localNumber);
      } catch (err) {
        copyStatus.textContent = err.message;
      }
    });

    document.getElementById("copy-again-btn").addEventListener("click", () => copyText(lastLocalNumber));

    document.getElementById("logout-btn").addEventListener("click", async () => {
      if (authToken) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "Authorization": "Bearer " + authToken }
        });
      }
      authToken = null;
      windowGrid.innerHTML = "";
      workspaceView.classList.add("hidden");
      workspaceControls.classList.add("hidden");
      loginView.classList.remove("hidden");
    });
  </script>
</body>
</html>
"""


class WorkspaceHandler(BaseHTTPRequestHandler):
    """HTTP request handler serving the UI and authenticated JSON endpoints."""

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        encoded = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 65536:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _get_session(self) -> tuple[str | None, dict[str, Any] | None]:
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None, None
        token = auth_header[7:].strip()
        with SESSION_LOCK:
            session = SESSIONS.get(token)
        return token, session

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/" or self.path == "/index.html":
            page = HTML_PAGE.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)
            return
        if self.path == "/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/login":
            try:
                body = self._read_json_body()
                window_count = max(1, min(4, int(body.get("windowCount", 4))))
                browser_url = validate_iframe_url(str(body.get("browserUrl", "")))
                demo_mode = bool(body.get("demoMode", False))
                country_code = str(body.get("countryCode", "auto"))
                base_url = str(body.get("baseUrl", "")).strip()
                api_key = str(body.get("apiKey", "")).strip()

                if not demo_mode:
                    base_url = validate_public_http_url(base_url)
                    if not api_key:
                        raise ValueError("API key is required when Demo Mode is off")

                token = secrets.token_hex(32)
                with SESSION_LOCK:
                    SESSIONS[token] = {
                        "base_url": base_url,
                        "api_key": api_key,
                        "browser_url": browser_url,
                        "country_code": country_code,
                        "window_count": window_count,
                        "demo_mode": demo_mode,
                        "demo_index": 0,
                    }

                self._send_json(
                    HTTPStatus.OK,
                    {
                        "token": token,
                        "windowCount": window_count,
                        "browserUrl": html.unescape(browser_url),
                    },
                )
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        if self.path == "/api/get-number":
            token, session = self._get_session()
            if not token or not session:
                self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Unauthorized"})
                return

            try:
                if session["demo_mode"]:
                    with SESSION_LOCK:
                        idx = session["demo_index"]
                        session["demo_index"] = (idx + 1) % len(DEMO_NUMBERS)
                    raw_number = DEMO_NUMBERS[idx]
                else:
                    raw_number = fetch_number_from_api(
                        session["base_url"], session["api_key"]
                    )

                local_number = strip_country_code(raw_number, session["country_code"])
                self._send_json(
                    HTTPStatus.OK,
                    {"rawNumber": raw_number, "localNumber": local_number},
                )
            except (ValueError, urllib.error.URLError, TimeoutError) as exc:
                self._send_json(HTTPStatus.BAD_GATEWAY, {"error": str(exc)})
            return

        if self.path == "/api/logout":
            token, _ = self._get_session()
            if token:
                with SESSION_LOCK:
                    SESSIONS.pop(token, None)
            self._send_json(HTTPStatus.OK, {"ok": True})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


def main() -> None:
    port = int(os.environ.get("PORT", "10000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), WorkspaceHandler)
    print(f"Serving MultiPane API Workspace on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
