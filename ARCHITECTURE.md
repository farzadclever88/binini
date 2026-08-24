# Binini Architecture

## Overview

Binini is a Persian (Jalali) production, BOM, inventory, and management system.

The project consists of:

- A frontend application hosted from the repository.
- A Cloudflare Worker backend.
- Cloudflare D1 as the database layer.

---

## Repository Structure

```text
binini/
│
├── index.html
├── css/
├── js/
│
├── workers.js
├── ARCHITECTURE.md
│
├── test.html
├── indextest.html
└── datetest.html
```

---

# 1. Frontend

The frontend is currently centered around:

```text
index.html
```

The current `index.html` contains a large amount of:

- HTML
- CSS
- JavaScript
- UI logic
- Form logic
- API communication
- Date handling
- Event handlers

The long-term goal is to modularize this file without changing application behavior.

The target architecture is approximately:

```text
index.html
    │
    ├── CSS modules
    │
    └── JavaScript modules
            │
            ├── app.js
            ├── api.js
            ├── state.js
            ├── ui.js
            ├── navigation.js
            ├── dates.js
            ├── forms.js
            ├── dashboard.js
            ├── inventory.js
            ├── production.js
            └── utils.js
```

The exact module boundaries should be determined during the refactoring process rather than by blindly splitting the existing file.

---

# 2. Backend

The production backend is a **Cloudflare Worker**.

The real Worker is managed and deployed through Cloudflare.

The frontend communicates with the production Worker through HTTP API requests.

Conceptually:

```text
Browser
   │
   │ HTTP API
   ▼
Cloudflare Worker
   │
   ▼
Cloudflare D1
```

---

# 3. Important: workers.js

The file:

```text
workers.js
```

in this repository is **NOT the production Worker runtime**.

It is a reference/snapshot of the Worker code used for documentation, development, and understanding the backend API.

It was copied from the Cloudflare Worker environment so that developers working on the frontend can understand:

- Available API endpoints
- Request formats
- Response formats
- Authentication logic
- Database operations
- D1 queries
- Backend behavior
- Frontend ↔ Worker contracts

### Runtime status

```text
Repository workers.js
        │
        └── Reference only
```

It is **not** the Worker that handles production requests.

The production Worker exists in Cloudflare.

### Important rule

Changing `workers.js` inside this repository does **NOT** change the production Cloudflare Worker.

Likewise, changes made directly to the production Cloudflare Worker may not be reflected in this repository copy.

Therefore `workers.js` should be treated as a **snapshot/reference**, not as the authoritative production backend source.

---

# 4. Backend Source of Truth

For production behavior, the source of truth is:

```text
Cloudflare Worker
```

not:

```text
workers.js
```

in this repository.

If there is ever a discrepancy between the repository copy and the actual Cloudflare Worker, the production Cloudflare Worker must be considered authoritative until the repository snapshot is updated.

---

# 5. Database

The backend uses:

```text
Cloudflare D1
```

The Worker is responsible for communicating with the database.

The frontend should not directly access the D1 database.

The intended architecture is:

```text
Frontend
   │
   │ API
   ▼
Cloudflare Worker
   │
   │ D1 queries
   ▼
Cloudflare D1
```

---

# 6. Frontend / Backend Contract

Frontend code should communicate with the backend through the Worker API.

Frontend modules should not contain assumptions about direct database access.

A future modular structure should centralize API communication in:

```text
js/api.js
```

This makes it easier to:

- Change API endpoints
- Handle authentication
- Handle errors
- Standardize requests
- Debug network problems
- Test frontend logic independently

---

# 7. Authentication

Authentication is handled through the backend Worker.

Frontend authentication/session code should remain separate from generic UI code.

During refactoring, authentication behavior must not be changed unless explicitly requested.

The refactor goal is:

```text
same authentication behavior
+
better code organization
```

not:

```text
new authentication implementation
```

---

# 8. Jalali Date Handling

The application uses Persian/Jalali dates.

Datepicker behavior must be treated as a separate concern.

The target architecture is:

```text
js/dates.js
```

All date-related initialization and helper functions should eventually be centralized there.

The application must not require the developer/user to manually execute:

```js
jQuery(".jalali-date").datepicker();
```

from the browser console after page load.

Datepicker initialization must happen automatically as part of the application's lifecycle.

---

# 9. Dynamic Forms

Some application UI/form elements may be created or rendered dynamically.

Therefore datepicker initialization must account for dynamically-created elements.

Incorrect pattern:

```js
$(document).ready(function () {
    $(".jalali-date").datepicker();
});
```

This only initializes elements that exist at that moment.

If `.jalali-date` elements are created later, they may not be initialized.

The preferred architecture is an explicit initialization function:

```js
initializeDatePickers();
```

which can be called:

1. During application initialization.
2. After dynamically rendering a form.
3. When a relevant UI component is mounted.

The function should be safe to call multiple times.

---

# 10. Datepicker Dependency

The repository currently contains datepicker-related assets.

There are also test/reference files using a Persian datepicker implementation.

These implementations must not be mixed accidentally.

Before changing the datepicker implementation, the existing production `index.html` dependency chain must be verified.

The refactoring goal is to establish **one clear datepicker implementation and one initialization lifecycle**.

Do not introduce a second datepicker library merely to fix an initialization bug.

---

# 11. Refactoring Rules

The refactor must follow these rules:

### Rule 1 — Preserve behavior

The first goal is code organization.

Existing functionality should remain unchanged.

### Rule 2 — No blind splitting

Do not simply split `index.html` into arbitrary files.

Each module must have a clear responsibility.

### Rule 3 — Preserve dependency order

Libraries must load before modules that depend on them.

For example:

```text
jQuery
   ↓
Datepicker library
   ↓
Application modules
   ↓
Application initialization
```

### Rule 4 — Avoid duplicated initialization

A component should not be initialized repeatedly without checking its current state.

This is particularly important for datepickers, event handlers, and dynamic UI components.

### Rule 5 — Centralize API access

API requests should gradually move toward:

```text
js/api.js
```

rather than being scattered throughout unrelated UI modules.

### Rule 6 — Keep backend reference separate

`workers.js` is documentation/reference material.

Frontend refactoring must not modify it unless explicitly requested.

### Rule 7 — Do not change production Cloudflare configuration

Frontend refactoring must not assume that repository changes automatically deploy to the Cloudflare Worker.

Cloudflare deployment is a separate concern.

---

# 12. Testing During Refactoring

Refactoring must be incremental.

After each major change, verify:

- Page loads successfully.
- No JavaScript errors occur.
- Login works.
- Session handling works.
- Navigation works.
- Forms open correctly.
- Dynamic forms render correctly.
- API requests succeed.
- API errors are handled.
- Jalali date inputs work automatically.
- Datepicker does not require manual console initialization.
- Existing production functionality remains intact.

---

# 13. Recommended Refactoring Order

The recommended order is:

```text
1. Analyze index.html
        ↓
2. Identify dependencies
        ↓
3. Extract CSS
        ↓
4. Extract shared utilities
        ↓
5. Extract API layer
        ↓
6. Extract UI helpers
        ↓
7. Extract navigation
        ↓
8. Extract date handling
        ↓
9. Extract forms
        ↓
10. Extract feature modules
        ↓
11. Reduce index.html to application shell
        ↓
12. Test entire application
```

Do not perform all steps in one uncontrolled change.

---

# 14. Git Workflow

Large refactors should not be performed directly on `main`.

Preferred workflow:

```text
main
 │
 └── refactor/index-modularization
          │
          ├── modularization changes
          ├── datepicker fix
          ├── architecture documentation
          └── tests
```

After validation:

```text
Pull Request
      ↓
Review
      ↓
Merge
```

---

# 15. Definition of Done

The refactor is considered complete when:

- `index.html` is significantly smaller.
- CSS is modularized.
- JavaScript responsibilities are separated.
- API communication has a clear location.
- Datepicker initialization is automatic.
- Dynamic Jalali date inputs work.
- No manual browser-console initialization is required.
- Existing functionality continues to work.
- `workers.js` remains clearly documented as a reference snapshot.
- Production Cloudflare Worker behavior has not been unintentionally changed.
- The changes can be reviewed through a Pull Request.

---

# 16. Important Architecture Principle

The most important principle of this project is:

> **Separate responsibilities without changing behavior.**

The first refactoring phase is not intended to redesign the application.

It is intended to make the existing system easier to understand, test, debug, and maintain.

Behavioral changes should be made separately and explicitly.
