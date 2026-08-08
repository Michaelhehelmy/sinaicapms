import type { Preview } from '@storybook/react';
import '../src/styles/global.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      config: {},
      options: {
        checks: { 'color-contrast': { options: { treatAnythingAsColor: true } } },
      },
    },
  },
};

export default preview;
