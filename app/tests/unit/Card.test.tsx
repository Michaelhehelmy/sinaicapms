import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies default padding (md)', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('p-6');
  });

  it('applies sm padding', () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('p-4');
  });

  it('applies lg padding', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('p-8');
  });

  it('applies no padding', () => {
    const { container } = render(<Card padding="none">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('p-');
  });

  it('applies hover effect when hover prop is true', () => {
    const { container } = render(<Card hover>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('hover:shadow-elevated');
    expect(card.className).toContain('transition-shadow');
  });

  it('does not apply hover effect by default', () => {
    const { container } = render(<Card>Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('hover:shadow-elevated');
  });

  it('accepts custom className', () => {
    const { container } = render(<Card className="custom">Content</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('custom');
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardHeader>
          <h3>Title</h3>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders action slot', () => {
    render(
      <Card>
        <CardHeader action={<button>Action</button>}>
          <h3>Title</h3>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('does not render action slot when not provided', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <h3>Title</h3>
        </CardHeader>
      </Card>,
    );
    const header = container.querySelector('.shrink-0.ml-4');
    expect(header).not.toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(
      <Card>
        <CardHeader className="custom-header">
          <h3>Title</h3>
        </CardHeader>
      </Card>,
    );
    const header = container.querySelector('.custom-header');
    expect(header).toBeInTheDocument();
  });
});

describe('CardBody', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardBody>Body content</CardBody>
      </Card>,
    );
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(
      <Card>
        <CardBody className="custom-body">Content</CardBody>
      </Card>,
    );
    const body = container.querySelector('.custom-body');
    expect(body).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(
      <Card>
        <CardFooter>Footer content</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('has border-top styling', () => {
    const { container } = render(
      <Card>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    const footer = container.querySelector('.border-t');
    expect(footer).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(
      <Card>
        <CardFooter className="custom-footer">Content</CardFooter>
      </Card>,
    );
    const footer = container.querySelector('.custom-footer');
    expect(footer).toBeInTheDocument();
  });
});
