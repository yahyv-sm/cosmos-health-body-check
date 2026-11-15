# Environment Feature Implementation

## Overview
Added support for **4 mission environments** to the Cosmos Health project:
1. 🛰️ **Space Station** (LEO, ISS-class)
2. 🚀 **Deep Space Craft** (Transit vehicle, Orion-class)
3. 🚙 **Surface Rover** (Planetary surface vehicle)
4. 🏠 **Surface Base** (Planetary outpost)

## What Was Added

### 1. JSON Data (`data/cosmos-health-data.json`)
- Added `projectAuthored.environments` configuration
- Each environment includes:
  - Name, icon, tagline, description
  - Key features list
  - Indicator emphasis (primary/secondary/contextual)
  - Environment-specific notes for each indicator
  - Hazard context for each of the 5 NASA hazards

### 2. JavaScript Logic (`js/cosmos-health-data-link.js`)
- `selectedEnvironment` state variable (defaults to 'station')
- `environments()` - Get all environments from JSON
- `environmentOf(id)` - Get specific environment by ID
- `currentEnvironment()` - Get currently selected environment
- `renderEnvironment()` - Render environment selector and info panel
- Updated `renderAll()` to include environment rendering
- Added comprehensive CSS styles for environment UI

### 3. UI Components
- **Environment Selector**: Button group in hero section for switching environments
- **Environment Info Panel**: Detailed display showing:
  - Environment header with icon and tagline
  - Description
  - Key features
  - Indicator emphasis tags (color-coded by priority)
  - Environment-specific notes for indicators
  - Hazard context for each NASA hazard
  - Disclaimer that this is contextual only

## Design Principles Preserved

✅ **Core simulation unchanged** - Environment selection does NOT affect:
   - Deviation calculations
   - Hazard scores
   - Body region colors
   - Symptom log functionality

✅ **Visual consistency** - Uses same color palette and styling as original design

✅ **Accessibility** - All environment controls are keyboard accessible with ARIA labels

✅ **Educational focus** - Maintains the project's educational simulation nature

## How to Use

1. Open the page in a browser
2. Look for the **MISSION ENVIRONMENT** selector in the top-right of the hero section
3. Click any environment button to switch contexts
4. The info panel below the hero updates with environment-specific guidance
5. All other functionality (sliders, body map, hazard radar) works the same regardless of environment

## Files Modified

- `data/cosmos-health-data.json` - Added environments configuration
- `js/cosmos-health-data-link.js` - Added environment rendering logic and styles
- `index.html` - No changes needed (JS dynamically creates environment UI)
- `Cosmos_Health_Body_check.html` - No changes needed (same as index.html)
