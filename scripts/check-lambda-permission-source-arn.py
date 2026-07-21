#!/usr/bin/env python3
"""
Verify every AWS::Lambda::Permission in our SAM templates has either
SourceArn or SourceAccount set.

Custom check because cfn-nag 0.8.10 does NOT include a rule for missing
SourceArn/SourceAccount on Lambda::Permission. cfn-nag's Lambda rules
only check (W24) action is InvokeFunction and (F45) EventSourceToken is
not plaintext. None validates SourceArn/SourceAccount presence.

Rationale: AWS API Gateway does not set aws:SourceAccount or aws:SourceArn
when invoking Lambda authorizers (verified in orion-infrastructure PRs #73,
#75; see docs/adr/0007-api-gateway-authorizer-trust-policy.md). The
defense-in-depth is the Lambda resource policy, which REQUIRES SourceArn
to scope invocation. Removing SourceArn silently re-introduces the
cross-API confusion vulnerability, hence this check.

Approach: regex-based. For each `AWS::Lambda::Permission` logical id,
scan the indented block under it (until next top-level key) and assert
that `SourceArn:` or `SourceAccount:` appears within. False positives are
possible if the same string appears in a comment or unrelated resource
that happens to share the indentation, but in practice the SAM templates
in this repo are flat enough that this works reliably.

Exits 0 if every Lambda::Permission has SourceArn or SourceAccount.
Exits 1 with a list of offending resources otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


# Matches the start of a Lambda::Permission logical resource definition.
# Logical IDs in our templates are PascalCase (e.g. AuthorizerFunctionPermission,
# IdentityRegisterPermission) and the resource type line is indented by 2 spaces.
#
# NOTE: indent uses `[ \t]` (not `\s`) so it does not match newlines. With
# `\s`, the regex would happily consume the blank line that separates sibling
# resources and start the match one line too early (see fix history).
PERMISSION_HEADER = re.compile(
    r"^(?P<indent>[ \t]{2,})(?P<logical_id>[A-Za-z][A-Za-z0-9]*):[ \t]*\n"
    r"[ \t]+Type:[ \t]*AWS::Lambda::Permission[ \t]*$",
    re.MULTILINE,
)


def _scan_template(template_path: Path) -> list[tuple[str, int]]:
    """Return (logical_id, line_number) for every Lambda::Permission
    that does NOT have SourceArn or SourceAccount in its block."""
    offenders: list[tuple[str, int]] = []
    text = template_path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Find each Lambda::Permission header.
    for match in PERMISSION_HEADER.finditer(text):
        logical_id = match.group("logical_id")
        header_indent_len = len(match.group("indent"))
        # Header line number (1-indexed for human-readable output).
        header_line = text.count("\n", 0, match.start()) + 1

        # Scan forward from the next line, collecting indented lines until
        # we hit a line at <= header_indent_len indentation (next sibling
        # resource, top-level key, or EOF).
        end_of_block = len(lines)
        for i in range(header_line, len(lines)):
            line = lines[i]
            if not line.strip() or line.lstrip().startswith("#"):
                continue  # skip blanks/comments
            # First non-blank, non-comment line at this indent or less
            # marks the end of the block.
            leading = len(line) - len(line.lstrip())
            if leading <= header_indent_len:
                end_of_block = i
                break

        # Strip comment lines before scanning for SourceArn/SourceAccount.
        # A commented-out `# SourceArn: ...` should NOT count as a fix.
        block_lines = lines[header_line:end_of_block]
        active_lines = [
            ln for ln in block_lines if not ln.lstrip().startswith("#")
        ]
        block_text = "\n".join(active_lines)
        if "SourceArn:" not in block_text and "SourceAccount:" not in block_text:
            offenders.append((logical_id, header_line))

    return offenders


def main() -> int:
    templates = sorted(
        [t for t in Path(".").glob("template.yaml") if t.is_file()]
        + [t for t in Path("contexts").glob("*/template.yaml") if t.is_file()]
    )
    if not templates:
        print("No template.yaml files found.", file=sys.stderr)
        return 0

    all_offenders: list[tuple[str, str, int]] = []
    for template_path in templates:
        for logical_id, line_no in _scan_template(template_path):
            all_offenders.append((str(template_path), logical_id, line_no))

    if all_offenders:
        print(
            "ERROR: Lambda::Permission resources without SourceArn/SourceAccount:",
            file=sys.stderr,
        )
        for path, logical_id, line_no in all_offenders:
            print(f"  - {path}:{logical_id} (line {line_no})", file=sys.stderr)
        print("", file=sys.stderr)
        print(
            "Each AWS::Lambda::Permission MUST specify SourceArn (or SourceAccount) "
            "to scope invocation to a specific API Gateway / event source. "
            "Removing this property silently re-introduces the cross-API "
            "confusion vulnerability documented in "
            "orion-infrastructure/docs/adr/0007-api-gateway-authorizer-trust-policy.md.",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: {len(templates)} template(s) scanned, all Lambda::Permission "
        f"resources have SourceArn or SourceAccount."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())