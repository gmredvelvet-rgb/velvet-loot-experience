# MASTER TASK — Velvet Loot Reveal

Create a production-ready Foundry VTT v14 module called:

Velvet Loot Reveal

Module ID:

velvet-loot-reveal

The module provides a cinematic loot presentation interface for Foundry VTT and integrates with Item Piles when available.

DO NOT replace or modify Item Piles inventory logic.

Item Piles must remain responsible for:
- item storage
- quantities
- currencies
- item transfers
- permissions
- pile state

Velvet Loot Reveal is only a cinematic UI and interaction layer.

---

# PRIMARY FEATURE

When an Actor or Token is recognized as a loot pile, provide an option to open a custom cinematic interface instead of, or alongside, the default loot sheet.

The interface must resemble a fantasy RPG loot-box/reward screen.

Layout:

[ LEFT ARROW ]

small item
medium item

LARGE SELECTED ITEM

medium item
small item

[ RIGHT ARROW ]

Below the carousel, show a decorative information panel containing:

ITEM NAME
RARITY
COST

Optional information:

ITEM LEVEL
QUANTITY
TRAITS

The selected item must always occupy the center position.

---

# FOUNDRY VERSION

Target:

Foundry Virtual Tabletop v14

Use modern v14 APIs.

Prefer ApplicationV2 and modern Foundry patterns.

Avoid deprecated APIs.

---

# ITEM PILES INTEGRATION

Item Piles support must be implemented through an isolated adapter:

scripts/integrations/item-piles-adapter.js

Never scatter Item Piles-specific code throughout the module.

The adapter must provide functions similar to:

isAvailable()
isLootPile(actor)
getItems(actor)
takeItem(actor, item, quantity, user)
takeAll(actor, user)

Use Item Piles public API where possible.

Never manipulate Item Piles flags or embedded documents directly if a supported public API exists.

If Item Piles is unavailable, the module must continue functioning.

---

# LOOT SERVICE

Create:

scripts/services/loot-service.js

Expose normalized methods such as:

LootService.isLootActor(actor)

LootService.getItems(actor)

LootService.takeItem(actor, item, quantity)

LootService.takeAll(actor)

The UI must never care whether the loot backend is:

- Item Piles
- native Foundry
- PF2e loot actor
- future integrations

---

# APPLICATION

Create:

LootCarouselApplication

using Foundry v14 ApplicationV2.

Suggested location:

scripts/applications/loot-carousel.js

Template:

templates/loot-carousel.hbs

Styles:

styles/loot-carousel.css

The application must support:

next item
previous item
select item
take item
take all
inspect item
close

Keyboard controls:

LEFT ARROW
RIGHT ARROW
ENTER
ESCAPE

Optional:

mouse wheel
swipe gesture

---

# CAROUSEL

Display up to five visible items:

position -2
position -1
position 0
position +1
position +2

Position 0 is selected.

Visual hierarchy:

-2:
scale ~0.55
opacity ~0.35

-1:
scale ~0.8
opacity ~0.7

0:
scale ~1.15
opacity 1
highest z-index

+1:
scale ~0.8

+2:
scale ~0.55

Use CSS transforms.

Do NOT require WebGL.

Use perspective and transform transitions to create pseudo-3D depth.

---

# ANIMATIONS

Implement AnimationService.

Opening sequence should approximately follow:

0ms
overlay fades in

150ms
bottom banner enters

250ms
carousel cards appear

400ms
selected item scales into focus

500ms
rarity glow begins

550ms
item name appears

650ms
rarity appears

750ms
cost appears

Navigation:

selected item slides away

new item moves toward center

scales interpolate

opacity changes

glow updates

Pickup:

item lifts slightly

flash/glow

item fades out

next item automatically becomes selected

Use Web Animations API and CSS transitions.

External animation libraries should NOT be mandatory.

---

# AUDIO

Create:

scripts/services/audio-service.js

Audio categories:

OPEN
NAVIGATE
REVEAL
PICKUP
CLOSE

Rarity-specific reveal sounds:

COMMON
UNCOMMON
RARE
UNIQUE

Audio settings must allow:

master enable/disable

volume

rarity sounds

navigation sounds

pickup sounds

Use modern Foundry v14 audio APIs.

---

# RARITY SERVICE

Create:

scripts/services/rarity-service.js

Normalize system rarity data.

Return:

{
  id,
  label,
  rank,
  cssClass,
  sound,
  visualPreset
}

Support at minimum:

PF2e

D&D 5e

generic fallback

For PF2e support:

common
uncommon
rare
unique

Never assume all systems store rarity in the same field.

---

# ITEM METADATA

Normalize:

name
image
quantity
price
rarity
level
traits
type

Expose through a normalized ViewModel.

Example:

{
  uuid,
  name,
  image,
  quantity,
  rarity,
  priceLabel,
  level,
  type,
  traits
}

Do not bind the Handlebars template directly to raw system data.

---

# ITEM TYPE PRESENTATIONS

Allow presentation presets:

weapon
armor
consumable
treasure
spell
container
generic

The architecture must allow additional presentation styles later.

---

# GM REVEAL SYSTEM

Implement optional synchronized reveal mode.

Modes:

Immediate

Player Interaction

GM Controlled

GM Controlled behavior:

Players see:

???

Unknown Item

GM presses:

REVEAL

The selected item is revealed simultaneously to allowed clients.

Use game.socket.

Suggested socket namespace:

module.velvet-loot-reveal

Socket actions:

OPEN
CLOSE
NAVIGATE
REVEAL
TAKE
REFRESH

Validate permissions.

Never trust client-side transfer requests blindly.

---

# MULTIPLAYER

Allow the GM to show a loot reveal to:

all players

specific players

players owning a particular character

local client only

The GM remains authoritative for synchronized reveal actions.

---

# SETTINGS

Create settings for:

Enable Velvet Loot Reveal

Enable Item Piles integration

Automatically offer cinematic view

Automatically open cinematic view

Enable sounds

Sound volume

Enable animations

Enable particles

Enable rarity glow

Show price

Show quantity

Show item level

Show traits

Allow player navigation

Allow player pickup

Reveal mode

Synchronize reveal to players

---

# DEFAULT LOOT SHEET

Never permanently replace the normal item pile sheet.

Provide an option:

Open Normal Loot Sheet

Also provide:

Open Loot Reveal

This ensures compatibility and fallback access.

---

# HOOK INTEGRATION

Add the cinematic loot option through clean hooks.

Possible entry points:

actor sheet header buttons

token HUD

Item Piles interaction

actor context menu

Avoid monkey-patching core Foundry classes unless absolutely necessary.

If patching becomes unavoidable, document it clearly.

---

# PERFORMANCE

The module must be lightweight.

Avoid continuous render loops.

Animations should only run during:

open
navigation
reveal
pickup
close

Preload audio where reasonable.

Lazy-load item images where possible.

Respect users with reduced-motion preferences.

---

# ACCESSIBILITY

Implement:

keyboard navigation

clear focus states

reduced motion support

sound toggle

text labels

buttons accessible without relying only on icons

---

# FAILURE HANDLING

If an item disappears because another user took it:

refresh the carousel

maintain a valid selected index

If the current item disappears:

move to the next available item

If the pile becomes empty:

show:

LOOT COLLECTED

then optionally close after a short delay.

---

# FILE STRUCTURE

velvet-loot-reveal/
│
├── module.json
│
├── scripts/
│   ├── main.js
│   ├── hooks.js
│   ├── applications/
│   │   └── loot-carousel.js
│   ├── integrations/
│   │   └── item-piles-adapter.js
│   ├── services/
│   │   ├── loot-service.js
│   │   ├── rarity-service.js
│   │   ├── audio-service.js
│   │   └── animation-service.js
│   └── utils/
│       └── item-utils.js
│
├── templates/
│   └── loot-carousel.hbs
│
├── styles/
│   └── loot-carousel.css
│
├── assets/
│   ├── ui/
│   └── audio/
│
└── lang/
    ├── en.json
    └── es.json

---

# DEVELOPMENT REQUIREMENT

Before implementing Item Piles integration:

1. inspect the installed Item Piles version
2. inspect its currently exposed public API
3. verify the correct methods for:
   - pile detection
   - inventory access
   - item transfer
   - currency transfer
4. do not invent API calls
5. isolate compatibility code in the adapter

Before implementing Foundry-specific calls:

verify APIs against Foundry v14.

Do not silently reuse deprecated v12/v13 APIs.

---

# DOCUMENTATION

Create:

README.md

ARCHITECTURE.md

CHANGELOG.md

DEV_NOTES.md

DEV_NOTES.md must record:

Item Piles API methods used

Foundry v14 APIs used

socket protocol

known limitations

compatibility concerns

future implementation ideas

---

The first objective is a functional MVP:

1. detect loot actor
2. show Open Loot Reveal button
3. open carousel
4. navigate items
5. display name / rarity / cost
6. inspect item
7. take item through Item Piles
8. remove taken item from carousel
9. play animation
10. play sound

After that, implement synchronized GM reveal and advanced effects.