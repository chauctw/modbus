# Fix Custom Tag Insertion & Name Mapping Bugs

## Observed Symptoms
1. **Insert fails / 500 error**: Creating a custom tag or adding a source returns 500, so the operation appears to fail.
2. **Name mapping mismatch**: When an expression uses full tag names (`Channel.Device.Tag`) that contain Vietnamese characters or spaces, evaluation silently returns `null` instead of computing the value.

## Root Causes

### Bug A — BigInt JSON serialization crash
`better-sqlite3` returns `lastInsertRowid` as `BigInt`. `res.json({ id: info.lastInsertRowid })` calls `JSON.stringify`, which throws on `BigInt` in Node.js.  
Affected endpoints in `routes/custom-tags.js`:
- `POST /api/custom-tags` (line 14)
- `POST /api/custom-tags/:id/sources` (line 60)

Because the response body fails to serialize, Express returns 500. The DB row is inserted, but the frontend treats the call as failed and never links sources.

### Bug B — Tokenizer regex rejects Unicode / spaces in identifiers
`expression-engine.js` line 13:
```javascript
[TokenType.IDENT]: /^[A-Za-z_][A-Za-z0-9_\.]*/,
```
This regex only allows ASCII letters, digits, underscores and dots. Any tag/device/channel name containing Vietnamese tones or spaces (common in this project) makes `compile(expression)` throw. The catch in `server.js` then sets the custom tag value to `null`.

## Fix Plan

### Task 1 — Fix BigInt serialization in `routes/custom-tags.js`
Convert `lastInsertRowid` to `Number` (or `String`) before putting it in the JSON response body.

- **Line 14**: Change `res.json({ id: info.lastInsertRowid })` to `res.json({ id: Number(info.lastInsertRowid) })`
- **Line 60**: Change `res.json({ id: info.lastInsertRowid })` to `res.json({ id: Number(info.lastInsertRowid) })`

Risk: `Number()` on very large IDs is safe for SQLite AUTOINCREMENT (fits in JS number safely for typical project sizes).

### Task 2 — Fix expression-engine IDENT regex to accept Unicode & spaces
Update the tokenizer so identifiers can contain Vietnamese characters and spaces, while still stopping at operators and parentheses.

In `expression-engine.js`, replace line 13:
```javascript
[TokenType.IDENT]: /^[A-Za-z_][A-Za-z0-9_\.]*/,
```
with:
```javascript
[TokenType.IDENT]: /^[^\s+\-*/(),]+/,
```

This matches any non-empty sequence of characters that is **not** whitespace or an operator/paren/comma. Because `NUMBER` is checked first in the tokenizer loop, numeric literals are still parsed as numbers.

### Task 3 — Verify nothing else breaks
- Ensure the parser still handles precedence and function calls (`round()`, `abs()`, etc.) correctly with the broader IDENT rule.
- Confirm that the frontend token-splitting regex in `public/js/custom-tags.js` (`/[+\-*/(),]+/`) remains compatible — dots and spaces inside tag names are not split, so the `tagNameToId` lookup still works.

### Task 4 — Validation steps
1. **Create a custom tag** via UI or `POST /api/custom-tags` and confirm the API returns `{ id: <number> }` instead of 500.
2. **Add a source** via `POST /api/custom-tags/:id/sources` and confirm it returns `{ id: <number> }` instead of 500.
3. **Create a custom tag** whose expression references a Modbus tag whose full name contains Vietnamese characters (e.g. `Nhà máy 1.Máy 1.Nhiệt độ`).
4. **Check evaluation**: confirm `GET /api/custom-tags/live-values` returns a numeric value instead of `null`.
5. **Run through existing expressions** (with `round`, `abs`, arithmetic operators) to confirm no regressions.

## Files Changed
- `routes/custom-tags.js`
- `expression-engine.js`
