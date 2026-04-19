---
name: devtools
description: "Developer utilities: Base64, JWT decode, hashing, UUID, passwords, timestamps, regex test, URL encode. Use instead of opening external websites for dev tools."
metadata:
  nessi:
    command: dev
    enabled: true
---

# Developer Tools

Quick developer utilities — no need to open external websites.

## Commands

### Encode / Decode

```bash
dev base64 encode "Hello World"
dev base64 decode "SGVsbG8gV29ybGQ="
dev url encode "hello world & foo=bar"
dev url decode "hello%20world%20%26%20foo%3Dbar"
```

### JWT Decode

```bash
dev jwt "eyJhbGciOiJIUzI1NiIs..."
```

Decodes header + payload (no signature verification).

### Hashing

```bash
dev hash "some text"
dev hash "some text" --algo md5
```

Algorithms: `sha256` (default), `sha1`, `sha512`, `md5`.

### Generate

```bash
dev uuid
dev password
dev password --length 32 --no-symbols
```

### Timestamp

```bash
dev timestamp
dev timestamp 1713456789
dev timestamp "2024-04-18T15:33:09Z"
```

Converts between Unix timestamp and ISO date. Without arguments, shows current time.

### Regex

```bash
dev regex "^[a-z]+@[a-z]+\.[a-z]{2,}$" "user@example.com"
```

Tests a pattern against input text, shows matches and capture groups.

## Notes

- All operations run locally in the browser
- Hashing uses Web Crypto API (SHA) or fallback for MD5
- JWT decode is read-only — no signature verification
