# exact-page-builder Landing Page Integration

## Overview

The `exact-page-builder` repository (https://github.com/mycomind4-arch/exact-page-builder) has been incorporated into fairprocessmaps as the primary landing page. This integration brings a professionally designed, component-based landing page to the fairprocessmaps public site.

## What Was Integrated

### Components
All landing page components from exact-page-builder have been copied to `frontend/web/src/components/landing/`:

- **Header.tsx** - Navigation header with logo, nav links, and CTA buttons
- **Hero.tsx** - Full-height hero section with gradient overlay and aerial imagery
- **ValueStrip.tsx** - Four-column value proposition strip
- **PropertyInfo.tsx** - Property information showcase with interactive map visualization
- **UseCases.tsx** - Four-column use case cards (property owners, buyers, neighbors, advocates)
- **TransparencyBand.tsx** - Dark forest-themed transparency benefits section
- **ClosingCta.tsx** - Final call-to-action section with forest imagery

### Assets
All image assets from exact-page-builder have been copied to `frontend/web/src/assets/`:

- `hero-coast.jpg` - Aerial coastal landscape (1920x1080)
- `map-aerial.jpg` - Satellite map visualization (1200x1000)
- `property-thumb.jpg` - Property preview image (800x560)
- `use-owners.jpg` - Property owners use case image
- `use-buyers.jpg` - Buyers & investors use case image
- `use-neighbors.jpg` - Neighbors & community use case image
- `use-advocates.jpg` - Advocates & professionals use case image
- `cta-forest.jpg` - Closing CTA forest image (1920x900)

### Design System
The exact-page-builder's design system has been added to `frontend/web/src/app/globals.css`:

#### Colors (oklch format)
- **Forest (Primary)**: `oklch(0.27 0.032 155)` - Deep forest green
- **Forest Foreground**: `oklch(0.97 0.008 90)` - Off-white for text on forest
- **Teal Pin**: `oklch(0.6 0.075 195)` - Accent color for map pins
- **Sand**: `oklch(0.965 0.008 90)` - Light beige background
- Standard semantic colors: background, foreground, card, primary, secondary, muted, accent, border

#### Fonts (via Google Fonts)
- **Playfair Display** - Serif font for headings (var(--font-serif))
- **Caveat** - Script font for accent text (var(--font-script))
- **Inter** - Sans-serif for body text (var(--font-sans))
- **JetBrains Mono** - Monospace for code (var(--font-mono))

## File Structure

```
fairprocessmaps/
├── frontend/web/src/
│   ├── app/
│   │   ├── landing/
│   │   │   └── page.tsx                          # Landing page route
│   │   ├── layout.tsx                            # Updated with serif/script fonts
│   │   └── globals.css                           # Updated with landing design system
│   ├── assets/                                   # All landing images
│   │   ├── hero-coast.jpg
│   │   ├── map-aerial.jpg
│   │   ├── property-thumb.jpg
│   │   ├── use-owners.jpg
│   │   ├── use-buyers.jpg
│   │   ├── use-neighbors.jpg
│   │   ├── use-advocates.jpg
│   │   └── cta-forest.jpg
│   └── components/
│       └── landing/                             # All landing components
│           ├── Header.tsx
│           ├── Hero.tsx
│           ├── ValueStrip.tsx
│           ├── PropertyInfo.tsx
│           ├── UseCases.tsx
│           ├── TransparencyBand.tsx
│           └── ClosingCta.tsx
```

## Landing Page Route

The landing page is available at:
- **Route**: `/landing`
- **Path**: `frontend/web/src/app/landing/page.tsx`

The page is a client component that imports and renders all seven landing components in sequence:
1. Header (navigation)
2. Hero (main hero section)
3. ValueStrip (value propositions)
4. PropertyInfo (property information showcase)
5. UseCases (use case cards)
6. TransparencyBand (transparency benefits)
7. ClosingCta (final call-to-action)

## Design System Integration

The landing page components use the exact-page-builder design system, which is now part of the fairprocessmaps theme. The original fairprocessmaps color system (with `--color-fp-*` variables) remains intact for the dashboard and admin interfaces.

### Color Compatibility

The landing page uses semantic color tokens that work across light/dark themes:
- `text-forest` / `bg-forest` - Primary forest green
- `text-sand` / `bg-sand` - Light background
- `text-foreground` / `text-muted-foreground` - Text hierarchy
- `border-border` - Border color
- `bg-background` / `bg-card` - Surface colors

## Font Integration

Updated `frontend/web/src/app/layout.tsx` to include new font variables:
```tsx
--font-sans: "Libre Franklin", ui-sans-serif, system-ui, sans-serif;
--font-serif: "Playfair Display", ui-serif, Georgia, serif;
--font-script: "Caveat", cursive;
```

These fonts are available as CSS custom properties for use throughout the application.

## Future Enhancements

- Add dynamic routing to move landing page to root (`/`) if needed
- Integrate authentication flows into Header CTAs
- Add analytics tracking to CTA buttons
- Consider responsive adjustments for mobile
- Add dark mode variants if needed
- Link navigation items to appropriate sections/pages

## Source Repository

The exact-page-builder repository is public and available at:
https://github.com/mycomind4-arch/exact-page-builder

This is a read-only integration - changes should be made in the fairprocessmaps repository, not pushed back to exact-page-builder.

## Notes

- All components use standard Lucide React icons
- Images are properly loaded with alt text for accessibility
- The design system follows a mobile-first responsive approach
- Components use Tailwind CSS utility classes for styling
- No external dependencies beyond what's already in fairprocessmaps
