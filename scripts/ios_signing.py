"""App Store signing on a CI Mac without Apple's cloud signing (that needs an Admin API key).

Adapted from the Capacitor app's scripts/ios_signing.py. The app and each app extension (targets/*: <app>.controls,
.keyboard, .share, .calldirectory, .notify) get a profile.

setup:        make a key + CSR, create an Apple Distribution certificate, make an App Store profile for the app
              through the App Store Connect API, install both in a temporary keychain, and write PROFILE_APP /
              PROFILE_NAME / PROFILE_UUID to GITHUB_ENV. Records what the profile grants.
entitlements: after expo prebuild, keep in the app's .entitlements only what its profile grants.
wait_build:   wait until App Store Connect lists the uploaded build (BUILD_NUMBER) and print its processing state.
cleanup:      delete the profile and revoke the certificate made by setup. Builds already uploaded to
              App Store Connect / TestFlight stay valid; Apple re-signs them.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, RUNNER_TEMP, GITHUB_ENV (setup writes to it), BUILD_NUMBER.
Run logs of a public repo are public: nothing here prints names, emails or keys.
"""
import base64, glob, json, os, plistlib, re, subprocess, sys, time, urllib.error, urllib.request, uuid

import jwt  # PyJWT

API = "https://api.appstoreconnect.apple.com/v1"
TMP = os.environ.get("RUNNER_TEMP", "/tmp")
STATE = os.path.join(TMP, "signing-state.json")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def token():
    key = open(os.environ["ASC_KEY_PATH"]).read()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise SystemExit(f"App Store Connect API {method} {path} failed ({e.code}): {detail}")


def sh(*cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


def mask(value):
    """Hide a value in every later line of the GitHub log (workflow command; not shown itself)."""
    if value and os.environ.get("GITHUB_ACTIONS"):
        print(f"::add-mask::{value}")


def setup():
    bundle = os.environ["BUNDLE_ID"]
    key, csr = os.path.join(TMP, "dist.key"), os.path.join(TMP, "dist.csr")
    sh("openssl", "genrsa", "-out", key, "2048")
    sh("openssl", "req", "-new", "-key", key, "-out", csr, "-subj", "/CN=Agentic OS CI/C=IN")
    csr_text = "".join(l for l in open(csr).read().splitlines() if "CERTIFICATE REQUEST" not in l)

    cert = call("POST", "/certificates", {"data": {"type": "certificates",
        "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_text}}})["data"]
    state = {"certificate": cert["id"], "profiles": [], "granted": {}}
    json.dump(state, open(STATE, "w"))
    der = os.path.join(TMP, "dist.cer")
    open(der, "wb").write(base64.b64decode(cert["attributes"]["certificateContent"]))

    # Temporary keychain holding the key and certificate.
    kc, kc_pw, p12_pw = os.path.join(TMP, "ci.keychain-db"), uuid.uuid4().hex, uuid.uuid4().hex
    pem, p12 = os.path.join(TMP, "dist.pem"), os.path.join(TMP, "dist.p12")
    sh("openssl", "x509", "-inform", "DER", "-in", der, "-out", pem)
    sh("openssl", "pkcs12", "-export", "-legacy", "-inkey", key, "-in", pem, "-out", p12, "-passout", f"pass:{p12_pw}")
    sh("security", "create-keychain", "-p", kc_pw, kc)
    sh("security", "set-keychain-settings", "-lut", "21600", kc)
    sh("security", "unlock-keychain", "-p", kc_pw, kc)
    sh("security", "import", p12, "-k", kc, "-P", p12_pw, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
    sh("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", kc_pw, kc)
    existing = [l.strip().strip('"') for l in sh("security", "list-keychains", "-d", "user").splitlines()]
    sh("security", "list-keychains", "-d", "user", "-s", kc, *existing)
    identity = sh("security", "find-identity", "-v", "-p", "codesigning", kc)
    # The identity carries the account holder's name: mask it before xcodebuild prints it.
    for full in re.findall(r'"([^"]+)"', identity):
        mask(full)
        holder = re.match(r"Apple Distribution: (.+) \([A-Z0-9]+\)$", full)
        if holder:
            mask(holder.group(1))
    print(f"Keychain ready: {len(re.findall(r'Apple Distribution', identity))} distribution identity")

    d = os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles")
    os.makedirs(d, exist_ok=True)
    stamp = int(time.time())
    made = {}
    for role, ident, label in (("APP", bundle, "Agentic OS"), ("EXT", f"{bundle}.controls", "Agentic OS Controls"),
                               ("KBD", f"{bundle}.keyboard", "Agentic OS Keyboard"),
                               ("SHR", f"{bundle}.share", "Agentic OS Share"),
                               ("CDX", f"{bundle}.calldirectory", "Agentic OS Call Directory"),
                               ("NSE", f"{bundle}.notify", "Agentic OS Notifications")):
        name = f"{label} CI {stamp}"
        pk = ensure_bundle(ident, label)
        prof = call("POST", "/profiles", {"data": {"type": "profiles",
            "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": pk}},
                              "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]}}}})["data"]
        state["profiles"].append(prof["id"])
        json.dump(state, open(STATE, "w"))
        uid = prof["attributes"]["uuid"]
        path = os.path.join(d, f"{uid}.mobileprovision")
        open(path, "wb").write(base64.b64decode(prof["attributes"]["profileContent"]))
        state["granted"][role] = granted(path)
        json.dump(state, open(STATE, "w"))
        print(f"  {role} grants: {', '.join(state['granted'][role])}")
        print(f"Profile '{name}' ({uid}) for {ident}")
        made[role] = (name, uid)

    with open(os.environ["GITHUB_ENV"], "a") as env:
        env.write(f"PROFILE_APP={made['APP'][0]}\nPROFILE_NAME={made['APP'][0]}\nPROFILE_UUID={made['APP'][1]}\n")
        env.write(f"PROFILE_EXT={made['EXT'][0]}\nPROFILE_KBD={made['KBD'][0]}\nPROFILE_SHR={made['SHR'][0]}\n")
        env.write(f"PROFILE_CDX={made['CDX'][0]}\nPROFILE_NSE={made['NSE'][0]}\n")
    print(f"Signing ready: certificate {cert['id']}, {len(made)} profiles")


def granted(profile_path):
    """The entitlement keys a provisioning profile allows (decoded with the system's CMS tool)."""
    raw = subprocess.run(["security", "cms", "-D", "-i", profile_path], check=True, capture_output=True).stdout
    return sorted(plistlib.loads(raw).get("Entitlements", {}).keys())


def keep(requested, allowed):
    """The requested entitlements a profile with these allowed keys can sign, and the ones it can't."""
    allowed = set(allowed)
    out, dropped = {}, []
    for key, value in requested.items():
        if key in allowed or (key == "com.apple.developer.healthkit.access" and "com.apple.developer.healthkit" in allowed):
            out[key] = value
        else:
            dropped.append(key)
    return out, dropped


def entitlements():
    """After expo prebuild: the app's entitlements, cut to what its profile grants."""
    if not os.path.exists(STATE):
        print("No signing state: entitlements left as they are.")
        return
    allowed = json.load(open(STATE)).get("granted", {}).get("APP", [])
    files = [p for p in glob.glob(os.path.join(ROOT, "ios", "*", "*.entitlements")) if "/Pods/" not in p]
    if not files:
        print("No .entitlements file in ios/: nothing to trim.")
    for path in files:
        with open(path, "rb") as f:
            requested = plistlib.load(f)
        kept, dropped = keep(requested, allowed)
        with open(path, "wb") as f:
            plistlib.dump(kept, f)
        line = f"{os.path.relpath(path, ROOT)}: keeps {', '.join(sorted(kept)) or 'nothing'}"
        if dropped:
            line += f"; drops {', '.join(dropped)} (not in the profile)"
        print(line)


def ensure_bundle(ident, label):
    ids = call("GET", f"/bundleIds?filter[identifier]={ident}&limit=200")["data"]
    match = [b for b in ids if b["attributes"]["identifier"] == ident]
    if match:
        return match[0]["id"]
    made = call("POST", "/bundleIds", {"data": {"type": "bundleIds",
        "attributes": {"identifier": ident, "name": label, "platform": "IOS"}}})["data"]
    print(f"Registered bundle ID {ident}")
    return made["id"]


def wait_build():
    """Wait (up to WAIT_MINUTES, default 20) for App Store Connect to list build BUILD_NUMBER of BUNDLE_ID."""
    bundle, number = os.environ["BUNDLE_ID"], os.environ["BUILD_NUMBER"]
    apps = call("GET", f"/apps?filter[bundleId]={bundle}")["data"]
    if not apps:
        raise SystemExit(f"No App Store Connect app for {bundle}.")
    app = apps[0]["id"]
    deadline = time.time() + 60 * int(os.environ.get("WAIT_MINUTES", "20"))
    last = None
    while time.time() < deadline:
        builds = call("GET", f"/builds?filter[app]={app}&filter[version]={number}&limit=5")["data"]
        if builds:
            a = builds[0]["attributes"]
            state = a.get("processingState")
            if state != last:
                print(f"build {number} uploaded {a.get('uploadedDate')} state {state}")
                last = state
            if state in ("VALID", "FAILED", "INVALID"):
                if state != "VALID":
                    raise SystemExit(f"Build {number} processing ended {state}.")
                return
        elif last is None:
            print(f"build {number} not listed yet")
            last = "unlisted"
        time.sleep(30)
    print(f"Stopped waiting; last state {last}. The build may still be processing.")


def next_build():
    """Write BUILD_NUMBER = one above the highest build App Store Connect holds for BUNDLE_ID (floor: BUILD_FLOOR).
    The dev client and the release workflow upload to the same app, and a build number can't repeat or go down."""
    bundle, floor = os.environ["BUNDLE_ID"], int(os.environ.get("BUILD_FLOOR", "100"))
    apps = call("GET", f"/apps?filter[bundleId]={bundle}")["data"]
    top = 0
    if apps:
        builds = call("GET", f"/builds?filter[app]={apps[0]['id']}&sort=-uploadedDate&limit=200")["data"]
        top = max([int(b["attributes"]["version"]) for b in builds if b["attributes"]["version"].isdigit()] or [0])
    number = max(top + 1, floor)
    print(f"highest uploaded build {top}; this run builds {number}")
    with open(os.environ["GITHUB_ENV"], "a") as f:
        f.write(f"BUILD_NUMBER={number}\n")


def cleanup():
    if not os.path.exists(STATE):
        return
    state = json.load(open(STATE))
    gone = [("profiles", p) for p in state.get("profiles", [])]
    if state.get("certificate"):
        gone.append(("certificates", state["certificate"]))
    for kind, ident in gone:
        try:
            call("DELETE", f"/{kind}/{ident}")
            print(f"Removed {kind[:-1]} {ident}")
        except SystemExit as e:
            print(e)


if __name__ == "__main__":
    {"setup": setup, "entitlements": entitlements, "wait_build": wait_build, "next_build": next_build,
     "cleanup": cleanup}[sys.argv[1]]()
