/**
 * Thinking Analysis Component
 *
 * 3-screen wizard for analyzing LLM reasoning and generating optimized prompts:
 *   Screen 1: Capture summary (prompt, thinking, result)
 *   Screen 2: LLM analysis of reasoning + scholar feedback
 *   Screen 3: Optimized prompt + save to Prompt Library
 *
 * Design principle: Human-in-the-Loop at every step.
 * Exactly 2 additional LLM calls per cycle (text-only, no image = cost-effective).
 */

import { llmService } from '../services/llm.js';
import { storage } from '../services/storage.js';
import { appState } from '../state.js';
import { thinkingPanel } from './thinking.js';
import { transcriptionManager } from './transcription.js';
import { descriptionManager } from './description.js';
import { validationPanel } from './validation.js';
import { dialogManager } from './dialogs.js';

// ============================================
// Meta-Prompts
// ============================================

const ANALYSIS_META_PROMPT = `You are a meta-cognitive analyst specializing in OCR/HTR reasoning evaluation.

CONTEXT: A language model performed "{operation}" on a historical manuscript image.

ORIGINAL PROMPT GIVEN TO THE MODEL:
---
{prompt}
---

THE MODEL'S THINKING/REASONING TRACE:
---
{thinking}
---

THE MODEL'S FINAL OUTPUT:
---
{result}
---

TASK: Analyze the model's reasoning quality. Evaluate:

1. REASONING STRUCTURE
   - Systematic approach? (line-by-line, left-to-right)
   - Alternatives considered for ambiguous readings?
   - Confident vs uncertain readings distinguished?

2. DOMAIN AWARENESS
   - Script-specific letter confusions addressed?
   - Abbreviation marks and expansions considered?
   - Ligatures and special characters handled?

3. PROMPT ADHERENCE
   - Instructions followed or ignored?
   - Output format as requested?

4. GAPS
   - Aspects not discussed in thinking?
   - Difficult sections skipped?

5. STRENGTHS
   - What worked well?
   - Most effective reasoning strategies?

FORMAT: Use the 5 sections above. Cite specific examples from the thinking trace. Be concise. Write for a paleography scholar.`;

const OPTIMIZE_META_PROMPT = `You are a prompt engineering specialist for historical document OCR/HTR.

TASK: Improve the original prompt based on the analysis and scholar feedback.

ORIGINAL PROMPT:
---
{original_prompt}
---

REASONING ANALYSIS:
---
{analysis}
---

SCHOLAR'S FEEDBACK:
---
{scholar_feedback}
---

OPERATION: {operation}

RULES:
1. Preserve structure (task, rules, output format).
2. Add instructions addressing identified GAPS.
3. Incorporate scholar feedback as concrete instructions.
4. Don't repeat what already works well.
5. Keep concise.
6. Preserve placeholders: {context_block}, {script_hints}, {text}, {context}, {previous_issues}.
7. Use imperative language.

Return ONLY the improved prompt text. No commentary.`;

// ============================================
// ThinkingAnalysisManager
// ============================================

class ThinkingAnalysisManager {
    constructor() {
        this._dialog = null;
        this._currentStep = 1;
        this._capture = null;
        this._analysisResult = null;
        this._isRunning = false;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        this._dialog = document.getElementById('thinkingAnalysisDialog');
        if (!this._dialog) {
            console.warn('[ThinkingAnalysis] Dialog element not found');
            return;
        }

        this._bindEvents();
    }

    _bindEvents() {
        // Analyze button in thinking header
        const analyzeBtn = document.getElementById('thinkingAnalyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.open());
        }

        // Close dialog
        const closeBtn = this._dialog.querySelector('[data-close-dialog]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this._dialog.close());
        }

        // Backdrop click closes dialog
        this._dialog.addEventListener('click', (e) => {
            if (e.target === this._dialog) this._dialog.close();
        });

        // Step 1 actions
        document.getElementById('analysisRunBtn')
            ?.addEventListener('click', () => this._runAnalysis());

        // Step 2 actions
        document.getElementById('analysisBackTo1')
            ?.addEventListener('click', () => this._showStep(1));
        document.getElementById('analysisOptimizeBtn')
            ?.addEventListener('click', () => this._runOptimization());

        // Step 3 actions
        document.getElementById('analysisBackTo2')
            ?.addEventListener('click', () => this._showStep(2));
        document.getElementById('analysisSaveBtn')
            ?.addEventListener('click', () => this._savePrompt());
    }

    // ============================================
    // Open Dialog
    // ============================================

    open() {
        if (!this._dialog) return;

        const meta = thinkingPanel.getCaptureMetadata();
        const thinkingText = thinkingPanel.getAccumulatedThinking();

        if (!thinkingText && !this._getResultText()) {
            dialogManager.showToast('No thinking data to analyze.', 'info');
            return;
        }

        this._capture = {
            operation: meta.operation || 'unknown',
            provider: meta.provider || llmService.activeProvider,
            model: meta.model || llmService.getCurrentModel(),
            prompt: this._getResolvedPrompt(),
            thinkingText,
            resultText: this._getResultText(),
            duration: thinkingPanel.getLastDuration()
        };

        appState.captureThinking(this._capture);
        this._analysisResult = null;
        this._populateStep1();
        this._showStep(1);
        this._dialog.showModal();
    }

    // ============================================
    // Step Navigation
    // ============================================

    _showStep(n) {
        this._currentStep = n;

        // Hide all panels
        const panels = ['analysisStep1', 'analysisStep2', 'analysisStep3'];
        panels.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.hidden = true;
        });

        // Show target panel
        const targetPanel = document.getElementById(`analysisStep${n}`);
        if (targetPanel) targetPanel.hidden = false;

        // Update step indicators
        const steps = document.querySelectorAll('#analysisSteps .analysis-step');
        steps.forEach(step => {
            const stepNum = parseInt(step.dataset.step, 10);
            step.classList.remove('active', 'done');
            if (stepNum === n) {
                step.classList.add('active');
            } else if (stepNum < n) {
                step.classList.add('done');
            }
        });
    }

    // ============================================
    // Step 1: Populate Capture Summary
    // ============================================

    _populateStep1() {
        if (!this._capture) return;

        const operationLabels = {
            transcription: 'Transcription',
            description: 'Description',
            validation: 'LLM Review'
        };

        // Meta badges
        const metaEl = document.getElementById('analysisMeta');
        if (metaEl) {
            const label = operationLabels[this._capture.operation] || this._capture.operation;
            const duration = this._capture.duration
                ? `${(this._capture.duration / 1000).toFixed(1)}s`
                : '';
            metaEl.innerHTML = [
                `<span>${label}</span>`,
                `<span>${this._escape(this._capture.provider)}</span>`,
                `<span>${this._escape(this._capture.model)}</span>`,
                duration ? `<span>${duration}</span>` : ''
            ].filter(Boolean).join('');
        }

        // Prompt
        const promptEl = document.getElementById('analysisCapturedPrompt');
        const promptLenEl = document.getElementById('analysisPromptLen');
        if (promptEl) promptEl.textContent = this._capture.prompt || '(no prompt captured)';
        if (promptLenEl) promptLenEl.textContent = (this._capture.prompt || '').length;

        // Thinking
        const thinkingEl = document.getElementById('analysisCapturedThinking');
        const thinkingLenEl = document.getElementById('analysisThinkingLen');
        if (thinkingEl) thinkingEl.textContent = this._capture.thinkingText || '(no thinking data)';
        if (thinkingLenEl) thinkingLenEl.textContent = (this._capture.thinkingText || '').length;

        // Result
        const resultEl = document.getElementById('analysisCapturedResult');
        const resultLenEl = document.getElementById('analysisResultLen');
        if (resultEl) resultEl.textContent = this._capture.resultText || '(no result)';
        if (resultLenEl) resultLenEl.textContent = (this._capture.resultText || '').length;
    }

    // ============================================
    // Step 2: Run Analysis
    // ============================================

    async _runAnalysis() {
        if (this._isRunning || !this._capture) return;
        this._isRunning = true;

        const loadingEl = document.getElementById('analysisLoading');
        const resultEl = document.getElementById('analysisResultContent');
        const runBtn = document.getElementById('analysisRunBtn');

        if (runBtn) runBtn.disabled = true;
        if (loadingEl) loadingEl.hidden = false;
        if (resultEl) resultEl.textContent = '';

        // Show step 2 immediately with loading
        this._showStep(2);

        try {
            const metaPrompt = this._buildAnalysisPrompt();
            const result = await llmService.textQuery(metaPrompt);
            this._analysisResult = result;

            if (resultEl) resultEl.textContent = result;
        } catch (err) {
            dialogManager.showToast(`Analysis failed: ${err.message}`, 'error');
            // Go back to step 1 on failure
            this._showStep(1);
        } finally {
            this._isRunning = false;
            if (runBtn) runBtn.disabled = false;
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    // ============================================
    // Step 3: Run Optimization
    // ============================================

    async _runOptimization() {
        if (this._isRunning || !this._analysisResult) return;
        this._isRunning = true;

        const loadingEl = document.getElementById('optimizeLoading');
        const textareaEl = document.getElementById('optimizedPromptText');
        const originalEl = document.getElementById('analysisOriginalForDiff');
        const optimizeBtn = document.getElementById('analysisOptimizeBtn');

        if (optimizeBtn) optimizeBtn.disabled = true;
        if (loadingEl) loadingEl.hidden = false;
        if (textareaEl) textareaEl.value = '';

        // Show step 3 immediately with loading
        this._showStep(3);

        try {
            const metaPrompt = this._buildOptimizationPrompt();
            const result = await llmService.textQuery(metaPrompt);

            if (textareaEl) textareaEl.value = result;
            if (originalEl) originalEl.textContent = this._capture.prompt || '';

            // Pre-fill save fields
            this._prefillSaveFields();
        } catch (err) {
            dialogManager.showToast(`Optimization failed: ${err.message}`, 'error');
            // Go back to step 2 on failure
            this._showStep(2);
        } finally {
            this._isRunning = false;
            if (optimizeBtn) optimizeBtn.disabled = false;
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    // ============================================
    // Save to Prompt Library
    // ============================================

    async _savePrompt() {
        const nameEl = document.getElementById('analysisPromptName');
        const categoryEl = document.getElementById('analysisPromptCategory');
        const tagsEl = document.getElementById('analysisPromptTags');
        const textEl = document.getElementById('optimizedPromptText');

        const name = nameEl?.value?.trim();
        const category = categoryEl?.value;
        const tags = tagsEl?.value?.trim();
        const text = textEl?.value?.trim();

        if (!name) {
            dialogManager.showToast('Please enter a name for the prompt.', 'warning');
            if (nameEl) nameEl.focus();
            return;
        }
        if (!text) {
            dialogManager.showToast('Prompt text is empty.', 'warning');
            return;
        }

        try {
            const promptRecord = {
                id: crypto.randomUUID(),
                name,
                category,
                tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                text,
                source: 'thinking-analysis',
                sourceOperation: this._capture?.operation || '',
                sourceProvider: this._capture?.provider || '',
                sourceModel: this._capture?.model || ''
            };

            await storage.savePrompt(promptRecord);
            dialogManager.showToast(`Prompt "${name}" saved to library.`, 'success');
            this._dialog.close();

            // Clear capture
            appState.clearThinkingCapture();
        } catch (err) {
            dialogManager.showToast(`Save failed: ${err.message}`, 'error');
        }
    }

    // ============================================
    // Prompt Building
    // ============================================

    _buildAnalysisPrompt() {
        return ANALYSIS_META_PROMPT
            .replace('{operation}', this._capture.operation || 'unknown')
            .replace('{prompt}', this._truncate(this._capture.prompt, 4000))
            .replace('{thinking}', this._truncate(this._capture.thinkingText, 8000))
            .replace('{result}', this._truncate(this._capture.resultText, 4000));
    }

    _buildOptimizationPrompt() {
        const scholarFeedback = document.getElementById('scholarFeedback')?.value?.trim()
            || '(no additional feedback)';

        return OPTIMIZE_META_PROMPT
            .replace('{original_prompt}', this._truncate(this._capture.prompt, 4000))
            .replace('{analysis}', this._truncate(this._analysisResult, 4000))
            .replace('{scholar_feedback}', scholarFeedback)
            .replace('{operation}', this._capture.operation || 'unknown');
    }

    // ============================================
    // Helpers
    // ============================================

    _truncate(text, maxChars = 8000) {
        if (!text || text.length <= maxChars) return text || '';
        const half = Math.floor(maxChars / 2);
        return text.slice(0, half)
            + `\n\n[... ${text.length - maxChars} characters truncated ...]\n\n`
            + text.slice(-half);
    }

    _getResultText() {
        const meta = thinkingPanel.getCaptureMetadata();
        const state = appState.getState();

        switch (meta.operation) {
            case 'transcription':
                return state.transcription?.raw || '';
            case 'description':
                return state.description?.raw || '';
            case 'validation':
                return state.validation?.llmJudge?.raw || '';
            default:
                return '';
        }
    }

    _getResolvedPrompt() {
        const meta = thinkingPanel.getCaptureMetadata();

        switch (meta.operation) {
            case 'transcription':
                return transcriptionManager.getLastResolvedPrompt();
            case 'description':
                return descriptionManager.getLastResolvedPrompt();
            case 'validation':
                return validationPanel.getLastResolvedPrompt();
            default:
                return llmService._lastResolvedPrompt || '';
        }
    }

    _prefillSaveFields() {
        const operationLabels = {
            transcription: 'Transcription',
            description: 'Description',
            validation: 'LLM Review'
        };

        const nameEl = document.getElementById('analysisPromptName');
        const categoryEl = document.getElementById('analysisPromptCategory');

        if (nameEl && this._capture) {
            const label = operationLabels[this._capture.operation] || this._capture.operation;
            nameEl.value = `${label} (optimized)`;
        }

        // Map operation to category
        if (categoryEl && this._capture) {
            const categoryMap = {
                transcription: 'transcription',
                description: 'description',
                validation: 'validation'
            };
            categoryEl.value = categoryMap[this._capture.operation] || 'transcription';
        }
    }

    /**
     * Minimal HTML escaping for meta badges
     */
    _escape(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

export const thinkingAnalysisManager = new ThinkingAnalysisManager();
