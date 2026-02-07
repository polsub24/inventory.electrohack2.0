# Inventory System Updates - Unlimited Components & Participant Limits

## Summary of Changes

This document outlines the changes made to implement two key features:
1. **Remove total limit display for participants** - Participants can only add components based on available quantity
2. **Add unlimited stock option for admin** - Components can be marked as unlimited (always available, no quantity tracking)

---

## 1. Database Schema Changes

### File: `server.js`
- **ComponentSchema**: Added `hasQuantityLimit` field (Boolean, default: true)
  - `true` = Limited quantity (traditional behavior)
  - `false` = Unlimited stock (no quantity tracking)

---

## 2. Type Definitions

### File: `types.ts`
- **Component Interface**: Added optional `hasQuantityLimit?: boolean` field

---

## 3. Backend API Changes

### File: `server.js`

#### Updated Endpoints:

1. **GET /api/inventory**
   - Now includes `hasQuantityLimit` in component responses

2. **PUT /api/components**
   - Accepts `hasQuantityLimit` parameter
   - Handles unlimited components during create/update

3. **POST /api/requests** (Submit Request)
   - Skips quantity reservation for unlimited components
   - Only increments `reservedQuantity` for limited components

4. **PATCH /api/requests/:id** (Update Request Status)
   - Skips quantity adjustments for unlimited components
   - Both when reverting old status and applying new status

5. **PATCH /api/requests/:id/reinstate** (Return to Inventory)
   - Skips quantity restoration for unlimited components

6. **DELETE /api/requests/:id** (Delete Request)
   - Skips quantity restoration for unlimited components

7. **DELETE /api/teams/:id** (Delete Team)
   - Skips quantity restoration for unlimited components when cleaning up team requests

---

## 4. Admin UI Changes

### File: `components/admin/InventoryManager.tsx`

#### Inventory Table:
- Added "Type" column showing "Limited" or "Unlimited" badge
- Total Qty column now shows "∞" for unlimited components

#### Add/Edit Component Modal:
- Added "Unlimited Stock" checkbox
- When checked:
  - Total Units input is disabled
  - Component is marked as unlimited
  - Quantity is set to 0 (not tracked)
- Includes helpful description: "Component is always available (no quantity tracking)"

---

## 5. Participant UI Changes

### File: `components/participant/ComponentCard.tsx`

#### Removed:
- "Total Limit" display (previously showed `component.totalQuantity`)

#### Updated:
- **Available Quantity**: Shows "∞" for unlimited components
- **Status**: Shows "Unlimited" for unlimited components, or "In Stock"/"Out of Stock" for limited ones
- **Add to Cart Logic**: 
  - Unlimited components can always be added (never disabled)
  - Limited components respect available quantity
- **Increment/Decrement**: 
  - Unlimited components have no upper limit
  - Limited components capped at available quantity
- **Status Badge**: Unlimited components always show as "Available" (green)

---

## 6. Business Logic

### Limited Components (hasQuantityLimit = true):
- Traditional behavior maintained
- `totalQuantity` tracked
- `reservedQuantity` tracked
- Participants limited by available quantity
- Stock deducted when collected

### Unlimited Components (hasQuantityLimit = false):
- Always available to participants
- No quantity tracking (totalQuantity set to 0)
- No reservation tracking
- No stock deduction when collected
- Displayed as "∞" or "Unlimited" in UI

---

## 7. Backward Compatibility

- Default value for `hasQuantityLimit` is `true`
- Existing components automatically treated as limited
- No migration required for existing data

---

## Testing Recommendations

1. **Admin Side:**
   - Create a new unlimited component
   - Edit existing component to make it unlimited
   - Verify table displays correctly (∞ symbol, Unlimited badge)

2. **Participant Side:**
   - Verify limited components show available quantity only (no total limit)
   - Verify unlimited components show ∞ and allow any quantity
   - Test adding both types to cart

3. **Request Flow:**
   - Submit request with mix of limited and unlimited components
   - Verify only limited components affect inventory counts
   - Test approval, collection, and return flows

4. **Edge Cases:**
   - Delete requests containing unlimited components
   - Delete teams with unlimited component requests
   - Change component from limited to unlimited and vice versa

---

## Files Modified

1. `types.ts` - Added hasQuantityLimit field
2. `server.js` - Schema, API endpoints, and inventory logic
3. `components/admin/InventoryManager.tsx` - Admin UI for managing components
4. `components/participant/ComponentCard.tsx` - Participant view of components

---

## Migration Notes

No database migration required. The `hasQuantityLimit` field has a default value of `true`, so all existing components will continue to work as limited components.

If you want to mark existing components as unlimited, use the admin UI to edit them and check the "Unlimited Stock" checkbox.
