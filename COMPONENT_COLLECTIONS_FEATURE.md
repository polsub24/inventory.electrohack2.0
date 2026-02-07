# Component Collections Tracking Feature

## Overview
This feature allows administrators to view which teams have collected specific components directly from the Manage Resources panel. This provides quick visibility into component distribution and usage patterns.

## What Changed

### InventoryManager Component Updates

#### 1. New "Collections" Button
- Added a blue "Collections" button next to the "Edit" button for each component
- Clicking this button opens a modal showing all teams that have collected that component

#### 2. Collections Modal
Displays comprehensive information about component distribution:

**Table Columns:**
- **Team Name** - Name of the team that collected the component
- **Leader** - Team leader's name
- **Reg #** - Team registration number
- **Qty** - Quantity collected by that team
- **Status** - Whether the component is still collected or has been returned
  - `COLLECTED` - Gray badge (component still with team)
  - `RETURNED` - Blue badge (component returned to inventory)
- **Date** - Collection date

**Summary Statistics:**
- Total Collected: Sum of all components currently with teams
- Total Returned: Sum of all components that have been returned

#### 3. Helper Function
```typescript
getTeamsWithComponent(componentId: string)
```
- Filters requests with `COLLECTED` or `RETURNED_TO_INVENTORY` status
- Extracts team information and quantities for the specific component
- Returns sorted list of teams with that component

## How to Use

### As an Admin:

1. **Navigate to Manage Resources**
   - Go to Admin Dashboard → Manage Resources tab

2. **View Component Collections**
   - Find the component you want to check
   - Click the blue "Collections" button in the Actions column

3. **Review Distribution**
   - See all teams that have collected this component
   - View quantities and collection status
   - Check collection dates
   - Review summary statistics at the bottom

## UI Features

### Visual Design
- **Blue "Collections" button** - Distinct from the amber "Edit" button
- **Responsive table** - Scrollable on smaller screens
- **Status badges** - Color-coded for quick identification
  - Gray for collected items
  - Blue for returned items
- **Summary panel** - Amber background with key statistics

### Empty State
If no teams have collected a component:
```
"No teams have collected this component yet"
```

## Example Scenario

**Component: Arduino Uno**

| Team Name | Leader | Reg # | Qty | Status | Date |
|-----------|--------|-------|-----|--------|------|
| Team Alpha | John | REG001 | 5 | Collected | 2/5/2026 |
| Team Beta | Sarah | REG002 | 3 | Returned | 2/6/2026 |
| Team Gamma | Mike | REG003 | 2 | Collected | 2/7/2026 |

**Summary:**
- Total Collected: 7 units (Team Alpha: 5, Team Gamma: 2)
- Total Returned: 3 units (Team Beta: 3)

## Benefits

✅ **Quick Visibility** - See component distribution at a glance
✅ **Audit Trail** - Track which teams have which components
✅ **Return Tracking** - Distinguish between collected and returned items
✅ **Usage Patterns** - Identify popular components and usage trends
✅ **Accountability** - Know exactly who has each component

## Technical Implementation

### Data Flow
```
1. User clicks "Collections" button
2. Component ID is passed to getTeamsWithComponent()
3. Function filters requests by:
   - Status: COLLECTED or RETURNED_TO_INVENTORY
   - Items containing the component ID
4. Extracts team details and quantities
5. Modal displays formatted table with results
```

### Performance
- Efficient filtering using JavaScript array methods
- No additional API calls required (uses existing request data)
- Real-time updates via existing 2-second polling

### State Management
```typescript
const [viewingCollections, setViewingCollections] = useState<Component | null>(null);
```
- Stores the component being viewed
- Modal opens when viewingCollections is not null
- Closes when set back to null

## Integration with Existing Features

### Works With:
- ✅ **Reinstate Inventory** - Shows both collected and returned statuses
- ✅ **Request Management** - Uses existing request data
- ✅ **Real-time Updates** - Automatically refreshes with polling
- ✅ **Status Badges** - Consistent styling with other status indicators

## Future Enhancements

Potential improvements:
- Export collections data to CSV/Excel
- Filter by status (collected vs returned)
- Sort by team name, quantity, or date
- Search functionality for large lists
- Show pending/approved requests as well
- Component usage analytics and charts
