# 0005 - Password hashing with scrypt (built-in Node crypto)

- Status: Accepted (2026-07-19, during PR #7 hardening)
- Deciders: @ahincho
- Supersedes: bcrypt (originally declared in PR #5)

## Context and Problem Statement

Passwords must be stored as a one-way hash with a per-user salt. The
candidates are:

1. **bcrypt** (npm package): well-known, tuned for password hashing,
   but adds an external native dependency.
2. **argon2** (npm package): modern PHC winner, more expensive to
   verify, also a native dependency.
3. **scrypt** from `node:crypto`: built-in to Node 24, no native
   dependency, tunable parameters.

The bootstrap initially shipped with `bcrypt`-style storage format (a
decision from PR #5) but the implementation was rewritten to **scrypt
without changing the feature surface**, on the basis that:

- Node 24 ships an audited scrypt implementation in `node:crypto`.
- `randomBytes` for salt and `timingSafeEqual` for verification are
  already available.
- Removing bcrypt removes a native build that CI has to compile on every
  fresh runner (and which gates behind Python + compilers).

## Decision

We use **scrypt** with the OWASP-recommended baseline
parameters: `N = 16384`, `r = 8`, `p = 1`, output `keylen` of 64 bytes.

- Format on the wire:
  `scrypt$N$r$p$salt$hash` (all base64url-encoded except the integer
  parameters).
- Salt: 16 random bytes per user.
- Verification uses `timingSafeEqual` and re-derives the key from the
  same N/r/p before comparing.
- `maxmem: 256 MiB` cap (Cloud Lambda memory ceiling permits).

## Why not bcrypt

- bcrypt requires an external package; native bindings are often the
  slowest CI step on greenfield runners.
- bcrypt's work factor would need to be re-tuned every 2-3 years as
  hardware improves; scrypt's `N` factor is similarly tunable.
- Auditing a single `node:crypto` call is easier than auditing a
  transitive dependency.

## Consequences

### Positive

- Zero native dependencies for authentication.
- Stable hash format that survives Node version upgrades (the encode
  format is portable; only the algorithm underneath may evolve via
  parameters).
- Performance: scrypt at N=16384 is ~80 ms on a Lambda at 1792 MB;
  acceptable for a registration/login UX.

### Negative

- We lose the option to switch password hashing algorithms without a
  migration story; future re-hashing would need a column add for the
  new algorithm (`alg` prefix already supports it: `scrypt$N$r$p$...`).
- The 256 MiB `maxmem` cap will need updating if Aurora/EventBridge
  raise it; tracked in tech debt.
