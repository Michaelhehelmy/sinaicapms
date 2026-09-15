import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted @huggingface/transformers mock ─────────────────────────────────
// The lib lazy-imports this module at runtime; not mocking it would attempt a
// real ONNX/WASM download. The fake returns a per-task pipeline object whose
// callable `pipe` resolves with library-shaped outputs.
const h = vi.hoisted(() => {
  const pipeline = vi.fn();
  return { pipeline };
});

vi.mock('@huggingface/transformers', () => ({
  pipeline: h.pipeline,
  env: {},
}));

import {
  getEmbeddings,
  classifySentiment,
  generateText,
  getBrowserModelStatus,
  __resetBrowserPipelines,
} from '@/lib/browser-ai';

/** Mean-pooled float32 vector — all values exactly representable in float32. */
const EMBED_VECTOR = new Float32Array([0.25, -0.5, 1, 2.5, 0.75, -0.125, 0, 0.5]);

/** Fake pipeline instances keyed by task name. */
const fakePipes: Record<string, ReturnType<typeof vi.fn>> = {};

/**
 * Per-task pipe behavior overridden by individual tests. Consulted at call time
 * (not queued onto the pipe mock) because a fresh pipe is created lazily on the
 * first pipeline() call of each test — queueing before that would hit the
 * previous test's stale pipe.
 */
const pipeBehaviors: Record<string, { impl?: () => unknown }> = {};

/** Options object the last `pipeline()` call received (captures progress_callback). */
let capturedOptions: { progress_callback?: (info: unknown) => void } = {};

/** Installs the default happy-path pipeline implementation. */
function installFakePipelines() {
  h.pipeline.mockReset();
  for (const key of Object.keys(pipeBehaviors)) delete pipeBehaviors[key];
  h.pipeline.mockImplementation(
    async (task: string, _modelId: string, opts: { progress_callback?: (info: unknown) => void }) => {
      capturedOptions = opts ?? {};
      const pipe = vi.fn();
      if (task === 'feature-extraction') {
        pipe.mockImplementation(() => pipeBehaviors['feature-extraction']?.impl?.() ?? { data: EMBED_VECTOR });
      } else if (task === 'sentiment-analysis') {
        pipe.mockImplementation(() => pipeBehaviors['sentiment-analysis']?.impl?.() ?? [{ label: 'POSITIVE', score: 0.987 }]);
      } else {
        pipe.mockImplementation(() => pipeBehaviors['text2text-generation']?.impl?.() ?? [{ generated_text: 'A quiet camp under the stars.' }]);
      }
      fakePipes[task] = pipe;
      return pipe;
    },
  );
}

/** Toggles whether the WebGPU API (`navigator.gpu`) is present. */
function setWebGpuAvailable(available: boolean) {
  if (available) {
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
  } else {
    delete (navigator as unknown as { gpu?: unknown }).gpu;
  }
}

beforeEach(() => {
  installFakePipelines();
  setWebGpuAvailable(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  setWebGpuAvailable(false);
  __resetBrowserPipelines();
});

describe('browser-ai client', () => {
  describe('getEmbeddings', () => {
    it('runs feature-extraction with pooling/normalization and maps the float32 vector', async () => {
      const result = await getEmbeddings('hello world');

      expect(h.pipeline).toHaveBeenCalledTimes(1);
      expect(h.pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({ device: 'cpu', dtype: 'q8' }),
      );
      expect(fakePipes['feature-extraction']).toHaveBeenCalledWith('hello world', {
        pooling: 'mean',
        normalize: true,
      });

      expect(result.dimensions).toBe(8);
      expect(Array.isArray(result.vector)).toBe(true);
      // float32 → number[] mapping preserves exact values
      expect(result.vector).toEqual([0.25, -0.5, 1, 2.5, 0.75, -0.125, 0, 0.5]);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('wraps inference failures with the Browser AI prefix + tool detail', async () => {
      pipeBehaviors['feature-extraction'] = { impl: () => { throw new Error('tensor boom'); } };
      await expect(getEmbeddings('x')).rejects.toThrow(
        /^Browser AI: Embedding extraction failed\. — tensor boom$/,
      );
    });

    it('passes an already-prefixed inference error through unchanged', async () => {
      pipeBehaviors['feature-extraction'] = { impl: () => { throw new Error('Browser AI: inner failure'); } };
      await expect(getEmbeddings('x')).rejects.toThrow(/^Browser AI: inner failure$/);
    });
  });

  describe('classifySentiment', () => {
    it('runs sentiment-analysis and returns the first prediction', async () => {
      const result = await classifySentiment('I love Sinai');

      expect(h.pipeline).toHaveBeenCalledWith(
        'sentiment-analysis',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
        expect.objectContaining({ device: 'cpu', dtype: 'q8' }),
      );
      expect(fakePipes['sentiment-analysis']).toHaveBeenCalledWith('I love Sinai');
      expect(result).toEqual({ label: 'POSITIVE', score: 0.987, latencyMs: expect.any(Number) });
    });

    it('normalizes an empty predictions array to blank label and zero score', async () => {
      pipeBehaviors['sentiment-analysis'] = { impl: () => [] };
      const result = await classifySentiment('nothing');
      expect(result.label).toBe('');
      expect(result.score).toBe(0);
    });

    it('stringifies non-string labels defensively', async () => {
      pipeBehaviors['sentiment-analysis'] = { impl: () => [{ label: 42, score: undefined }] };
      const result = await classifySentiment('numeric');
      expect(result.label).toBe('42');
      expect(result.score).toBe(0);
    });

    it('wraps inference failures with the Browser AI prefix', async () => {
      pipeBehaviors['sentiment-analysis'] = { impl: () => { throw new Error('labels boom'); } };
      await expect(classifySentiment('x')).rejects.toThrow(
        /^Browser AI: Sentiment classification failed\. — labels boom$/,
      );
    });
  });

  describe('generateText', () => {
    it('runs text2text-generation and forwards max_new_tokens', async () => {
      const result = await generateText('Summarize:', { maxNewTokens: 32 });

      expect(h.pipeline).toHaveBeenCalledWith(
        'text2text-generation',
        'Xenova/LaMini-Flan-T5-248M',
        expect.objectContaining({ device: 'cpu', dtype: 'q8' }),
      );
      expect(fakePipes['text2text-generation']).toHaveBeenCalledWith('Summarize:', {
        max_new_tokens: 32,
      });
      expect(result.text).toBe('A quiet camp under the stars.');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('omits the generation options object when maxNewTokens is not given', async () => {
      const result = await generateText('Hi');
      expect(fakePipes['text2text-generation']).toHaveBeenCalledWith('Hi', undefined);
      expect(result.text).toBe('A quiet camp under the stars.');
    });

    it('normalizes a missing generated_text to an empty string', async () => {
      pipeBehaviors['text2text-generation'] = { impl: () => [] };
      const result = await generateText('Hi');
      expect(result.text).toBe('');
    });

    it('wraps inference failures with the Browser AI prefix', async () => {
      pipeBehaviors['text2text-generation'] = { impl: () => { throw new Error('decode boom'); } };
      await expect(generateText('x')).rejects.toThrow(
        /^Browser AI: Text generation failed\. — decode boom$/,
      );
    });
  });

  describe('pipeline cache', () => {
    it('reuses a pipeline for the same model:device:dtype key and reloads on a new key', async () => {
      await getEmbeddings('one');
      await getEmbeddings('two');
      expect(h.pipeline).toHaveBeenCalledTimes(1);

      // webgpu device → different key → new pipeline
      setWebGpuAvailable(true);
      await getEmbeddings('three', { device: 'webgpu' });
      expect(h.pipeline).toHaveBeenCalledTimes(2);
      expect(h.pipeline).toHaveBeenLastCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({ device: 'webgpu', dtype: 'q8' }),
      );

      // q4 dtype → different key → new pipeline
      await getEmbeddings('four', { device: 'cpu', dtype: 'q4' });
      expect(h.pipeline).toHaveBeenCalledTimes(3);
      expect(h.pipeline).toHaveBeenLastCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({ device: 'cpu', dtype: 'q4' }),
      );

      // same key as before → cached
      await getEmbeddings('five', { device: 'cpu', dtype: 'q4' });
      expect(h.pipeline).toHaveBeenCalledTimes(3);
    });

    it('never shares a cache slot across model kinds', async () => {
      await getEmbeddings('one');
      await classifySentiment('two');
      await generateText('three');
      expect(h.pipeline).toHaveBeenCalledTimes(3);
    });

    it('__resetBrowserPipelines clears the cache so the next call reloads', async () => {
      await getEmbeddings('x');
      expect(h.pipeline).toHaveBeenCalledTimes(1);
      __resetBrowserPipelines();
      await getEmbeddings('y');
      expect(h.pipeline).toHaveBeenCalledTimes(2);
    });
  });

  describe('options plumbing', () => {
    it('passes device and dtype through to pipeline options', async () => {
      setWebGpuAvailable(true);
      await getEmbeddings('x', { device: 'webgpu', dtype: 'q4' });
      expect(h.pipeline).toHaveBeenCalledWith(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        expect.objectContaining({ device: 'webgpu', dtype: 'q4' }),
      );
    });

    it('does not wire a progress_callback when onProgress is omitted', async () => {
      await getEmbeddings('x');
      expect(capturedOptions.progress_callback).toBeUndefined();
    });
  });

  describe('progress forwarding', () => {
    it('forwards only progress/done/ready events as normalized { status, loaded, total }', async () => {
      const onProgress = vi.fn();
      await getEmbeddings('progressive', { onProgress });

      const callback = capturedOptions.progress_callback;
      expect(callback).toBeTypeOf('function');

      callback?.({ status: 'progress', loaded: 100, total: 500 });
      callback?.({ status: 'done', loaded: 500, total: 500 });
      callback?.({ status: 'ready' });
      // non-UI statuses are filtered out
      callback?.({ status: 'initiate', loaded: 0, total: 0 });
      callback?.({ status: 'download', loaded: 1, total: 2 });
      callback?.({ status: 'removed params' });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, { status: 'progress', loaded: 100, total: 500 });
      expect(onProgress).toHaveBeenNthCalledWith(2, { status: 'done', loaded: 500, total: 500 });
      expect(onProgress).toHaveBeenNthCalledWith(3, { status: 'ready', loaded: 0, total: 0 });
    });

    it('defaults non-number loaded/total to zero', async () => {
      const onProgress = vi.fn();
      await getEmbeddings('progressive', { onProgress });
      capturedOptions.progress_callback?.({
        status: 'progress',
        loaded: 'x' as unknown as number,
        total: undefined,
      });
      expect(onProgress).toHaveBeenCalledWith({ status: 'progress', loaded: 0, total: 0 });
    });
  });

  describe('failure wrapping', () => {
    it('prefixes pipeline creation failures with a model hint', async () => {
      h.pipeline.mockRejectedValueOnce(new Error('network down'));
      await expect(getEmbeddings('x')).rejects.toThrow(
        /^Browser AI: Failed to load "Xenova\/all-MiniLM-L6-v2" \(feature-extraction\)\. Check your connection and retry\. — network down$/,
      );
    });

    it('uses the WebGPU-specific creation hint when loading on webgpu', async () => {
      setWebGpuAvailable(true);
      h.pipeline.mockRejectedValueOnce(new Error('wgpu init failed'));
      await expect(getEmbeddings('x', { device: 'webgpu' })).rejects.toThrow(
        /^Browser AI: WebGPU inference failed\. Retry with \{ device: "cpu" \} \(WASM\)\. — wgpu init failed$/,
      );
    });

    it('does not double-prefix already-prefixed creation errors', async () => {
      h.pipeline.mockRejectedValueOnce(new Error('Browser AI: already wrapped'));
      await expect(getEmbeddings('x')).rejects.toThrow(/^Browser AI: already wrapped$/);
    });

    it('stringifies non-Error failures', async () => {
      h.pipeline.mockRejectedValueOnce('flaky');
      await expect(getEmbeddings('x')).rejects.toThrow(
        /^Browser AI: Failed to load "Xenova\/all-MiniLM-L6-v2" \(feature-extraction\)\. Check your connection and retry\. — flaky$/,
      );
    });

    it('drops an undefined failure reason from the message', async () => {
      h.pipeline.mockRejectedValueOnce(undefined);
      await expect(getEmbeddings('x')).rejects.toThrow(
        /^Browser AI: Failed to load "Xenova\/all-MiniLM-L6-v2" \(feature-extraction\)\. Check your connection and retry\.$/,
      );
    });
  });

  describe('WebGPU availability', () => {
    it('fails fast with a WebGPU hint when navigator.gpu is absent', async () => {
      const spy = vi.fn();
      h.pipeline.mockImplementation(spy);

      await expect(getEmbeddings('x', { device: 'webgpu' })).rejects.toThrow(
        /^Browser AI: WebGPU is not available in this browser\. Pass \{ device: "cpu" \} to fall back to WASM inference\.$/,
      );
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('getBrowserModelStatus', () => {
    it('reports supported with WASM and no webgpu by default', () => {
      const status = getBrowserModelStatus();
      expect(status.supported).toBe(true);
      expect(status.webgpu).toBe(false);
      expect(status.reason).toBeUndefined();
    });

    it('reports webgpu when navigator.gpu is present', () => {
      setWebGpuAvailable(true);
      expect(getBrowserModelStatus().webgpu).toBe(true);
    });

    it('reports unsupported when WebAssembly is unavailable', () => {
      const originalWasm = (globalThis as { WebAssembly?: unknown }).WebAssembly;
      (globalThis as { WebAssembly?: unknown }).WebAssembly = undefined;
      try {
        const status = getBrowserModelStatus();
        expect(status.supported).toBe(false);
        expect(status.webgpu).toBe(false);
        expect(status.reason).toMatch(/requires a browser environment with WebAssembly/);
      } finally {
        (globalThis as { WebAssembly?: unknown }).WebAssembly = originalWasm;
      }
    });
  });

  describe('import topology guard', () => {
    it('keeps @huggingface/transformers out of the static import graph (lazy-load only)', async () => {
      // Reads the raw source text (no network, no globals) so the guard stays
      // deterministic. Node built-ins are dynamically imported inside the test
      // so nothing touches the module graph at import time.
      const { readFile } = await import('node:fs/promises');
      const path = await import('node:path');

      // Resolve the lib source from this test file's own location. `__dirname`
      // is provided by vitest's CJS/ESM transpile; fall back to deriving it
      // from `import.meta.url` when it is unavailable (pure ESM runners).
      const testDir =
        typeof __dirname === 'string' && __dirname.length > 0
          ? __dirname
          : path.dirname(new URL(import.meta.url).pathname);
      const sourcePath = path.resolve(testDir, '../../src/lib/browser-ai.ts');
      const source = await readFile(sourcePath, 'utf8');

      // Static runtime imports of the transformers package, both quote styles:
      //   import ... from '@huggingface/transformers'
      //   import ... from "@huggingface/transformers"
      // The regex does NOT flag:
      //   - `import type { ... }`           (excluded via (?!type\b))
      //   - the dynamic `await import(...)` (those lines never start with `import`)
      //   - any `@/...` alias import        (specifier must be the exact package)
      const staticImportRE =
        /^import\s+(?!type\b)[^\n]*?\s+from\s+["']@huggingface\/transformers["']/m;

      const offenders = source
        .split('\n')
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => staticImportRE.test(line));

      expect(offenders).toEqual([]);

      // Guard against a vacuous pass — the architecturally-required lazy
      // dynamic import must still be present.
      const dynamicImportRE = /await\s+import\(\s*["']@huggingface\/transformers["']\s*\)/;
      expect(
        dynamicImportRE.test(source),
        'expected the source to contain `await import(\'@huggingface/transformers\')` — the guard must not pass vacuously',
      ).toBe(true);
    });
  });
});