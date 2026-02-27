/**
 * DOM Utility Tests
 *
 * Verifies null-safe DOM helpers from utils/dom.js.
 * All functions must be safe to call with missing elements.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getById,
    select,
    selectAll,
    withElement,
    onById,
    on,
    onAll,
    toggleVisibility,
    show,
    hide,
    toggleClass,
    addClass,
    removeClass,
    setText,
    setHTML,
    setDisabled,
    createSVGElement,
    clearChildren,
    focusDelayed
} from '../js/utils/dom.js';

beforeEach(() => {
    document.body.innerHTML = `
        <div id="container">
            <span id="label" class="text">Hello</span>
            <button id="btn" class="primary" disabled>Click</button>
            <input id="input" type="text" value="test" />
            <ul id="list">
                <li class="item">A</li>
                <li class="item">B</li>
                <li class="item">C</li>
            </ul>
            <div id="hideable" hidden>Hidden content</div>
            <div id="parent">
                <span class="child">Child 1</span>
                <span class="child">Child 2</span>
            </div>
        </div>
    `;
});

// ========================================================================
// Selection helpers
// ========================================================================
describe('getById', () => {
    it('should return element when found', () => {
        const el = getById('label');
        expect(el).not.toBeNull();
        expect(el.tagName).toBe('SPAN');
    });

    it('should return null when not found', () => {
        expect(getById('nonexistent')).toBeNull();
    });
});

describe('select', () => {
    it('should select by CSS selector', () => {
        const el = select('#btn');
        expect(el).not.toBeNull();
        expect(el.tagName).toBe('BUTTON');
    });

    it('should select by class', () => {
        const el = select('.text');
        expect(el.id).toBe('label');
    });

    it('should scope to parent element', () => {
        const parent = getById('parent');
        const child = select('.child', parent);
        expect(child.textContent).toBe('Child 1');
    });

    it('should return null when nothing matches', () => {
        expect(select('.does-not-exist')).toBeNull();
    });
});

describe('selectAll', () => {
    it('should return all matching elements', () => {
        const items = selectAll('.item');
        expect(items).toHaveLength(3);
    });

    it('should return empty NodeList when nothing matches', () => {
        const items = selectAll('.nonexistent');
        expect(items).toHaveLength(0);
    });

    it('should scope to parent element', () => {
        const parent = getById('parent');
        const children = selectAll('.child', parent);
        expect(children).toHaveLength(2);
    });
});

// ========================================================================
// withElement
// ========================================================================
describe('withElement', () => {
    it('should call callback with element when found', () => {
        const callback = vi.fn();
        withElement('label', callback);
        expect(callback).toHaveBeenCalledOnce();
        expect(callback.mock.calls[0][0].id).toBe('label');
    });

    it('should not call callback when element not found', () => {
        const callback = vi.fn();
        withElement('nonexistent', callback);
        expect(callback).not.toHaveBeenCalled();
    });
});

// ========================================================================
// Event binding
// ========================================================================
describe('onById', () => {
    it('should bind event listener to existing element', () => {
        const handler = vi.fn();
        onById('label', 'click', handler);

        getById('label').click();
        expect(handler).toHaveBeenCalledOnce();
    });

    it('should not throw when element not found', () => {
        expect(() => onById('nonexistent', 'click', vi.fn())).not.toThrow();
    });
});

describe('on', () => {
    it('should bind event listener by selector', () => {
        const handler = vi.fn();
        on('.text', 'click', handler);

        getById('label').click();
        expect(handler).toHaveBeenCalledOnce();
    });

    it('should not throw when selector matches nothing', () => {
        expect(() => on('.nonexistent', 'click', vi.fn())).not.toThrow();
    });
});

describe('onAll', () => {
    it('should bind event to all matching elements', () => {
        const handler = vi.fn();
        onAll('.item', 'click', handler);

        const items = document.querySelectorAll('.item');
        items[0].click();
        items[2].click();
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should not throw when selector matches nothing', () => {
        expect(() => onAll('.nonexistent', 'click', vi.fn())).not.toThrow();
    });
});

// ========================================================================
// Visibility
// ========================================================================
describe('toggleVisibility', () => {
    it('should toggle hidden attribute when no explicit state', () => {
        const el = getById('label');
        expect(el.hidden).toBe(false);

        toggleVisibility(el);
        expect(el.hidden).toBe(true);

        toggleVisibility(el);
        expect(el.hidden).toBe(false);
    });

    it('should set hidden=false when show=true', () => {
        const el = getById('hideable');
        expect(el.hidden).toBe(true);

        toggleVisibility(el, true);
        expect(el.hidden).toBe(false);
    });

    it('should set hidden=true when show=false', () => {
        const el = getById('label');
        toggleVisibility(el, false);
        expect(el.hidden).toBe(true);
    });

    it('should accept string ID', () => {
        toggleVisibility('hideable', true);
        expect(getById('hideable').hidden).toBe(false);
    });

    it('should not throw for unknown ID', () => {
        expect(() => toggleVisibility('nonexistent', true)).not.toThrow();
    });
});

describe('show', () => {
    it('should remove hidden attribute', () => {
        const el = getById('hideable');
        expect(el.hidden).toBe(true);

        show(el);
        expect(el.hidden).toBe(false);
    });

    it('should accept string ID', () => {
        show('hideable');
        expect(getById('hideable').hidden).toBe(false);
    });
});

describe('hide', () => {
    it('should add hidden attribute', () => {
        const el = getById('label');
        expect(el.hidden).toBe(false);

        hide(el);
        expect(el.hidden).toBe(true);
    });

    it('should accept string ID', () => {
        hide('label');
        expect(getById('label').hidden).toBe(true);
    });
});

// ========================================================================
// Class manipulation
// ========================================================================
describe('toggleClass', () => {
    it('should toggle class on element', () => {
        const el = getById('label');
        expect(el.classList.contains('active')).toBe(false);

        toggleClass(el, 'active');
        expect(el.classList.contains('active')).toBe(true);

        toggleClass(el, 'active');
        expect(el.classList.contains('active')).toBe(false);
    });

    it('should force class on with force=true', () => {
        const el = getById('label');
        toggleClass(el, 'active', true);
        expect(el.classList.contains('active')).toBe(true);

        // Calling again with true should keep it
        toggleClass(el, 'active', true);
        expect(el.classList.contains('active')).toBe(true);
    });

    it('should force class off with force=false', () => {
        const el = getById('label');
        el.classList.add('active');

        toggleClass(el, 'active', false);
        expect(el.classList.contains('active')).toBe(false);
    });

    it('should accept string ID', () => {
        toggleClass('label', 'highlight');
        expect(getById('label').classList.contains('highlight')).toBe(true);
    });

    it('should not throw for unknown ID', () => {
        expect(() => toggleClass('nonexistent', 'active')).not.toThrow();
    });
});

describe('addClass', () => {
    it('should add a single class', () => {
        addClass('label', 'new-class');
        expect(getById('label').classList.contains('new-class')).toBe(true);
    });

    it('should add multiple classes', () => {
        addClass('label', 'a', 'b', 'c');
        const el = getById('label');
        expect(el.classList.contains('a')).toBe(true);
        expect(el.classList.contains('b')).toBe(true);
        expect(el.classList.contains('c')).toBe(true);
    });

    it('should accept element reference', () => {
        const el = getById('label');
        addClass(el, 'direct');
        expect(el.classList.contains('direct')).toBe(true);
    });

    it('should not throw for unknown ID', () => {
        expect(() => addClass('nonexistent', 'cls')).not.toThrow();
    });
});

describe('removeClass', () => {
    it('should remove a class', () => {
        const el = getById('label');
        expect(el.classList.contains('text')).toBe(true);

        removeClass('label', 'text');
        expect(el.classList.contains('text')).toBe(false);
    });

    it('should remove multiple classes', () => {
        const el = getById('btn');
        el.classList.add('extra');
        removeClass(el, 'primary', 'extra');
        expect(el.classList.contains('primary')).toBe(false);
        expect(el.classList.contains('extra')).toBe(false);
    });

    it('should not throw when class does not exist', () => {
        expect(() => removeClass('label', 'nonexistent-class')).not.toThrow();
    });

    it('should not throw for unknown ID', () => {
        expect(() => removeClass('nonexistent', 'cls')).not.toThrow();
    });
});

// ========================================================================
// Content manipulation
// ========================================================================
describe('setText', () => {
    it('should set text content by element', () => {
        const el = getById('label');
        setText(el, 'New text');
        expect(el.textContent).toBe('New text');
    });

    it('should set text content by ID', () => {
        setText('label', 'By ID');
        expect(getById('label').textContent).toBe('By ID');
    });

    it('should not throw for unknown ID', () => {
        expect(() => setText('nonexistent', 'text')).not.toThrow();
    });
});

describe('setHTML', () => {
    it('should set innerHTML by element', () => {
        const el = getById('label');
        setHTML(el, '<em>bold</em>');
        expect(el.innerHTML).toBe('<em>bold</em>');
    });

    it('should set innerHTML by ID', () => {
        setHTML('label', '<strong>strong</strong>');
        expect(getById('label').innerHTML).toBe('<strong>strong</strong>');
    });

    it('should not throw for unknown ID', () => {
        expect(() => setHTML('nonexistent', '<p>text</p>')).not.toThrow();
    });
});

describe('setDisabled', () => {
    it('should disable a button', () => {
        const btn = getById('btn');
        btn.disabled = false;

        setDisabled(btn, true);
        expect(btn.disabled).toBe(true);
    });

    it('should enable a button', () => {
        setDisabled('btn', false);
        expect(getById('btn').disabled).toBe(false);
    });

    it('should disable an input by ID', () => {
        setDisabled('input', true);
        expect(getById('input').disabled).toBe(true);
    });

    it('should not throw for unknown ID', () => {
        expect(() => setDisabled('nonexistent', true)).not.toThrow();
    });

    it('should not throw for element without disabled property', () => {
        // div does not have a native disabled property in jsdom
        // but 'disabled' in div may still be true for some DOM impls,
        // so we just verify no error is thrown
        expect(() => setDisabled('label', true)).not.toThrow();
    });
});

// ========================================================================
// SVG
// ========================================================================
describe('createSVGElement', () => {
    it('should create element with SVG namespace', () => {
        const svg = createSVGElement('svg');
        expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });

    it('should create circle element', () => {
        const circle = createSVGElement('circle');
        expect(circle.tagName).toBe('circle');
        expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
    });

    it('should create path element', () => {
        const path = createSVGElement('path');
        expect(path.tagName).toBe('path');
    });
});

// ========================================================================
// clearChildren
// ========================================================================
describe('clearChildren', () => {
    it('should remove all children by element', () => {
        const list = getById('list');
        expect(list.children.length).toBe(3);

        clearChildren(list);
        expect(list.children.length).toBe(0);
    });

    it('should remove all children by ID', () => {
        clearChildren('list');
        expect(getById('list').children.length).toBe(0);
    });

    it('should not throw for unknown ID', () => {
        expect(() => clearChildren('nonexistent')).not.toThrow();
    });

    it('should be safe on already-empty element', () => {
        clearChildren('list');
        expect(() => clearChildren('list')).not.toThrow();
    });
});

// ========================================================================
// focusDelayed
// ========================================================================
describe('focusDelayed', () => {
    it('should focus element after delay', async () => {
        vi.useFakeTimers();

        const input = getById('input');
        const focusSpy = vi.spyOn(input, 'focus');

        focusDelayed(input, 10);
        expect(focusSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(10);
        expect(focusSpy).toHaveBeenCalledOnce();

        vi.useRealTimers();
    });

    it('should accept string ID', () => {
        vi.useFakeTimers();

        const input = getById('input');
        const focusSpy = vi.spyOn(input, 'focus');

        focusDelayed('input', 10);
        vi.advanceTimersByTime(10);

        expect(focusSpy).toHaveBeenCalledOnce();
        vi.useRealTimers();
    });

    it('should use default 50ms delay', () => {
        vi.useFakeTimers();

        const input = getById('input');
        const focusSpy = vi.spyOn(input, 'focus');

        focusDelayed(input);

        vi.advanceTimersByTime(49);
        expect(focusSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(focusSpy).toHaveBeenCalledOnce();

        vi.useRealTimers();
    });

    it('should not throw for unknown ID', () => {
        vi.useFakeTimers();
        expect(() => {
            focusDelayed('nonexistent', 10);
            vi.advanceTimersByTime(10);
        }).not.toThrow();
        vi.useRealTimers();
    });
});
