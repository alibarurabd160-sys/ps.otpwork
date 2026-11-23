"""Unit tests for render_app/app.py."""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from render_app.app import (
    WorkspaceHandler,
    extract_phone_from_payload,
    strip_country_code,
    validate_iframe_url,
    validate_public_http_url,
)


class TestNumberAndUrlHelpers(unittest.TestCase):
    def test_strip_country_code_explicit_and_auto(self) -> None:
        self.assertEqual(strip_country_code("+8801712345678", "880"), "1712345678")
        self.assertEqual(strip_country_code("008801819876543", "880"), "1819876543")
        self.assertEqual(strip_country_code("+14155550142", "auto"), "4155550142")
        self.assertEqual(strip_country_code("+447911123456", "auto"), "7911123456")

    def test_extract_phone_from_payload(self) -> None:
        self.assertEqual(extract_phone_from_payload({"number": "+8801700000000"}), "+8801700000000")
        self.assertEqual(
            extract_phone_from_payload({"data": {"phone_number": "+14155550199"}}),
            "+14155550199",
        )
        self.assertEqual(extract_phone_from_payload("+8801911223344"), "+8801911223344")
        with self.assertRaises(ValueError):
            extract_phone_from_payload({"status": "ok"})

    def test_ssrf_blocks_local_and_private_urls(self) -> None:
        for bad in (
            "http://127.0.0.1:8080/api",
            "http://localhost/test",
            "http://169.254.169.254/latest/meta-data",
            "http://10.0.0.1/internal",
            "file:///etc/passwd",
        ):
            with self.assertRaises(ValueError):
                validate_public_http_url(bad)

    def test_iframe_url_rejects_javascript_scheme(self) -> None:
        self.assertEqual(validate_iframe_url("https://example.com"), "https://example.com")
        with self.assertRaises(ValueError):
            validate_iframe_url("javascript:alert(1)")


class TestHttpEndpoints(unittest.TestCase):
    def setUp(self) -> None:
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), WorkspaceHandler)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def test_demo_login_get_number_and_logout(self) -> None:
        login_req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/login",
            data=json.dumps(
                {
                    "windowCount": 4,
                    "browserUrl": "https://example.com",
                    "countryCode": "880",
                    "demoMode": True,
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(login_req) as resp:
            login_data = json.loads(resp.read().decode("utf-8"))
        token = login_data["token"]
        self.assertEqual(login_data["windowCount"], 4)

        num_req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/get-number",
            data=b"",
            headers={"Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(num_req) as resp:
            num_data = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(num_data["rawNumber"], "+8801712345678")
        self.assertEqual(num_data["localNumber"], "1712345678")

        logout_req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/logout",
            data=b"",
            headers={"Authorization": f"Bearer {token}"},
            method="POST",
        )
        with urllib.request.urlopen(logout_req) as resp:
            self.assertEqual(resp.status, 200)

        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(num_req)
        self.assertEqual(ctx.exception.code, 401)


if __name__ == "__main__":
    unittest.main()
