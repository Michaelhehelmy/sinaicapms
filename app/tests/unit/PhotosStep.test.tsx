import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotosStep, { type WizardPhoto } from '@/components/admin/PhotosStep';

const mockShowToast = vi.fn();
const mockUpload = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  upload: (...args: unknown[]) => mockUpload(...args),
}));

/** Controlled harness so onChange updates the parent-owned list like the wizard does. */
function Harness({ initial = [] }: { initial?: WizardPhoto[] }) {
  const [photos, setPhotos] = useState<WizardPhoto[]>(initial);
  return <PhotosStep photos={photos} onChange={setPhotos} />;
}

function makeFile(name: string, type = 'image/png', size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('PhotosStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockReset();
    mockUpload.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.png' });
  });

  it('renders drop zone, hint, browse button and URL input', () => {
    render(<Harness />);
    expect(screen.getByText('Drop images here or click to browse')).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop images/)).toBeInTheDocument();
    expect(screen.getByText('Browse Files')).toBeInTheDocument();
    expect(screen.getByLabelText('Add Image by URL')).toBeInTheDocument();
    expect(screen.getByText(/paste an image URL with Ctrl\+V/)).toBeInTheDocument();
  });

  it('uploads files selected via the file input and appends results', async () => {
    render(<Harness />);
    const input = screen.getByTestId('photos-file-input');
    fireEvent.change(input, { target: { files: [makeFile('a.png'), makeFile('b.png')] } });
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.some((img) => img.getAttribute('src') === 'https://cdn.example.com/uploaded.png')).toBe(true);
    });
    expect(screen.getAllByText('Uploaded').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the in-flight pending list while uploading', async () => {
    let resolveUpload: (v: { url: string }) => void = () => {};
    mockUpload.mockImplementation(
      () =>
        new Promise<{ url: string }>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    render(<Harness />);
    const input = screen.getByTestId('photos-file-input');
    fireEvent.change(input, { target: { files: [makeFile('slow.png')] } });
    await waitFor(() => {
      expect(screen.getByTestId('photos-pending')).toBeInTheDocument();
      expect(screen.getByText('slow.png')).toBeInTheDocument();
      expect(screen.getByText('Uploading…')).toBeInTheDocument();
    });
    resolveUpload({ url: 'https://cdn.example.com/slow.png' });
    await waitFor(() => {
      expect(screen.queryByTestId('photos-pending')).not.toBeInTheDocument();
    });
  });

  it('warns when no image files are provided', async () => {
    render(<Harness />);
    const input = screen.getByTestId('photos-file-input');
    fireEvent.change(input, { target: { files: [makeFile('doc.pdf', 'application/pdf')] } });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('Failed to upload image', 'warning');
  });

  it('warns when some files are not images but still uploads the valid ones', async () => {
    render(<Harness />);
    const input = screen.getByTestId('photos-file-input');
    fireEvent.change(input, {
      target: { files: [makeFile('doc.pdf', 'application/pdf'), makeFile('photo.png')] },
    });
    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(mockShowToast).toHaveBeenCalledWith('Failed to upload image', 'warning');
    });
    await waitFor(() => {
      expect(screen.getByText('Uploaded')).toBeInTheDocument();
    });
  });

  it('shows an error toast when an upload fails but keeps successful ones', async () => {
    mockUpload.mockImplementation((file: File) =>
      file.name === 'bad.png'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ url: 'https://cdn.example.com/good.png' }),
    );
    render(<Harness />);
    const input = screen.getByTestId('photos-file-input');
    fireEvent.change(input, { target: { files: [makeFile('bad.png'), makeFile('good.png')] } });
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to upload image: boom', 'error');
      expect(screen.getByText('Uploaded')).toBeInTheDocument();
    });
  });

  it('uploads files dropped onto the drop zone', async () => {
    render(<Harness />);
    const zone = screen.getByRole('button', { name: /Drop images here/ });
    fireEvent.drop(zone, { dataTransfer: { files: [makeFile('drop.png')] } });
    expect(mockUpload).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText('Uploaded')).toBeInTheDocument();
    });
  });

  it('toggles active drag state on dragover and dragleave', () => {
    render(<Harness />);
    const zone = screen.getByRole('button', { name: /Drop images here/ });
    fireEvent.dragOver(zone);
    expect(screen.getByRole('button', { name: 'Drop images to add them' })).toBeInTheDocument();
    fireEvent.dragLeave(zone);
    expect(screen.getByRole('button', { name: /Drop images here/ })).toBeInTheDocument();
  });

  it('opens the file browser when the drop zone is activated with keyboard', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<Harness />);
    const zone = screen.getByRole('button', { name: /Drop images here/ });
    fireEvent.keyDown(zone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('adds a valid URL via the Add URL button', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Add Image by URL'), {
      target: { value: 'https://example.com/photo.jpg' },
    });
    fireEvent.click(screen.getByText('Add URL'));
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(screen.getByText('URL')).toBeInTheDocument();
  });

  it('rejects invalid URLs and duplicates with a warning', () => {
    render(<Harness initial={[{ url: 'https://example.com/photo.jpg', type: 'url' }]} />);
    fireEvent.change(screen.getByLabelText('Add Image by URL'), {
      target: { value: 'not-a-url' },
    });
    fireEvent.click(screen.getByText('Add URL'));
    expect(mockShowToast).toHaveBeenCalledWith('Please enter a valid http(s) image URL.', 'warning');

    fireEvent.change(screen.getByLabelText('Add Image by URL'), {
      target: { value: 'https://example.com/photo.jpg' },
    });
    fireEvent.click(screen.getByText('Add URL'));
    expect(mockShowToast).toHaveBeenCalledTimes(2);
  });

  it('adds a URL when Enter is pressed', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Add Image by URL'), {
      target: { value: 'https://example.com/enter.jpg' },
    });
    fireEvent.keyDown(screen.getByLabelText('Add Image by URL'), { key: 'Enter' });
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/enter.jpg');
  });

  it('adds a pasted URL and ignores non-URL paste', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Add Image by URL');
    fireEvent.paste(input, { clipboardData: { getData: () => 'https://example.com/paste.jpg' } });
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/paste.jpg');

    fireEvent.paste(input, { clipboardData: { getData: () => 'just text' } });
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('removes a photo when its remove button is clicked', () => {
    render(<Harness initial={[{ url: 'https://example.com/one.jpg', type: 'url' }]} />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove image')).not.toBeInTheDocument();
  });

  it('clears the URL input after a successful add', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Add Image by URL');
    fireEvent.change(input, { target: { value: 'https://example.com/clear.jpg' } });
    fireEvent.click(screen.getByText('Add URL'));
    expect(input).toHaveValue('');
  });
});
