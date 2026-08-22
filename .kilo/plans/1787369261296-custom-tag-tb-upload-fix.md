# Custom Tag to ThingsBoard Upload Fix

## Problem

Custom tags with `tb_telemetry_enabled=1` or `tb_attributes_enabled=1` are not sending data to ThingsBoard, even when:
- The custom tag has valid expression
- The custom tag is mapped to TB devices via `custom_tag_tb_devices`
- The TB devices are enabled

## Root Cause

The custom tag upload logic in `processThingsBoardUploads()` (`server.js:198-287`) has three critical bugs:

### Bug 1: Early Return (server.js:206)
```javascript
if (!dueTelemetryTb.length && !dueAttributesTb.length) return;
```
When no TB devices are due for telemetry/attributes based on **regular tag** intervals, the function returns early, never reaching the custom tag upload code (lines 261-282).

### Bug 2: Gating Condition (server.js:261, 272)
```javascript
if (dueTelemetryTb.length) { /* upload custom tags */ }
if (dueAttributesTb.length) { /* upload custom tags */ }
```
Custom tag uploads are gated by the existence of due TB devices. Custom tags mapped to TB devices with no regular tags (or whose regular tags aren't due) will never upload.

### Bug 3: No Custom Tag Interval Tracking
The custom tag's own interval (`tb_telemetry_interval_ms`, `tb_attributes_interval_ms`) is never used. Instead, the TB device's global interval determines when custom tags upload, and there's no per-custom-tag upload time tracking.

## Solution

### Changes to `server.js`

#### 1. Add new tracking Maps (after line 516)
Add Maps to track custom tag upload times per TB device:
```javascript
const customTagTbLastTelemetry = new Map();   // key: `${customTagId}_${tbDeviceId}`, value: timestamp
const customTagTbLastAttributes = new Map();  // key: `${customTagId}_${tbDeviceId}`, value: timestamp
```

#### 2. Rewrite custom tag upload logic (replace lines 261-282)
Replace the gated custom tag upload blocks with independent logic that:
- Queries all custom tags with telemetry/attributes enabled
- For each custom tag, checks its TB device mappings
- Uses the **custom tag's own interval** (`ct.tb_telemetry_interval_ms`, `ct.tb_attributes_interval_ms`) to determine when to upload
- Only uploads if the value in `customTagValueCache` is not null
- Tracks upload time per `(customTagId, tbDeviceId)` pair

```javascript
// Custom tag telemetry uploads - independent of regular tags
const customTelemetryTags = db.prepare('SELECT id, name, decimals, tb_telemetry_interval_ms FROM custom_tags WHERE tb_telemetry_enabled=1').all();
customTelemetryTags.forEach((ct) => {
  const mappings = db.prepare('SELECT tb_device_id FROM custom_tag_tb_devices WHERE custom_tag_id=?').all(ct.id);
  mappings.forEach((m) => {
    const tb = tbDevices.find((d) => d.id === m.tb_device_id);
    if (!tb || !tb.enabled) return;
    const value = customTagValueCache.get(ct.id);
    if (value === null || value === undefined) return;
    const key = `${ct.id}_${m.tb_device_id}`;
    const lastUpload = customTagTbLastTelemetry.get(key) || 0;
    const interval = ct.tb_telemetry_interval_ms || 5000;
    if (now - lastUpload >= interval) {
      customTagTbLastTelemetry.set(key, now);
      uploadJobs.push(uploadToThingsBoard(tb, [{ ...ct, last_value: value }], false));
    }
  });
});

// Custom tag attributes uploads - independent of regular tags
const customAttributesTags = db.prepare('SELECT id, name, decimals, tb_attributes_interval_ms FROM custom_tags WHERE tb_attributes_enabled=1').all();
customAttributesTags.forEach((ct) => {
  const mappings = db.prepare('SELECT tb_device_id FROM custom_tag_tb_devices WHERE custom_tag_id=?').all(ct.id);
  mappings.forEach((m) => {
    const tb = tbDevices.find((d) => d.id === m.tb_device_id);
    if (!tb || !tb.enabled) return;
    const value = customTagValueCache.get(ct.id);
    if (value === null || value === undefined) return;
    const key = `${ct.id}_${m.tb_device_id}`;
    const lastUpload = customTagTbLastAttributes.get(key) || 0;
    const interval = ct.tb_attributes_interval_ms || 5000;
    if (now - lastUpload >= interval) {
      customTagTbLastAttributes.set(key, now);
      uploadJobs.push(uploadToThingsBoard(tb, [{ ...ct, last_value: value }], true));
    }
  });
});
```

#### 3. Update shutdown function (line 541-547)
No changes needed for new Maps (they're just in-memory tracking).

### No Changes Required
- `routes/custom-tags.js` - CRUD and source sync are working correctly
- `expression-engine.js` - Expression evaluation is working correctly
- `public/js/custom-tags.js` - Frontend UI for enabling TB and mapping devices is working correctly
- `db.js` - Schema already has all necessary tables and columns

## Validation Plan

1. **Test Case 1: Custom tag with telemetry enabled**
   - Create a custom tag with `tb_telemetry_enabled=1` and map to a TB device
   - Verify data appears in ThingsBoard within the configured interval
   - Check PM2 logs for `[TB] Upload telemetry ... OK` messages

2. **Test Case 2: Custom tag with attributes enabled**
   - Create a custom tag with `tb_attributes_enabled=1` and map to a TB device
   - Verify data appears in ThingsBoard attributes

3. **Test Case 3: Custom tag interval respected**
   - Set `tb_telemetry_interval_ms=30000` (30 seconds)
   - Verify uploads happen at 30-second intervals, not the TB device's global interval

4. **Test Case 4: Multiple custom tags to same TB device**
   - Map multiple custom tags to the same TB device
   - Verify all custom tags upload independently

5. **Test Case 5: Custom tag with null value**
   - Create a custom tag whose expression evaluates to null (e.g., source unavailable)
   - Verify no upload attempt is made (no error in logs)

6. **Test Case 6: Custom tag to disabled TB device**
   - Map custom tag to a disabled TB device
   - Verify no upload attempt is made

## Risks

- **Memory growth**: The tracking Maps will grow with the number of custom tag to TB device mappings. This is bounded by the number of custom tags × number of TB devices, which is typically small (< 10,000 entries).
- **No breaking changes**: The fix only changes the upload logic, not the API or data model.

## Files to Modify

- `server.js` - Main fix (lines 261-282, and add tracking Maps after line 516)
