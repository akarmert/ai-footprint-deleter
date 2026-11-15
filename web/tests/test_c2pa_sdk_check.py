"""Offline integration checks for the development-only SDK inspector.

The optional official fixture is read in place; mutations exist only in memory.
Set C2PA_OFFICIAL_FIXTURE to an explicitly authorized local copy to enable them.
"""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("c2pa_sdk_check", HERE / "c2pa-sdk-check.py")
assert SPEC is not None and SPEC.loader is not None
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)
OFFICIAL_SHA256 = "75a8da33f6eaf1e16bf3b42cd78913b22b2e6a671fda217a508b1ba4230ce864"


class LocalSdkChecks(unittest.TestCase):
    def test_clean_jpeg_reports_absence_without_claiming_container_validity(self):
        result = CHECK.inspect_bytes((HERE / "fixtures" / "image-1.jpg").read_bytes())
        self.assertEqual(result["presence"], "absent")
        self.assertEqual(result["readability"], "readable")
        self.assertEqual(result["containerValidity"], "unknown")
        for key in ("signature", "trust", "integrity"):
            self.assertEqual(result[key], "unknown")
        self.assertEqual(result["sdk"]["pythonPackage"], "0.38.0")

    def test_invalid_bytes_are_not_manifest_absence(self):
        result = CHECK.inspect_bytes(b"not an image")
        self.assertEqual(result["presence"], "unknown")
        self.assertEqual(result["readability"], "unreadable")
        self.assertEqual(result["error"], "sdkReadError")

    def test_cli_emits_json_without_paths_or_manifest_text(self):
        path = HERE / "fixtures" / "image-1.jpg"
        output = subprocess.check_output(
            [sys.executable, str(HERE / "c2pa-sdk-check.py"), str(path)], text=True)
        report = json.loads(output)
        self.assertEqual(report["results"][0]["presence"], "absent")
        self.assertNotIn(str(path), output)
        self.assertNotIn("active_manifest", output)
        self.assertNotIn("explanation", output)


@unittest.skipUnless(os.environ.get("C2PA_OFFICIAL_FIXTURE"),
                     "C2PA_OFFICIAL_FIXTURE was not explicitly supplied")
class OfficialFixtureChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import hashlib
        cls.data = Path(os.environ["C2PA_OFFICIAL_FIXTURE"]).read_bytes()
        if hashlib.sha256(cls.data).hexdigest() != OFFICIAL_SHA256:
            raise ValueError("official fixture hash mismatch")

    def test_valid_signature_does_not_imply_trusted_signer(self):
        result = CHECK.inspect_bytes(self.data)
        self.assertEqual(result["presence"], "present")
        self.assertEqual(result["readability"], "readable")
        self.assertEqual(result["signature"], "validated")
        self.assertEqual(result["trust"], "untrusted")
        self.assertEqual(result["integrity"], "bindingMatched")
        self.assertIn("signingCredential.ocsp.skipped",
                      result["activeValidationCodes"]["informational"])
        output = json.dumps(result)
        for private in ("contentauth:", "make_test_images", "self#jumbf", "explanation"):
            self.assertNotIn(private, output)

    def test_claim_mutation_reports_signature_mismatch_not_absence(self):
        source, replacement = b"make_test_images/0.16.1", b"fake_test_images/0.16.1"
        self.assertEqual(self.data.count(source), 1)
        result = CHECK.inspect_bytes(self.data.replace(source, replacement, 1))
        self.assertEqual(result["presence"], "present")
        self.assertEqual(result["signature"], "mismatch")
        self.assertEqual(result["trust"], "untrusted")
        self.assertEqual(result["integrity"], "bindingMatched")

    def test_assertion_mutation_is_integrity_failure_not_signature_failure(self):
        self.assertIn(b"Adobe", self.data)
        result = CHECK.inspect_bytes(self.data.replace(b"Adobe", b"Xdobe", 1))
        self.assertEqual(result["presence"], "present")
        self.assertEqual(result["signature"], "validated")
        self.assertEqual(result["integrity"], "mismatch")

    def test_truncated_container_is_unreadable_not_absent(self):
        result = CHECK.inspect_bytes(self.data[:4096])
        self.assertEqual(result["presence"], "unknown")
        self.assertEqual(result["readability"], "unreadable")
        self.assertEqual(result["containerValidity"], "unknown")


if __name__ == "__main__":
    unittest.main()
