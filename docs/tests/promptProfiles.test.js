/**
 * Prompt Profiles Tests
 *
 * Guards against accidental prompt corruption: missing placeholders,
 * removed profiles, broken lookup functions.
 */

import { describe, it, expect } from 'vitest';
import {
    PROMPT_PROFILES,
    PROMPT_STAGES,
    DEFAULT_PROMPT_PROFILE_ID,
    getPromptProfileById,
    listPromptProfiles
} from '../js/config/promptProfiles.js';

describe('Prompt Profiles', () => {

    // ====================================================================
    // Constants
    // ====================================================================
    describe('constants', () => {
        it('should define three stages', () => {
            expect(PROMPT_STAGES.STAGE1).toBe('stage1');
            expect(PROMPT_STAGES.STAGE2).toBe('stage2');
            expect(PROMPT_STAGES.STAGE3).toBe('stage3');
        });

        it('should set generic_default as the default profile ID', () => {
            expect(DEFAULT_PROMPT_PROFILE_ID).toBe('generic_default');
        });

        it('should have PROMPT_STAGES frozen', () => {
            expect(Object.isFrozen(PROMPT_STAGES)).toBe(true);
        });

        it('should have PROMPT_PROFILES frozen', () => {
            expect(Object.isFrozen(PROMPT_PROFILES)).toBe(true);
        });
    });

    // ====================================================================
    // Profile catalog
    // ====================================================================
    describe('profile catalog', () => {
        it('should contain exactly 4 profiles', () => {
            expect(PROMPT_PROFILES).toHaveLength(4);
        });

        it('should include generic_default profile', () => {
            expect(PROMPT_PROFILES.some(p => p.id === 'generic_default')).toBe(true);
        });

        it('should include medieval_latin_manuscript profile', () => {
            expect(PROMPT_PROFILES.some(p => p.id === 'medieval_latin_manuscript')).toBe(true);
        });

        it('should include early_modern_letter profile', () => {
            expect(PROMPT_PROFILES.some(p => p.id === 'early_modern_letter')).toBe(true);
        });

        it('should include liturgical_chant_normalized profile', () => {
            expect(PROMPT_PROFILES.some(p => p.id === 'liturgical_chant_normalized')).toBe(true);
        });

        it('should have unique IDs', () => {
            const ids = PROMPT_PROFILES.map(p => p.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });

    // ====================================================================
    // Profile structure
    // ====================================================================
    describe('profile structure', () => {
        PROMPT_PROFILES.forEach(profile => {
            describe(`profile: ${profile.id}`, () => {
                it('should have id, label, and description', () => {
                    expect(typeof profile.id).toBe('string');
                    expect(profile.id.length).toBeGreaterThan(0);
                    expect(typeof profile.label).toBe('string');
                    expect(profile.label.length).toBeGreaterThan(0);
                    expect(typeof profile.description).toBe('string');
                    expect(profile.description.length).toBeGreaterThan(0);
                });

                it('should have all three stage prompts', () => {
                    expect(typeof profile.prompts.stage1).toBe('string');
                    expect(typeof profile.prompts.stage2).toBe('string');
                    expect(typeof profile.prompts.stage3).toBe('string');
                });

                it('stage1 should contain {context_block} placeholder', () => {
                    expect(profile.prompts.stage1).toContain('{context_block}');
                });

                it('stage1 should contain {script_hints} placeholder', () => {
                    expect(profile.prompts.stage1).toContain('{script_hints}');
                });

                it('stage2 should contain {text} placeholder', () => {
                    expect(profile.prompts.stage2).toContain('{text}');
                });

                it('stage2 should contain {context} placeholder', () => {
                    expect(profile.prompts.stage2).toContain('{context}');
                });

                it('stage3 should contain {text} placeholder', () => {
                    expect(profile.prompts.stage3).toContain('{text}');
                });

                it('stage3 should contain {context} placeholder', () => {
                    expect(profile.prompts.stage3).toContain('{context}');
                });

                it('stage3 should contain {previous_issues} placeholder', () => {
                    expect(profile.prompts.stage3).toContain('{previous_issues}');
                });

                it('stage1 should not contain stage2/stage3 placeholders', () => {
                    expect(profile.prompts.stage1).not.toContain('{text}');
                    expect(profile.prompts.stage1).not.toContain('{previous_issues}');
                });
            });
        });
    });

    // ====================================================================
    // getPromptProfileById
    // ====================================================================
    describe('getPromptProfileById', () => {
        it('should return profile for valid ID', () => {
            const profile = getPromptProfileById('generic_default');
            expect(profile).not.toBeNull();
            expect(profile.id).toBe('generic_default');
        });

        it('should return correct profile for medieval_latin_manuscript', () => {
            const profile = getPromptProfileById('medieval_latin_manuscript');
            expect(profile).not.toBeNull();
            expect(profile.label).toBe('Medieval Latin Manuscript');
        });

        it('should return correct profile for early_modern_letter', () => {
            const profile = getPromptProfileById('early_modern_letter');
            expect(profile).not.toBeNull();
            expect(profile.label).toBe('Early Modern Letter');
        });

        it('should return null for unknown ID', () => {
            expect(getPromptProfileById('nonexistent')).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(getPromptProfileById('')).toBeNull();
        });

        it('should return null for null', () => {
            expect(getPromptProfileById(null)).toBeNull();
        });

        it('should return null for undefined', () => {
            expect(getPromptProfileById(undefined)).toBeNull();
        });

        it('should return null for non-string type', () => {
            expect(getPromptProfileById(42)).toBeNull();
        });
    });

    // ====================================================================
    // listPromptProfiles
    // ====================================================================
    describe('listPromptProfiles', () => {
        it('should return array with same length as PROMPT_PROFILES', () => {
            const list = listPromptProfiles();
            expect(list).toHaveLength(PROMPT_PROFILES.length);
        });

        it('should include id, label, description on each entry', () => {
            const list = listPromptProfiles();
            list.forEach(entry => {
                expect(entry).toHaveProperty('id');
                expect(entry).toHaveProperty('label');
                expect(entry).toHaveProperty('description');
            });
        });

        it('should not expose prompt text', () => {
            const list = listPromptProfiles();
            list.forEach(entry => {
                expect(entry).not.toHaveProperty('prompts');
            });
        });

        it('should preserve ordering', () => {
            const list = listPromptProfiles();
            expect(list[0].id).toBe(PROMPT_PROFILES[0].id);
            expect(list[list.length - 1].id).toBe(PROMPT_PROFILES[PROMPT_PROFILES.length - 1].id);
        });
    });
});
