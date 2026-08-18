import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotosStep, { type WizardPhoto } from '@/components/admin/PhotosStep';

const mockShowToast = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  upload: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    id,
    value,
    onChange,
    onKeyDown,
    onPaste,
    placeholder,
    type,
    'aria-label': ariaLabel,
  }: {
    id?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    'aria-label'?: string;
  }) => (
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={ariaLabel || id || 'input'}
    />
  ),
}));

import * as api from '@/lib/api';
const mockUpload = vi.mocked(api.upload);

const makePhoto = (url: string, type: 'upload' | 'url' = 'upload', name?: string): WizardPhoto => ({
  url,
  type,
  name,
});

const samplePhotos: WizardPhoto[] = [
  makePhoto('https://example.com/photo1.jpg', 'upload', 'photo1.jpg'),
  makePhoto('https://example.com/photo2.png', 'url'),
];

describe('PhotosStep', () => {
  let photos: WizardPhoto[];
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    photos = [];
    onChange = vi.fn();
  });

  it('renders with empty photo list', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    expect(screen.getByTestId('photos-step')).toBeInTheDocument();
    expect(screen.getByText(/Drop images here or click to browse/)).toBeInTheDocument();
    expect(screen.getByTestId('photos-file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('photos-list')).not.toBeInTheDocument();
  });

  it('upload button triggers file input click', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const browseBtn = screen.getByText('Browse Files');
    const fileInput = screen.getByTestId('photos-file-input');
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(browseBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('drop zone click triggers file input', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const dropZone = screen.getByRole('button', { name: /Drop images here or click to browse/ });
    const fileInput = screen.getByTestId('photos-file-input');
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(dropZone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('image preview displays correctly for uploaded and URL photos', () => {
    render(<PhotosStep photos={samplePhotos} onChange={onChange} />);
    const list = screen.getByTestId('photos-list');
    expect(list).toBeInTheDocument();

    const images = list.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/photo1.jpg');
    expect(images[1]).toHaveAttribute('src', 'https://example.com/photo2.png');

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('URL')).toBeInTheDocument();
  });

  it('remove button removes a photo from the list', () => {
    photos = [...samplePhotos];
    render(<PhotosStep photos={photos} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remove image' });
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([samplePhotos[1]]);
  });

  it('file type validation rejects non-image files', async () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const fileInput = screen.getByTestId('photos-file-input');

    const nonImageFile = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [nonImageFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to upload image', 'warning');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows warning for mixed files (some non-image)', async () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const fileInput = screen.getByTestId('photos-file-input');

    const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    const nonImageFile = new File(['doc'], 'readme.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile, nonImageFile], configurable: true });
    mockUpload.mockResolvedValue({ url: 'https://cdn.example.com/photo.jpg' });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to upload image', 'warning');
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it('URL validation rejects non-http URLs', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const urlInput = screen.getByTestId('Add Image by URL');
    fireEvent.change(urlInput, { target: { value: 'ftp://invalid.com/img.jpg' } });
    fireEvent.click(screen.getByText('Add URL'));

    expect(mockShowToast).toHaveBeenCalledWith('Please enter a valid image URL', 'warning');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('URL validation rejects empty input', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const urlInput = screen.getByTestId('Add Image by URL');
    fireEvent.change(urlInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Add URL'));

    expect(mockShowToast).toHaveBeenCalledWith('Please enter a valid image URL', 'warning');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects duplicate URLs', () => {
    photos = [makePhoto('https://example.com/existing.jpg', 'url')];
    render(<PhotosStep photos={photos} onChange={onChange} />);
    const urlInput = screen.getByTestId('Add Image by URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/existing.jpg' } });
    fireEvent.click(screen.getByText('Add URL'));

    expect(mockShowToast).toHaveBeenCalledWith('This image was already added', 'warning');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds valid URL to photo list', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const urlInput = screen.getByTestId('Add Image by URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/new.jpg' } });
    fireEvent.click(screen.getByText('Add URL'));

    expect(onChange).toHaveBeenCalledWith([{ url: 'https://example.com/new.jpg', type: 'url' }]);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('Enter key adds URL', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const urlInput = screen.getByTestId('Add Image by URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/key.jpg' } });
    fireEvent.keyDown(urlInput, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith([{ url: 'https://example.com/key.jpg', type: 'url' }]);
  });

  it('upload progress indicator shows during upload', async () => {
    let resolveUpload: (v: unknown) => void;
    mockUpload.mockImplementation(() => new Promise((r) => { resolveUpload = r; }));

    render(<PhotosStep photos={[]} onChange={onChange} />);
    const fileInput = screen.getByTestId('photos-file-input');
    const imageFile = new File(['img'], 'slow.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByTestId('photos-pending')).toBeInTheDocument();
    });
    expect(screen.getByText('slow.jpg')).toBeInTheDocument();
    expect(screen.getByText('Uploading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drop images here or click to browse/ })).toHaveAttribute('aria-disabled');

    resolveUpload!({ url: 'https://cdn.example.com/slow.jpg' });
    await waitFor(() => {
      expect(screen.queryByTestId('photos-pending')).not.toBeInTheDocument();
    });
  });

  it('error handling for failed uploads shows error toast', async () => {
    mockUpload.mockRejectedValue(new Error('Network timeout'));

    render(<PhotosStep photos={[]} onChange={onChange} />);
    const fileInput = screen.getByTestId('photos-file-input');
    const imageFile = new File(['img'], 'fail.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to upload image: Network timeout',
        'error',
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('successful upload appends photo to list', async () => {
    mockUpload.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.jpg' });

    render(<PhotosStep photos={[]} onChange={onChange} />);
    const fileInput = screen.getByTestId('photos-file-input');
    const imageFile = new File(['img'], 'uploaded.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [imageFile], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(imageFile);
      expect(onChange).toHaveBeenCalledWith([
        { url: 'https://cdn.example.com/uploaded.jpg', type: 'upload', name: 'uploaded.jpg' },
      ]);
    });
  });

  it('gallery grid layout has correct structure', () => {
    render(<PhotosStep photos={samplePhotos} onChange={onChange} />);
    const list = screen.getByTestId('photos-list');
    expect(list.className).toContain('grid');
    expect(list.className).toContain('grid-cols-2');
  });

  it('drop zone handles drag over and drop events', async () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const dropZone = screen.getByRole('button', { name: /Drop images here or click to browse/ });

    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', { value: {} });
    fireEvent(dropZone, dragOverEvent);

    expect(dropZone).toHaveAttribute('aria-label', 'Drop images to add them');
  });

  it('keyboard Enter on drop zone opens file browser', () => {
    render(<PhotosStep photos={[]} onChange={onChange} />);
    const dropZone = screen.getByRole('button', { name: /Drop images here or click to browse/ });
    const fileInput = screen.getByTestId('photos-file-input');
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.keyDown(dropZone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalled();
  });
});
