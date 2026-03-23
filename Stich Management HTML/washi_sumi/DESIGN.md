# Design System Specification: Editorial Zen

## 1. Overview & Creative North Star
**Creative North Star: The Modern Calligrapher**
This design system rejects the "boxed-in" nature of traditional administrative dashboards. Instead, it draws inspiration from the intentionality of Japanese *Ma* (the celebration of empty space) and the structural elegance of *Shodo* (calligraphy). 

We move beyond the "template" look by treating the dashboard as a high-end editorial canvas. By utilizing intentional asymmetry, overlapping layers, and a high-contrast typographic scale between the sharp `Instrument Serif` and the utilitarian `Noto Sans JP`, we create an experience that feels curated rather than just calculated. This system prioritizes tonal depth over structural lines, ensuring the UI feels organic, premium, and calm.

---

## 2. Colors & Surface Philosophy
The palette is rooted in traditional Japanese pigments: *Washi* (paper), *Sumi* (ink), and *Akabeni* (pigment red).

### The "No-Line" Rule
To achieve a high-end aesthetic, **1px solid borders for sectioning are strictly prohibited.** Do not use lines to separate the sidebar from the main content or to divide cards. Boundaries must be defined through background color shifts.
- Use `surface-container-low` for secondary areas.
- Use `surface` for the primary canvas.
- A vertical "gap" of empty space (`spacing-8`) is preferred over a divider line.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked physical materials.
- **Level 0 (Base):** `surface` (#fcf9f4) – The fundamental paper layer.
- **Level 1 (Sections):** `surface-container-low` (#f6f3ee) – Used for large layout blocks like the sidebar or secondary panels.
- **Level 2 (Interaction):** `surface-container-lowest` (#ffffff) – Used for primary cards and data entry fields to create a "lifted" paper effect.

### The "Glass & Akabeni" Rule
For floating elements (modals, dropdowns), use **Glassmorphism**. Apply `surface` at 80% opacity with a `24px` backdrop-blur. For primary CTAs, use a subtle gradient from `primary` (#a2281a) to `primary-container` (#c4402f) at a 135-degree angle to give the "Torii Red" a tactile, lacquered depth.

---

## 3. Typography
The typographic soul of this system lies in the tension between the serif display and the sans-serif UI.

*   **Display & Headlines (`Instrument Serif` / `notoSerif` token):** Used for page titles and high-level stats. These should be large and authoritative. The serif conveys a sense of heritage and precision.
*   **Body & Labels (`Noto Sans JP` / `manrope` token):** Used for all functional data. It is highly legible and provides a neutral "quietness" that allows the headers to shine.

**Hierarchy Guidance:**
- **Display-LG (3.5rem):** Reserved for empty state heroes or major dashboard summaries.
- **Headline-SM (1.5rem):** Standard page titles.
- **Label-MD (0.75rem):** All caps with `0.05em` letter spacing for table headers, utilizing `on-surface-variant` (#59413d) to ensure they feel like metadata, not primary content.

---

## 4. Elevation & Depth
We eschew the heavy shadows of the 2010s in favor of **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by placing a `surface-container-lowest` card (Pure White) atop a `surface-container` background. The contrast in value creates a "natural lift."
*   **Ambient Shadows:** If a floating state is required (e.g., a dragged item), use a `shadow-xl` with a blur of `40px` at `4%` opacity. The shadow color must be tinted with the `primary` token (#a2281a) to mimic natural light reflecting off a warm surface.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in data-dense tables, use `outline-variant` (#e1bfb9) at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components

### Buttons
- **Primary:** Gradient `primary` to `primary-container`. `radius-DEFAULT` (10px). Text is `on-primary` (white).
- **Secondary:** Ghost style. No background, `outline` token for text color. High-interaction state uses `surface-container-high` background.
- **Tertiary:** Text-only, using `Instrument Serif` for a sophisticated, editorial feel in low-priority actions.

### Cards & Lists
**Forbid the use of divider lines.** 
- Separate list items using `spacing-2` of vertical white space.
- Use a hover state of `surface-container-highest` to define row boundaries dynamically.
- Cards must use `radius-DEFAULT` (10px) and sit on `surface-container-low` to distinguish from the background.

### Status Badges
Badges should be minimal, using a "dot and text" pattern.
- **Critical (Red):** `error` text with an 8% `error` background.
- **Pending (Amber):** `secondary` text.
- **Success (Green):** `tertiary` text.
- **Processing (Blue):** `primary` text.

### The 224px Sidebar
The sidebar is a "Low-Surface" anchor. 
- **Background:** `surface-container-low`.
- **Active State:** A vertical `akabeni` (Primary) bar 4px wide on the far left, with the menu text shifting to `primary` color. No background pills for active states—keep it airy.

### Input Fields
Inputs should feel like "wells" in the paper. 
- **Background:** `surface-container-lowest`.
- **Border:** `outline-variant` at 20% opacity. 
- **Focus:** 2px solid `primary`. No "glow" effect—just a sharp, calligraphic stroke.

---

## 6. Do's and Don'ts

### Do
- **Embrace White Space:** If a section feels crowded, increase the spacing from `spacing-4` to `spacing-8`. Space is a design element, not "empty" area.
- **Use Asymmetry:** Place page titles on the far left, but align primary actions to the right with a slightly different vertical baseline to create a dynamic, editorial flow.
- **Layer Surfaces:** Always ask, "Can I define this area with a subtle color shift instead of a line?"

### Don't
- **Don't use pure black shadows:** Always tint shadows with the surface or primary accent color.
- **Don't use 1px borders:** They break the "Zen" flow and make the dashboard look like a generic Bootstrap admin panel.
- **Don't crowd the sidebar:** With only 224px, use `label-sm` for categories to keep the navigation feeling light and breathable.
- **Don't use default "Blue" for links:** Use `primary` (Akabeni Red) or `tertiary` (Teal) to stay within the Japanese-inspired palette.