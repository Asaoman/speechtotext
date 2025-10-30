# ProperNounsModalMinimal Component Documentation

## Overview

`ProperNounsModalMinimal` is a minimal, shared modal component used consistently across both **proofreading** and **subtitle generation** tabs for managing proper nouns dictionaries.

## Location

```
components/ProperNounsModalMinimal.tsx
```

## Features

### 1. Minimal Dictionary List View
- Displays all dictionaries in a compact, collapsible list
- Shows entry count for each dictionary
- Click to expand and view entries within each dictionary

### 2. Add New Proper Noun
- Select a dictionary from dropdown
- Enter term and optional reading
- Press "追加" button or Enter key to add
- Real-time update across all components

### 3. Read-Only Display
- No edit or delete capabilities (minimal version)
- Full management available in Settings modal
- Focus on quick additions during workflow

## Usage

### Import

```typescript
import ProperNounsModalMinimal from '@/components/ProperNounsModalMinimal'
```

### Implementation

```typescript
const [showProperNounsModal, setShowProperNounsModal] = useState(false)

// Open modal
<button onClick={() => setShowProperNounsModal(true)}>
  固有名詞を管理
</button>

// Render modal
{showProperNounsModal && (
  <ProperNounsModalMinimal onClose={() => setShowProperNounsModal(false)} />
)}
```

## Props

### `onClose` (required)
- **Type**: `() => void`
- **Description**: Callback function to close the modal

## Component Structure

```
ProperNounsModalMinimal
├── Header
│   ├── Title: "📚 固有名詞辞書"
│   └── Close Button
├── Add New Entry Section
│   ├── Dictionary Selector
│   ├── Term Input
│   ├── Reading Input (optional)
│   └── Add Button
└── Dictionary List Section
    └── Collapsible Dictionary Items
        └── Entry List (when expanded)
```

## Consistency Rules

### This component is used in:
1. **Proofreading Tab** (`校正タブ`)
   - Location: ProofreadingSection.tsx
   - Access: "固有名詞を管理" button in Project Settings

2. **Subtitle Generation Tab** (`字幕生成タブ`)
   - Location: ProofreadingSection.tsx (same component)
   - Access: "固有名詞を管理" button in Project Settings

### Why Shared Component?

- **Consistency**: Identical UI/UX across all tabs
- **Maintainability**: Single source of truth for proper nouns management
- **Simplicity**: Focused on adding entries during workflow
- **Performance**: Lightweight compared to full management component

## State Management

### LocalStorage Integration
- Reads dictionaries from `localStorage` via `storage.getDictionaries()`
- Reads entries from `localStorage` via `storage.getDictionaryEntries(dictId)`
- Writes new entries to `localStorage` via `storage.setDictionaryEntries()`
- Dispatches storage event for real-time updates across components

### Real-Time Updates
```typescript
window.dispatchEvent(new Event('storage'))
```
This ensures the proper nouns count badge updates immediately after adding entries.

## Styling

### Modal Overlay
- Fixed position, full viewport
- Dark backdrop with blur effect
- Click-outside-to-close functionality

### Content Card
- Max width: 600px
- Max height: 90vh
- Scrollable overflow
- Centered alignment

### Color Scheme
- Accent color highlights for active elements
- Muted colors for secondary information
- Consistent with global CSS variables

## Related Components

### Full Management Component
- **ProperNounsManager.tsx**: Full CRUD operations
- **Location**: Settings modal only
- **Features**: Create dictionaries, edit entries, delete entries, import/export

### Integration Points
- **ProofreadingSection.tsx**: Both tabs use this component
- **Storage utility**: `lib/utils.ts` for localStorage operations
- **Types**: `lib/types.ts` for TypeScript definitions

## API Integration

### Proofreading API (`/api/proofread`)
- Automatically fetches proper nouns when `includeProperNouns` is true
- Adds proper nouns context to AI prompts
- No additional API calls needed from this component

## Best Practices

### 1. Don't Duplicate
This component should NEVER be duplicated. Always import from the single source.

### 2. Modal Positioning
Always use the same z-index (1000) to ensure proper layering.

### 3. Event Handling
Always dispatch storage event after modifications to ensure synchronization.

### 4. User Guidance
Include the footer message: "💡 辞書の管理(編集・削除)は設定画面から行えます"

## Future Enhancements

Potential features for future versions:
- Quick search/filter within dictionaries
- Batch import from clipboard
- Recent terms quick access
- Category-based filtering

## Troubleshooting

### Entries not appearing
- Check localStorage is enabled
- Verify storage utility functions are working
- Confirm dictionary exists before adding entries

### Count not updating
- Ensure storage event is dispatched
- Check useEffect dependencies in parent component
- Verify localStorage event listener is attached

## Example

Complete example with proper nouns count display:

```typescript
const [properNounsCount, setProperNounsCount] = useState(0)
const [showProperNounsModal, setShowProperNounsModal] = useState(false)

useEffect(() => {
  const updateProperNounsCount = () => {
    const dictionaries = storage.getDictionaries()
    let totalCount = 0
    dictionaries.forEach((dict: any) => {
      const entries = storage.getDictionaryEntries(dict.id)
      totalCount += entries.length
    })
    setProperNounsCount(totalCount)
  }

  updateProperNounsCount()

  const handleStorageChange = () => {
    updateProperNounsCount()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }
}, [])

return (
  <>
    <button onClick={() => setShowProperNounsModal(true)}>
      <span>固有名詞を管理</span>
      <span className="badge">登録数: {properNounsCount}件</span>
    </button>

    {showProperNounsModal && (
      <ProperNounsModalMinimal
        onClose={() => setShowProperNounsModal(false)}
      />
    )}
  </>
)
```

---

**Version**: 1.0.0
**Last Updated**: 2025-10-28
**Author**: Speech to Text React Team
