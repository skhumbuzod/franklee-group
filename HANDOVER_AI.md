# Franklee Group — Developer / AI Handover Document

This document is designed to bring any new developer or AI assistant up to speed on the Franklee Group digital build. It covers the current state of the codebase, architectural decisions, and the roadmap for transitioning the prototype into a production-ready application.

---

## 1. Project Overview

The repository contains two primary frontend deliverables built for Franklee Group, a South African logistics company:

1.  **Corporate Website**: A premium, visually commanding landing page detailing their four divisions.
2.  **Franklee Loop Prototype**: An interactive frontend simulation of their backhaul exchange marketplace, featuring role-based flows (Driver, Shipper, Admin) and complex negotiation mechanics.

### Tech Stack
*   **Frontend**: Pure Vanilla HTML, CSS, and JavaScript. No external libraries, frameworks, or build tools (no React, Vue, Tailwind, etc.).
*   **Styling**: Custom CSS with CSS variables, heavily relying on Flexbox/Grid. Includes custom animations (keyframes) and glassmorphism UI effects.
*   **Typography**: Google Fonts (`Bebas Neue`, `Inter`, `IBM Plex Mono`, `Outfit`).
*   **Deployment**: Static hosting via GitHub Pages.

---

## 2. File Structure

```text
franklee-group/
├── index.html          # Main corporate website (single file)
├── loop/
│   └── index.html      # Franklee Loop web app prototype (single file)
├── assets/
│   └── hero-bg.jpg     # Main hero background image
├── server/             # (Backend reference code - Node.js/Prisma)
│   ├── integrations.js # Payment, KYC, Insurance adapters
│   ├── matchFlow.js    # Core transactional logic
│   ├── matching.js     # Matching algorithm and economics
│   └── routes.js       # Express routes
├── README.md           # General project info
└── HANDOVER_AI.md      # This document
```

---

## 3. The Franklee Loop Prototype (`loop/index.html`)

The Loop app is currently a **high-fidelity frontend simulation**. It simulates backend delays, notifications, and state changes entirely in the browser using JavaScript `setTimeout` and DOM manipulation.

### Core Mechanics & State Machine
The app manages state using a simple global object:
```javascript
const state = {
  role: null,             // 'driver' | 'shipper' | 'admin'
  currentScreen: 's0',    // Tracks active DOM screen ID
  screenHistory: [],      // Stack for the "Back" button functionality
  haulData: {},           // Stores current haul request form data
  bookingStep: 0,         // Tracks progress in the 5-step booking tracker
  selectedDrivers: {},    // Admin's driver assignment state
  ratings: { driver: 0, platform: 0 } 
};
```

### Key Simulated Flows to Understand:
*   **Negotiation (Shipper ↔ Admin)**: The shipper submits a budget. A `setTimeout` simulates the Admin reviewing and returning a counter-offer. If the shipper counters back, the system simulates an auto-accept from the Admin.
*   **Collection PIN Validation**: Located in the booking flow (`verifyAndPickup()`). In production, the Driver enters a 4-digit PIN provided by the Shipper to release the escrow. The prototype accepts *any* 4 digits to allow the demo to proceed.
*   **Live Map / ETA**: The "In Transit" screen uses a `setInterval` to mock a live countdown of distance and ETA to demonstrate what the live tracking UI looks like.

---

## 4. Backend Reference Logic (`server/`)

We have mapped out the production Node.js/Prisma backend logic in the `server/` directory. **This code is not currently executing**, but serves as the exact blueprint for the backend build.

It defines:
1.  **KYC / Identity (`integrations.js`)**: How drivers are verified and how the 4-digit Collection PINs are securely generated.
2.  **Payments / Escrow (`integrations.js`)**: Holding freight value from the Shipper via a payment gateway, taking a 10% commission, and settling the remainder to the Carrier upon delivery.
3.  **The Matching Engine (`matching.js`)**: Deterministic logic to match open loads to open empty legs based on Date, Vehicle Type, Weight, and Route.
4.  **Transaction Safety (`matchFlow.js`)**: Prisma `$transaction` blocks ensuring that a match locks the load, verifies identity, and holds payment simultaneously.

---

## 5. Roadmap: Converting Prototype to Production

If you are the AI or Developer taking over, here is how you move this from a frontend simulation to a full stack app:

### Phase 1: Framework Migration (Optional but Recommended)
The prototype is a 1,500+ line vanilla HTML/JS file. For production, split this into a component-based framework (React/Next.js or Vue/Nuxt) to manage complex state securely.

### Phase 2: Database & Auth
1.  Implement Auth (e.g., Firebase, Supabase, or custom JWT).
2.  Deploy the Prisma schema based on the logic in `server/matching.js` (Models needed: `User`, `Leg`, `Load`, `Match`, `Payment`, `ComplianceDoc`).

### Phase 3: Connect the Frontend
Remove the `setTimeout` simulations in `loop/index.html` and replace them with actual `fetch()` calls to the Express endpoints defined in `server/routes.js`.

### Phase 4: Third-Party Integrations
*   **Mapping**: Replace the CSS/SVG mocked route map with Google Maps API or Mapbox for live driver GPS tracking.
*   **Payments**: Connect a South African gateway (e.g., Peach Payments, Paystack, or Ozow) to handle the Escrow hold and split commission payout logic defined in `integrations.js`.
*   **SMS/WhatsApp**: Connect Twilio or similar to send the Collection PINs and notifications to Drivers/Shippers instead of the simulated in-app slide-down notifications.
