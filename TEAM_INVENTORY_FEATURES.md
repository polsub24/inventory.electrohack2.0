# Team Inventory Management Features

## Overview
This update adds comprehensive inventory tracking for teams in both the admin panel and participant dashboard. Admins can view what each team has collected and returned, while participants can see their own collected components.

## Admin Panel Features

### 1. Team Inventory Summary on Team Cards

Each team card in the "Manage Teams" section now displays:
- **Collected Count**: Number of components currently with the team (green)
- **Returned Count**: Number of components returned to inventory (blue)

**Example:**
```
Team Alpha
Leader: John Doe
Reg #: REG001
5 collected | 3 returned
[View Inventory] [Delete]
```

### 2. View Team Inventory Button

New "View Inventory" button on each team card opens a detailed modal showing:

#### Collected Components Table:
- Component name
- Category
- Quantity (in green)
- Status: Currently with team

#### Returned Components Table:
- Component name
- Category
- Quantity (in blue)
- Status: Returned to inventory

#### Summary Statistics:
- Total Collected: Sum of all components with team
- Total Returned: Sum of all components returned

### 3. Helper Function

```typescript
getTeamInventory(teamId: string)
```
- Aggregates all `COLLECTED` and `RETURNED` requests for a team
- Groups components by ID and sums quantities
- Returns separate lists for collected and returned items

## Participant Dashboard Features

### 1. New "My Inventory" Tab

Added a third tab to the participant dashboard:
- **Resources**: Browse and request components
- **My Requests**: View request history
- **My Inventory**: NEW - View collected components

### 2. CollectedComponents Component

New component that displays:

#### Currently With You Section (Green):
- Shows all components the team has collected
- Displays component name, category, and quantity
- Total count of components in possession
- Empty state: "No components collected yet"

#### Returned Components Section (Blue):
- Shows all components the team has returned
- Displays component name, category, and quantity
- Total count of returned components
- Only appears if team has returned items

## Technical Implementation

### Data Flow

**Admin Panel:**
```
1. TeamManager loads teams and requests from context
2. For each team, getTeamInventory() is called
3. Function filters requests by teamId and status
4. Aggregates components into collected/returned groups
5. Displays summary on card and details in modal
```

**Participant Dashboard:**
```
1. CollectedComponents loads requests from context
2. Filters by current user's team ID
3. Separates COLLECTED and RETURNED requests
4. Aggregates components by ID
5. Displays in separate tables
```

### State Management

**TeamManager:**
```typescript
const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
```
- Tracks which team's inventory is being viewed
- Modal opens when viewingTeamId is set
- Closes when set back to null

**ParticipantDashboardPage:**
```typescript
const [activeTab, setActiveTab] = useState<'store' | 'requests' | 'inventory'>('store');
```
- Added 'inventory' to tab options
- Shows CollectedComponents when inventory tab is active

### Component Aggregation Logic

```typescript
// For each request with COLLECTED or RETURNED status
teamRequests.forEach(req => {
    req.items.forEach(item => {
        const comp = components.find(c => c.id === item.componentId);
        
        if (req.status === RequestStatus.Collected) {
            // Add to collected group
            if (collected[item.componentId]) {
                collected[item.componentId].quantity += item.quantity;
            } else {
                collected[item.componentId] = { component: comp, quantity: item.quantity };
            }
        } else if (req.status === RequestStatus.Returned) {
            // Add to returned group
            if (returned[item.componentId]) {
                returned[item.componentId].quantity += item.quantity;
            } else {
                returned[item.componentId] = { component: comp, quantity: item.quantity };
            }
        }
    });
});
```

## UI/UX Design

### Color Coding
- **Green**: Collected components (currently with team)
- **Blue**: Returned components (back in inventory)
- **Amber**: Category badges (consistent across app)

### Responsive Design
- Tables scroll horizontally on mobile
- Font sizes adjust for different screen sizes
- Buttons stack vertically on small screens

### Empty States
- Clear messaging when no components collected
- Separate empty states for collected and returned sections

## Use Cases

### Admin Scenarios

**1. Check Team Inventory:**
```
Admin → Manage Teams → Click "View Inventory" on team card
→ See all collected and returned components
```

**2. Quick Overview:**
```
Admin → Manage Teams → View team cards
→ See collected/returned counts at a glance
```

**3. Track Returns:**
```
Admin → Manage Teams → View Inventory
→ Check "Returned Components" section
→ Verify what has been returned
```

### Participant Scenarios

**1. View Current Inventory:**
```
Participant → Dashboard → My Inventory tab
→ See "Currently With You" section
→ Know what components they have
```

**2. Check Return History:**
```
Participant → Dashboard → My Inventory tab
→ See "Returned Components" section
→ Verify what has been returned
```

**3. Plan Returns:**
```
Participant → My Inventory
→ See total collected count
→ Decide what to return
```

## Benefits

### For Admins:
✅ **Quick Overview**: See inventory status on team cards
✅ **Detailed View**: Access full inventory breakdown
✅ **Return Tracking**: Monitor returned components
✅ **Accountability**: Know exactly who has what
✅ **Audit Trail**: Complete history of collections and returns

### For Participants:
✅ **Transparency**: See their own inventory
✅ **Responsibility**: Track what they have
✅ **Return Awareness**: Know what they've returned
✅ **Planning**: Better manage component usage

## Integration with Existing Features

### Works With:
- ✅ **Reinstate Inventory**: Shows returned status
- ✅ **Request Management**: Uses request data
- ✅ **Component Collections**: Complementary view
- ✅ **Real-time Updates**: Auto-refreshes with polling

### Data Sources:
- `requests`: Filtered by status and team
- `components`: Component details
- `teams`: Team information
- `user`: Current participant's team ID

## Future Enhancements

Potential improvements:
- Export team inventory to CSV/Excel
- Filter by component category
- Sort by quantity or name
- Search within inventory
- Damage/loss reporting
- Component condition tracking
- Return reminders/notifications
- Inventory analytics and charts
