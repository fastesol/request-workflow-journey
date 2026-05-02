# API Workflow Builder

A visual tool for building and executing chained API request workflows. Think Postman, but with a node-based canvas where you can wire together multiple requests, pass data between them, iterate over arrays, and run the whole sequence with a single click.

![Node canvas with connected API nodes]

---

## Features

- **Visual workflow canvas** — drag, connect, and arrange API request nodes
- **Multiple workflows** — tabbed interface, each workflow is fully isolated
- **Sequential execution** — nodes run in dependency order; results from one node feed into the next
- **Data mapping** — map response fields from any node into the request of any downstream node (URL, headers, body, query params)
- **Array handling** — pick a single index, a random item, the whole array, iterate over every item, or collect all values into a query param
- **Transform nodes** — write arbitrary JavaScript (lodash included) to reshape data between requests
- **User input nodes** — pause the workflow mid-run to collect OTP codes or any manual input
- **Condition-based execution** — skip a node entirely if a JS expression evaluates to false
- **Per-node run** — execute any single node independently without running the whole workflow
- **Auth support** — Bearer token, API key, or OAuth 2 client-credentials wired globally
- **Export / import** — save any workflow as JSON and reload it later

---

## Tech stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | React 18, Vite, ReactFlow, Axios        |
| Backend  | Node.js, Express, Axios, Lodash, vm     |

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
# from the repo root
npm run install:all
```

### Run

```bash
# start both frontend and backend
npm run backend      # Express API on http://localhost:3001
npm run frontend     # Vite dev server on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Application overview

### Workflows (tabs)

Each tab at the top of the screen is an independent workflow with its own nodes, edges, mappings, and results.

| Action | How |
|--------|-----|
| New workflow | click **+** at the right of the tab bar |
| Rename | click **⋯** on the tab → Rename |
| Duplicate | **⋯** → Duplicate |
| Export to JSON | **⋯** → Export |
| Import from JSON | click **⬆** (upload icon) next to **+** |
| Delete | **⋯** → Delete |

---

### Node types

#### Start node (green)
Every workflow must have exactly one Start node. Clicking **▶** on it runs the entire workflow in order. Connect it to the first request node in your flow.

#### API node (default)
Represents a single HTTP request. Configure the method, URL, headers, and body in the right panel. The URL is relative to the Base URL set in Global Config.

#### Transform node (purple)
Runs a JavaScript function between requests. You have access to `results` (all previous node responses) and `_` (lodash). Use `return` to produce the output that downstream nodes can map from.

```js
// example transform: flatten seat data
const areas = results['node_1'].data.seatLayoutData.areas;
return {
  seats: areas
    .flatMap(a => a.rows.flatMap(r => r.seats))
    .filter(s => !s.isDisabled)
    .slice(0, 2)
};
```

#### User input node (cyan)
Pauses the workflow and shows a dialog asking the user to type a value (e.g. an OTP). The entered value is available in downstream nodes as `data.value` or `data.[fieldName]`.

---

### Adding nodes

Right-click anywhere on the canvas to open the context menu and choose a node type, or use the toolbar buttons at the top-left of the canvas.

---

### Global config

Click **Global Config** (top toolbar) to set:

- **Base URL** — prepended to all relative node URLs (e.g. `https://api.example.com`)
- **Global headers** — headers merged into every request (e.g. `Content-Type`, `Accept`)
- **Authentication** — Bearer token, API key header, or OAuth 2 client credentials

---

### Running a workflow

1. Ensure your workflow has a **Start node** connected to the first request node.
2. Click **▶** on the Start node (or the **Run** button in the toolbar).
3. Watch node borders change colour as execution progresses:
   - **Amber** — currently running
   - **Green** — completed successfully
   - **Red** — error
   - **Cyan** — waiting for user input
   - **Dashed grey** — skipped (condition was false)
4. Click any node after execution to inspect its response in the right panel.

---

## Mapping

Mappings wire a value from one node's response directly into a downstream node's request — automatically, on every execution. No copy-pasting between requests.

### How it works

```
Node A (GET /users/me) → response → Node B (POST /orders)
                                          ↑
                          mapping: data.user.id → body.userId
```

Before Node B executes, the engine reads `data.user.id` out of Node A's response and writes it into Node B's request body. Node B never needs to know where the value came from.

### Opening the mapping editor

1. Click the **destination** node (the one that *receives* data).
2. In the right panel, open the **Mappings** tab.
3. Run the workflow at least once first — the live response tree then lets you click fields to auto-fill the source path.

---

### Mapping technique 1 — Single value into a body field

**Use case:** A login endpoint returns a `userId`. You need to send it in the body of a create-order request.

**Node A response** (`POST /auth/login`):
```json
{
  "data": {
    "user": {
      "id": "usr_8f3a",
      "name": "Alice"
    },
    "sessionToken": "eyJhbGci..."
  }
}
```

**Mapping setup** (on Node B):

| Field | Value |
|-------|-------|
| From Node | Node A — Login |
| Source Path | `data.user.id` |
| Inject Into | `body.userId` |

**Node B request body** before execution:
```json
{ "items": ["item_1"], "userId": "usr_8f3a" }
```

> **Tip:** After running Node A once, click the `id` value in the response tree and the Source Path fills automatically.

---

### Mapping technique 2 — Single value into a URL path parameter

**Use case:** Fetch a list of categories, then for each selected category fetch its products at `/categories/{id}/products`.

**Node A response** (`GET /categories`):
```json
{
  "data": {
    "categories": [
      { "id": "cat_01", "name": "Electronics" },
      { "id": "cat_02", "name": "Clothing" }
    ]
  }
}
```

**Node B URL:**
```
/categories/{{categoryId}}/products
```

**Mapping setup** (on Node B):

| Field | Value |
|-------|-------|
| From Node | Node A — Get Categories |
| Source Path | `data.categories[0].id` |
| Inject Into | `urlParam.categoryId` |

The placeholder `{{categoryId}}` in the URL is replaced with `cat_01` at runtime.

---

### Mapping technique 3 — Single value into a query parameter

**Use case:** A search node returns a city name. The next node fetches weather using that city as a query param.

**Node A response** (`GET /user/location`):
```json
{
  "data": {
    "city": "London",
    "country": "GB"
  }
}
```

**Node B URL** (before mapping):
```
/weather
```

**Mapping setup** (on Node B):

| Field | Value |
|-------|-------|
| From Node | Node A — Get Location |
| Source Path | `data.city` |
| Inject Into | `queryParam.city` |

**Resulting URL at runtime:**
```
/weather?city=London
```

---

### Mapping technique 4 — Single value into a request header

**Use case:** An auth node returns a token. Every subsequent request needs `Authorization: Bearer <token>`.

> **Recommended approach:** Use **Global Config → Auth → Bearer token** to apply a token to all nodes automatically. Use header mapping only when a *per-node* token changes between requests.

**Node A response** (`POST /auth/token`):
```json
{
  "data": {
    "access_token": "eyJhbGci...",
    "expires_in": 3600
  }
}
```

**Mapping setup** (on Node B):

| Field | Value |
|-------|-------|
| From Node | Node A — Get Token |
| Source Path | `data.access_token` |
| Inject Into | `headers.Authorization` |

**Node B will send:**
```
Authorization: eyJhbGci...
```

To send a proper Bearer prefix, use a Transform node in between to produce `"Bearer " + token`, then map from that.

---

### Mapping technique 5 — Whole array (as-is)

**Use case:** One endpoint returns a list of seat objects. The booking endpoint expects that exact array in its body.

**Node A response** (`GET /cart`):
```json
{
  "data": {
    "seats": [
      { "row": "A", "number": 1, "ticketTypeCode": "ADULT" },
      { "row": "A", "number": 2, "ticketTypeCode": "ADULT" }
    ]
  }
}
```

**Mapping setup** (on Node B):

1. Set **Source Path** to `data.seats` — the array is detected automatically.
2. Select **Whole array** from the mode buttons.
3. Set **Inject Into** to `body.seats`.

**Node B request body** at runtime:
```json
{
  "seats": [
    { "row": "A", "number": 1, "ticketTypeCode": "ADULT" },
    { "row": "A", "number": 2, "ticketTypeCode": "ADULT" }
  ]
}
```

---

### Mapping technique 6 — Random item from an array

**Use case:** A test workflow fetches a list of available products and books one at random to spread load across test runs.

**Node A response** (`GET /products`):
```json
{
  "data": {
    "products": [
      { "id": "prod_11", "name": "Widget A", "price": 9.99 },
      { "id": "prod_22", "name": "Widget B", "price": 14.99 },
      { "id": "prod_33", "name": "Widget C", "price": 4.99 }
    ]
  }
}
```

**Mapping setup** (on Node B):

1. Set **Source Path** to `data.products`.
2. Select **Random item** from the mode buttons.
3. **Which field to pick:** `id` (selected from the dropdown).
4. **Inject Into:** `body.productId`.

**Node B request body** — each run uses a different product:
```json
{ "productId": "prod_22" }   ← changes randomly each run
```

> To inject the whole random item object instead of a single field, leave "Which field to pick" blank and set Inject Into to `body.product`.

---

### Mapping technique 7 — Auto-iterate (loop over every array item)

**Use case:** Fetch all cities, then call a weather endpoint for each city one by one. Stop as soon as one returns a forecast.

**Node A response** (`GET /cities`):
```json
{
  "data": {
    "cities": [
      { "id": "city_01", "name": "Oslo" },
      { "id": "city_02", "name": "Bergen" },
      { "id": "city_03", "name": "Stavanger" }
    ]
  }
}
```

**Node B URL:**
```
/weather/{{item}}
```

**Mapping setup** (on Node B → Auto-iterate):

| Step | Setting | Value |
|------|---------|-------|
| 1 | Source Path | `data.cities` |
| 2 | Mode | Auto-iterate |
| 3 | Which key per item | `id` |
| 4 | Inject into field | *(leave blank — using `{{item}}` in URL)* |
| 5 | Stop when response has data at path | `data.forecast` |
| 6 | Condition | is not empty |

**What happens at runtime:**

```
→ GET /weather/city_01   → no forecast → continue
→ GET /weather/city_02   → forecast found → stop
```

Node B's result is an array of per-item responses:
```json
[
  { "index": 0, "item": "city_01", "response": { "data": {} } },
  { "index": 1, "item": "city_02", "response": { "data": { "forecast": [...] } }, "stopped": true }
]
```

**Injecting the iterated value into the body instead of the URL:**

Set **Inject into request field** to `body.cityId` (and remove `{{item}}` from the URL). Each iteration sends:
```json
{ "cityId": "city_01" }
{ "cityId": "city_02" }
...
```

---

### Mapping technique 8 — Collect all (build a multi-value query param)

**Use case:** Fetch a list of selected cinema IDs, then call a single showtimes endpoint that accepts all of them at once via `?cinemaId[]=`.

**Node A response** (`GET /user/favourites`):
```json
{
  "data": {
    "cinemas": [
      { "id": "cin_101", "name": "Odeon West" },
      { "id": "cin_205", "name": "Vue City" },
      { "id": "cin_309", "name": "Cineworld Park" }
    ]
  }
}
```

**Mapping setup** (on Node B → Collect all):

| Setting | Value |
|---------|-------|
| Source Path | `data.cinemas` |
| Mode | Collect all |
| Which field to collect | `id` |
| Query param name | `cinemaId` |

**Node B URL at runtime:**
```
/showtimes?cinemaId[]=cin_101&cinemaId[]=cin_205&cinemaId[]=cin_309
```

All three IDs are sent in one request — no iteration needed.

---

### Mapping technique 9 — Mapping from a Transform node

**Use case:** Two upstream nodes return seat data in different formats. A Transform node merges and normalises them. The booking node maps from the transform output.

**Transform node script:**
```js
const layout  = results['node_layout'].data.seatLayoutData.areas;
const pricing = results['node_pricing'].data.ticketTypes;

const seats = layout
  .flatMap(area => area.rows.flatMap(row => row.seats))
  .filter(s => !s.isDisabled && s.seatStyle !== 'EMPTY')
  .sort(() => Math.random() - 0.5)
  .slice(0, 2)
  .map(seat => ({
    position:       seat.position,
    seatStyle:      seat.seatStyle,
    ticketTypeCode: pricing[0].code,
    seatsInGroup:   []
  }));

return { seats };
```

**Transform node result** (available as `data`):
```json
{
  "data": {
    "seats": [
      { "position": { "row": "B", "column": 4 }, "ticketTypeCode": "ADULT", ... },
      { "position": { "row": "B", "column": 5 }, "ticketTypeCode": "ADULT", ... }
    ]
  }
}
```

**Mapping setup** (on Node Booking):

| Field | Value |
|-------|-------|
| From Node | Transform — Seat Picker |
| Source Path | `data.seats` |
| Mode | Whole array |
| Inject Into | `body.seats` |

---

### Mapping technique 10 — Mapping from a User Input node

**Use case:** An SMS OTP is sent during login. The workflow pauses, the user types the code, and it is injected into the verification request.

**User Input node config:**

| Setting | Value |
|---------|-------|
| Prompt | `Enter the OTP sent to your mobile` |
| Field name | `otp` |

**User Input node result** (after the user submits):
```json
{
  "data": {
    "value": "847291",
    "otp":   "847291"
  }
}
```

**Mapping setup** (on Node Verify OTP):

| Field | Value |
|-------|-------|
| From Node | User Input — OTP |
| Source Path | `data.otp` |
| Inject Into | `body.otp` |

**Node Verify OTP request body** at runtime:
```json
{ "otp": "847291" }
```

---

### Dynamic variable placeholders

Use these anywhere in a URL, header, or body — no mapping needed.

| Placeholder | Resolves to | Example |
|-------------|-------------|---------|
| `{{$datetime}}` | ISO 8601 with time | `2026-05-02T14:30:00.000Z` |
| `{{$timestamp}}` | Unix epoch (ms) | `1746192600000` |
| `{{$isoDate}}` | Date only | `2026-05-02` |
| `{{$time}}` | Time only | `14:30:00` |

**Example** — expire a token one hour from now in the request body:
```json
{
  "issuedAt": "{{$datetime}}",
  "ref": "order-{{$timestamp}}"
}
```

---

### All inject target formats — quick reference

| Inject Into format | What it does | Example value |
|--------------------|--------------|---------------|
| `body.field` | Sets a top-level body key | `body.userId` |
| `body.nested.key` | Sets a deeply nested body key | `body.address.city` |
| `headers.Name` | Sets a request header | `headers.X-Session-Id` |
| `queryParam.name` | Appends `?name=value` to the URL | `queryParam.page` |
| `urlParam.name` | Replaces `{{name}}` in the URL path | `urlParam.orderId` |

---

### Viewing and editing mappings

All active mappings for a node are listed at the bottom of the Mappings tab.

- Click **✎** to edit a mapping.
- Click **✕** to delete it.

Mapping type badges in the list:

| Badge | Type |
|-------|------|
| *(none)* | Single-value mapping |
| **random** (purple) | Random item from array |
| **collect** (orange) | Collect-all query param |
| ⟳ active | Auto-iterate (shown as a separate badge above the form) |

---

## Run conditions

Every node (except Start) can have an optional JavaScript condition. If the condition evaluates to false, the node is skipped and downstream nodes that depend on it still run (receiving `{ skipped: true }` as the result).

Open the **Run Condition** strip at the bottom of any node's config panel.

```js
// only run if the previous node returned results
results['node_2'].data?.items?.length > 0
```

Available variable: `results` — same structure as in transform scripts.

---

## Canvas shortcuts

| Action | Shortcut |
|--------|----------|
| Select all nodes | Ctrl + A |
| Copy selected | Ctrl + C |
| Cut selected | Ctrl + X |
| Paste | Ctrl + V |
| Select all (button) | **⊞** button top-left of canvas |

---

## Export / import workflow format

Exported workflows are plain JSON files containing the node list, edge connections, mappings, and global config. You can version-control them, share them with teammates, or import them into any instance of this app.

```json
{
  "name": "My Workflow",
  "nodes": [...],
  "edges": [...],
  "mappings": [...],
  "globalConfig": { "baseUrl": "https://api.example.com", "headers": {} }
}
```

---

## Project structure

```
postman-app/
├── frontend/
│   └── src/
│       ├── App.jsx                  # workflow state, execution loop, tab bar
│       └── components/
│           ├── FlowBuilder.jsx      # ReactFlow canvas, node rendering
│           ├── NodeConfigPanel.jsx  # right panel: request, mappings, condition
│           └── MappingHandler.js    # mapping factory functions and path utilities
├── backend/
│   ├── server.js                    # Express routes
│   ├── executionEngine.js           # topological sort, node dispatch
│   ├── variableResolver.js          # mapping resolution, auth injection
│   └── authHandler.js               # token fetch and cache
└── package.json                     # root scripts
```

---

## License

MIT
