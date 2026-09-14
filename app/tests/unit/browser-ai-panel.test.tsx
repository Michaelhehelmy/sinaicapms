import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrowserAIPanel from '@/components/admin/BrowserAIPanel';
import * as browserAI from '@/lib/browser-ai';
import { __resetBrowserPipelines } from '@/lib/browser-ai';

// ─── Hoisted @huggingface/transformers mock ─────────────────────────────────
// The real browser-ai client lib runs against this fake — no real downloads.
const h = vi.hoisted(() => {
  const pipeline = vi.fn();
  return { pipeline };
});

vi.mock('@huggingface/transformers', () => ({
  pipeline: h.pipeline,
  env: {},
}));

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

/** Mean-pooled float32 vector — values exactly representable in float32. */
const EMBED_VECTOR = new Float32Array([0.25, -0.5, 1, 2.5, 0.75, -0.125, 0, 0.5]);

/** Fake pipeline instances keyed by task name. */
const fakePipes: Record<string, ReturnType<typeof vi.fn>> = {};

/** Options object the last `pipeline()` call received (captures progress_callback). */
let capturedOptions: { progress_callback?: (info: unknown) => void } = {};

/** When true the fake pipeline emits a download progress event during creation. */
let fireProgress = false;

/**
 * Installs the default happy-path pipeline implementation: each task returns a
 * callable pipe that resolves with library-shaped outputs.
 */
function installFakePipelines() {
  h.pipeline.mockReset();
  h.pipeline.mockImplementation(
    async (task: string, _modelId: string, opts: { progress_callback?: (info: unknown) => void }) => {
      capturedOptions = opts ?? {};
      const pipe = vi.fn();
      if (task === 'feature-extraction') {
        pipe.mockResolvedValue({ data: EMBED_VECTOR });
      } else if (task === 'sentiment-analysis') {
        pipe.mockResolvedValue([{ label: 'POSITIVE', score: 0.987 }]);
      } else {
        pipe.mockResolvedValue([{ generated_text: 'A quiet camp under the stars.' }]);
      }
      fakePipes[task] = pipe;
      if (fireProgress) {
        capturedOptions.progress_callback?.({ status: 'progress', loaded: 120, total: 400 });
      }
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
  mockShowToast.mockClear();
  setWebGpuAvailable(false);
  fireProgress = false;
  capturedOptions = {};
  installFakePipelines();
});

afterEach(() => {
  vi.restoreAllMocks();
  setWebGpuAvailable(false);
  __resetBrowserPipelines();
});

describe('BrowserAIPanel', () => {
  it('renders the idle state with all three tools and a disabled webgpu option', async () => {
    render(<BrowserAIPanel />);

    expect(screen.getByTestId('browser-ai-panel')).toBeInTheDocument();
    expect(screen.getByText('On-device model runtime')).toBeInTheDocument();
    expect(screen.getByText('Not loaded')).toBeInTheDocument();

    const loadButton = screen.getByTestId('bai-load-model-btn');
    expect(loadButton).toHaveTextContent('Load in browser');
    expect(loadButton).toBeEnabled();

    // Tool cards
    expect(screen.getByText('Embeddings')).toBeInTheDocument();
    expect(screen.getByText('Sentiment')).toBeInTheDocument();
    expect(screen.getByText('Text generation')).toBeInTheDocument();

    // Run buttons start disabled (empty textareas)
    expect(screen.getByTestId('bai-embed-run')).toBeDisabled();
    expect(screen.getByTestId('bai-sentiment-run')).toBeDisabled();
    expect(screen.getByTestId('bai-gen-run')).toBeDisabled();

    // Device select: cpu selected, webgpu unavailable -> disabled option
    const deviceSelect = screen.getByTestId('bai-device-select');
    expect(deviceSelect).toHaveValue('cpu');
    const webgpuOption = within(deviceSelect).getByRole('option', { name: 'WebGPU (GPU)' });
    expect(webgpuOption).toBeDisabled();
    expect(within(deviceSelect).getByRole('option', { name: 'CPU (WASM)' })).toBeEnabled();

    // No inference ran yet
    expect(h.pipeline).not.toHaveBeenCalled();
  });

  it('loads the model on demand and reports download progress', async () => {
    fireProgress = true;
    render(<BrowserAIPanel />);

    await userEvent.click(screen.getByTestId('bai-load-model-btn'));

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
    expect(screen.getByTestId('bai-load-model-btn')).toHaveTextContent('Model ready');
    expect(screen.getByTestId('bai-load-model-btn')).toBeDisabled();

    // Warm-up uses the embeddings model on the selected device.
    expect(h.pipeline).toHaveBeenCalledTimes(1);
    expect(h.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      expect.objectContaining({ device: 'cpu', dtype: 'q8' }),
    );
    expect(fakePipes['feature-extraction']).toHaveBeenCalledWith(
      'SinaiCamps browser AI warm-up',
      { pooling: 'mean', normalize: true },
    );
    expect(mockShowToast).toHaveBeenCalledWith('Browser AI model ready.', 'success');

    // Download progress events surfaced through the real progress_callback.
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('Loading model for tool…')).toBeInTheDocument();

    // A later `progress` event with total 0 renders no percentage.
    await act(async () => {
      capturedOptions.progress_callback?.({ status: 'progress', loaded: 0, total: 0 });
    });
    await waitFor(() => {
      expect(screen.queryByText('30%')).not.toBeInTheDocument();
    });
  });

  it('runs embeddings and shows dimensions, first values and latency', async () => {
    render(<BrowserAIPanel />);

    await userEvent.type(screen.getByTestId('bai-embed-input'), 'The desert at dusk');
    await userEvent.click(screen.getByTestId('bai-embed-run'));

    const result = await screen.findByTestId('bai-embed-result');
    expect(within(result).getByText('8 dims')).toBeInTheDocument();
    expect(within(result).getByText(/Latency \d+ms/)).toBeInTheDocument();
    // 8-dim vector → no truncation marker, first 8 values listed
    expect(result).toHaveTextContent(
      '[0.2500, -0.5000, 1.0000, 2.5000, 0.7500, -0.1250, 0.0000, 0.5000]',
    );
    expect(result).not.toHaveTextContent('…');

    expect(fakePipes['feature-extraction']).toHaveBeenCalledWith('The desert at dusk', {
      pooling: 'mean',
      normalize: true,
    });
  });

  it('formats large latencies in seconds and truncates long vectors', async () => {
    const embedSpy = vi
      .spyOn(browserAI, 'getEmbeddings')
      .mockResolvedValue({
        dimensions: 384,
        vector: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
        latencyMs: 2500,
      });

    render(<BrowserAIPanel />);
    await userEvent.type(screen.getByTestId('bai-embed-input'), 'slow');
    await userEvent.click(screen.getByTestId('bai-embed-run'));

    const result = await screen.findByTestId('bai-embed-result');
    expect(within(result).getByText('384 dims')).toBeInTheDocument();
    expect(within(result).getByText('Latency 2.50s')).toBeInTheDocument();
    // 384-dim vector → first 8 values rendered with a truncation marker
    expect(result).toHaveTextContent(
      '[0.2500, 0.5000, 0.7500, 1.0000, 1.2500, 1.5000, 1.7500, 2.0000, …',
    );
    expect(embedSpy).toHaveBeenCalled();
  });

  it('runs sentiment and shows the label badge with confidence', async () => {
    render(<BrowserAIPanel />);

    await userEvent.type(screen.getByTestId('bai-sentiment-input'), 'Magical!');
    await userEvent.click(screen.getByTestId('bai-sentiment-run'));

    const result = await screen.findByTestId('bai-sentiment-result');
    expect(within(result).getByText('POSITIVE')).toBeInTheDocument();
    expect(within(result).getByText('98.7% confidence')).toBeInTheDocument();
    expect(within(result).getByText(/Latency \d+ms/)).toBeInTheDocument();

    expect(fakePipes['sentiment-analysis']).toHaveBeenCalledWith('Magical!');
  });

  it('runs text generation and forwards the max new tokens selection', async () => {
    render(<BrowserAIPanel />);

    await userEvent.type(screen.getByTestId('bai-gen-input'), 'Summarize a day:');
    await userEvent.click(screen.getByTestId('bai-gen-run'));

    const result = await screen.findByTestId('bai-gen-result');
    expect(result).toHaveTextContent('A quiet camp under the stars.');
    expect(within(result).getByText('Generated')).toBeInTheDocument();
    // Default token cap is 64.
    expect(fakePipes['text2text-generation']).toHaveBeenLastCalledWith('Summarize a day:', {
      max_new_tokens: 64,
    });

    // Switch to 32 tokens and regenerate.
    await userEvent.selectOptions(screen.getByLabelText('Max new tokens'), '32');
    await userEvent.click(screen.getByTestId('bai-gen-run'));
    await waitFor(() => {
      expect(fakePipes['text2text-generation']).toHaveBeenLastCalledWith('Summarize a day:', {
        max_new_tokens: 32,
      });
    });
  });

  it('renders a model-load error with toast and error badge', async () => {
    h.pipeline.mockRejectedValueOnce(new Error('download failed'));
    render(<BrowserAIPanel />);

    await userEvent.click(screen.getByTestId('bai-load-model-btn'));

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Browser AI: Failed to load "Xenova/all-MiniLM-L6-v2" (feature-extraction). Check your connection and retry. — download failed',
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      'Browser AI: Failed to load "Xenova/all-MiniLM-L6-v2" (feature-extraction). Check your connection and retry. — download failed',
      'error',
    );
  });

  it('renders an inference error inline and as a toast', async () => {
    render(<BrowserAIPanel />);
    await userEvent.click(screen.getByTestId('bai-load-model-btn'));
    await screen.findByText('Ready');

    fakePipes['feature-extraction'].mockRejectedValueOnce(new Error('inference boom'));
    await userEvent.type(screen.getByTestId('bai-embed-input'), 'boom');
    await userEvent.click(screen.getByTestId('bai-embed-run'));

    await waitFor(() => {
      expect(screen.getByText(/Browser AI: Embedding extraction failed\. — inference boom/)).toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/Browser AI: Embedding extraction failed\. — inference boom/),
      'error',
    );
  });

  it('renders a sentiment inference error inline and as a toast', async () => {
    const classifySpy = vi
      .spyOn(browserAI, 'classifySentiment')
      .mockRejectedValue(new Error('sentiment boom'));

    render(<BrowserAIPanel />);
    await userEvent.type(screen.getByTestId('bai-sentiment-input'), 'mixed feelings');
    await userEvent.click(screen.getByTestId('bai-sentiment-run'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('sentiment boom');
    expect(mockShowToast).toHaveBeenCalledWith('sentiment boom', 'error');
    expect(classifySpy).toHaveBeenCalledWith(
      'mixed feelings',
      expect.objectContaining({ device: 'cpu' }),
    );
  });

  it('renders a generation inference error inline and as a toast', async () => {
    const genSpy = vi
      .spyOn(browserAI, 'generateText')
      .mockRejectedValue(new Error('gen boom'));

    render(<BrowserAIPanel />);
    await userEvent.type(screen.getByTestId('bai-gen-input'), 'keep going');
    await userEvent.click(screen.getByTestId('bai-gen-run'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('gen boom');
    expect(mockShowToast).toHaveBeenCalledWith('gen boom', 'error');
    expect(genSpy).toHaveBeenCalledWith(
      'keep going',
      expect.objectContaining({ device: 'cpu', maxNewTokens: 64 }),
    );
  });

  it('enables the webgpu option and passes the device through to the pipeline', async () => {
    setWebGpuAvailable(true);
    render(<BrowserAIPanel />);

    const deviceSelect = screen.getByTestId('bai-device-select');
    expect(within(deviceSelect).getByRole('option', { name: 'WebGPU (GPU)' })).toBeEnabled();

    await userEvent.selectOptions(deviceSelect, 'webgpu');
    await userEvent.type(screen.getByTestId('bai-embed-input'), 'gpu text');
    await userEvent.click(screen.getByTestId('bai-embed-run'));

    await screen.findByTestId('bai-embed-result');
    expect(h.pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      expect.objectContaining({ device: 'webgpu', dtype: 'q8' }),
    );
  });

  it('renders the unavailable EmptyState when WASM is missing', () => {
    const originalWasm = (globalThis as { WebAssembly?: unknown }).WebAssembly;
    (globalThis as { WebAssembly?: unknown }).WebAssembly = undefined;
    try {
      render(<BrowserAIPanel />);
      expect(screen.getByText('Browser AI unavailable')).toBeInTheDocument();
      expect(screen.getByText(/requires a browser environment with WebAssembly/)).toBeInTheDocument();
      expect(screen.queryByTestId('bai-load-model-btn')).not.toBeInTheDocument();
    } finally {
      (globalThis as { WebAssembly?: unknown }).WebAssembly = originalWasm;
    }
  });
});