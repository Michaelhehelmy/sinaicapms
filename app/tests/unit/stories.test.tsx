import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as BadgeStories from '@/stories/Badge.stories';
import * as ButtonStories from '@/stories/Button.stories';
import * as CardStories from '@/stories/Card.stories';
import * as DataTableStories from '@/stories/DataTable.stories';
import * as EmptyStateStories from '@/stories/EmptyState.stories';
import * as InputStories from '@/stories/Input.stories';
import * as LoadingSpinnerStories from '@/stories/LoadingSpinner.stories';
import * as ModalStories from '@/stories/Modal.stories';
import * as StatCardStories from '@/stories/StatCard.stories';
import * as ToastStories from '@/stories/Toast.stories';

// Storybook fixtures are not shipped in the production Astro build, but we
// render every exported story to keep their render functions covered and
// prevent regressions in the UI catalog.
const storyModules: Array<[string, Record<string, unknown>]> = [
  ['Badge', BadgeStories as unknown as Record<string, unknown>],
  ['Button', ButtonStories as unknown as Record<string, unknown>],
  ['Card', CardStories as unknown as Record<string, unknown>],
  ['DataTable', DataTableStories as unknown as Record<string, unknown>],
  ['EmptyState', EmptyStateStories as unknown as Record<string, unknown>],
  ['Input', InputStories as unknown as Record<string, unknown>],
  ['LoadingSpinner', LoadingSpinnerStories as unknown as Record<string, unknown>],
  ['Modal', ModalStories as unknown as Record<string, unknown>],
  ['StatCard', StatCardStories as unknown as Record<string, unknown>],
  ['Toast', ToastStories as unknown as Record<string, unknown>],
];

for (const [moduleName, mod] of storyModules) {
  describe(`${moduleName}.stories`, () => {
    it('renders every exported story without crashing', () => {
      const meta = mod.default as {
        component?: React.ComponentType<Record<string, unknown>>;
      };
      expect(meta.component).toBeDefined();

      const stories = Object.entries(mod).filter(([name]) => name !== 'default');
      expect(stories.length).toBeGreaterThan(0);

      for (const [name, story] of stories) {
        const s = story as {
          render?: () => React.ReactElement;
          args?: Record<string, unknown>;
        };
        // Storybook invokes `render` as a function component (it may call
        // hooks like useState), so createElement it with the story args
        // instead of calling it directly.
        const component = (s.render ?? meta.component) as React.ComponentType<Record<string, unknown>>;
        const { container } = render(React.createElement(component, s.args));
        expect(container).toBeTruthy();
      }
    });
  });
}
