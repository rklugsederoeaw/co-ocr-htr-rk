/**
 * Tests for BM25 integration in ValidationEngine
 *
 * Tests the BM25-specific methods added to ValidationEngine:
 * - _extractQueryTerms
 * - _deduplicateHits
 * - _formatReferenceContext
 * - validate() reference context integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationEngine } from '../js/services/validation.js';

// Mock LLM service
vi.mock('../js/services/llm.js', () => ({
    llmService: {
        hasApiKey: vi.fn(() => false),
        validate: vi.fn()
    },
    ISSUE_TYPES: {}
}));

// Mock postprocess
vi.mock('../js/services/postprocess.js', () => ({
    runPostprocessing: vi.fn()
}));

// Mock constants
vi.mock('../js/utils/constants.js', () => ({
    FEATURE_FLAGS: {
        postprocessPipelineV1: false
    }
}));

// Mock bm25Service
vi.mock('../js/services/bm25.js', () => ({
    bm25Service: {
        isReady: vi.fn(() => false),
        isBuilding: vi.fn(() => false),
        searchMultiple: vi.fn(() => Promise.resolve({}))
    }
}));

import { bm25Service } from '../js/services/bm25.js';
import { llmService } from '../js/services/llm.js';

describe('ValidationEngine - BM25 Integration', () => {
    let engine;

    beforeEach(() => {
        engine = new ValidationEngine();
        vi.clearAllMocks();
    });

    // =========================================
    // _extractQueryTerms
    // =========================================

    describe('_extractQueryTerms', () => {
        it('should extract words from flagged lines when rules matched', () => {
            const text = 'First line of text\nSecond line with dominus\nThird line here';
            const ruleResults = [
                {
                    passed: true,
                    lines: [2], // line 2 is flagged
                    matches: ['dominus']
                }
            ];

            const terms = engine._extractQueryTerms(text, ruleResults);

            expect(terms).toContain('Second');
            expect(terms).toContain('line');
            expect(terms).toContain('with');
            expect(terms).toContain('dominus');
            // Should NOT contain words from unflagged lines (in targeted mode)
            expect(terms).not.toContain('First');
            expect(terms).not.toContain('Third');
        });

        it('should fall back to all lines when no rules matched', () => {
            const text = 'Alpha beta gamma\nDelta epsilon zeta';
            const ruleResults = [
                { passed: false, lines: [], matches: [] }
            ];

            const terms = engine._extractQueryTerms(text, ruleResults);

            // Broad fallback requires word.length > 3
            expect(terms).toContain('Alpha');
            expect(terms).toContain('beta');
            expect(terms).toContain('gamma');
            expect(terms).toContain('Delta');
        });

        it('should strip punctuation from terms', () => {
            const text = 'Hello, world! "dominus" (ecclesia)';
            const ruleResults = [
                { passed: true, lines: [1], matches: ['test'] }
            ];

            const terms = engine._extractQueryTerms(text, ruleResults);

            expect(terms).toContain('Hello');
            expect(terms).toContain('world');
            expect(terms).toContain('dominus');
            expect(terms).toContain('ecclesia');
            // Should not contain punctuation artifacts
            expect(terms.every(t => !/[.,;:!?'"()[\]{}]/.test(t))).toBe(true);
        });

        it('should limit to 50 terms', () => {
            // Generate many words
            const words = Array.from({ length: 100 }, (_, i) => `word${i}longterm`);
            const text = words.join(' ');
            const ruleResults = [{ passed: false, lines: [], matches: [] }];

            const terms = engine._extractQueryTerms(text, ruleResults);

            expect(terms.length).toBeLessThanOrEqual(50);
        });

        it('should filter out single-character terms', () => {
            const text = 'A B C dominus in ecclesia';
            const ruleResults = [
                { passed: true, lines: [1], matches: ['test'] }
            ];

            const terms = engine._extractQueryTerms(text, ruleResults);

            // Single chars should be filtered (length > 1 check)
            expect(terms).not.toContain('A');
            expect(terms).not.toContain('B');
        });

        it('should return empty array for empty text', () => {
            const terms = engine._extractQueryTerms('', []);
            expect(terms).toHaveLength(0);
        });
    });

    // =========================================
    // _deduplicateHits
    // =========================================

    describe('_deduplicateHits', () => {
        it('should deduplicate hits with same term+definition', () => {
            const multiResults = {
                dominus: [
                    { term: 'dominus', definition: 'lord', score: 5 },
                    { term: 'ecclesia', definition: 'church', score: 3 }
                ],
                lord: [
                    { term: 'dominus', definition: 'lord', score: 4 }, // duplicate
                    { term: 'rex', definition: 'king', score: 2 }
                ]
            };

            const hits = engine._deduplicateHits(multiResults);

            expect(hits).toHaveLength(3);
            expect(hits.filter(h => h.term === 'dominus')).toHaveLength(1);
        });

        it('should sort by score descending', () => {
            const multiResults = {
                q1: [
                    { term: 'a', definition: 'low', score: 1 },
                    { term: 'b', definition: 'high', score: 10 }
                ],
                q2: [
                    { term: 'c', definition: 'mid', score: 5 }
                ]
            };

            const hits = engine._deduplicateHits(multiResults);

            expect(hits[0].score).toBe(10);
            expect(hits[1].score).toBe(5);
            expect(hits[2].score).toBe(1);
        });

        it('should handle empty results', () => {
            const hits = engine._deduplicateHits({});
            expect(hits).toHaveLength(0);
        });

        it('should treat different definitions of same term as distinct', () => {
            const multiResults = {
                q1: [
                    { term: 'liber', definition: 'book', score: 5 },
                    { term: 'liber', definition: 'free', score: 3 }
                ]
            };

            const hits = engine._deduplicateHits(multiResults);
            expect(hits).toHaveLength(2);
        });
    });

    // =========================================
    // _formatReferenceContext
    // =========================================

    describe('_formatReferenceContext', () => {
        it('should format hits as structured prompt context', () => {
            const hits = [
                { term: 'dominus', definition: 'lord', source: 'Glossary A' },
                { term: 'ecclesia', definition: 'church', source: 'Glossary A' },
                { term: 'rex', definition: 'king', source: 'Glossary B' }
            ];

            const context = engine._formatReferenceContext(hits);

            expect(context).toContain('## REFERENCE DATA');
            expect(context).toContain('"dominus" -> lord');
            expect(context).toContain('"ecclesia" -> church');
            expect(context).toContain('"rex" -> king');
            expect(context).toContain('Source: Glossary A');
            expect(context).toContain('Source: Glossary B');
            expect(context).toContain('---');
        });

        it('should return empty string for no hits', () => {
            const context = engine._formatReferenceContext([]);
            expect(context).toBe('');
        });

        it('should limit entries to maxEntries', () => {
            const hits = Array.from({ length: 50 }, (_, i) => ({
                term: `word${i}`,
                definition: `def${i}`,
                source: 'Test'
            }));

            const context = engine._formatReferenceContext(hits, { maxEntries: 5 });

            // Should only contain 5 entries
            const termMatches = context.match(/"word\d+" ->/g);
            expect(termMatches).toHaveLength(5);
        });

        it('should group entries by source', () => {
            const hits = [
                { term: 'a', definition: 'x', source: 'Source1' },
                { term: 'b', definition: 'y', source: 'Source2' },
                { term: 'c', definition: 'z', source: 'Source1' }
            ];

            const context = engine._formatReferenceContext(hits);

            // Source1 should appear before Source2 (insertion order)
            const idx1 = context.indexOf('Source: Source1');
            const idx2 = context.indexOf('Source: Source2');
            expect(idx1).toBeLessThan(idx2);
        });

        it('should use fallback source name when missing', () => {
            const hits = [
                { term: 'test', definition: 'val', collectionId: 'col-1' }
            ];

            const context = engine._formatReferenceContext(hits);
            expect(context).toContain('Source: col-1');
        });

        it('should include usage instructions', () => {
            const hits = [{ term: 'test', definition: 'val', source: 'S' }];
            const context = engine._formatReferenceContext(hits);

            expect(context).toContain('verify or correct uncertain readings');
            expect(context).toContain('Do not assume');
            expect(context).toContain('cite its Source id');
        });
    });

    // =========================================
    // validate() integration
    // =========================================

    describe('validate() with BM25', () => {
        it('should call BM25 retrieval when service is ready and LLM is enabled', async () => {
            bm25Service.isReady.mockReturnValue(true);
            llmService.hasApiKey.mockReturnValue(true);
            bm25Service.searchMultiple.mockResolvedValue({
                dominus: [{ term: 'dominus', definition: 'lord', score: 5 }]
            });
            llmService.validate.mockResolvedValue({
                confidence: 'sure',
                reasoning: 'ok',
                issues: [],
                summary: 'ok'
            });

            const text = 'dominus ecclesia';
            const result = await engine.validate(text, [], {
                includeLLM: true,
                checkMarkers: false,
                checkStats: false,
                checkArtifacts: false
            });

            expect(bm25Service.searchMultiple).toHaveBeenCalled();
            expect(result.llmJudge).toBeDefined();
        });

        it('should skip BM25 retrieval when service is not ready', async () => {
            bm25Service.isReady.mockReturnValue(false);
            llmService.hasApiKey.mockReturnValue(true);
            llmService.validate.mockResolvedValue({
                confidence: 'sure',
                reasoning: 'ok',
                issues: [],
                summary: 'ok'
            });

            await engine.validate('test text', [], {
                includeLLM: true,
                checkMarkers: false,
                checkStats: false,
                checkArtifacts: false
            });

            expect(bm25Service.searchMultiple).not.toHaveBeenCalled();
        });

        it('should skip BM25 retrieval when LLM is disabled', async () => {
            bm25Service.isReady.mockReturnValue(true);

            await engine.validate('test text', [], {
                includeLLM: false
            });

            expect(bm25Service.searchMultiple).not.toHaveBeenCalled();
        });

        it('should pass reference context to validateWithLLM', async () => {
            bm25Service.isReady.mockReturnValue(true);
            llmService.hasApiKey.mockReturnValue(true);
            bm25Service.searchMultiple.mockResolvedValue({
                dominus: [{ term: 'dominus', definition: 'lord', source: 'Test', score: 5 }]
            });
            llmService.validate.mockResolvedValue({
                confidence: 'sure',
                reasoning: 'ok',
                issues: [],
                summary: 'ok'
            });

            await engine.validate('dominus test', [], {
                includeLLM: true,
                checkMarkers: false,
                checkStats: false,
                checkArtifacts: false
            });

            // The validate call should receive enriched text with reference context
            const callArg = llmService.validate.mock.calls[0][0];
            expect(callArg).toContain('## REFERENCE DATA');
            expect(callArg).toContain('"dominus" -> lord');
            expect(callArg).toContain('TRANSCRIPTION TO VALIDATE'); // clear section separator
            expect(callArg).toContain('dominus test'); // original text still present
        });
    });
});
