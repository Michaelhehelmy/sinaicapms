/**
 * Browser-side AI inference via Transformers.js.
 *
 * Runs three small ONNX models entirely in the admin's browser — never on a
 * server, never through the backend API. Every exported function lazily
 * `await import()`s `@huggingface/transformers` only when it is actually
 * invoked, so the ONNX runtime + model code stays out of the initial page
 * bundle (the whole point: bundle isolation) and is fetched on first use.
 * Created pipelines (model + tokenizer + session) are cached per
 * model/device/dtype combination and reused across calls.
 *
 * Models:
 * - embeddings → `Xenova/all-MiniLM-L6-v2` via `feature-extraction`
 *   (mean-pooled, L2-normalized; 384 dims)
 * - sentiment  → `Xenova/distilbert-base-uncased-finetuned-sst-2-english`
 *   via `sentiment-analysis`
 * - text-gen   → `Xenova/LaMini-Flan-T5-248M` via `text2text-generation`
 *
 * Transformers.js v4 API notes (for follow-up work):
 * - `pipeline(task, model, { device, dtype, progress_callback })` is the v4
 *   surface (`@huggingface/transformers` ^4.2.0). Backend devices are named
 *   `'cpu'` (WASM) / `'webgpu'`; quantized dtypes are `'q8'` / `'q4'`.
 * - `env.backends.onnx.wasm.wasmPaths` (v4 name; `env.backends.onnx` in v3)
 *   can point the WASM binaries at a self-hosted location. Not needed today —
 *   the default jsDelivr CDN is used.
 * - Feature extraction is pooled at inference time with
 *   `{ pooling: 'mean', normalize: true }`; the result is a `Tensor` whose
 *   flattened `data` is the embedding vector.
 * - Sentiment returns `[{ label, score }]`; text2text-generation returns
 *   `[{ generated_text }]` (generated completion only — the input prompt is not
 *   echoed back, unlike the causal `text-generation` task) — first element
 *   wins in both cases.
 * - All failures surface as `Error` with a `Browser AI: ` prefix (including a
 *   `device: 'cpu'` hint when WebGPU is requested but unavailable).
 */

export type BrowserDevice = 'cpu' | 'webgpu';
export type BrowserDtype = 'q8' | 'q4';

export interface BrowserProgress {
  status: string;
  loaded: number;
  total: number;
}

export interface BrowserModelOptions {
  /** Inference backend. Defaults to `cpu` (WASM); WebGPU is an explicit opt-in. */
  device?: BrowserDevice;
  /** Quantization. Defaults to `q8`; `q4` trades a little quality for a smaller download. */
  dtype?: BrowserDtype;
  /** Called with `progress` / `done` / `ready` statuses while the pipeline loads. */
  onProgress?: (progress: BrowserProgress) => void;
}

/** Keys the three supported browser models. */
export type BrowserModelKind = 'embeddings' | 'sentiment' | 'text-gen';

export interface EmbeddingsResult {
  /** Dimensionality of the vector (e.g. 384 for all-MiniLM-L6-v2). */
  dimensions: number;
  /** The mean-pooled, L2-normalized embedding vector. */
  vector: number[];
  /** Wall-clock time (ms) for the whole operation, including any lazy load. */
  latencyMs: number;
}

export interface SentimentResult {
  /** Predicted label, e.g. `POSITIVE` / `NEGATIVE`. */
  label: string;
  /** Model confidence in [0, 1]. */
  score: number;
  /** Wall-clock time (ms) for the whole operation, including any lazy load. */
  latencyMs: number;
}

export interface GenerateTextOptions extends BrowserModelOptions {
  /** Maximum number of tokens to generate (forwarded as `max_new_tokens`). */
  maxNewTokens?: number;
}

export interface GenerateTextResult {
  /** The first generated text completion (prompt included by default). */
  text: string;
  /** Wall-clock time (ms) for the whole operation, including any lazy load. */
  latencyMs: number;
}

export interface BrowserModelStatus {
  /** Whether browser inference can run (browser + WebAssembly available). */
  supported: boolean;
  /** Whether the WebGPU backend is exposed by this browser. */
  webgpu: boolean;
  /** Human-readable explanation when `supported` is false. */
  reason?: string;
}

interface ModelSpec {
  task: 'feature-extraction' | 'sentiment-analysis' | 'text2text-generation';
  modelId: string;
}

const MODEL_SPECS: Record<BrowserModelKind, ModelSpec> = {
  embeddings: {
    task: 'feature-extraction',
    modelId: 'Xenova/all-MiniLM-L6-v2',
  },
  sentiment: {
    task: 'sentiment-analysis',
    modelId: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  },
  'text-gen': {
    task: 'text2text-generation',
    modelId: 'Xenova/LaMini-Flan-T5-248M',
  },
};

const DEFAULT_DEVICE: BrowserDevice = 'cpu';
const DEFAULT_DTYPE: BrowserDtype = 'q8';

/**
 * Compile-time handle on the transformers module. `typeof import(...)` in type
 * position is a pure type query and emits no runtime import — the lazy
 * `await import()` inside `getOrCreatePipeline` is the only real dependency
 * edge, so the ONNX runtime + model code stays out of the page bundle until
 * an admin actually uses a browser-AI tool.
 */
type TransformersModule = typeof import('@huggingface/transformers');

/**
 * Cache of created pipelines, keyed by `${modelId}:${device ?? 'cpu'}:${dtype ?? 'q8'}`
 * so a given combination is downloaded/initialized once and then reused.
 */
const pipelineCache = new Map<string, unknown>();

/**
 * Clears the pipeline cache — mostly a test helper, but also useful for
 * forcing a fresh model download after e.g. a failed partial load.
 */
export function __resetBrowserPipelines(): void {
  pipelineCache.clear();
}

/**
 * Static, conservative capability check that NEVER imports the transformers
 * library. `supported` requires a browser-like environment with WebAssembly
 * (the WASM CPU path); `webgpu` reports whether the WebGPU API is present.
 */
export function getBrowserModelStatus(): BrowserModelStatus {
  const hasWindow = typeof window !== 'undefined';
  const hasWasm =
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function';
  if (!hasWindow || !hasWasm) {
    return {
      supported: false,
      webgpu: false,
      reason:
        'Browser AI requires a browser environment with WebAssembly support. Retry from a modern browser.',
    };
  }
  return {
    supported: true,
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
  };
}

/**
 * Builds the `progress_callback` handed to `pipeline()`. The library reports
 * several progress shapes; we forward only the ones the UI cares about
 * (`progress`, `done`, `ready`) and always normalize to `{ status, loaded,
 * total }` so callers get one stable shape.
 *
 * The callback parameter is typed as `unknown` (then narrowed structurally):
 * the library's `ProgressInfo` type is a type-only export, and we deliberately
 * avoid any top-level `import type` of the package. `(info: unknown) => void`
 * is contravariantly assignable to the library's `ProgressCallback` and thus
 * typechecks when passed into `pipeline()` options.
 */
function createProgressCallback(
  onProgress?: (progress: BrowserProgress) => void,
): ((info: unknown) => void) | undefined {
  if (!onProgress) return undefined;
  return (info: unknown) => {
    const signal = info as { status?: string; loaded?: number; total?: number };
    if (
      signal.status === 'progress' ||
      signal.status === 'done' ||
      signal.status === 'ready'
    ) {
      onProgress({
        status: signal.status ?? '',
        loaded: typeof signal.loaded === 'number' ? signal.loaded : 0,
        total: typeof signal.total === 'number' ? signal.total : 0,
      });
    }
  };
}

/**
 * Rethrows any browser-AI fault as an `Error` prefixed with `Browser AI: `.
 * Already-prefixed errors pass through untouched so wrapped layers don't
 * double-prefix. Never swallows the original error.
 */
function wrapBrowserAIError(cause: unknown, detail: string): Error {
  if (cause instanceof Error && cause.message.startsWith('Browser AI: ')) {
    return cause;
  }
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `Browser AI: ${detail}${reason && reason !== 'undefined' ? ` — ${reason}` : ''}`,
  );
}

/**
 * Lazily loads (or reuses from cache) the pipeline for `kind`, configured with
 * the requested `device` / `dtype` / `onProgress`. The transformers library is
 * dynamically imported only here — the first call for a given key pays the
 * download, subsequent calls hit the cache.
 */
async function getOrCreatePipeline(
  kind: BrowserModelKind,
  options: BrowserModelOptions,
): Promise<unknown> {
  const device = options.device ?? DEFAULT_DEVICE;
  const dtype = options.dtype ?? DEFAULT_DTYPE;
  const cacheKey = `${MODEL_SPECS[kind].modelId}:${device}:${dtype}`;

  const cached = pipelineCache.get(cacheKey);
  if (cached) return cached;

  if (device === 'webgpu' && !getBrowserModelStatus().webgpu) {
    throw new Error(
      'Browser AI: WebGPU is not available in this browser. Pass { device: "cpu" } to fall back to WASM inference.',
    );
  }

  const { pipeline: createPipeline } = await import('@huggingface/transformers');
  const { task, modelId } = MODEL_SPECS[kind];

  try {
    const instance = await createPipeline(task, modelId, {
      device,
      dtype,
      progress_callback: createProgressCallback(options.onProgress),
    });
    pipelineCache.set(cacheKey, instance);
    return instance;
  } catch (cause) {
    const hint =
      device === 'webgpu'
        ? 'WebGPU inference failed. Retry with { device: "cpu" } (WASM).'
        : `Failed to load "${modelId}" (${task}). Check your connection and retry.`;
    throw wrapBrowserAIError(cause, hint);
  }
}

/**
 * Embeds `text` with `Xenova/all-MiniLM-L6-v2` (mean-pooled, L2-normalized).
 *
 * @param text Single text to embed.
 * @param options Device/dtype overrides and load progress callback.
 * @returns `{ dimensions, vector, latencyMs }`.
 */
export async function getEmbeddings(
  text: string,
  options: BrowserModelOptions = {},
): Promise<EmbeddingsResult> {
  const startedAt = performance.now();
  try {
    const pipe = (await getOrCreatePipeline(
      'embeddings',
      options,
    )) as InstanceType<TransformersModule['FeatureExtractionPipeline']>;
    const tensor = await pipe(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(tensor.data as ArrayLike<number>);
    return {
      dimensions: vector.length,
      vector,
      latencyMs: performance.now() - startedAt,
    };
  } catch (cause) {
    throw wrapBrowserAIError(cause, 'Embedding extraction failed.');
  }
}

/**
 * Classifies the sentiment of `text` with
 * `Xenova/distilbert-base-uncased-finetuned-sst-2-english`.
 *
 * @param text Single text to classify.
 * @param options Device/dtype overrides and load progress callback.
 * @returns `{ label, score, latencyMs }` — first prediction wins.
 */
export async function classifySentiment(
  text: string,
  options: BrowserModelOptions = {},
): Promise<SentimentResult> {
  const startedAt = performance.now();
  try {
    const pipe = (await getOrCreatePipeline(
      'sentiment',
      options,
    )) as InstanceType<TransformersModule['TextClassificationPipeline']>;
    const outputs = await pipe(text);
    const first = outputs[0];
    return {
      label: typeof first?.label === 'string' ? first.label : String(first?.label ?? ''),
      score: typeof first?.score === 'number' ? first.score : 0,
      latencyMs: performance.now() - startedAt,
    };
  } catch (cause) {
    throw wrapBrowserAIError(cause, 'Sentiment classification failed.');
  }
}

/**
 * Generates a short text completion for `prompt` with
 * `Xenova/LaMini-Flan-T5-248M`.
 *
 * @param prompt Input prompt.
 * @param options Optionally cap output with `maxNewTokens` (forwarded as
 *   `max_new_tokens`), plus device/dtype overrides and load progress callback.
 * @returns `{ text, latencyMs }` — first generated result wins.
 */
export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<GenerateTextResult> {
  const startedAt = performance.now();
  try {
    const pipe = (await getOrCreatePipeline(
      'text-gen',
      options,
    )) as InstanceType<TransformersModule['Text2TextGenerationPipeline']>;
    const outputs = await pipe(
      prompt,
      typeof options.maxNewTokens === 'number'
        ? { max_new_tokens: options.maxNewTokens }
        : undefined,
    );
    const first = outputs[0];
    return {
      text: typeof first?.generated_text === 'string' ? first.generated_text : '',
      latencyMs: performance.now() - startedAt,
    };
  } catch (cause) {
    throw wrapBrowserAIError(cause, 'Text generation failed.');
  }
}