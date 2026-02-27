/**
 * Prompt Library Manager
 *
 * Persistent prompt database for all workflows (transcription, description,
 * validation/LLM review). Stores prompts in IndexedDB and provides a dialog
 * for browsing, creating, editing, duplicating, and deleting prompts.
 *
 * Categories:
 *   - transcription  (Stage 1)
 *   - description     (Image description / illumination)
 *   - validation      (Custom LLM Review prompt)
 *   - stage2          (Paleographic Review override)
 *   - stage3          (Philological Review override)
 */

import { storage } from '../services/storage.js';
import { PROMPT_PROFILES } from '../config/promptProfiles.js';
import { dialogManager } from './dialogs.js';

// Category metadata for display
const CATEGORIES = {
  transcription: 'Transcription (Stage 1)',
  description:   'Description',
  validation:    'LLM Review',
  stage2:        'Stage 2 (Paleographic)',
  stage3:        'Stage 3 (Philological)'
};

class PromptLibraryManager {
  constructor() {
    this._dialog = null;
    this._listEl = null;
    this._editEl = null;
    this._filterEl = null;
    this._editingId = null;
    this._pickerCallback = null;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  init() {
    this._dialog = document.getElementById('promptLibraryDialog');
    this._listEl = document.getElementById('promptLibraryList');
    this._editEl = document.getElementById('promptLibraryEdit');
    this._filterEl = document.getElementById('promptLibraryFilter');

    if (!this._dialog) return;

    // Header button
    document.getElementById('btnPromptLibrary')?.addEventListener('click', () => this.open());

    // Close button
    this._dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => this._dialog.close());

    // Filter change
    this._filterEl?.addEventListener('change', () => this._renderTable());

    // Add button
    document.getElementById('promptLibraryAdd')?.addEventListener('click', () => this._showEditView(null));

    // Edit form buttons
    document.getElementById('promptEditCancel')?.addEventListener('click', () => this._hideEditView());
    document.getElementById('promptEditSave')?.addEventListener('click', () => this._saveFromEditView());

    // Seed defaults on first run
    this._seedIfNeeded();

    // Bind "Load from Library" / "Save to Library" buttons in workflow dialogs
    this._bindWorkflowButtons();
  }

  // ===========================================================================
  // Open / Close
  // ===========================================================================

  async open() {
    if (!this._dialog) return;
    this._hideEditView();
    await this._renderTable();
    this._dialog.showModal();
  }

  // ===========================================================================
  // Seeding
  // ===========================================================================

  async _seedIfNeeded() {
    try {
      const existing = await storage.listPrompts();
      if (existing.length > 0) return;
    } catch {
      return;
    }

    const stageMap = {
      stage1: 'transcription',
      stage2: 'stage2',
      stage3: 'stage3'
    };

    const stageLabels = {
      stage1: 'Stage 1',
      stage2: 'Stage 2',
      stage3: 'Stage 3'
    };

    for (const profile of PROMPT_PROFILES) {
      for (const [stageKey, category] of Object.entries(stageMap)) {
        const text = profile.prompts[stageKey];
        if (!text) continue;

        await storage.savePrompt({
          id: crypto.randomUUID(),
          name: `${profile.label} - ${stageLabels[stageKey]}`,
          category,
          text,
          tags: [],
          isBuiltIn: true,
          sourceProfileId: profile.id
        });
      }
    }

    console.log('[PromptLibrary] Seeded default prompts from profiles');
  }

  // ===========================================================================
  // Table rendering
  // ===========================================================================

  async _renderTable() {
    if (!this._listEl) return;

    const category = this._filterEl?.value || null;
    let prompts;
    try {
      prompts = await storage.listPrompts(category || null);
    } catch {
      this._listEl.innerHTML = '<p class="text-muted">Could not load prompts.</p>';
      return;
    }

    if (prompts.length === 0) {
      this._listEl.innerHTML = '<p class="text-muted">No prompts found. Click "+ New Prompt" to create one.</p>';
      return;
    }

    this._listEl.innerHTML = prompts.map(p => `
      <div class="prompt-library-item" data-id="${p.id}">
        <div class="prompt-library-item-info">
          <span class="prompt-library-item-name">${this._esc(p.name)}</span>
          ${p.tags?.length ? `<span class="prompt-library-item-tags">${p.tags.map(t => this._esc(t)).join(', ')}</span>` : ''}
        </div>
        <span class="prompt-library-item-category">${CATEGORIES[p.category] || p.category}</span>
        <div class="prompt-library-item-actions">
          <button class="icon-btn icon-sm" data-action="edit" data-id="${p.id}" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>
          <button class="icon-btn icon-sm" data-action="duplicate" data-id="${p.id}" title="Duplicate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="icon-btn icon-sm ${p.isBuiltIn ? 'disabled' : ''}" data-action="delete" data-id="${p.id}" title="Delete" ${p.isBuiltIn ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Delegate click events
    this._listEl.onclick = (e) => this._handleListClick(e);
  }

  _handleListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit') this._showEditView(id);
    else if (action === 'duplicate') this._duplicatePrompt(id);
    else if (action === 'delete') this._deletePrompt(id);
  }

  // ===========================================================================
  // Edit view
  // ===========================================================================

  async _showEditView(id) {
    if (!this._editEl || !this._listEl) return;

    this._editingId = id;

    const nameInput = document.getElementById('promptEditName');
    const categorySelect = document.getElementById('promptEditCategory');
    const tagsInput = document.getElementById('promptEditTags');
    const textArea = document.getElementById('promptEditText');

    if (id) {
      const prompt = await storage.getPrompt(id);
      if (!prompt) return;
      nameInput.value = prompt.name || '';
      categorySelect.value = prompt.category || 'transcription';
      tagsInput.value = (prompt.tags || []).join(', ');
      textArea.value = prompt.text || '';
    } else {
      nameInput.value = '';
      categorySelect.value = this._filterEl?.value || 'transcription';
      tagsInput.value = '';
      textArea.value = '';
    }

    this._listEl.hidden = true;
    document.querySelector('.prompt-library-toolbar')?.classList.add('hidden');
    this._editEl.hidden = false;
    nameInput.focus();
  }

  _hideEditView() {
    if (!this._editEl || !this._listEl) return;
    this._editEl.hidden = true;
    this._listEl.hidden = false;
    document.querySelector('.prompt-library-toolbar')?.classList.remove('hidden');
    this._editingId = null;
  }

  async _saveFromEditView() {
    const nameInput = document.getElementById('promptEditName');
    const categorySelect = document.getElementById('promptEditCategory');
    const tagsInput = document.getElementById('promptEditTags');
    const textArea = document.getElementById('promptEditText');

    const name = nameInput?.value.trim();
    const text = textArea?.value.trim();

    if (!name || !text) {
      nameInput?.classList.toggle('input-error', !name);
      textArea?.classList.toggle('input-error', !text);
      return;
    }

    const tags = (tagsInput?.value || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const record = {
      id: this._editingId || crypto.randomUUID(),
      name,
      category: categorySelect?.value || 'transcription',
      text,
      tags
    };

    // Preserve built-in fields if editing existing
    if (this._editingId) {
      const existing = await storage.getPrompt(this._editingId);
      if (existing) {
        record.isBuiltIn = existing.isBuiltIn || false;
        record.sourceProfileId = existing.sourceProfileId || null;
        record.createdAt = existing.createdAt;
      }
    }

    await storage.savePrompt(record);
    this._hideEditView();
    await this._renderTable();
  }

  // ===========================================================================
  // Duplicate / Delete
  // ===========================================================================

  async _duplicatePrompt(id) {
    const original = await storage.getPrompt(id);
    if (!original) return;

    await storage.savePrompt({
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      category: original.category,
      text: original.text,
      tags: [...(original.tags || [])],
      isBuiltIn: false,
      sourceProfileId: null
    });

    await this._renderTable();
  }

  async _deletePrompt(id) {
    const prompt = await storage.getPrompt(id);
    if (!prompt || prompt.isBuiltIn) return;

    if (!confirm(`Delete prompt "${prompt.name}"?`)) return;

    await storage.deletePrompt(id);
    await this._renderTable();
  }

  // ===========================================================================
  // Picker popup (for "Load from Library" buttons)
  // ===========================================================================

  async showPicker(category, targetTextarea) {
    let prompts;
    try {
      prompts = await storage.listPrompts(category);
    } catch {
      return;
    }

    if (prompts.length === 0) {
      this._showToast('No prompts found for this category. Open the Prompt Library to create one.', 'info');
      return;
    }

    // Remove any existing picker
    this._closePicker();

    const popup = document.createElement('div');
    popup.className = 'prompt-picker-popup';
    popup.innerHTML = `
      <div class="prompt-picker-header">Select Prompt</div>
      ${prompts.map(p => `
        <div class="prompt-picker-item" data-id="${p.id}">
          <span class="prompt-picker-name">${this._esc(p.name)}</span>
        </div>
      `).join('')}
    `;

    popup.addEventListener('click', async (e) => {
      const item = e.target.closest('.prompt-picker-item');
      if (!item) return;

      const promptData = await storage.getPrompt(item.dataset.id);
      if (promptData && targetTextarea) {
        const textarea = typeof targetTextarea === 'string'
          ? document.getElementById(targetTextarea)
          : targetTextarea;
        if (textarea) {
          textarea.value = promptData.text;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      this._closePicker();
    });

    // Position near the textarea
    const textarea = typeof targetTextarea === 'string'
      ? document.getElementById(targetTextarea)
      : targetTextarea;
    if (textarea) {
      const rect = textarea.getBoundingClientRect();
      popup.style.position = 'fixed';
      popup.style.top = `${rect.top}px`;
      popup.style.left = `${rect.right + 8}px`;

      // If off-screen right, show on left side
      if (rect.right + 300 > window.innerWidth) {
        popup.style.left = `${Math.max(8, rect.left - 300)}px`;
      }
      // If off-screen bottom, adjust
      if (rect.top + 260 > window.innerHeight) {
        popup.style.top = `${Math.max(8, window.innerHeight - 260)}px`;
      }
    }

    document.body.appendChild(popup);

    // Close on outside click (next tick)
    requestAnimationFrame(() => {
      const handler = (e) => {
        if (!popup.contains(e.target)) {
          this._closePicker();
          document.removeEventListener('click', handler, true);
        }
      };
      document.addEventListener('click', handler, true);
      popup._outsideHandler = handler;
    });
  }

  _closePicker() {
    const existing = document.querySelector('.prompt-picker-popup');
    if (existing) {
      if (existing._outsideHandler) {
        document.removeEventListener('click', existing._outsideHandler, true);
      }
      existing.remove();
    }
  }

  // ===========================================================================
  // Save to Library (from workflow textareas)
  // ===========================================================================

  async saveToLibrary(category, textareaId) {
    const textarea = document.getElementById(textareaId);
    const text = textarea?.value?.trim();
    if (!text) {
      this._showToast('Textarea is empty -- nothing to save.', 'warning');
      return;
    }

    const name = prompt('Name for this prompt:');
    if (!name?.trim()) return;

    await storage.savePrompt({
      id: crypto.randomUUID(),
      name: name.trim(),
      category,
      text,
      tags: [],
      isBuiltIn: false,
      sourceProfileId: null
    });

    this._showToast(`Prompt "${name.trim()}" saved to library.`, 'success');
  }

  // ===========================================================================
  // Workflow button bindings
  // ===========================================================================

  _bindWorkflowButtons() {
    // Stage 1 (Transcription)
    document.getElementById('loadLibraryStage1')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPicker('transcription', 'promptOverrideStage1');
    });
    document.getElementById('saveLibraryStage1')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveToLibrary('transcription', 'promptOverrideStage1');
    });

    // Description
    document.getElementById('loadLibraryDescription')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPicker('description', 'descriptionPrompt');
    });
    document.getElementById('saveLibraryDescription')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveToLibrary('description', 'descriptionPrompt');
    });

    // Custom Validation Prompt (LLM Review)
    document.getElementById('loadLibraryValidation')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPicker('validation', 'customValidationPrompt');
    });
    document.getElementById('saveLibraryValidation')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveToLibrary('validation', 'customValidationPrompt');
    });

    // Stage 2 (Paleographic)
    document.getElementById('loadLibraryStage2')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPicker('stage2', 'promptOverrideStage2');
    });
    document.getElementById('saveLibraryStage2')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveToLibrary('stage2', 'promptOverrideStage2');
    });

    // Stage 3 (Philological)
    document.getElementById('loadLibraryStage3')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPicker('stage3', 'promptOverrideStage3');
    });
    document.getElementById('saveLibraryStage3')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveToLibrary('stage3', 'promptOverrideStage3');
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  _showToast(message, type = 'info') {
    dialogManager.showToast(message, type);
  }
}

export const promptLibraryManager = new PromptLibraryManager();
