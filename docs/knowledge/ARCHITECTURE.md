---
type: knowledge
created: 2026-01-16
tags: [coocr-htr, architecture, javascript]
status: complete
---

# Technical Architecture

System design for coOCR/HTR. Client-only, no backend.

**Dependency:** [METHODOLOGY](METHODOLOGY.md) (Rationale for technology decisions)

## System Overview

```
+-------------------------------------------------------------+
|                         BROWSER                             |
+-------------------------------------------------------------+
|  UI LAYER                                                   |
|  +----------+ +----------+ +----------+ +----------+        |
|  | Header   | | Document | | Editor   | |Validation|        |
|  |          | | Viewer   | |          | | Panel    |        |
|  +----------+ +----------+ +----------+ +----------+        |
+-------------------------------------------------------------+
|  APPLICATION LAYER                                          |
|  +----------+ +----------+ +----------+ +----------+        |
|  |   App    | | Document | |Validation| |  Export  |        |
|  |Controller| | Manager  | |  Engine  | |  Service |        |
|  +----------+ +----------+ +----------+ +----------+        |
+-------------------------------------------------------------+
|  SERVICE LAYER                                              |
|  +----------+ +----------+ +----------+ +----------+        |
|  |  LLM API | | Storage  | |  Image   | |  Event   |        |
|  |          | |          | | Processor| |   Bus    |        |
|  +----------+ +----------+ +----------+ +----------+        |
+-------------------------------------------------------------+
|  PERSISTENCE                                                |
|  +----------------+ +----------------------------+          |
|  |  LocalStorage  | |       IndexedDB            |          |
|  |  (Settings,    | |  (Projects, Sessions,      |          |
|  |   Prompts)     | |   Images, optional keys)   |          |
|  +----------------+ +----------------------------+          |
+-------------------------------------------------------------+
                              |
                              v HTTPS
+-------------------------------------------------------------+
|  EXTERNAL APIs                                              |
|  +----------+ +----------+ +----------+ +----------+        |
|  |  Gemini  | |  OpenAI  | | Anthropic| |  Ollama  |        |
|  +----------+ +----------+ +----------+ +----------+        |
+-------------------------------------------------------------+
```

## File Structure

### Current Implementation

```
docs/
├── index.html              # Entry Point (CSP meta tag)
├── favicon.png
├── sw.js                   # Service Worker (offline caching)
├── manifest.json           # PWA manifest
├── css/
│   ├── variables.css       # Design System Tokens (60+ vars)
│   ├── styles.css          # Entry point with @imports
│   ├── base.css            # Reset, typography
│   ├── layout.css          # Grid, panels, header
│   ├── components.css      # Buttons, inputs
│   ├── dialogs.css         # Dialog system
│   ├── editor.css          # Transcription editor
│   ├── viewer.css          # OpenSeadragon viewer styles
│   ├── validation.css      # Validation panel
│   └── pages.css           # Static pages (help, about)
├── js/
│   ├── main.js             # Initialization, Workflow
│   ├── state.js            # Central State with EventTarget
│   ├── viewer.js           # OpenSeadragon Viewer
│   ├── editor.js           # Flexible Editor (lines/grid)
│   ├── ui.js               # UI Interactions
│   ├── pwa.js              # PWA lifecycle management
│   ├── pwa-init.js         # PWA bootstrap (extracted from inline)
│   ├── components/
│   │   ├── dialogs.js      # Dialog Manager
│   │   ├── upload.js       # Upload Component
│   │   ├── transcription.js# Transcription UI
│   │   ├── validation.js   # Validation Panel
│   │   ├── context.js      # Document Context Manager
│   │   ├── description.js  # Visual Description Panel
│   │   ├── thinking.js     # LLM Thinking/Reasoning Display
│   │   ├── thinkingAnalysis.js # Thinking Analysis Wizard
│   │   ├── promptLibrary.js# Persistent Prompt Library
│   │   └── batch-progress.js # Batch Progress Panel
│   ├── services/
│   │   ├── llm.js          # Multi-Provider LLM Service
│   │   ├── storage.js      # localStorage + IndexedDB storage service
│   │   ├── validation.js   # Validation Engine
│   │   ├── export.js       # Export Service (PAGE-XML, TEI, ZIP)
│   │   ├── project-io.js   # Project Import/Export (.coocr)
│   │   ├── postprocess.js  # HTR Post-Processing Pipeline
│   │   ├── samples.js      # Demo Loader
│   │   └── parsers/
│   │       ├── page-xml.js # PAGE-XML Parser
│   │       └── mets-xml.js # METS-XML Parser
│   └── utils/
│       ├── constants.js    # Feature flags, timeouts, keys
│       ├── dom.js          # DOM helper utilities
│       ├── textFormatting.js # XSS-safe escaping
│       ├── panelResize.js  # Horizontal 3-column resize
│       ├── validationResize.js # Vertical validation resize
│       └── tooltips.js     # Info tooltip rendering
├── vendor/                 # Vendored dependencies (no CDN)
│   ├── openseadragon/
│   │   ├── openseadragon.min.js    # OpenSeadragon 4.1
│   │   ├── openseadragon-svg-overlay.js
│   │   └── images/         # 36 OSD button images
│   ├── jszip.min.js        # JSZip (ZIP export/import)
│   ├── marked.min.js       # Marked (Markdown rendering)
│   └── fonts/
│       ├── fonts.css        # @font-face declarations
│       └── *.woff2          # Inter + JetBrains Mono
├── samples/
│   ├── index.json          # Sample Manifest
│   └── raitbuch/           # Demo Data
└── tests/
    ├── llm.test.js
    ├── page-xml.test.js
    ├── export.test.js
    ├── validation.test.js
    ├── project-io.test.js
    ├── state.test.js
    └── e2e/                # Playwright E2E tests
```

## Core Modules

### AppState

Central state management using native EventTarget API. Replaces custom EventBus with browser standard.

**Implementation:** [state.js](../docs/js/state.js)

**State Properties:**
| Property | Type | Description |
|----------|------|-------------|
| image | Object | URL, width, height of current document |
| regions | Array | Bounding boxes with line number and coordinates |
| transcription | Array | Transcribed text lines |
| zoom | Number | Current zoom level |
| selectedLine | Number/null | Currently selected line |

**Key Methods:**
- `getState()` returns current state
- `setImage(url)` loads document and fires `imageChanged`
- `setSelection(line)` selects line and fires `selectionChanged`
- `setZoom(level)` updates zoom and fires `zoomChanged`

**Advantages over Custom EventBus:**
- Native Browser API (no dependencies)
- DevTools integration (event debugging)
- Memory management by browser

### Event Types

| Event | Payload | Trigger |
|-------|---------|---------|
| `imageChanged` | `{ url }` | Image loaded |
| `selectionChanged` | `{ line }` | Line selected |
| `zoomChanged` | `{ zoom }` | Zoom changed |
| `transcriptionComplete` | `{ segments }` | LLM response parsed |
| `validationComplete` | `{ results }` | Validation finished |
| `segmentUpdated` | `{ index, text }` | Inline edit |
| `batchStarted` | `{ operation, total }` | Batch operation begins |
| `batchProgress` | `{ currentIndex, total, ... }` | Batch progress update |
| `batchComplete` | `{ successCount, errorCount, ... }` | Batch operation finished |

**Batch State:**

For multi-page batch operations (transcription/validation), additional state tracks progress:

| Property | Type | Description |
|----------|------|-------------|
| batch.operation | string/null | 'transcription' \| 'validation' \| null |
| batch.status | string | 'idle' \| 'running' \| 'complete' \| 'aborted' |
| batch.currentIndex | number | Current page being processed |
| batch.total | number | Total pages in batch |
| batch.successCount | number | Successfully processed pages |
| batch.errorCount | number | Failed pages |
| batch.abortRequested | boolean | User requested abort |

**Batch Methods:**
- `startBatch(operation, total)` initializes batch and fires `batchStarted`
- `updateBatchProgress(index, success)` updates counters and fires `batchProgress`
- `requestBatchAbort()` sets abort flag for loop termination
- `completeBatch()` finalizes batch and fires `batchComplete`
- `getPageStatus(pageIndex)` returns transcription/validation status for page

### LLMService

Abstraction layer for multiple LLM providers with unified API.

**Implementation:** [llm.js](../docs/js/services/llm.js)

**Key Methods:**
- `setProvider(name)` switches between Gemini, OpenAI, Anthropic, Ollama
- `setApiKey(key)` configures authentication
- `transcribe(image, options)` sends image to VLM for OCR/HTR
- `validate(text, options)` requests LLM Review (options: `{ customPrompt }`)
- `isOcrOnlyModel()` detects OCR-specific models (e.g., DeepSeek-OCR)
- `getValidationFallback()` finds alternative provider for validation

**Supported Providers:**
| Provider | Endpoint | Default Model | Vision |
|----------|----------|---------------|--------|
| Gemini | generativelanguage.googleapis.com | gemini-3-flash-preview | Yes |
| OpenAI | api.openai.com | gpt-5.2 | Yes |
| Anthropic | api.anthropic.com | claude-sonnet-4-5 | Yes |
| Ollama | localhost:11434 | deepseek-ocr | Yes |

**Validation Fallback (OCR-only Models):**

OCR-only models like DeepSeek-OCR cannot perform text validation (they require images). When such a model is active, validation automatically falls back to an alternative provider:

```
User selects: DeepSeek-OCR (Ollama)
                    │
    ┌───────────────┴───────────────┐
    │                               │
Transcription                   Validation
    │                               │
DeepSeek-OCR                   Fallback to:
(local, /api/chat)             1. Cloud provider with API key
                               2. Other Ollama model (llama3.2)
```

**Ollama Vision Models:**

Vision models require `/api/chat` endpoint (not `/api/generate`) and work best with simple prompts:
- DeepSeek-OCR: "Extract the text in the image."
- LLaVA, llama3.2-vision: Standard vision prompts

### Document Viewer (OpenSeadragon)

IIIF-compatible image viewer with SVG overlay for region synchronization.

**Implementation:** [viewer.js](../docs/js/viewer.js)

**Dependencies:** OpenSeadragon 4.1 + SVG Overlay Plugin (vendored in `vendor/openseadragon/`)

**Key Features:**
| Feature | Description |
|---------|-------------|
| Pan/Zoom | Built-in mouse and touch support |
| Rotation | 90-degree increments |
| Flip | Horizontal mirroring |
| Local Images | Direct file upload |
| IIIF Images | Manifest URL loading |
| SVG Overlay | Region highlighting with bounding boxes |

**Coordinate System:**
OpenSeadragon uses viewport-normalized coordinates where X ranges 0-1 and Y is scaled by aspect ratio.

**Important:** Y coordinates must be multiplied by aspect ratio (height/width) when converting from PAGE-XML percentages. The formula is: `x = percent/100`, `y = (percent/100) * aspectRatio`. This is a common source of bugs - see viewer.js for the implementation.

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset view |
| `f` | Fit to view |
| `r` / `R` | Rotate left/right |
| `h` | Flip horizontal |

### Event System

Components communicate through AppState events. Each component listens for relevant events and updates its UI accordingly.

**Event Flow:**
- **viewer.js** listens for `selectionChanged` to highlight regions and pan
- **editor.js** listens for `selectionChanged` to highlight rows and scroll
- **ui.js** listens for `selectionChanged` to scroll validation cards into view
- **editor.js** listens for `pageChanged` and `pagesLoaded` to re-render content

This creates bidirectional synchronization between all three panels.

### IIIF Integration

**Implementation:** IIIF Dialog in [dialogs.js](../docs/js/components/dialogs.js)

**Features:**
| Feature | Description |
|---------|-------------|
| Manifest URL Input | Text field with validation |
| Example Links | Pre-filled Bodleian, Gallica, BSB URLs |
| Version Detection | Auto-detect IIIF Presentation API v2/v3 |
| Page Navigation | Multi-page documents with prev/next buttons |

**Workflow:** User opens IIIF Dialog, enters manifest URL, system parses manifest, extracts pages, displays first page in viewer, enables navigation for multi-page documents.

### StorageService

| Storage | Type | Content | Limit |
|---------|------|---------|-------|
| LocalStorage | Synchronous | Settings, prompt fallbacks, active project ID | ~5MB |
| IndexedDB | Asynchronous | Projects, sessions, images, optional API keys | Browser quota |

## Data Flows

### Upload → Transcription

```
Image Upload → Base64 Encode → LLM Request → Parse Response
                                                    |
                                                    v
    Export ← Corrections ← Expert Review ← Validation
```

### Text-Image Synchronization (Triple Linking)

All three main panels are bidirectionally linked:

```
+-------------------------------------------------------------+
|                                                             |
|   DOCUMENT VIEWER <----------------> TRANSCRIPTION          |
|         |                               |                   |
|         |                               |                   |
|         v                               v                   |
|   +---------------------------------------------+           |
|   |            VALIDATION PANEL                  |           |
|   +---------------------------------------------+           |
|                                                             |
+-------------------------------------------------------------+
```

### Synchronization Flow

```
User clicks Transcription Line #4
       |
   TranscriptionTable.onClick(lineNumber: 4)
       |
   appState.setSelection(4)
       |
   dispatchEvent('selectionChanged', { line: 4 })
       |
   +-------------------+------------------------+
   |                   |                        |
   v                   v                        v
DocumentViewer    ValidationPanel           Editor
.highlightBox(4)  .scrollToRelated(4)      .highlightRow(4)
.scrollToRegion() .expandCard(4)
```

### Reverse Flow (Viewer → Transcription)

```
User clicks Bounding Box in Viewer
       |
   DocumentViewer.onBoxClick(boxId)
       |
   appState.setSelection(lineNumber)
       |
   dispatchEvent('selectionChanged', { line: 4 })
       |
   +-------------------+------------------------+
   |                   |                        |
   v                   v                        v
Transcription     ValidationPanel           State
.scrollToLine(4)  .scrollToRelated(4)      (updated)
.highlightRow(4)
```

### Validation → All Panels

```
User clicks "Line 4" in Validation Card
       |
   ValidationPanel.onLineRefClick(4)
       |
   appState.setSelection(4)
       |
   dispatchEvent('selectionChanged', { line: 4 })
       |
   +-------------------+------------------------+
   |                   |                        |
   v                   v                        v
DocumentViewer    Transcription             State
.highlightBox(4)  .scrollToLine(4)         (updated)
.scrollToRegion() .highlightRow(4)
```

## API Integration

All provider-specific API calls are implemented in [llm.js](../docs/js/services/llm.js).

**Common Pattern:** Each provider receives the prompt and base64-encoded image, returns structured transcription. Temperature is set low (0.1) for consistent OCR results.

**Provider Specifics:**
| Provider | Auth Method | Image Format | Max Tokens |
|----------|-------------|--------------|------------|
| Gemini | URL parameter | inline_data | 8192 |
| OpenAI | Bearer token | image_url (data URI) | 4096 |
| Anthropic | x-api-key header | base64 in content | 4096 |
| Ollama | None (local) | base64 | Varies |

## Error Handling

| Error Type | Cause | Handling |
|------------|-------|----------|
| NetworkError | No connection | Retry with backoff |
| AuthError | Invalid API Key | Dialog for key entry |
| RateLimitError | Too many requests | Wait, countdown |
| QuotaError | Quota exhausted | Alternative provider |
| StorageError | IndexedDB/localStorage quota reached | Show warning, cleanup option |

**Retry Strategy:** Exponential backoff (1s, 2s, 4s) with max 3 attempts. Respects `retryAfter` header from rate-limited responses.

## Security

### API Key Handling

Keys are always used in memory during runtime.
Optional persistence (trusted devices only) stores keys in IndexedDB `apiKeys`.
localStorage is not used for API key material.

**Warning in UI:** "Do not use this tool on public computers."

### Content Security Policy

A strict CSP is enforced via `<meta http-equiv="Content-Security-Policy">` in `index.html`:

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `default-src` | `'self'` | Baseline: same-origin only |
| `script-src` | `'self'` | No inline scripts, no CDN scripts |
| `style-src` | `'self' 'unsafe-inline'` | Self + inline for dynamic CSS (OSD) |
| `img-src` | `'self' data: blob: https://*.iiif.io ...` | Local images + IIIF servers |
| `connect-src` | `'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.mistral.ai http://localhost:* https://*.iiif.io ...` | LLM APIs + Ollama + IIIF |
| `font-src` | `'self'` | Vendored fonts only |
| `object-src` | `'none'` | No plugins |
| `base-uri` | `'self'` | Prevents base-tag hijacking |
| `worker-src` | `'self'` | Service worker same-origin |

**CSP compliance required:** All scripts must be external files (`src=` attribute). No `onclick`, no inline `<script>` blocks. Event handlers are attached in JavaScript via `addEventListener`.

### Vendored Dependencies

All external libraries are vendored in `docs/vendor/` to eliminate CDN dependencies. This enables:
- **Offline operation** via Service Worker caching
- **CSP `script-src 'self'`** without `unsafe-inline` or CDN allowlisting
- **Supply-chain hardening** -- no runtime dependency on third-party CDNs

| Library | Path | Version |
|---------|------|---------|
| OpenSeadragon | `vendor/openseadragon/openseadragon.min.js` | 4.1 |
| OSD SVG Overlay | `vendor/openseadragon/openseadragon-svg-overlay.js` | -- |
| JSZip | `vendor/jszip.min.js` | 3.x |
| Marked | `vendor/marked.min.js` | 15.x |
| Inter (font) | `vendor/fonts/*.woff2` | Variable |
| JetBrains Mono | `vendor/fonts/*.woff2` | Variable |

The Service Worker (`sw.js`, cache version `coocr-v2`) pre-caches all vendor assets on install for full offline support.

## Technology Decisions

| Decision | Rationale |
|----------|-----------|
| No Framework | Reduces complexity, improves longevity |
| IndexedDB + localStorage split | Fast settings access + robust project persistence |
| Fetch API | Native, sufficient for REST |
| ES6 Modules | Native browser support, no bundler |
| CSS Custom Properties | Theming without preprocessor |
| Vendored dependencies | Offline capability, CSP compliance, supply-chain security |
| CSP via meta tag | No server config needed (GitHub Pages static hosting) |

## Performance Goals

| Metric | Target |
|--------|--------|
| HTML | <5 KB gzip |
| CSS | <15 KB gzip |
| JavaScript | <50 KB gzip |
| Fonts | ~100 KB |
| **Total** | **<170 KB** |

---

**References:**
- [VALIDATION](VALIDATION.md) for ValidationEngine details
- [DATA-SCHEMA](DATA-SCHEMA.md) for data structures
