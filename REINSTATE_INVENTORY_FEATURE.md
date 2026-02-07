# Reinstate Inventory Feature

## Overview
This feature allows administrators to return collected components back to inventory without deleting the request history. This provides better audit trails and flexibility in managing inventory.

## What Changed

### 1. New Request Status: `RETURNED_TO_INVENTORY`
- Added a new status to track when collected items are returned to inventory
- Displayed with a blue badge in the UI
- Visible in the History tab alongside collected requests

### 2. Backend API Endpoint
**Endpoint:** `PATCH /api/requests/:id/reinstate`

**Functionality:**
- Can only be used on requests with `COLLECTED` status
- Restores component quantities to `totalQuantity` (reverses the collection)
- Updates request status to `RETURNED_TO_INVENTORY`
- Maintains the request history for audit purposes

**Example:**
```javascript
// Request
PATCH /api/requests/123abc/reinstate

// Response
{
  "id": "123abc",
  "status": "RETURNED_TO_INVENTORY",
  "items": [...],
  ...
}
```

### 3. Frontend Changes

#### InventoryContext
- Added `reinstateInventory(requestId: string)` function
- Available throughout the application via `useInventory()` hook

#### RequestDetailView Component
- New "Reinstate Inventory" button appears for `COLLECTED` requests
- Green button to distinguish from other actions
- Confirmation dialog before reinstating
- Automatically refreshes data and navigates back to admin dashboard

#### StatusBadge Component
- Added styling for `RETURNED` status (blue badge)

#### AdminDashboardPage
- History tab now shows both `COLLECTED` and `RETURNED` requests

## How to Use

### As an Admin:

1. **Navigate to History Tab**
   - Go to Admin Dashboard → History tab
   - View all collected requests

2. **Open a Collected Request**
   - Click "View" on any request with `COLLECTED` status

3. **Reinstate Inventory**
   - Click the green "Reinstate Inventory" button
   - Confirm the action in the dialog
   - Components are returned to total stock
   - Request status changes to `RETURNED`
   - Request history is preserved

## Benefits

✅ **Audit Trail:** Request history is maintained even after returning components
✅ **Flexibility:** Easy to handle returns, damaged items, or unused components
✅ **No Data Loss:** Unlike "Delete History", this preserves all request information
✅ **Clear Status:** Distinct status shows which requests have been returned

## Stock Impact

### Before Reinstate:
- Request Status: `COLLECTED`
- Component Total Quantity: Reduced by collected amount
- Reserved Quantity: 0

### After Reinstate:
- Request Status: `RETURNED_TO_INVENTORY`
- Component Total Quantity: Increased by returned amount
- Reserved Quantity: 0

## Example Scenario

**Initial State:**
- Arduino Uno: Total = 20, Reserved = 0
- Team requests 5 Arduino Uno
- After collection: Total = 15, Reserved = 0

**After Reinstate:**
- Admin clicks "Reinstate Inventory"
- Arduino Uno: Total = 20, Reserved = 0
- Request shows as `RETURNED` in history

## Technical Details

### Database Schema
No schema changes required. Uses existing `Request` collection with new status value.

### Stock Calculation Logic
```javascript
// On Reinstate
for (const item of request.items) {
  await Component.findByIdAndUpdate(item.componentId, {
    $inc: { totalQuantity: item.quantity }
  });
}
```

### Status Flow
```
PENDING_APPROVAL → MODIFIED_BY_ADMIN → APPROVED_READY → COLLECTED → RETURNED_TO_INVENTORY
                                                ↓
                                            REJECTED
```

## Future Enhancements

Potential improvements:
- Partial reinstatement (return only some items)
- Reason tracking for returns
- Automatic notifications when items are returned
- Return statistics in dashboard metrics
