import React, { useCallback, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  getBrowserModelStatus,
  getEmbeddings,
  classifySentiment,
  generateText,
  type BrowserDevice,
  type BrowserProgress,
  type EmbeddingsResult,
  type SentimentResult,
  type GenerateTextResult,
} from '@/lib/browser-ai';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const DEVICE_OPTIONS: { value: BrowserDevice; label: string; disabled?: boolean }[] = [
  { value: 'cpu', label: 'CPU (WASM)' },
  { value: 'webgpu', label: 'WebGPU (GPU)' },
];

const TOKEN_OPTIONS = [
  { value: '16', label: '16 tokens' },
  { value: '32', label: '32 tokens' },
  { value: '64', label: '64 tokens' },
  { value: '128', label: '128 tokens' },
];

const LOAD_STATE_LABEL: Record<LoadState, string> = {
  idle: 'Not loaded',
  loading: 'Loading…',
  ready: 'Ready',
  error: 'Error',
};

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function loadStateVariant(state: LoadState): 'neutral' | 'warning' | 'success' | 'error' {
  switch (state) {
    case 'loading':
      return 'warning';
    case 'ready':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

/* ─── Local stroke icons (repo style: inline SVG, no icon library) ─────── */

function ToolIcon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

const EMBED_ICON =
  'M8 4h.01M12 4h.01M16 4h.01M8 20h.01M12 20h.01M16 20h.01M4 8h.01M4 12h.01M4 16h.01M20 8h.01M20 12h.01M20 16h.01M7 7l10 10M17 7L7 17';
const SENTIMENT_ICON =
  'M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 9.75h.008v.008H9V9.75zm6 0h.008v.008H15V9.75z';
const GEN_ICON =
  'M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h10.5';
const CUSTOMER_ICON =
  'M12 2a4 4 0 00-4 4v2a4 4 0 008 0V6a4 4 0 00-4-4zM16 14h.01M8 14h.01M12 14v4M8 18h8M6 22h12';

/* ─── Result sub-views ──────────────────────────────────────────────────── */

function EmbeddingsResultView({ result }: { result: EmbeddingsResult }) {
  const preview = result.vector.slice(0, 8).map((v) => v.toFixed(4));
  return (
    <div
      data-testid="bai-embed-result"
      className="mt-3 rounded-lg border border-info-100 bg-info-50 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info" size="sm">
          {result.dimensions} dims
        </Badge>
        <span className="text-xs text-gray-500">Latency {formatLatency(result.latencyMs)}</span>
      </div>
      <p className="mt-1.5 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">First 8 values: </span>
        <span className="font-mono break-all">
          [{preview.join(', ')}
          {result.dimensions > 8 ? ', …' : ''}]
        </span>
      </p>
    </div>
  );
}

function SentimentResultView({
  result,
}: {
  result: SentimentResult;
}) {
  const label = (result.label ?? '').toUpperCase();
  const variant = label.includes('POSITIVE')
    ? 'success'
    : label.includes('NEGATIVE')
      ? 'error'
      : 'info';
  return (
    <div
      data-testid="bai-sentiment-result"
      className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant} size="sm">
          {result.label || 'Unknown'}
        </Badge>
        <Badge variant="neutral" size="sm">
          {(result.score * 100).toFixed(1)}% confidence
        </Badge>
        <span className="text-xs text-gray-500">Latency {formatLatency(result.latencyMs)}</span>
      </div>
    </div>
  );
}

function GenerationResultView({ result }: { result: GenerateTextResult }) {
  return (
    <div
      data-testid="bai-gen-result"
      className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
    >
      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{result.text}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge variant="default" size="sm">Generated</Badge>
        <span className="text-xs text-gray-500">Latency {formatLatency(result.latencyMs)}</span>
      </div>
    </div>
  );
}

/* ─── Panel ─────────────────────────────────────────────────────────────── */

export default function BrowserAIPanel() {
  const { showToast } = useToast();

  // Browser capability snapshot — computed once on mount, never imports the
  // transformers library (pure capability check in the client lib).
  const [status] = useState(() => getBrowserModelStatus());
  const [device, setDevice] = useState<BrowserDevice>('cpu');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadProgress, setLoadProgress] = useState<BrowserProgress | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Embeddings tool
  const [embedText, setEmbedText] = useState('');
  const [embedBusy, setEmbedBusy] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embedResult, setEmbedResult] = useState<EmbeddingsResult | null>(null);

  // Sentiment tool
  const [sentimentText, setSentimentText] = useState('');
  const [sentimentBusy, setSentimentBusy] = useState(false);
  const [sentimentError, setSentimentError] = useState<string | null>(null);
  const [sentimentResult, setSentimentResult] = useState<SentimentResult | null>(null);

  // Text generation tool
  const [genText, setGenText] = useState('');
  const [genTokens, setGenTokens] = useState('64');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<GenerateTextResult | null>(null);

  const handleDeviceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setDevice(e.target.value as BrowserDevice);
    // A device switch invalidates any warm-up state — the next run downloads
    // the model again for the newly selected backend.
    setLoadState('idle');
    setLoadProgress(null);
    setModelError(null);
  }, []);

  const handleToolError = useCallback(
    (err: unknown, setErr: (msg: string) => void) => {
      const msg = err instanceof Error ? err.message : String(err);
      setErr(msg);
      showToast(msg, 'error');
    },
    [showToast],
  );

  const handleLoadModel = useCallback(async () => {
    setLoadState('loading');
    setLoadProgress(null);
    setModelError(null);
    try {
      // Warm up the ONNX runtime by loading the smallest model (embeddings) on
      // the selected device. The client lib caches pipelines per
      // model/device/dtype, so the first tool call reuses this download.
      await getEmbeddings('SinaiCamps browser AI warm-up', {
        device,
        onProgress: setLoadProgress,
      });
      setLoadState('ready');
      showToast('Browser AI model ready.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadState('error');
      setModelError(msg);
      showToast(msg, 'error');
    }
  }, [device, showToast]);

  const runEmbeddings = useCallback(async () => {
    if (!embedText.trim()) {
      showToast('Enter some text to embed.', 'warning');
      return;
    }
    setEmbedResult(null);
    setEmbedError(null);
    setEmbedBusy(true);
    try {
      setEmbedResult(await getEmbeddings(embedText, { device, onProgress: setLoadProgress }));
    } catch (err) {
      handleToolError(err, setEmbedError);
    } finally {
      setEmbedBusy(false);
    }
  }, [embedText, device, handleToolError, showToast]);

  const runSentiment = useCallback(async () => {
    if (!sentimentText.trim()) {
      showToast('Enter some text to classify.', 'warning');
      return;
    }
    setSentimentResult(null);
    setSentimentError(null);
    setSentimentBusy(true);
    try {
      setSentimentResult(
        await classifySentiment(sentimentText, { device, onProgress: setLoadProgress }),
      );
    } catch (err) {
      handleToolError(err, setSentimentError);
    } finally {
      setSentimentBusy(false);
    }
  }, [sentimentText, device, handleToolError, showToast]);

  const runGeneration = useCallback(async () => {
    if (!genText.trim()) {
      showToast('Enter a prompt to generate from.', 'warning');
      return;
    }
    setGenResult(null);
    setGenError(null);
    setGenBusy(true);
    try {
      setGenResult(
        await generateText(genText, {
          device,
          maxNewTokens: parseInt(genTokens, 10) || 64,
          onProgress: setLoadProgress,
        }),
      );
    } catch (err) {
      handleToolError(err, setGenError);
    } finally {
      setGenBusy(false);
    }
  }, [genText, genTokens, device, handleToolError, showToast]);

  // Streaming download progress (shown while any model is being fetched).
  const showDownload =
    loadState === 'loading' || (loadProgress !== null && loadProgress.status === 'progress');
  const progressPct =
    loadProgress && loadProgress.total > 0
      ? Math.min(100, Math.round((loadProgress.loaded / loadProgress.total) * 100))
      : 0;

  if (!status.supported) {
    return (
      <Card padding="none" className="p-6" data-testid="browser-ai-panel">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ToolIcon d={CUSTOMER_ICON} />
          </span>
          <h3 className="text-base font-semibold text-gray-800">Browser AI</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Run lightweight ONNX models directly in this browser — no server round-trips.
        </p>
        <EmptyState
          title="Browser AI unavailable"
          description={status.reason ?? 'This browser cannot run on-device inference.'}
        />
      </Card>
    );
  }

  return (
    <div data-testid="browser-ai-panel" className="space-y-6">
      {/* ── Model status card ─────────────────────────────────────── */}
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <ToolIcon d={CUSTOMER_ICON} />
              </span>
              <h3 className="text-base font-semibold text-gray-800">On-device model runtime</h3>
              <Badge variant={loadStateVariant(loadState)} size="sm" dot>
                {LOAD_STATE_LABEL[loadState]}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 max-w-xl">
              Models download once and run locally via WebAssembly or WebGPU — your data never
              leaves this browser. Switching the device re-downloads the model for that backend.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select
                label="Device"
                data-testid="bai-device-select"
                options={DEVICE_OPTIONS.map((o) => ({
                  ...o,
                  disabled: o.value === 'webgpu' ? !status.webgpu : o.disabled,
                }))}
                value={device}
                onChange={handleDeviceChange}
                disabled={loadState === 'loading'}
              />
            </div>
            <Button
              data-testid="bai-load-model-btn"
              onClick={handleLoadModel}
              loading={loadState === 'loading'}
              disabled={loadState === 'ready'}
              variant={loadState === 'ready' ? 'success' : 'primary'}
            >
              {loadState === 'loading' ? 'Loading…' : loadState === 'ready' ? 'Model ready' : 'Load in browser'}
            </Button>
          </div>
        </div>

        {loadState === 'error' && modelError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-error-100 bg-error-50 px-3 py-2 text-sm text-error-700"
          >
            {modelError}
          </div>
        )}

        {showDownload && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>
                {loadState === 'loading' ? 'Downloading model…' : 'Loading model for tool…'}
              </span>
              {loadProgress && loadProgress.total > 0 && <span>{progressPct}%</span>}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-warm-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* ── Tools grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Embeddings */}
        <Card padding="md" className="flex flex-col">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-info-50 text-info-600">
                <ToolIcon d={EMBED_ICON} />
              </span>
              <h4 className="text-sm font-semibold text-gray-800">Embeddings</h4>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              All-MiniLM-L6-v2 — turn text into a 384-dim vector.
            </p>
          </div>
          <textarea
            data-testid="bai-embed-input"
            rows={4}
            value={embedText}
            onChange={(e) => setEmbedText(e.target.value)}
            placeholder="e.g. A quiet bedouin camp under the Sinai stars…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {embedError && (
            <p role="alert" className="mt-2 text-xs text-error-600">{embedError}</p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              data-testid="bai-embed-run"
              onClick={runEmbeddings}
              loading={embedBusy}
              disabled={!embedText.trim()}
              variant="secondary"
              size="md"
            >
              Run Embedding
            </Button>
          </div>
          {embedResult && <EmbeddingsResultView result={embedResult} />}
        </Card>

        {/* Sentiment */}
        <Card padding="md" className="flex flex-col">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-success-50 text-success-600">
                <ToolIcon d={SENTIMENT_ICON} />
              </span>
              <h4 className="text-sm font-semibold text-gray-800">Sentiment</h4>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              distilbert SST-2 — positive / negative classification.
            </p>
          </div>
          <textarea
            data-testid="bai-sentiment-input"
            rows={4}
            value={sentimentText}
            onChange={(e) => setSentimentText(e.target.value)}
            placeholder="e.g. The stargazing night was absolutely magical."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {sentimentError && (
            <p role="alert" className="mt-2 text-xs text-error-600">{sentimentError}</p>
          )}
          <div className="mt-3">
            <Button
              data-testid="bai-sentiment-run"
              onClick={runSentiment}
              loading={sentimentBusy}
              disabled={!sentimentText.trim()}
              variant="secondary"
              size="md"
            >
              Classify Sentiment
            </Button>
          </div>
          {sentimentResult && <SentimentResultView result={sentimentResult} />}
        </Card>

        {/* Text generation */}
        <Card padding="md" className="flex flex-col">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-warning-50 text-warning-600">
                <ToolIcon d={GEN_ICON} />
              </span>
              <h4 className="text-sm font-semibold text-gray-800">Text generation</h4>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              LaMini-Flan-T5 — short on-device completions.
            </p>
          </div>
          <textarea
            data-testid="bai-gen-input"
            rows={4}
            value={genText}
            onChange={(e) => setGenText(e.target.value)}
            placeholder="e.g. Summarize a day in Wadi Rum in one sentence:"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {genError && (
            <p role="alert" className="mt-2 text-xs text-error-600">{genError}</p>
          )}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div className="w-32">
              <Select
                label="Max new tokens"
                options={TOKEN_OPTIONS}
                value={genTokens}
                onChange={(e) => setGenTokens(e.target.value)}
              />
            </div>
            <Button
              data-testid="bai-gen-run"
              onClick={runGeneration}
              loading={genBusy}
              disabled={!genText.trim()}
              variant="secondary"
              size="md"
            >
              Generate
            </Button>
          </div>
          {genResult && <GenerationResultView result={genResult} />}
        </Card>
      </div>
    </div>
  );
}