# OCR/HTR & Image Description

> **Forked from [DigitalHumanitiesCraft/co-ocr-htr](https://github.com/DigitalHumanitiesCraft/co-ocr-htr)** by [Christopher Pollin](https://github.com/chpollin) (DH Craft Graz).

## Acknowledgements and License

This project is based on the excellent work of **Christopher Pollin** ([DH Craft](https://dhcraft.org/)), who designed and developed coOCR/HTR as an Editor-in-the-Loop tool for OCR/HTR verification of historical documents. The original architecture, design system, LLM integration, and Promptotyping approach originate from his upstream repository.

We gratefully acknowledge Christopher Pollin for:

- Developing and open-sourcing coOCR/HTR
- The innovative Promptotyping approach (documentation-driven AI development)
- Licensing under CC BY 4.0, enabling forks and further development

### License

This work, like the original, is licensed under the [Creative Commons Attribution 4.0 International License (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

[![CC BY 4.0](https://licensebuttons.net/l/by/4.0/88x31.png)](https://creativecommons.org/licenses/by/4.0/)

**Attribution:** Christopher Pollin / DH Craft - [github.com/DigitalHumanitiesCraft/co-ocr-htr](https://github.com/DigitalHumanitiesCraft/co-ocr-htr)

---

## [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/rklugsederoeaw/co-ocr-htr-rk)

---

## About This Fork

This fork is maintained by **Robert Klugseder** (Austrian Academy of Sciences, ACDH) and extends coOCR/HTR with features for medieval manuscript workflows:

- **Persistent project management** with IndexedDB (multiple projects, image storage)
- **Illuminated initials description** via Google Gemini (art-historical analysis)
- **Flexible validation provider configuration** for any model (separate transcription and validation models)
- **Responsive panel layouts** with resize handles and CSS Container Queries
- **LLM Review Apply** -- apply LLM suggestions directly into the editor
- **HTR Post-Processing Pipeline** (feature-flagged) with multi-stage normalization
- **LLM Thinking Panel** -- real-time streaming of LLM reasoning (Gemini, Anthropic, Ollama)
- **Prompt Profiles** -- scenario-based prompt architecture for different document types
- **Prompt Library** -- persistent prompt database (IndexedDB) for saving, organizing, and reusing prompts across all workflows
- **Project export/import** (.coocr archive) for cross-browser/device transfer with optional encrypted API keys
- **Improved UX** with custom dialogs, storage quota display, and tooltips

## Quick Start

### Live Demo

**[Try coOCR/HTR](https://rklugsederoeaw.github.io/co-ocr-htr-rk/)**

1. Click "Upload" > "Load Demo" to try with sample data
2. Click the model indicator to configure your LLM provider
3. Upload a document (image, PAGE-XML, METS-XML, IIIF manifest)
4. Click "Transcribe" for LLM transcription
5. Review results and export

### Local Development

```bash
git clone https://github.com/rklugsederoeaw/co-ocr-htr-rk.git
cd co-ocr-htr-rk
npx serve docs -l 3000
# http://localhost:3000
```

No build step required. Tests:

```bash
cd docs && npm install && npm test
```

---

## Fork Changelog

<!-- CHANGELOG_START -->

For the complete development history before this fork, see the original repository: [DigitalHumanitiesCraft/co-ocr-htr](https://github.com/DigitalHumanitiesCraft/co-ocr-htr).

---

### Fork Milestone 1: Audit and Stability Foundation (2026-02-08)

Key changes:

- Security, robustness, and data-integrity audit fixes across core modules (67ff594, 74ea53e)
- LLM timeout tuning for cloud and local inference paths (a3bde4d)
- Local config loading hardened for localhost-only development usage (bfcc2e4, 4e6a1af)
- API connection test flow in configuration dialog (2d33195)

---

### Fork Milestone 2: IndexedDB Project Persistence (2026-02-08 to 2026-02-09)

Key changes:

- Project/session persistence model moved to IndexedDB stores (`projects`, `sessions`, `images`, `apiKeys`) (e2d99c5)
- Multi-project workflow (create, rename, switch, delete) (e2d99c5)
- Custom dialog flows replacing browser-native confirm/prompt interactions (c494152)
- Storage quota visualization in Settings (c494152)

---

### Fork Milestone 3: OCR-Only Validation and Mistral OCR (2026-02-09)

Key changes:

- Mistral OCR provider added (c005db4)
- Explicit validation provider configuration for OCR-only models (5ddce16)
- Validation priority model: explicit provider > automatic fallback > active provider (5ddce16)
- Regression hardening for dialog and validation edge cases (102be34, 38630e2, fca3853)

---

### Fork Milestone 4: Describe Workflow (2026-02-10)

Key changes:

- Gemini-based image description workflow for illuminated initials (22f9e1d)
- Description panel editing and per-page persistence on navigation/session save (88b94a1, f2c0603)
- Session restore fixes for description state and panel rendering (159cd21, ade8559, fd91d8d)

---

### Fork Milestone 5: Responsive and Resizable Workspace (2026-02-10)

Key changes:

- Responsive panel headers using container queries (9ca61ee)
- Horizontal 3-column resize with keyboard/mouse support and persistence (9ca61ee)
- Vertical resize for description vs. transcription panes (04c29d5)
- UI refinements for controls, indicators, and dialog positioning (cd1c227, d50339f, a42ff18, 7cfa5b1, e952df4, afbfc2f)

---

### Fork Milestone 6: Validation Persistence and LLM Review Apply (2026-02-11)

Key changes:

- Unified terminology: rule-based checks = "Validation", LLM-based review = "LLM Review" (1c3a50e, 03434fd)
- Validation results persistence: summary, timestamp, custom prompt survive page reload (6b6e8cc)
- LLM Review Apply: apply LLM suggestions directly into the editor with one click (06d3c6f)
- Undo support for applied LLM Review suggestions (45d2eb9)
- Robust apply matching for multi-column layouts and abbreviated entries (3af669f)

---

### Fork Milestone 7: HTR Post-Processing Pipeline (2026-02-11 to 2026-02-12)

Key changes:

- Post-processing orchestrator with Stage 2 (normalization) + Stage 3 (enrichment) pipeline (9b70f44)
- Strict JSON normalization, stage metadata, confidence and marker canonicalization (9b70f44)
- Document context extension: scriptType, century, region, languages, textType, knownText (9b70f44)
- Stage badges and toggles in validation panel for per-stage result filtering (9b70f44)
- Feature-flagged: `FEATURE_FLAGS.postprocessPipelineV1` (default: off) (9b70f44, 4bed38e)
- HTR post-processing strategy document with expert analysis (59db113)

---

### Fork Milestone 8: LLM Thinking Panel (2026-02-12)

Key changes:

- Real-time display of LLM thinking/reasoning during transcription, validation, and description (beb98e6)
- Streaming support for 3 providers: Gemini (SSE), Anthropic (Extended Thinking), Ollama (`<think>` tags) (beb98e6)
- Automatic fallback to non-streaming on stream error (beb98e6)
- Collapse/expand button for thinking panel (6fc62c1)
- Thinking panel stays above validation loading overlay via z-index layering (6fc62c1)

---

### Fork Milestone 9: Prompt Profiles and Validation Panel Resize (2026-02-12)

Key changes:

- Prompt profile architecture with scenario-based profiles: Generic Historical Document, Medieval Latin Manuscript, Early Modern Letter (acf0709)
- Stage override support for advanced per-stage prompt customization (acf0709)
- Vertical resize handles for validation panel sub-sections (thinking, validation, LLM review) (e2f9f90)
- Keyboard, mouse, and double-click-reset support for vertical resize (e2f9f90)

### Fork Milestone 10: Project Export/Import (.coocr) and UX Fixes (2026-02-27)

Key changes:

- Project export/import as `.coocr` archive (ZIP-based via JSZip) for cross-browser/device transfer (f3e74fd)
- Archive contains project metadata, session state, LLM settings, and images
- Optional AES-GCM encrypted API key export with password protection (Web Crypto API, PBKDF2)
- Import with conflict detection: replace existing, keep both (rename), or cancel
- Password prompt dialog for encrypted API key decryption on import
- Export button per project in the project list dialog
- "Import Project (.coocr)" entry in the upload menu
- "Describing..." loading overlay in editor panel during image description (matching transcription UX)
- Validation provider configuration now always visible in API dialog (not restricted to OCR-only models)

---

### Fork Milestone 11: Prompt Library (2026-02-27)

Key changes:

- Persistent Prompt Library stored in IndexedDB (new `prompts` store, schema v2) (a9497f4)
- Header button (book icon) opens a full-screen dialog for browsing, creating, editing, duplicating, and deleting prompts
- Five prompt categories: Transcription (Stage 1), Description, LLM Review, Stage 2 (Paleographic), Stage 3 (Philological)
- Automatic seeding: the three built-in Prompt Profiles (Generic, Medieval Latin, Early Modern Letter) are seeded as 9 library entries on first use
- Built-in prompts are protected from deletion (duplicate-and-edit workflow)
- "Load from Library" and "Save to Library" buttons in all five workflow textareas (Transcription, Description, LLM Review, Stage 2, Stage 3)
- Category-filtered picker popup for quick prompt selection within workflow dialogs (157fa8e)
- Clickable rows for direct editing, full-width edit form (8d47013, ce366f5)
- Optional tags (comma-separated) for organizing prompts

---

### Fork Milestone 12: Thinking Analysis (2026-02-27)

Key changes:

- 3-screen wizard dialog for analyzing LLM reasoning and generating optimized prompts (054172d)
- Screen 1 (Capture): displays operation metadata, prompt used, thinking trace, and result with character counts
- Screen 2 (Analysis): LLM meta-analysis of reasoning quality (5 evaluation dimensions) plus scholar feedback textarea
- Screen 3 (Optimize): LLM-generated optimized prompt (editable) with one-click save to Prompt Library
- Human-in-the-Loop at every step: no autonomous prompt modification
- Exactly 2 additional LLM calls per analysis cycle (text-only, no image = cost-effective)
- New `textQuery()` method in llm.js for text-only LLM calls (no image payload)
- Thinking text accumulator in thinking panel with capture metadata
- Analyze button (magnifying glass icon) appears after thinking completion
- Resolved prompt capture in transcription, description, and validation components
- Context-window protection via smart truncation of long thinking traces

---

<!-- CHANGELOG_END -->

---

## Features

Baseline methodology and early system design come from the upstream project ([DigitalHumanitiesCraft/co-ocr-htr](https://github.com/DigitalHumanitiesCraft/co-ocr-htr)).  
This fork extends that base with additional persistence, workflow, and UX capabilities.

- **LLM providers**: Gemini, OpenAI, Anthropic, Ollama, Mistral OCR
- **Hybrid validation**: deterministic Validation + LLM Review with apply-to-editor
- **LLM Thinking Panel**: real-time streaming of LLM reasoning (Gemini SSE, Anthropic Extended Thinking, Ollama `<think>` tags)
- **Prompt profiles**: scenario-based prompt architecture (Generic, Medieval Latin, Early Modern Letter) with stage overrides
- **Prompt Library**: persistent prompt database with categories, tags, seeding from built-in profiles, and Load/Save integration in all workflow dialogs
- **Thinking Analysis**: 3-step wizard for analyzing LLM reasoning traces and generating optimized prompts with Human-in-the-Loop feedback
- **HTR Post-Processing**: multi-stage normalization pipeline (Stage 2 + 3) with confidence/marker canonicalization (feature-flagged)
- **Import paths**: image upload, PAGE-XML, METS-XML, IIIF manifests
- **Export formats**: TXT, JSON, Markdown, PAGE-XML, TEI-XML, ZIP (multi-page)
- **Project export/import**: `.coocr` archive format for cross-browser/device transfer with optional AES-GCM encrypted API keys
- **Project persistence**: IndexedDB-backed projects/sessions/images with quota display
- **Multi-project workflow**: create, rename, switch, delete
- **Optional API key persistence**: user-controlled storage in IndexedDB
- **Describe feature**: Gemini-based image description for illuminated initials
- **Batch operations**: transcription, validation, and description across multi-page documents
- **Responsive workspace**: 3-column resize + vertical editor/validation split with keyboard support
- **PWA support**: installable app with offline asset caching

---

## Usage Guides

### Project Management

coOCR/HTR stores work sessions in the browser's IndexedDB. Each project contains images, transcriptions, validations, and descriptions independently.

**Create a new project:**

1. Click the document name in the header (or the dropdown icon next to it)
2. In the project dialog, click **"New Project"**
3. Enter a project name (max. 100 characters) and confirm with **"Create"**
4. The new project becomes active immediately

**Switch between projects:**

1. Click the document name in the header
2. Select the desired project from the project list
3. Images and transcriptions are loaded automatically

**Rename/delete projects:**

- The project list shows **Rename** and **Delete** icons next to each project
- Deletion requires confirmation in a custom dialog

**Storage quota:**

- Under Settings, the current IndexedDB storage usage is shown as a progress bar
- Green: < 70%, Yellow: 70-90%, Red: > 90%
- Images are stored separately in the IndexedDB `images` store (solves QuotaExceededError for large documents)

---

### Illuminated Initials Description

This feature visually analyzes manuscript pages and generates art-historical descriptions of illuminated initials, manuscript illumination, and decorative elements. It exclusively uses Google Gemini (best vision capabilities for art analysis).

**Prerequisite:** A valid Gemini API key must be configured (click the model indicator > select Gemini > enter API key).

**Describe a single page:**

1. Load a document (image upload, IIIF, or demo)
2. Click the **"Describe"** button in the editor toolbar
3. In the dialog, customize the analysis prompt or keep the default prompt
4. Click **"Describe"** - Gemini analyzes the image (approx. 10-15 seconds)
5. The description appears in the **"Image Description"** panel below the toolbar

**Customize the analysis prompt:**

- The default prompt focuses on: Historiated initials, decorative elements, iconography, artistic period, technical details
- Use **"Load Default Prompt"** to restore the default prompt at any time
- Custom prompts are saved automatically and reused on the next invocation
- Example for a specific prompt: *"Identify all biblical scenes and iconographic elements. Name the depicted saints and their attributes."*

**Multi-page documents:**

- For multi-page documents (IIIF, METS), a page selection appears in the dialog
- **"Current page only"** describes only the current page
- **"All pages"** starts a batch description with progress display
- Each page receives its own independent description

**Edit descriptions:**

- The description panel is directly editable (textarea)
- Changes are saved automatically (debounce: 500ms)
- The collapse button (chevron on the right) toggles the panel open/closed
- **"Copy"** copies the description to the clipboard

**Export descriptions:**

- JSON export includes `description` with raw text, prompt, model, and timestamp
- Markdown export includes the description as a separate section before the transcription

---

### Validation Provider Configuration

coOCR/HTR-rk allows configuring a separate model for validation and LLM review, independent of the transcription model. This is useful for hybrid workflows (e.g., OCR transcription + LLM validation) or simply to use a different model for review than for transcription.

**Default behavior (no explicit validation provider):**

- The transcription model is also used for validation
- For OCR-only models (Mistral OCR, DeepSeek OCR), the system automatically falls back to a configured cloud provider
- Cloud fallback priority: Gemini > OpenAI > Anthropic
- For Ollama-based OCR workflows, a local text-model fallback can be attempted (e.g., `llama3.2`) if no cloud key is configured

**Configure an explicit validation provider:**

1. Click the model indicator to open the API dialog
2. The **"Validation Configuration"** section is always visible below the model selection
3. Choose a validation model from the dropdown (or leave empty to use the transcription model)
4. Enter the API key for the validation provider (auto-filled if already stored)
5. Optional: Enable **"Store validation API key permanently"** for persistent storage

**Validation priority (three tiers):**

1. Explicitly configured validation provider (highest priority)
2. Automatic fallback to a configured cloud provider (for OCR-only models)
3. Active transcription provider (default)

**Typical hybrid workflows:**

- **OCR-only:** Mistral OCR (transcription) + Gemini Flash (validation)
- **Cost optimization:** Gemini Pro (transcription) + Gemini Flash (validation)
- **Local + cloud:** Ollama DeepSeek-OCR (transcription) + GPT-5.2 Mini (validation)

---

### Prompt Library

The Prompt Library provides a persistent database for storing, organizing, and reusing prompts across all workflows. Prompts are stored in the browser's IndexedDB and survive page reloads, browser restarts, and session changes.

**Open the Prompt Library:**

1. Click the **book icon** in the header bar (between Projects and Settings)
2. The library dialog shows all saved prompts with name, category, and action buttons
3. Use the **category filter** dropdown to show only prompts of a specific type

**Categories:**

- **Transcription (Stage 1)** -- prompts for initial LLM transcription
- **Description** -- prompts for illuminated initials / image description
- **LLM Review** -- custom validation prompts
- **Stage 2 (Paleographic)** -- paleographic review override prompts
- **Stage 3 (Philological)** -- philological review override prompts

**Create a new prompt:**

1. Click **"+ New Prompt"** in the library toolbar
2. Enter a name, select a category, add optional tags (comma-separated), and write the prompt text
3. Click **"Save"**

**Edit an existing prompt:**

1. Click anywhere on the prompt row to open the edit form
2. Modify name, category, tags, or text
3. Click **"Save"** to update, or **"Cancel"** to discard changes

**Duplicate / Delete:**

- **Duplicate** (copy icon): creates a copy with "(copy)" appended to the name
- **Delete** (trash icon): removes user-created prompts (requires confirmation)
- Built-in prompts (seeded from Prompt Profiles) cannot be deleted -- duplicate them to create an editable copy

**Load a prompt into a workflow:**

1. In any workflow dialog (Transcribe, Describe, Validate), click **"Load from Library"** next to the prompt textarea
2. A picker popup shows only prompts matching the current category
3. Click a prompt to load its text into the textarea

**Save the current prompt to the library:**

1. Write or modify a prompt in any workflow textarea
2. Click **"Save to Library"** next to the textarea
3. Enter a name for the prompt -- it is saved with the matching category automatically

**Built-in prompts (seeding):**

On first use, the library is automatically populated with 9 prompts from the three built-in Prompt Profiles (Generic Historical Document, Medieval Latin Manuscript, Early Modern Letter), each with Stage 1, Stage 2, and Stage 3 variants. These serve as starting templates and can be duplicated for customization.

---

### Responsive and Resizable Panels

The 3-column layout (Viewer | Editor | Validation) is freely scalable.

**Horizontal resize (between columns):**

- Vertical resize handles are positioned between the three panels (visible as a thin line)
- **Mouse:** Drag the handle to adjust column widths
- **Keyboard:** Focus the handle (Tab), then use Arrow Left/Right (+/- 10px, with Shift: +/- 50px)
- **Reset:** Double-click the handle to restore the default ratios (40/35/25%)
- Column ratios are saved to localStorage and restored on next load
- Minimum panel width: 200px

**Vertical resize (description/transcription):**

- When the description panel is visible, a horizontal resize handle appears between the description and transcription areas
- Drag to adjust the heights of both areas
- Minimum height per area: 80px

**Responsive button labels:**

- When panels are narrow, button labels are automatically hidden (only icons remain visible)
- Editor panel: below 750px width (common due to many buttons)
- All panels: below 400px width (generic fallback)
- Tooltips and info icons are also hidden below 400px

**Below 1200px viewport width:** The layout automatically switches to 2 columns (validation panel hidden, resize handles deactivated).

**Below 768px viewport width:** A desktop-use warning is displayed.

---

## Architecture

coOCR/HTR-rk is a **browser-only SPA** served from `docs/`.  
There is no backend application layer; state and persistence live in the browser.  
Primary runtime network traffic is LLM API calls and optional IIIF resources.

### Runtime Layers (Current)

| Layer       | Modules                                                                                                                                                | Responsibility                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| UI          | `docs/index.html`, `docs/js/viewer.js`, `docs/js/editor.js`, `docs/js/ui.js`, `docs/js/components/*`                                                   | Viewer/editor/dialog UX, upload flows, panel interactions            |
| State/Event | `docs/js/state.js`                                                                                                                                     | Central `AppState` (`EventTarget`) with domain state + app events    |
| Services    | `docs/js/services/llm.js`, `docs/js/services/validation.js`, `docs/js/services/export.js`, `docs/js/services/storage.js`, `docs/js/services/parsers/*` | LLM abstraction, hybrid validation, export, persistence, XML parsing |
| PWA         | `docs/js/pwa.js`, `docs/sw.js`, `docs/manifest.json`                                                                                                   | Service worker caching, offline indicator, installability            |

### State and Event Model

- `appState` in `docs/js/state.js` is the single source of truth for:
  - Project/session context
  - Current document/page + multi-page collections
  - Transcription, validation, and description data
  - Batch operation status
  - UI state (selection, loading, active dialog)
- UI modules communicate via `CustomEvent`s on `appState` (e.g. `transcriptionComplete`, `validationComplete`, `selectionChanged`, `pageChanged`).

### Persistence Model (Current)

- `localStorage` stores lightweight synchronous settings:
  - `coocr:settings`
  - `coocr:descriptionPrompt`
  - `coocr:validationPrompt`
  - `coocr:activeProjectId`
- `IndexedDB` (`coocr-htr`, schema v2) stores structured project data:
  - `projects`
  - `sessions`
  - `images`
  - `apiKeys` (optional, only when user enables persistence)
  - `prompts` (Prompt Library entries with category, tags, timestamps)

### LLM and Validation Flow

- Active provider handles transcription (`Gemini`, `OpenAI`, `Anthropic`, `Mistral OCR`, `Ollama`).
- Validation provider resolution is:
  1. Explicit validation provider/model (if configured)
  2. Automatic fallback when OCR-only model is active
  3. Active provider (standard case)
- API keys are always used in runtime memory; optional persistence can restore keys from IndexedDB on startup.

### Import/Export and Viewer

- Import: image upload, PAGE-XML, METS-XML, IIIF manifests.
- Viewer: OpenSeadragon + SVG overlay for region/line synchronization.
- Export: TXT, JSON, Markdown, PAGE-XML, TEI-XML, plus ZIP export for multi-page batches.

For deeper technical details, see `knowledge/ARCHITECTURE.md`.

## Documentation

Knowledge base in `knowledge/`:

- [VISION.md](knowledge/VISION.md) - Project goals
- [METHODOLOGY.md](knowledge/METHODOLOGY.md) - Scientific background
- [ARCHITECTURE.md](knowledge/ARCHITECTURE.md) - Technical architecture
- [VALIDATION.md](knowledge/VALIDATION.md) - Validation system
- [MODEL-LANDSCAPE.md](knowledge/MODEL-LANDSCAPE.md) - OCR/HTR model comparison

## Contributors

| Role            | Person                                                       |
| --------------- | ------------------------------------------------------------ |
| Original author | [Christopher Pollin](https://github.com/chpollin) (DH Craft) |
| Fork maintainer | Robert Klugseder (OEAW / ACDH)                               |
| AI assistance   | Claude Code (Anthropic) and Codex CLI (OpenAI)               |

---

*Based on [co-ocr-htr](https://github.com/DigitalHumanitiesCraft/co-ocr-htr) by Christopher Pollin, licensed under CC BY 4.0.*
