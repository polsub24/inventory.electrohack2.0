# EMBED CONTROL 7.0 — UI/UX Architecture Guide

This document outlines the design system and UI architecture for the ELECTROHACK 2.0 Inventory Management System[cite: 1]. It utilizes a "Premium SaaS Dark Mode" aesthetic, blending the Embed Control 7.0 and IEEE CAS brand identities without relying on cluttered hacker tropes.

## 1. Core Design System

*   **Base Canvas:** Pure OLED Black (`bg-black`). Provides an infinite, clean workspace that reduces visual fatigue during the hackathon.
*   **Surface Elevation:** Deep charcoal (`bg-zinc-950` or `bg-neutral-900`) used for `ComponentCard` elements, the `Cart` drawer, and admin action modals[cite: 1].
*   **Brand Accents:** Embed Control / IEEE CAS Emerald Green (`#10b981` / `emerald-500`). Strictly reserved for primary actions (e.g., "Transmit Request"), active states, and successful system feedback.
*   **Borders:** Ultra-thin, low-contrast gray (`border-zinc-800` or `border-white/5`) to define structural boundaries without adding noise.

## 2. Typography

*   **Primary (UI & Headings):** A clean, modern sans-serif (e.g., *Inter*, *Geist*, *SF Pro*). Used for module titles, component names, and buttons.
*   **Secondary (Data & Metrics):** A strict monospace font (e.g., *JetBrains Mono*). Used exclusively for hardware quantities, the 2-second polling timestamps, team registration numbers, and request UUIDs[cite: 1].

## 3. Global Layout & Branding

*   **Command Header:** A fixed top navigation bar featuring the Embed Control 7.0 logo on the left (Home) and the monochrome IEEE CAS logo on the right.
*   **Live Sync Indicator:** A minimal green LED dot next to the user profile that gently "breathes" (fades in and out) every time the 2-second `refreshData` fetch completes successfully[cite: 1].
*   **Background Watermark (Optional):** The Embed Control circular nodes scaled to 150%, anchored to the bottom-right corner at 2% to 3% opacity (`opacity-[0.03] pointer-events-none`) to provide architectural texture without interfering with data.

## 4. Participant Storefront

The participant dashboard (`ParticipantDashboardPage`) prioritizes a frictionless, e-commerce-like experience[cite: 1].

*   **Component Grid (`ComponentList`):** Rendered as flat, borderless charcoal rectangles on the black canvas. 
*   **Hardware Status Dots:** Availability is communicated via minimal glowing dots instead of bulky text pills:
    *   🟢 **In Stock:** Solid emerald dot (`bg-emerald-500`).
    *   🟡 **Low Stock (<5):** Solid amber dot (`bg-amber-500`)[cite: 1].
    *   🔴 **Depleted:** Red dot with a faint red glow (`bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]`).
*   **Quantity Steppers:** Subtly integrated into the bottom of the card. Unlimited components (`hasQuantityLimit: false`) display an infinity symbol (`∞`)[cite: 1].
*   **Cart Drawer (`Cart.tsx`):** A slide-over panel that acts as an industrial payload bay[cite: 1]. The "Submit Request" button remains a disabled gray until a valid component is added, shifting to solid backlit green.

## 5. Admin Control Terminal

The admin dashboard (`AdminDashboardPage`) strips away decorative elements to maximize data density and operational speed[cite: 1].

*   **Dashboard Metrics:** Total Units, Reserved, Queue, Ready, and Low Stock are displayed as large, pure white monospace numbers directly on the black canvas, separated by 1px vertical dividers[cite: 1].
*   **Request Queue (`RequestList`):** A high-contrast charcoal table with 1px alternating row dividers[cite: 1]. 
*   **Action Modals:** Hovering over destructive actions like "Deny Request" or "Delete History" changes the muted gray button to red to prevent accidental data loss[cite: 1]. Positive actions ("Confirm & Approve", "Finalize Release") are solid green[cite: 1].

## 6. Animations & Micro-interactions

*   **The "Spotlight Reveal" PCB Hover:** 
    *   **Target:** `ComponentCard` grids and Admin Metric numbers.
    *   **Mechanic:** A seamless, 1px monochromatic dark-green PCB SVG pattern is hidden inside the charcoal cards (`opacity-0`).
    *   **Interaction:** Tracking the user's cursor (`onMouseMove`), a CSS `radial-gradient` acts as a flashlight, smoothly illuminating the circuit traces exactly where the mouse hovers (`group-hover:opacity-100`).
*   **New Data Arrival:** Incoming requests sliding into the admin queue receive a brief green left-border flash before settling into the table.
*   **Number Ticking:** Inventory changes trigger a rapid monospace count-up/count-down animation rather than an instant snap.
*   **Snappy Toasts:** The gamified "spark burst" on cart submission is replaced by a sleek, floating charcoal toast notification sliding up from the bottom: "✓ Request Transmitted"[cite: 1].