# Qivaya UI/UX overhaul plan

## Product-experience release — 25 August 2026

The ten-area experience pass is implemented as a shared-shell release rather than another set of duplicate pages:

1. Patient home and navigation use one sticky desktop header and one contained mobile dock.
2. Provider discovery keeps its hero, filters, results, sorting, and trust explanation in one responsive flow.
3. Appointments use a bounded journey canvas and a scroll-safe detail dialog.
4. Health records and the medical-document vault share the same hierarchy and readable dark/light surfaces.
5. Family access now uses the shared patient header and a responsive delegated-access card grid.
6. Notifications and preferences use consistent privacy, empty, loading, and error states.
7. Provider schedule and encounter workspaces retain clinical density without horizontal page overflow.
8. Admin overview and operations use a fixed desktop navigation contract and fluid main column.
9. Authentication, profile, and accessibility surfaces share the same brand, spacing, control, and theme language.
10. Arabic/RTL, keyboard focus, reduced motion, text wrapping, mobile containment, and light/dark themes are part of the same acceptance boundary.

The final presentation layer is `app/product-experience-release.css`. It is loaded after legacy route styles, uses explicit shell selectors, and does not change business logic or authorization.

## Product direction

Qivaya should feel calm, precise, trustworthy, and easy to scan. The interface uses one cyan-led accent, warm amber only for emphasis, restrained elevation, generous whitespace, and consistent interaction patterns across patient, provider, partner, and platform workspaces.

## Delivery sequence

1. Foundation: semantic color, spacing, radius, typography, elevation, focus, and motion tokens.
2. Themes: persistent light and dark modes, system-aware first visit, accessible contrast, and no change to business logic.
3. Navigation: one patient header, compact searchable role navigation, consistent top bars, mobile dock, and predictable active states.
4. Components: buttons, fields, cards, tables, badges, banners, dialogs, drawers, and designed loading/empty/error/success states.
5. Role surfaces: patient journeys first, then provider, partner, and high-density admin workspaces.
6. Responsive UX: mobile-first stacking, overflow containment, touch targets, sticky actions, and reduced-motion support.
7. Quality gate: one consolidated build, targeted route screenshots at desktop and mobile widths, keyboard navigation, contrast, and production promotion.

## Experience rules

- One primary action per section; destructive actions remain visually distinct and require confirmation.
- Navigation labels use user tasks, not internal system terminology.
- Dense operational pages preserve information density but use clear grouping and progressive disclosure.
- Empty and error states always explain what happened and offer the next useful action.
- Patient views default to a lighter, reassuring visual tone; operational views support both themes with higher information density.
- Arabic uses logical layout properties and maintains equivalent hierarchy, touch targets, and comprehension.

## Completion criteria

- No overlapping or clipped navigation at supported breakpoints.
- Every route inherits the same semantic tokens and theme behavior.
- Forms, tables, cards, and system states remain readable in light and dark modes.
- Keyboard focus is always visible and dialogs retain focus correctly.
- All major routes build successfully and production aliases point to the verified release.

## Route remediation matrix

The design system must not impose layout geometry through partial class-name matches. Each shell keeps an explicit contract:

- Patient shell: shared header and mobile dock, centered content, dark branded hero where a hero is used.
- Provider discovery: one continuous discovery hero, one filter/results workspace, and a high-contrast trust panel.
- Provider console: native sidebar grid remains intact; tokens change presentation but not column math.
- Platform operations: each legacy operational shell retains its own sidebar width until it is migrated to the shared admin shell.
- Audit ledger: fixed 238px desktop sidebar, fluid main column, 1360px content ceiling, and readable operational typography.
- Mobile: route-owned breakpoints remain authoritative; the theme control sits above the dock without covering actions.

Regression rule: shared CSS may define tokens, color, focus, motion, and component appearance. Width, positioning, grid columns, and route padding require a fully qualified shell selector.
