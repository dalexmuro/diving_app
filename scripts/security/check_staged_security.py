"""Security gate for Git staging area and tracked repository files.

Inspects staged blobs directly from the Git index (never trusting only the
working tree) or all tracked files in CI mode. Blocks:
  - .env files (except .env.example)
  - Unauthorized .sql, .dump, .bak, .sqlite, .db files
  - Certificates and private keys
  - Database backups/exports and private production configs
  - Connection strings, hardcoded credentials, and personal data (PII)
"""

from __future__ import annotations

import argparse
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST_SQL_FILE = ROOT / ".security" / "authorized-sql.txt"

SKIP_PATH_PREFIXES = (
    ".agents/",
    "scripts/security/",
)

SKIP_EXTENSIONS = {
    ".fit",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".pdf",
}

FORBIDDEN_ENV_RE = re.compile(r"(^|/)\.env(\.[^/]+)?$", re.IGNORECASE)
ALLOWED_ENV_RE = re.compile(r"(^|/)\.env(\.[^/]+)?\.example$", re.IGNORECASE)

DB_EXTS = {".sql", ".dump", ".bak", ".sqlite", ".sqlite3", ".db"}
CERT_KEY_EXTS = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".crt", ".cer"}
CERT_KEY_NAMES = {"id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"}

PROD_CONFIG_PATTERNS = (
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "service-account*.json",
    "*credentials*.json",
    "wrangler.prod.*",
    "wrangler.production.*",
    ".dev.vars",
    "local.properties",
)

BACKUP_NAME_RE = re.compile(
    r"(backup|dump|export).*\.(json|csv|sql|zip|tar|gz)$", re.IGNORECASE
)

CONTENT_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "Database connection string with credentials",
        re.compile(
            r"(?i)(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|mssql|amqp)://"
            r"[a-z0-9._%+-]+:[^@\s'\"]{3,}@[a-z0-9.-]+"
        ),
    ),
    (
        "Private key block",
        re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"),
    ),
    (
        "Suunto or Cloudflare hardcoded secret/token",
        re.compile(
            r"(?i)(suunto[_-]?(?:client[_-]?secret|subscription[_-]?key)|"
            r"ocp-apim-subscription-key|cloudflare[_-]?api[_-]?token|jwt[_-]?secret)"
            r"\s*[:=]\s*['\"]?(?!your_|replace_|example|placeholder|dummy|<)[a-z0-9._-]{16,}['\"]?"
        ),
    ),
    (
        "Potential personal email address (PII)",
        re.compile(
            r"(?i)\b[a-z0-9._%+-]+@"
            r"(?!example\.com\b|example\.org\b|test\.local\b|users\.noreply\.github\.com\b)"
            r"[a-z0-9.-]+\.[a-z]{2,}\b"
        ),
    ),
    (
        "Potential personal phone number (PII)",
        re.compile(
            r"(?i)(?:phone|tel|telephone|telefono|mobile|cel)\s*[:=]\s*"
            r"['\"]?\+?[0-9][0-9\s\-().]{7,18}[0-9]['\"]?"
        ),
    ),
    (
        "Potential personal identifier (DNI/NIE/Passport/IBAN/SSN)",
        re.compile(
            r"(?i)(?:dni|nie|passport|pasaporte|iban|ssn)\s*[:=]\s*"
            r"['\"]?(?!example|placeholder|dummy|0000)[a-z0-9]{6,34}['\"]?"
        ),
    ),
]


def load_authorized_sql_patterns() -> list[str]:
    if not ALLOWLIST_SQL_FILE.exists():
        return []
    patterns: list[str] = []
    for raw in ALLOWLIST_SQL_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    return patterns


def run_git(args: list[str]) -> bytes:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    return proc.stdout


def get_staged_files() -> list[str]:
    out = run_git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    return [p for p in out.decode("utf-8", errors="replace").split("\0") if p]


def get_tracked_files() -> list[str]:
    out = run_git(["ls-files", "-z"])
    return [p for p in out.decode("utf-8", errors="replace").split("\0") if p]


def read_blob(path: str, staged: bool) -> bytes:
    if staged:
        return run_git(["show", f":{path}"])
    return (ROOT / path).read_bytes()


def is_binary(data: bytes) -> bool:
    return b"\x00" in data[:8192]


def check_path(path: str, sql_allowlist: list[str]) -> list[str]:
    errors: list[str] = []
    norm = path.replace("\\", "/")
    name = Path(norm).name
    ext = Path(norm).suffix.lower()

    if FORBIDDEN_ENV_RE.search(norm) and not ALLOWED_ENV_RE.search(norm):
        errors.append(
            f"Forbidden environment file: {norm} (only .env.example is allowed)"
        )

    if ext in DB_EXTS:
        if not any(fnmatch.fnmatch(norm, pat) for pat in sql_allowlist):
            errors.append(
                f"Unauthorized database/SQL artifact: {norm} "
                "(authorize explicitly in .security/authorized-sql.txt if intended)"
            )

    if ext in CERT_KEY_EXTS or name.lower() in CERT_KEY_NAMES:
        errors.append(f"Certificate or private key file blocked: {norm}")

    for pat in PROD_CONFIG_PATTERNS:
        if fnmatch.fnmatch(name.lower(), pat.lower()) or fnmatch.fnmatch(
            norm.lower(), pat.lower()
        ):
            errors.append(f"Private/production config file blocked: {norm}")

    if BACKUP_NAME_RE.search(name):
        errors.append(f"Potential database backup/export file blocked: {norm}")

    return errors


def check_content(path: str, data: bytes) -> list[str]:
    norm = path.replace("\\", "/")
    ext = Path(norm).suffix.lower()

    if norm.startswith(SKIP_PATH_PREFIXES) or ext in SKIP_EXTENSIONS or is_binary(data):
        return []
    if ALLOWED_ENV_RE.search(norm) or norm == ".gitleaks.toml":
        return []

    is_lockfile = Path(norm).name == "package-lock.json"
    text = data.decode("utf-8", errors="replace")
    errors: list[str] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        for rule_name, pattern in CONTENT_RULES:
            if is_lockfile and "PII" in rule_name:
                continue
            if pattern.search(line):
                errors.append(f"{norm}:{line_no}: {rule_name}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Security gate for staged or tracked files."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--staged", action="store_true", help="Inspect Git staging area blobs."
    )
    mode.add_argument(
        "--all-tracked", action="store_true", help="Inspect all Git-tracked files."
    )
    args = parser.parse_args()

    files = get_staged_files() if args.staged else get_tracked_files()
    sql_allowlist = load_authorized_sql_patterns()
    all_errors: list[str] = []

    for path in files:
        all_errors.extend(check_path(path, sql_allowlist))
        try:
            blob = read_blob(path, staged=args.staged)
        except subprocess.CalledProcessError:
            continue
        all_errors.extend(check_content(path, blob))

    if all_errors:
        print("SECURITY GATE FAILED:", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(f"Security gate passed ({len(files)} file(s) checked).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
