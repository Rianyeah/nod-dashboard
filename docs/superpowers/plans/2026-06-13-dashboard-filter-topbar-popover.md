# Dashboard Filter Top Bar Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard global filters horizontally compact, move Transport Quality and Ticketing filters into their headers with advanced Popovers, and fully display the Impact Service category donut.

**Architecture:** Extend the existing shared filter system with a controlled draft Popover while retaining the existing Sheet for surfaces that still use it. Make the shared filter row wrap only below the desktop breakpoint, then compose page-specific header actions around the shared toolbar without changing request state or API parameters.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui Radix Popover, Recharts, Node test runner, Playwright.

---

### Task 1: Add Regression Contracts

**Files:**
- Modify: `frontend/src/__tests__/dashboardFilterContracts.test.js`
- Modify: `frontend/src/__tests__/transportQualityContracts.test.js`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`
- Modify: `frontend/src/__tests__/impactServiceShadcnContracts.test.js`

- [ ] Add assertions for desktop `lg:flex-nowrap`, mobile wrapping, `DashboardFilterPopover`, header placement, absence of page-level advanced Sheets, and the enlarged donut layout.
- [ ] Run the four targeted test files and confirm the new assertions fail for the missing implementation.

### Task 2: Implement Shared Horizontal Toolbar and Popover

**Files:**
- Modify: `frontend/src/components/dashboard-filters/DashboardFilters.jsx`

- [ ] Change the filter control row and action row to wrap by default and use `lg:flex-nowrap`.
- [ ] Add `DashboardFilterPopover` using the installed shadcn Popover primitives.
- [ ] Preserve draft reset on open, atomic apply, cancel/outside/Escape discard, active-count badge, and compact scrollable content.
- [ ] Run `dashboardFilterContracts.test.js` and confirm it passes.

### Task 3: Move Transport and Ticketing Filters

**Files:**
- Modify: `frontend/src/pages/TransportQualityPage.jsx`
- Modify: `frontend/src/pages/TicketingPage.jsx`

- [ ] Replace `DashboardFilterSheet` imports and usage with `DashboardFilterPopover`.
- [ ] Move each `DashboardFilterBar` from main content into its page header.
- [ ] Keep last-update, Refresh, Export CSV, reset, chips, IDs, and current state handlers intact.
- [ ] Run the Transport Quality and Ticketing contract tests.

### Task 4: Fix Impact Service Donut and Header Alignment

**Files:**
- Modify: `frontend/src/features/impact-service/ImpactServiceHeader.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceFilters.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceCharts.jsx`

- [ ] Keep header controls on one desktop row while allowing mobile wrap.
- [ ] Increase the donut canvas to 214px, use safe radii, and widen/pad the legend column.
- [ ] Run the Impact Service shadcn contract test.

### Task 5: Verify Rendered Behavior

**Files:**
- Verify: `frontend/src/**/*.jsx`
- Update: `graphify-out/`

- [ ] Run all frontend Node contract tests.
- [ ] Run targeted ESLint for modified frontend files.
- [ ] Run the production build.
- [ ] Use Playwright against `http://127.0.0.1:5173` for desktop and mobile checks, including Popover apply/cancel/Escape and horizontal overflow.
- [ ] Run `graphify update .`.
- [ ] Run `git diff --check` and inspect the final diff without reverting unrelated user changes.
