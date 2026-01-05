# Calculated Projection Items - Implementation Plan

## Overview

Add a new capability for projection items to automatically calculate their amounts based on other projection items. Examples:
- Credit card processing fees = 2.9% of projected sales
- Sales tax = 6% of all revenue
- LOC interest = 8% APR on average monthly LOC balance

---

## Data Model Changes

### Extended Entry Schema

```javascript
{
  // Existing fields
  id: 1736123456789,
  date: '2026-01-02',
  description: 'CC Processing Fees',
  type: 'expense',
  frequency: 'daily',
  endDate: undefined,
  endOccurrences: undefined,

  // Amount handling (MODIFIED)
  amount: null,                    // null when calculated, number when manual/override
  manualOverride: false,           // true = user replaced calculated amount

  // NEW: Calculation configuration
  calculationType: null,           // null | 'percentage' | 'fixed' | 'balance_percentage'
  calculationValue: null,          // The percentage or fixed amount

  // NEW: Source configuration
  sourceMode: null,                // null | 'single' | 'selected' | 'all_of_type'
  sourceEntryIds: [],              // Array of source entry IDs
  sourceType: null,                // For 'all_of_type': 'revenue' | 'expense' | 'loc_draw' | 'loc_paydown'

  // NEW: Time period for aggregation
  sourcePeriod: 'same_day',        // 'same_day' | 'same_week' | 'same_month' | 'rolling_days'
  sourcePeriodDays: null,          // For 'rolling_days': number of days to look back

  // NEW: Date offset
  dateOffset: 0,                   // Days after source (0 = same day, 2 = T+2 settlement)

  // NEW: Period timing (for same_month)
  periodTiming: 'end'              // 'end' | 'start' - when in the period to place entry
}
```

---

## Calculation Types

| Type | Description | Use Case |
|------|-------------|----------|
| `percentage` | % of sum of source amounts | CC fees (2.9% of sales) |
| `fixed` | Fixed amount × count of occurrences | Per-transaction fee ($0.30/txn) |
| `balance_percentage` | % of running LOC balance (APR) | LOC interest (8% annual) |

---

## Source Configuration

### Source Modes

| Mode | Description | UI Element |
|------|-------------|------------|
| `single` | One specific entry | Dropdown select |
| `selected` | Multiple specific entries | Multi-select with checkboxes |
| `all_of_type` | All entries of a type | Type dropdown |

### Source Periods (for aggregation)

| Period | Description | Typical Use |
|--------|-------------|-------------|
| `same_day` | Sources occurring same day | Daily CC fees |
| `same_week` | Sources in same calendar week | Weekly fee summary |
| `same_month` | Sources in same calendar month | Monthly interest |
| `rolling_days` | Sources in last N days (looking back) | Rolling average fees |

### Period Timing (for same_month only)

| Timing | Description |
|--------|-------------|
| `end` | Entry placed on last day of month (DEFAULT) |
| `start` | Entry placed on first day of month |

---

## Calculation Logic

### Percentage Calculation

```javascript
function calculatePercentage(calcEntry, sourceAmounts) {
  const total = sourceAmounts.reduce((sum, amt) => sum + amt, 0);
  return Math.round(total * (calcEntry.calculationValue / 100));
}
```

### Fixed Per-Occurrence

```javascript
function calculateFixed(calcEntry, sourceOccurrenceCount) {
  return Math.round(sourceOccurrenceCount * calcEntry.calculationValue);
}
```

### Balance Percentage (LOC Interest)

```javascript
function calculateBalancePercentage(calcEntry, avgBalance) {
  // No compounding - simple interest only
  // No negative interest - if balance <= 0, return 0
  if (avgBalance <= 0) return 0;

  // Convert APR to period rate
  let periodRate;
  switch (calcEntry.sourcePeriod) {
    case 'same_month':
      periodRate = calcEntry.calculationValue / 12 / 100;  // Monthly
      break;
    case 'same_week':
      periodRate = calcEntry.calculationValue / 52 / 100;  // Weekly
      break;
    case 'same_day':
      periodRate = calcEntry.calculationValue / 365 / 100; // Daily
      break;
  }

  return Math.round(avgBalance * periodRate);
}
```

---

## Manual Override Behavior

1. Calculated entries default to auto-calculation
2. User can edit amount to set manual override
3. `manualOverride: true` flag set when user provides amount
4. Calculation config preserved - user can revert to auto
5. UI shows both: "Calculated: $34.80" and manual input option

---

## Date Offset

- `dateOffset: 0` = Same day as source occurrence
- `dateOffset: 2` = 2 days after source (T+2 settlement)
- Applied after period aggregation
- Entries pushed past forecast range are not displayed

---

## Display Options

### New State Property

```javascript
state.entryDisplayMode = 'grouped';  // 'grouped' | 'date_sorted'
```

### Grouped Display (Default)

```
Daily Sales                     Revenue    Daily       $1,200
  ↳ CC Processing Fees          Expense    (calculated) ← 2.9%
  ↳ Sales Tax                   Expense    (calculated) ← 6%

Online Sales                    Revenue    Daily       $800

LOC Balance
  ↳ LOC Interest                Expense    Monthly     ← 8% APR
```

### Date-Sorted Display

```
Daily Sales                     Revenue    Daily       $1,200
CC Processing Fees              Expense    Daily       ← 2.9% of Daily Sales
Online Sales                    Revenue    Daily       $800
Sales Tax                       Expense    Daily       ← 6% of Daily Sales
```

---

## Validation Rules

1. **Source required**: Calculated entries must have at least one source
2. **Source must exist**: All sourceEntryIds must reference existing entries
3. **No circular dependencies**: Calculated entries cannot be sources
4. **No self-reference**: Entry cannot reference itself
5. **Calculation value required**: Must be > 0
6. **Valid source mode**: Must match sourceEntryIds/sourceType configuration

---

## Edge Cases

| Case | Handling |
|------|----------|
| Source entry deleted | Show warning; skip in calculations; prompt user to fix |
| All sources deleted | Same as above |
| Manual override set | Use manual amount; show "calculated would be $X" |
| Source has no occurrences in period | Amount = $0 |
| Date offset pushes past forecast | Entry not shown |
| LOC balance ≤ 0 | Interest = $0 (no negative interest) |
| Multiple sources, mixed frequencies | Aggregate all occurrences in period |
| Import with broken references | Validate on import; warn user |
| Cleanup deletes source | Mark calculated as orphaned |

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Add new fields to entry schema
- [ ] Update saveState/loadState for new fields
- [ ] Add isCalculatedEntry() helper
- [ ] Add getSourceEntries() helper
- [ ] Update expandEntries() for two-pass expansion

### Phase 2: Single Source + Percentage
- [ ] Implement single-source percentage calculation
- [ ] Add "Amount Type" toggle to entry form (manual vs calculated)
- [ ] Add source entry dropdown (filtered to non-calculated)
- [ ] Add calculation value input
- [ ] Update entry list display to show calculation indicator

### Phase 3: Date Offset
- [ ] Add dateOffset field to form
- [ ] Implement offset in expansion logic
- [ ] Handle edge case: offset pushes past forecast range

### Phase 4: Manual Override
- [ ] Add manualOverride flag handling
- [ ] Show calculated vs manual toggle in edit mode
- [ ] Add "Revert to calculated" button
- [ ] Display "would be $X" when overridden

### Phase 5: Multiple Sources
- [ ] Add sourceMode selection UI
- [ ] Implement multi-select for 'selected' mode
- [ ] Implement type dropdown for 'all_of_type' mode
- [ ] Add sourcePeriod selection
- [ ] Implement period aggregation logic

### Phase 6: Fixed Per-Occurrence
- [ ] Add 'fixed' calculation type
- [ ] Count occurrences instead of summing amounts
- [ ] Update UI to explain "per occurrence"

### Phase 7: LOC Interest (Balance-Based)
- [ ] Add 'balance_percentage' calculation type
- [ ] Implement average balance calculation for period
- [ ] APR to period rate conversion
- [ ] Enforce no negative interest rule
- [ ] Add periodTiming option (start/end of month)

### Phase 8: Display & Polish
- [ ] Add entryDisplayMode setting
- [ ] Implement grouped display view
- [ ] Add visual grouping with indentation
- [ ] Orphaned entry warnings
- [ ] "Fix broken link" UI

---

## UI Mockups

### Entry Form - Calculated Mode

```
┌─────────────────────────────────────────────────────────────┐
│ Add Projection Item                                         │
├─────────────────────────────────────────────────────────────┤
│ Start Date:    [2026-01-02    ]                            │
│ Description:   [CC Processing Fees                    ]     │
│ Type:          [Expense           ▼]                        │
│                                                             │
│ Amount:        ○ Manual  ● Calculated                       │
│                                                             │
│ ┌─ Calculation Settings ──────────────────────────────────┐ │
│ │ Calculate:   [2.9  ] [% of amount    ▼]                 │ │
│ │                                                         │ │
│ │ Based on:    ● Specific items  ○ All [revenue ▼]        │ │
│ │              ☑ Daily Sales ($1,200/day)                 │ │
│ │              ☑ Online Sales ($800/day)                  │ │
│ │              ☐ Catering Revenue ($500/week)             │ │
│ │                                                         │ │
│ │ Time Period: [Same day         ▼]                       │ │
│ │ Date Offset: [0  ] days after source                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Frequency:     (Inherited from sources)                     │
│                                                             │
│              [Cancel]                      [Save Entry]     │
└─────────────────────────────────────────────────────────────┘
```

### Entry Form - LOC Interest

```
┌─────────────────────────────────────────────────────────────┐
│ Add Projection Item                                         │
├─────────────────────────────────────────────────────────────┤
│ Start Date:    [2026-01-31    ]                            │
│ Description:   [LOC Interest                          ]     │
│ Type:          [Expense           ▼]                        │
│                                                             │
│ Amount:        ○ Manual  ● Calculated                       │
│                                                             │
│ ┌─ Calculation Settings ──────────────────────────────────┐ │
│ │ Calculate:   [8.0  ] [% APR on LOC balance ▼]           │ │
│ │                                                         │ │
│ │ Time Period: [Same month       ▼]                       │ │
│ │ Charge on:   ● End of month  ○ Start of month           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Frequency:     [Monthly          ▼]                         │
│                                                             │
│              [Cancel]                      [Save Entry]     │
└─────────────────────────────────────────────────────────────┘
```

---

## File Changes Required

| File | Changes |
|------|---------|
| `app.js` | Entry schema, expandEntries(), calculation functions, validation |
| `index.html` | Entry form UI, display mode toggle, calculation settings |
| `styles.css` | Grouped display styling, calculation indicators |

---

## Testing Scenarios

1. **Basic percentage**: 2.9% of single daily revenue item
2. **Multiple sources**: 2.9% of two revenue items combined
3. **All of type**: 6% of all revenue items
4. **Date offset**: T+2 settlement fees
5. **Manual override**: Override then revert
6. **LOC interest**: 8% APR on monthly average balance
7. **Source deletion**: Delete source, verify warning
8. **Period boundaries**: Same month on Jan 31, Feb 28
9. **Rolling period**: 30-day lookback calculation
10. **Zero balance**: LOC interest when balance is $0
11. **Import/export**: Preserve calculation config and links
