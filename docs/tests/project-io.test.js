import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storageMock, llmServiceMock, appStateMock } = vi.hoisted(() => ({
  storageMock: {
    getProject: vi.fn(),
    loadSession: vi.fn(),
    loadAllImages: vi.fn(),
    loadAllApiKeys: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    saveSession: vi.fn(),
    saveImage: vi.fn(),
    deleteProject: vi.fn(),
    clearSession: vi.fn(),
    deleteImages: vi.fn(),
    getActiveProjectId: vi.fn(() => null),
    setActiveProjectId: vi.fn(),
    clearActiveProjectId: vi.fn(),
    saveApiKey: vi.fn(),
    saveDescriptionPrompt: vi.fn(),
    saveValidationPrompt: vi.fn(),
    saveValidationProviderConfig: vi.fn(),
    loadDescriptionPrompt: vi.fn(() => ''),
    loadValidationPrompt: vi.fn(() => ''),
    loadSettings: vi.fn(() => ({}))
  },
  llmServiceMock: {
    activeProvider: 'gemini',
    activeModel: 'gemini-3-flash-preview',
    providers: {
      gemini: { defaultModel: 'gemini-3-flash-preview', activeModel: null, endpoint: null },
      openai: { defaultModel: 'gpt-4o-mini', activeModel: null, endpoint: null },
      anthropic: { defaultModel: 'claude-3-5-sonnet', activeModel: null, endpoint: null },
      mistral: { defaultModel: 'mistral-ocr-latest', activeModel: null, endpoint: null },
      ollama: { defaultModel: 'llama3.2', activeModel: null, endpoint: 'http://localhost:11434' }
    },
    setApiKey: vi.fn(),
    setValidationApiKey: vi.fn(),
    setProvider: vi.fn(),
    setModel: vi.fn(),
    setEndpoint: vi.fn()
  },
  appStateMock: {
    restoreSession: vi.fn(async () => true)
  }
}));

vi.mock('../js/services/storage.js', () => ({
  storage: storageMock
}));

vi.mock('../js/services/llm.js', () => ({
  llmService: llmServiceMock
}));

vi.mock('../js/state.js', () => ({
  appState: appStateMock
}));

import { decryptKeys, encryptKeys, projectIOService } from '../js/services/project-io.js';

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length;
}

function makeEntry(path, content, sizeOverride = null) {
  return {
    name: path,
    dir: false,
    async: vi.fn(async () => content),
    _data: {
      uncompressedSize: sizeOverride ?? byteLength(content)
    }
  };
}

function createZip(entries) {
  const map = new Map();
  for (const [path, value] of Object.entries(entries)) {
    if (typeof value === 'object' && value !== null && value.__entry) {
      map.set(path, value.__entry);
    } else {
      map.set(path, makeEntry(path, value));
    }
  }

  return {
    file(path) {
      return map.get(path) || null;
    },
    forEach(callback) {
      for (const [path, entry] of map.entries()) {
        callback(path, entry);
      }
    }
  };
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildManifest(entries, { legacyOnly = false, tamperPath = null } = {}) {
  const checksums = {};
  for (const [path, content] of Object.entries(entries)) {
    checksums[path] = await sha256Hex(content);
  }
  if (tamperPath) {
    checksums[tamperPath] = 'deadbeef';
  }

  const manifest = {
    formatVersion: '1.0',
    exportDate: '2026-02-27T00:00:00.000Z',
    appVersion: 'coOCR/HTR',
    checksum: checksums['session.json']
  };

  if (!legacyOnly) {
    manifest.checksums = checksums;
  }

  return JSON.stringify(manifest, null, 2);
}

describe('ProjectIOService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    storageMock.getProject.mockResolvedValue(null);
    storageMock.loadSession.mockResolvedValue(null);
    storageMock.loadAllImages.mockResolvedValue({});
    storageMock.loadAllApiKeys.mockResolvedValue({});
    storageMock.listProjects.mockResolvedValue([]);
    storageMock.createProject.mockResolvedValue(undefined);
    storageMock.saveSession.mockResolvedValue(undefined);
    storageMock.saveImage.mockResolvedValue(undefined);
    storageMock.deleteProject.mockResolvedValue(undefined);
    storageMock.clearSession.mockResolvedValue(undefined);
    storageMock.deleteImages.mockResolvedValue(undefined);
    storageMock.saveApiKey.mockResolvedValue(undefined);
    storageMock.getActiveProjectId.mockReturnValue(null);
    appStateMock.restoreSession.mockResolvedValue(true);

    global.window = global.window || {};
    window.JSZip = {
      loadAsync: vi.fn()
    };
  });

  it('encrypts and decrypts API keys roundtrip', async () => {
    const original = { gemini: 'g-key', gemini_validation: 'v-key' };
    const encrypted = await encryptKeys(original, 'strong-passphrase');
    const decrypted = await decryptKeys(encrypted, 'strong-passphrase');

    expect(decrypted).toEqual(original);
  });

  it('imports encrypted keys and routes *_validation keys correctly', async () => {
    const encryptedKeys = await encryptKeys(
      { gemini: 'g-key', gemini_validation: 'v-key' },
      'pass-1234'
    );

    const coreEntries = {
      'project.json': JSON.stringify({ name: 'Imported Project', pageCount: 1 }),
      'session.json': JSON.stringify({ document: { filename: 'doc.jpg' } }),
      'settings.json': JSON.stringify({}),
      'keys.enc': encryptedKeys
    };

    const manifest = await buildManifest({
      ...coreEntries,
      'images/p1.b64': 'data:image/jpeg;base64,abc'
    });

    const zip = createZip({
      ...coreEntries,
      'images/p1.b64': 'data:image/jpeg;base64,abc',
      'manifest.json': manifest
    });

    window.JSZip.loadAsync.mockResolvedValue(zip);

    const result = await projectIOService.importProject(
      { size: 1024 },
      { onPasswordNeeded: async () => 'pass-1234' }
    );

    expect(result.projectName).toBe('Imported Project');
    expect(storageMock.saveApiKey).toHaveBeenCalledWith('gemini', 'g-key', false);
    expect(storageMock.saveApiKey).toHaveBeenCalledWith('gemini', 'v-key', true);
    expect(llmServiceMock.setApiKey).toHaveBeenCalledWith('gemini', 'g-key');
    expect(llmServiceMock.setValidationApiKey).toHaveBeenCalledWith('gemini', 'v-key');
  });

  it('rolls back partially imported data on failure', async () => {
    const coreEntries = {
      'project.json': JSON.stringify({ name: 'Rollback Project', pageCount: 1 }),
      'session.json': JSON.stringify({}),
      'settings.json': JSON.stringify({})
    };
    const manifest = await buildManifest({
      ...coreEntries,
      'images/p1.b64': 'data:image/jpeg;base64,abc'
    });

    const zip = createZip({
      ...coreEntries,
      'images/p1.b64': 'data:image/jpeg;base64,abc',
      'manifest.json': manifest
    });

    window.JSZip.loadAsync.mockResolvedValue(zip);
    storageMock.saveImage.mockRejectedValueOnce(new Error('disk full'));

    await expect(projectIOService.importProject({ size: 2048 }, {})).rejects.toThrow('disk full');

    const createdProjectId = storageMock.createProject.mock.calls[0][0].id;
    expect(storageMock.clearSession).toHaveBeenCalledWith(createdProjectId);
    expect(storageMock.deleteImages).toHaveBeenCalledWith(createdProjectId);
    expect(storageMock.deleteProject).toHaveBeenCalledWith(createdProjectId);
  });

  it('supports legacy archives with only session checksum', async () => {
    const coreEntries = {
      'project.json': JSON.stringify({ name: 'Legacy Project', pageCount: 0 }),
      'session.json': JSON.stringify({}),
      'settings.json': JSON.stringify({})
    };
    const manifest = await buildManifest(coreEntries, { legacyOnly: true });
    const zip = createZip({
      ...coreEntries,
      'manifest.json': manifest
    });

    window.JSZip.loadAsync.mockResolvedValue(zip);

    await expect(projectIOService.importProject({ size: 512 }, {})).resolves.toEqual(
      expect.objectContaining({ projectName: 'Legacy Project' })
    );
  });

  it('rejects archive when modern checksum validation fails', async () => {
    const coreEntries = {
      'project.json': JSON.stringify({ name: 'Corrupt Project', pageCount: 0 }),
      'session.json': JSON.stringify({}),
      'settings.json': JSON.stringify({})
    };
    const manifest = await buildManifest(coreEntries, { tamperPath: 'project.json' });
    const zip = createZip({
      ...coreEntries,
      'manifest.json': manifest
    });

    window.JSZip.loadAsync.mockResolvedValue(zip);

    await expect(projectIOService.importProject({ size: 512 }, {})).rejects.toThrow('project.json is corrupted');
    expect(storageMock.createProject).not.toHaveBeenCalled();
  });

  it('rejects oversize archives before zip parsing', async () => {
    await expect(
      projectIOService.importProject({ size: 501 * 1024 * 1024 }, {})
    ).rejects.toThrow('archive exceeds 500MB');
    expect(window.JSZip.loadAsync).not.toHaveBeenCalled();
  });

  it('rejects archives with too many image entries', async () => {
    const entries = {
      'manifest.json': JSON.stringify({ formatVersion: '1.0' })
    };
    for (let i = 0; i < 201; i++) {
      entries[`images/p${i}.b64`] = 'data:image/jpeg;base64,abc';
    }

    window.JSZip.loadAsync.mockResolvedValue(createZip(entries));

    await expect(projectIOService.importProject({ size: 4096 }, {})).rejects.toThrow('too many images');
  });

  it('rejects oversized image entries', async () => {
    const coreEntries = {
      'project.json': JSON.stringify({ name: 'Big Image Project', pageCount: 1 }),
      'session.json': JSON.stringify({}),
      'settings.json': JSON.stringify({})
    };
    const manifest = await buildManifest({
      ...coreEntries,
      'images/p1.b64': 'data:image/jpeg;base64,abc'
    });

    const bigImageEntry = {
      __entry: makeEntry('images/p1.b64', 'data:image/jpeg;base64,abc', 50 * 1024 * 1024 + 1)
    };

    const zip = createZip({
      ...coreEntries,
      'images/p1.b64': bigImageEntry,
      'manifest.json': manifest
    });
    window.JSZip.loadAsync.mockResolvedValue(zip);

    await expect(projectIOService.importProject({ size: 10 * 1024 }, {})).rejects.toThrow('exceeds 50MB');
  });
});
