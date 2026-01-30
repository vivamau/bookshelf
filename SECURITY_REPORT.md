# Security Report for Bookshelf Application

This report outlines critical security vulnerabilities identified in the Bookshelf codebase and the proposed remediation steps.

## 1. SQL Injection
**Severity:** Critical
**Location:** `backend/utils/crudFactory.js`
**Description:**
The `createCrudRouter` function dynamically constructs SQL queries using keys from the request body (`req.body`) without validation. This allows an attacker to inject arbitrary SQL fragments into `INSERT` and `UPDATE` statements by manipulating JSON keys.
**PoC:**
Sending a payload like `{"format_name) VALUES (?); --": "Hacked"}` to `POST /api/formats` allows inserting arbitrary data or modifying the query structure.

## 2. Server-Side Request Forgery (SSRF)
**Severity:** High
**Location:** `backend/index.js` (Route: `POST /api/books/:id/cover-from-url`)
**Description:**
The application accepts a `coverUrl` parameter and makes an HTTP request to it using `axios` without any validation or filtering. This allows an authenticated user to force the server to make requests to internal resources (e.g., internal APIs, metadata services, local services on localhost).

## 3. Hardcoded Secrets
**Severity:** High
**Location:** `backend/index.js`
**Description:**
The JWT signing key is hardcoded as `'default_secret_key'` if the environment variable `TOKEN_KEY` is not set.
```javascript
process.env.TOKEN_KEY || 'default_secret_key'
```
This compromises the security of all user sessions if the code is exposed or if the default is used in production.

## 4. Path Traversal & Arbitrary File Upload Risk
**Severity:** Medium
**Location:** `backend/index.js` (Multer config) and `backend/utils/libraryScanner.js`
**Description:**
The application uses `file.originalname` directly when saving uploaded files. While modern libraries often handle basic traversal attempts, relying on user input for filenames is risky. Additionally, `libraryScanner.js` processes files based on filenames that might be derived from untrusted sources (e.g., uploads).

## Remediation Plan

1.  **Fix SQL Injection:** Validate `req.body` keys against the actual table schema (allowlist approach) in `crudFactory.js`.
2.  **Fix SSRF:** Implement URL validation to block private IP ranges (localhost, 10.0.0.0/8, etc.) before making requests.
3.  **Fix Secrets:** Remove the hardcoded secret. If `TOKEN_KEY` is missing, generate a random secure key at startup (logging a warning) to ensure tokens are cryptographically secure, even if not persistent across restarts.
4.  **Fix File Handling:** Sanitize all filenames using `path.basename` and regular expressions to remove potential directory traversal characters before file operations.
