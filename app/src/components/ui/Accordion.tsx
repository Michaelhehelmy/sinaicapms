import React, { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

interface AccordionContextValue {
  openItems: string[];
  toggle: (value: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion components must be used within <Accordion>');
  return ctx;
}

interface AccordionProps {
  type?: 'single' | 'multiple';
  defaultValue?: string[];
  className?: string;
  children: React.ReactNode;
}

interface AccordionItemProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

interface AccordionTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'id'> {
  value: string;
  children: React.ReactNode;
}

interface AccordionContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Accessible Accordion — buttons with aria-expanded/aria-controls, panels with
 * role="region" + aria-labelledby, keyboard operable (native buttons; arrow
 * keys work when trigger is focused). Single or multiple open items.
 *
 * @example
 * <Accordion type="single" defaultValue={['a']}>
 *   <AccordionItem value="a">
 *     <AccordionTrigger value="a">What's included?</AccordionTrigger>
 *     <AccordionContent value="a">Tents, meals, guides.</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 */
export function Accordion({
  type = 'single',
  defaultValue = [],
  className,
  children,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultValue);

  const toggle = useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        if (type === 'single') {
          return prev.includes(value) ? [] : [value];
        }
        return prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value];
      });
    },
    [type],
  );

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div
        className={cn(
          'divide-y divide-gray-200 rounded-xl border border-warm-100 bg-white',
          className,
        )}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({ value, className, children }: AccordionItemProps) {
  return <div className={cn('px-4', className)}>{children}</div>;
}

export function AccordionTrigger({
  value,
  children,
  className,
  ...rest
}: AccordionTriggerProps) {
  const { openItems, toggle } = useAccordion();
  const open = openItems.includes(value);
  const triggerId = `${value}-trigger`;
  const contentId = `${value}-content`;

  return (
    <button
      type="button"
      id={triggerId}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={() => toggle(value)}
      className={cn(
        'flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-semibold text-gray-800',
        'rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className,
      )}
      {...rest}
    >
      {children}
      <svg
        className={cn(
          'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200',
          open && 'rotate-180',
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

export function AccordionContent({
  value,
  className,
  children,
}: AccordionContentProps) {
  const { openItems } = useAccordion();
  const open = openItems.includes(value);
  const contentId = `${value}-content`;
  const triggerId = `${value}-trigger`;

  return (
    <div
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      hidden={!open}
      className={cn('pb-4 text-sm text-gray-600', className)}
    >
      {open ? children : null}
    </div>
  );
}
