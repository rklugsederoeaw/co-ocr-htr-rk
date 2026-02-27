# Test Coverage Analysis

**Date:** 2026-02-27
**Current state:** 549 passing, 1 failing (17 test files + 2 E2E specs)

---

## 1. Coverage Overview

### Tested Modules (17 unit test files)

| Test File | Module | ~Tests | Coverage Depth |
|-----------|--------|--------|---------------|
| `state.test.js` | `state.js` | 89 | Comprehensive |
| `llm.test.js` | `services/llm.js` | 110+ | Extensive |
| `validation.test.js` | `services/validation.js` | 85 | Strong |
| `export.test.js` | `services/export.js` | 65 | Excellent |
| `storage.test.js` | `services/storage.js` | 60 | Strong |
| `postprocess.test.js` | `services/postprocess.js` | 26 | Solid |
| `textFormatting.test.js` | `utils/textFormatting.js` | 75 | Excellent |
| `page-xml.test.js` | `services/parsers/page-xml.js` | 26 | Solid |
| `llm-streaming.test.js` | `services/llm.js` (streaming) | 32 | Strong |
| `description.test.js` | `components/description.js` | 37 | Good |
| `thinking.test.js` | `components/thinking.js` | 16 | Good |
| `editor.test.js` | `editor.js` | 13 | Partial |
| `validation-apply.test.js` | `components/validation.js` | 6 | Partial |
| `llm-validation-provider.test.js` | `services/llm.js` (validation) | 20 | Good |
| `context-manager.test.js` | `components/context.js` | 2 | Minimal |
| `dialogs-validation-persistence.test.js` | `components/dialogs.js` | 1 | Minimal |
| `apply-export-integration.test.js` | Integration | 1 | Minimal |

### E2E Tests (2 files)

| Spec File | Scenarios | Coverage |
|-----------|-----------|----------|
| `hitl-flow.spec.js` | 13 | Core apply/undo/redo/export workflow |
| `thinking-panel.spec.js` | 12 | Panel visibility, streaming, XSS |

### Untested Modules (15 source files with zero tests)

| Module | Singleton | Criticality | Testability |
|--------|-----------|-------------|-------------|
| `services/parsers/mets-xml.js` | `metsXMLParser` | **High** | **Easy** |
| `services/project-io.js` | `projectIOService` | **High** | Medium |
| `components/upload.js` | `uploadManager` | **High** | Medium |
| `components/transcription.js` | `transcriptionManager` | **High** | Medium |
| `config/promptProfiles.js` | exports | **Medium** | **Easy** |
| `utils/dom.js` | exports | **Medium** | **Easy** |
| `services/samples.js` | `samplesService` | Medium | Medium |
| `components/batch-progress.js` | `batchProgress` | Medium | Easy |
| `viewer.js` | `initViewer()` | Medium | Hard (OSD) |
| `ui.js` | `initUI()` | Medium | Hard (DOM) |
| `main.js` | -- | Low | Hard |
| `pwa.js` | -- | Low | Hard |
| `utils/panelResize.js` | `initPanelResize()` | Low | Hard |
| `utils/tooltips.js` | tooltip helpers | Low | Easy |
| `utils/validationResize.js` | `initValidationResize()` | Low | Hard |

---

## 2. Existing Failing Test

`thinking.test.js` line 69 -- the test expects `"Transcription -- gemini/gemini-3-flash"` but the component now renders `"Transcription -- LLM Thinking"`. The production code's header format has changed but the test assertion was not updated.

---

## 3. Recommended Improvements (Prioritized)

### Priority 1 -- High-value, easy-to-write tests

#### 3.1 METS-XML Parser (`services/parsers/mets-xml.js`)

**Why:** Pure parser with zero DOM dependencies. Handles multi-page document import -- a core feature. Analogous to the well-tested `page-xml.js` parser.

**What to test:**
- `parse()` with valid METS-XML (metadata, files, pages, structure extraction)
- `parse()` with namespaced vs non-namespaced XML
- `_extractMetadata()` -- title, author, language, date, identifier, rights
- `_extractFiles()` -- file IDs, href resolution, dimensions, USE groups
- `_extractPages()` -- ordering, image/thumbnail assignment, MASTER vs DEFAULT
- `_extractStructure()` -- nested logical divs, levels, labels
- `_resolveUrl()` -- absolute URLs pass through, relative resolve against base, empty/invalid
- `isMetsXML()` -- positive and negative detection
- Error handling: parse errors, missing structMap, no pages

**Estimated tests:** 30-40

---

#### 3.2 Prompt Profiles (`config/promptProfiles.js`)

**Why:** Pure data + two lookup functions. Defends against accidental prompt corruption during edits.

**What to test:**
- `PROMPT_PROFILES` has expected profile count (3) and IDs
- Each profile has all three stage prompts (`stage1`, `stage2`, `stage3`)
- Each stage prompt contains expected placeholders (`{context_block}`, `{text}`, etc.)
- `getPromptProfileById()` -- returns correct profile, returns null for invalid/empty ID
- `listPromptProfiles()` -- returns array with id/label/description for each profile
- `DEFAULT_PROMPT_PROFILE_ID` is `'generic_default'`
- `PROMPT_STAGES` enum has correct values

**Estimated tests:** 15-20

---

#### 3.3 DOM Utilities (`utils/dom.js`)

**Why:** Pure utility functions used everywhere. Easy to test in jsdom. Prevents regressions in null-safety behavior.

**What to test:**
- `getById()` / `select()` / `selectAll()` -- found and not-found cases
- `withElement()` -- callback invoked when found, skipped when not
- `onById()` / `on()` / `onAll()` -- event binding and null-safety
- `toggleVisibility()` / `show()` / `hide()` -- explicit and toggle modes, string vs element args
- `toggleClass()` / `addClass()` / `removeClass()` -- string vs element, force param
- `setText()` / `setHTML()` / `setDisabled()` -- null-safety
- `clearChildren()` / `focusDelayed()` -- basic behavior
- `createSVGElement()` -- correct namespace

**Estimated tests:** 25-30

---

### Priority 2 -- Critical business logic gaps

#### 3.4 Upload Validation Logic (`components/upload.js`)

**Why:** File validation is a security/UX boundary. The `validateFile()`, `isImageFile()`, `isXMLFile()` methods are pure functions that can be tested without DOM wiring.

**What to test:**
- `validateFile()` -- oversized file, unsupported type, valid image, valid XML
- `isImageFile()` -- all supported MIME types, extension fallback (`.tiff`, `.webp`), negative cases
- `isXMLFile()` -- MIME types, `.xml` extension, negative cases
- File size boundary (exactly `MAX_FILE_SIZE`, just over)

**Estimated tests:** 12-15

---

#### 3.5 Project IO -- Crypto Helpers (`services/project-io.js`)

**Why:** `encryptKeys()` and `decryptKeys()` are exported, use Web Crypto, and handle sensitive data. A round-trip test ensures they don't silently break.

**What to test:**
- Round-trip: `encrypt` then `decrypt` returns original object
- Wrong password throws/rejects
- Empty key object round-trips
- `_deduplicateName()` -- unique name, conflict with `(imported)`, multiple conflicts
- `_generateId()` -- format, uniqueness

**Estimated tests:** 8-10

---

#### 3.6 Editor (`editor.js`) -- Expanded Coverage

**Why:** Current editor tests cover only `applySuggestionAtLine`. The editor has significant untested logic: undo/redo stack, diff rendering, RTL detection, line number sync, normalized vs structured view toggle.

**What to test:**
- `detectRTL()` -- Latin text, Arabic text, mixed, empty, threshold behavior
- Undo/redo stack: push, undo, redo, redo after new edit (branch trim), max size
- Diff display: show/hide toggle, modified lines highlighted, identical lines unmarked
- Line number rendering syncs with textarea scroll
- Text direction auto-detection on transcription load

**Estimated tests:** 20-25

---

### Priority 3 -- Integration and robustness gaps

#### 3.7 Export -- ZIP Format

**Why:** ZIP export is the only untested export format. It bundles PAGE-XML + images via JSZip.

**What to test:**
- ZIP contains expected files (PAGE-XML, images, metadata)
- Multi-page ZIP exports all pages
- Requires mocking JSZip CDN load

**Estimated tests:** 5-8

---

#### 3.8 Multi-page Document Flow (Integration)

**Why:** State management for multi-page is tested, but the integration of page navigation with transcription preservation, validation per-page, and export of all pages is not.

**What to test:**
- Navigate pages: transcription preserved per-page and restored on return
- Validation results preserved per-page
- Export includes all pages' transcriptions
- Batch transcription stores results per-page

**Estimated tests:** 8-12

---

#### 3.9 Storage Error Scenarios

**Why:** Current storage tests are thorough for happy paths but skip error conditions.

**What to test:**
- IndexedDB `QuotaExceededError` during save
- Corrupted IndexedDB data during load
- `localStorage` full during settings save
- Concurrent project switches (race conditions)

**Estimated tests:** 8-10

---

#### 3.10 Validation Engine -- Edge Cases

**Why:** Rule-by-rule edge cases are not exhaustively tested.

**What to test:**
- Abbreviation rule: nested brackets `Herr[n]`, edge patterns like `[n]` at start/end of line
- Control characters rule: `\r\n` (Windows line endings), form feed, vertical tab
- Special chars rule: various Unicode blocks (CJK, Cyrillic, combining characters)
- Line count / char count with very large texts
- Double spaces: tabs vs spaces, non-breaking spaces

**Estimated tests:** 15-20

---

### Priority 4 -- Nice to have

#### 3.11 Context Manager (`components/context.js`) -- Expanded

Only 2 tests exist. Should cover:
- All context fields (scriptType, languages, century, region, textType, knownText)
- `buildPromptContext()` with various field combinations
- Fallback behavior when fields are empty/missing

#### 3.12 Dialogs (`components/dialogs.js`) -- Expanded

Only 1 test exists. Should cover:
- API key save/load per provider
- Dialog open/close lifecycle
- Toast display and auto-dismiss

#### 3.13 Batch Progress Panel (`components/batch-progress.js`)

- `show()` creates panel, displays title and counter
- `update()` reflects progress percentage
- `showComplete()` shows success/error/aborted summary
- `hide()` hides panel
- Abort button calls `appState.requestBatchAbort()`

#### 3.14 E2E Test Expansion

Current E2E covers the core HITL flow but misses:
- File upload (drag & drop, file picker)
- IIIF URL import
- Multi-page navigation
- Batch transcription progress
- Export dialog and download
- API key configuration persistence
- Keyboard shortcuts

---

## 4. Summary

| Priority | Area | New Tests | Effort |
|----------|------|-----------|--------|
| P1 | METS-XML parser | ~35 | Small |
| P1 | Prompt profiles | ~18 | Small |
| P1 | DOM utilities | ~28 | Small |
| P2 | Upload validation | ~14 | Small |
| P2 | Project IO crypto | ~9 | Medium |
| P2 | Editor expanded | ~22 | Medium |
| P3 | ZIP export | ~6 | Medium |
| P3 | Multi-page integration | ~10 | Medium |
| P3 | Storage errors | ~9 | Medium |
| P3 | Validation edge cases | ~17 | Small |
| P4 | Context/Dialogs/Batch/E2E | ~40+ | Large |
| -- | **Total** | **~208** | -- |

### Quick Wins (start here)

1. **Fix the failing `thinking.test.js`** assertion (line 69) -- the header format changed
2. **Add `mets-xml.test.js`** -- pure parser, mirrors existing `page-xml.test.js` patterns
3. **Add `promptProfiles.test.js`** -- pure data validation, catches prompt corruption
4. **Add `dom.test.js`** -- pure utilities, prevents null-safety regressions
5. **Add upload validation tests** -- extract `validateFile`/`isImageFile`/`isXMLFile` tests
