"""App Store signing on a CI Mac without Apple's cloud signing (that needs an Admin API key).

setup:   make a key + CSR, create an Apple Distribution certificate, register the app's bundle IDs
         (app, widgets, share sheet, keyboard, and the Screen Time extensions with FAMILY_CONTROLS=true), turn on
         their capabilities (Push; HealthKit and time-sensitive notifications, which may be refused without failing
         the build), make an App Store profile for each through the App Store Connect API, install them, and write
         the profile names Xcode needs. It also records what each profile actually grants.
entitlements: after add_targets.rb, keep in each target's .entitlements only what its profile grants, so a
         capability Apple hasn't approved (Family Controls before the request is granted) never breaks signing.
cleanup: delete the profiles and revoke the certificate made by setup. Builds already uploaded
         to App Store Connect / TestFlight stay valid; Apple re-signs them.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, RUNNER_TEMP, GITHUB_ENV (setup writes to it), FAMILY_CONTROLS.
"""
import base64, json, os, plistlib, subprocess, sys, time, urllib.error, urllib.request, uuid

import jwt  # PyJWT

API = "https://api.appstoreconnect.apple.com/v1"
TMP = os.environ.get("RUNNER_TEMP", "/tmp")
STATE = os.path.join(TMP, "signing-state.json")


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


def setup():
    bundle = os.environ["BUNDLE_ID"]
    key, csr = os.path.join(TMP, "dist.key"), os.path.join(TMP, "dist.csr")
    sh("openssl", "genrsa", "-out", key, "2048")
    sh("openssl", "req", "-new", "-key", key, "-out", csr, "-subj", "/CN=Agentic OS CI/C=IN")
    csr_text = "".join(l for l in open(csr).read().splitlines() if "CERTIFICATE REQUEST" not in l)

    cert = call("POST", "/certificates", {"data": {"type": "certificates",
        "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_text}}})["data"]
    state = {"certificate": cert["id"]}
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
    print(identity)

    d = os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles")
    os.makedirs(d, exist_ok=True)
    state["profiles"] = []
    env_lines = []
    stamp = int(time.time())
    state["granted"] = {}
    for env_key, ident, label, caps in targets(bundle):
        pk = ensure_bundle(ident, label)
        for cap in caps:
            ensure_capability(pk, cap)
        name = f"{label} CI {stamp}"
        prof = call("POST", "/profiles", {"data": {"type": "profiles",
            "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": pk}},
                              "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]}}}})["data"]
        state["profiles"].append(prof["id"])
        json.dump(state, open(STATE, "w"))
        uid = prof["attributes"]["uuid"]
        path = os.path.join(d, f"{uid}.mobileprovision")
        open(path, "wb").write(base64.b64decode(prof["attributes"]["profileContent"]))
        state["granted"][env_key] = granted(path)
        json.dump(state, open(STATE, "w"))
        print(f"  {env_key} grants: {', '.join(state['granted'][env_key])}")
        env_lines.append(f"PROFILE_{env_key}={name}")
        if env_key == "APP":
            env_lines += [f"PROFILE_NAME={name}", f"PROFILE_UUID={uid}"]
        print(f"Profile '{name}' ({uid}) for {ident}")

    with open(os.environ["GITHUB_ENV"], "a") as env:
        env.write("\n".join(env_lines) + "\n")
    print(f"Signing ready: certificate {cert['id']}, {len(state['profiles'])} profiles")


# A capability is a list of App Store Connect names to try in order. A leading "?" marks it optional: if the API
# refuses every name, the run goes on and the entitlements step drops what the profile doesn't grant.
def targets(bundle):
    """(env key, bundle id, name, capabilities) for the app and its extensions."""
    family = os.environ.get("FAMILY_CONTROLS", "").lower() == "true"
    app_caps = [["PUSH_NOTIFICATIONS"], ["?HEALTHKIT"], ["?USERNOTIFICATIONS_TIMESENSITIVE", "?TIME_SENSITIVE_NOTIFICATIONS"]]
    if family:
        app_caps.append(["?FAMILY_CONTROLS"])
    out = [("APP", bundle, "Agentic OS", app_caps),
           ("WIDGETS", f"{bundle}.widgets", "Agentic OS Widgets", []),
           ("SHARE", f"{bundle}.share", "Agentic OS Share", []),
           ("KEYBOARD", f"{bundle}.keyboard", "Agentic OS Keyboard", [])]
    if family:
        out += [("MONITOR", f"{bundle}.monitor", "Agentic OS Screen Time Monitor", [["?FAMILY_CONTROLS"]]),
                ("SHIELD", f"{bundle}.shield", "Agentic OS Shield", [["?FAMILY_CONTROLS"]]),
                ("SHIELDACTION", f"{bundle}.shieldaction", "Agentic OS Shield Action", [["?FAMILY_CONTROLS"]])]
    return out


# Where each target's entitlements live under ios/App (add_targets.rb uses the same names).
ENTITLEMENTS = {"APP": "App/App.entitlements", "WIDGETS": "AgenticWidgets/AgenticWidgets.entitlements",
                "SHARE": "AgenticShare/AgenticShare.entitlements", "KEYBOARD": "AgenticKeyboard/AgenticKeyboard.entitlements",
                "MONITOR": "AgenticMonitor/AgenticMonitor.entitlements", "SHIELD": "AgenticShield/AgenticShield.entitlements",
                "SHIELDACTION": "AgenticShieldAction/AgenticShieldAction.entitlements"}


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
    """After add_targets.rb: each target's entitlements, cut to what its profile grants."""
    if not os.path.exists(STATE):
        print("No signing state (compile check): entitlements left as they are.")
        return
    state = json.load(open(STATE))
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ios", "App")
    for env_key, allowed in state.get("granted", {}).items():
        path = os.path.join(root, ENTITLEMENTS[env_key])
        if not os.path.exists(path):
            continue
        with open(path, "rb") as f:
            requested = plistlib.load(f)
        kept, dropped = keep(requested, allowed)
        with open(path, "wb") as f:
            plistlib.dump(kept, f)
        line = f"{env_key}: keeps {', '.join(sorted(kept)) or 'nothing'}"
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


def ensure_capability(pk, names):
    """Turns on the first of names the API accepts. Optional names ("?X") warn instead of failing the run."""
    have = {c["attributes"]["capabilityType"] for c in call("GET", f"/bundleIds/{pk}/bundleIdCapabilities")["data"]}
    if have.intersection(n.lstrip("?") for n in names):
        return True
    for raw in names:
        cap = raw.lstrip("?")
        try:
            call("POST", "/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities", "attributes": {"capabilityType": cap},
                "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": pk}}}}})
            print(f"Turned on {cap}")
            return True
        except SystemExit as e:
            if not raw.startswith("?"):
                raise
            print(f"Could not turn on {cap} (left out of this build): {str(e)[:300]}")
    return False


def cleanup():
    if not os.path.exists(STATE):
        return
    state = json.load(open(STATE))
    gone = [("profiles", p) for p in state.get("profiles", []) + ([state["profile"]] if state.get("profile") else [])]
    if state.get("certificate"):
        gone.append(("certificates", state["certificate"]))
    for kind, ident in gone:
        try:
            call("DELETE", f"/{kind}/{ident}")
            print(f"Removed {kind[:-1]} {ident}")
        except SystemExit as e:
            print(e)


def users():
    """Who can be an internal tester: the team's App Store Connect users (email and roles)."""
    for u in call("GET", "/users?limit=50")["data"]:
        a = u["attributes"]
        print(f"user {a.get('username')} roles {','.join(a.get('roles', []))}")


def testers():
    """Internal TestFlight group "Me" with access to every build, and TESTER_EMAIL in it. Safe to re-run."""
    bundle, email = os.environ["BUNDLE_ID"], os.environ["TESTER_EMAIL"].strip()
    apps = call("GET", f"/apps?filter[bundleId]={bundle}")["data"]
    if not apps:
        raise SystemExit(f"No App Store Connect app for {bundle}.")
    app = apps[0]["id"]
    groups = call("GET", f"/apps/{app}/betaGroups?limit=50")["data"]
    group = next((g for g in groups if g["attributes"]["isInternalGroup"] and g["attributes"]["name"] == "Me"), None)
    if not group:
        group = call("POST", "/betaGroups", {"data": {"type": "betaGroups",
            "attributes": {"name": "Me", "isInternalGroup": True, "hasAccessToAllBuilds": True},
            "relationships": {"app": {"data": {"type": "apps", "id": app}}}}})["data"]
        print("Created internal group Me")
    found = call("GET", f"/betaGroups/{group['id']}/betaTesters?limit=200")["data"]
    if any(t["attributes"].get("email", "").lower() == email.lower() for t in found):
        print(f"{email} is already a tester")
    else:
        call("POST", "/betaTesters", {"data": {"type": "betaTesters", "attributes": {"email": email},
            "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": group["id"]}]}}}})
        print(f"Added {email}; TestFlight emails an invite")
    builds = call("GET", f"/builds?filter[app]={app}&sort=-uploadedDate&limit=3")["data"]
    for b in builds:
        a = b["attributes"]
        print(f"build {a.get('version')} uploaded {a.get('uploadedDate')} state {a.get('processingState')}")


if __name__ == "__main__":
    {"setup": setup, "entitlements": entitlements, "cleanup": cleanup, "testers": testers, "users": users}[sys.argv[1]]()
