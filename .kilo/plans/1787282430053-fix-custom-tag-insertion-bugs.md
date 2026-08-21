# Plan: Fix Custom Tag Insertion Bugs in custom-tags.js

## Root Cause
The error `Cannot read properties of null (reading 'getBoundingClientRect')` occurs at `custom-tags.js:85` because `showPickerFloating` is called with a `null` `triggerBtn`. The callers (lines 187, 192, 197) pass `e.currentTarget` which can be `null` when the modal is re-rendered or closed before an async operation completes.

## Affected Code
- `public/js/custom-tags.js:76-135` — `showPickerFloating(triggerBtn, ...)` reads `triggerBtn.getBoundingClientRect()` at line 85
- `public/js/custom-tags.js:185-199` — Callers pass `e.currentTarget` without null guard

## Fix Steps

### 1. Add null guard in `showPickerFloating`
In `showPickerFloating`, before line 85, check if `triggerBtn` is null or not an element. If null, fall back to `document.activeElement` or skip positioning.

```javascript
function showPickerFloating(triggerBtn, title, items, getLabel) {
  return new Promise((resolve) => {
    const existing = document.getElementById('picker-float');
    if (existing) existing.remove();
    if (!items.length) {
      alert('Không có mục nào để chọn');
      resolve(null);
      return;
    }
    // Guard: triggerBtn may be null if modal re-rendered during async call
    if (!triggerBtn || !triggerBtn.getBoundingClientRect) {
      resolve(null);
      return;
    }
    const rect = triggerBtn.getBoundingClientRect();
    // ... rest of function
```

### 2. Ensure callers pass a valid reference
In the onclick handlers (lines 185-199), capture the button reference before the async `api()` call in case the modal is closed/re-rendered:

```javascript
$('#insTag').onclick = async (e) => {
  const btn = e.currentTarget;
  const available = await api('/api/custom-tags/sources/available');
  const pick = await showPickerFloating(btn, 'Chọn tag', available.tags, t => t.fullName);
  if (pick) insertAtCursor(pick);
};
```

This pattern should be applied consistently to `#insApi`, `#insCustom`, and any other similar handlers.

## Validation
1. Reproduce: Open custom tag form, click "+ Tag", and immediately close the modal → should not throw
2. Open console, verify no errors when using the picker normally
3. Test on a clean load: create a new custom tag, add sources via picker

## Files to Change
- `public/js/custom-tags.js` — only this file