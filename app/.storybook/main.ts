import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    // Ensure path aliases work
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@': '/workspace/sinaicamps/app/src',
      };
    }
    return config;
  },
};

export default config;
