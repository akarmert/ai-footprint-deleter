"""Development-only, offline C2PA SDK inspection; never a cleaning verdict.

Run with the project's Python environment:
    python web/tests/c2pa-sdk-check.py local-file.jpg [another-local-file.png]
No media, manifest text, paths, or SDK exception messages are emitted.
"""

import argparse
import importlib.metadata
import io
import json
from pathlib import Path
import re

import c2pa


OFFLINE_SETTINGS = {
    "core": {"allowed_network_hosts": []},
    "verify": {"remote_manifest_fetch": False, "ocsp_fetch": False},
}
_CODE = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+\Z")


def _codes(active):
    """Only active-manifest codes; never ingredient reports or explanations."""
    result = {}
    for bucket in ("success", "failure", "informational"):
        entries = active.get(bucket, [])
        if not isinstance(entries, list):
            raise ValueError("invalid validation bucket")
        codes = set()
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("invalid validation entry")
            code = entry.get("code")
            if isinstance(code, str) and len(code) <= 128 and _CODE.fullmatch(code):
                codes.add(code)
        result[bucket] = sorted(codes)
    return result


def inspect_bytes(data):
    """Inspect bytes without persisting transformed media or fetching URLs.

    ManifestNotFound means SDK-level absence only. Container validity remains
    unknown and must be checked independently by the parent engine.
    """
    result = {
        "sdk": {
            "pythonPackage": importlib.metadata.version("c2pa-python"),
            "native": c2pa.sdk_version(),
        },
        "presence": "unknown",
        "readability": "unreadable",
        "signature": "unknown",
        "trust": "unknown",
        "integrity": "unknown",
        "containerValidity": "unknown",
        "activeValidationCodes": {"success": [], "failure": [], "informational": []},
        "error": None,
    }
    try:
        with c2pa.Settings.from_dict(OFFLINE_SETTINGS) as settings:
            with c2pa.Context(settings=settings) as context:
                try:
                    reader = c2pa.Reader(stream=io.BytesIO(data), context=context)
                except c2pa.C2paError.ManifestNotFound:
                    result.update(presence="absent", readability="readable")
                    return result
                with reader:
                    report = json.loads(reader.json())
                    if not isinstance(report, dict):
                        raise ValueError("invalid report")
                    label = report.get("active_manifest")
                    manifests = report.get("manifests")
                    if (not isinstance(label, str) or not label
                            or not isinstance(manifests, dict)
                            or not isinstance(manifests.get(label), dict)):
                        raise ValueError("missing active manifest")
                    result["presence"] = "present"
                    validation = report.get("validation_results")
                    if not isinstance(validation, dict):
                        raise ValueError("missing validation results")
                    active = validation.get("activeManifest")
                    if not isinstance(active, dict):
                        raise ValueError("missing active validation")
                    codes = _codes(active)
                    result["activeValidationCodes"] = codes
                    success, failure = set(codes["success"]), set(codes["failure"])
                    result["readability"] = "readable"
                    if "claimSignature.mismatch" in failure:
                        result["signature"] = "mismatch"
                    elif "claimSignature.validated" in success:
                        result["signature"] = "validated"
                    if "signingCredential.untrusted" in failure:
                        result["trust"] = "untrusted"
                    elif "signingCredential.trusted" in success:
                        result["trust"] = "trusted"
                    hash_prefixes = ("assertion.hashedURI.", "assertion.dataHash.",
                                     "assertion.bmffHash.", "assertion.boxesHash.")
                    if any(code.startswith(hash_prefixes) and code.endswith(".mismatch")
                           for code in failure):
                        result["integrity"] = "mismatch"
                    elif any(code in success for code in (
                            "assertion.dataHash.match", "assertion.bmffHash.match",
                            "assertion.boxesHash.match")):
                        # A binding match does not imply every assertion was validated.
                        result["integrity"] = "bindingMatched"
    except c2pa.C2paError:
        result["error"] = "sdkReadError"
    except (ValueError, TypeError, KeyError):
        result["error"] = "invalidSdkReport"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    records = []
    for index, path in enumerate(args.paths):
        try:
            result = inspect_bytes(path.read_bytes())
        except OSError:
            result = {"sdk": {"pythonPackage": importlib.metadata.version("c2pa-python"),
                              "native": c2pa.sdk_version()},
                      "presence": "unknown", "readability": "unreadable",
                      "signature": "unknown", "trust": "unknown", "integrity": "unknown",
                      "containerValidity": "unknown",
                      "activeValidationCodes": {"success": [], "failure": [], "informational": []},
                      "error": "inputReadError"}
        records.append({"inputIndex": index, **result})
    print(json.dumps({"purpose": "developmentInspectionOnly", "results": records}))


if __name__ == "__main__":
    main()
