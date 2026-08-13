import type { Meta, StoryObj } from '@storybook/react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/Accordion';

const meta: Meta<typeof Accordion> = {
  title: 'UI/Accordion',
  component: Accordion,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Single: Story = {
  render: () => (
    <Accordion type="single" defaultValue={['a']}>
      <AccordionItem value="a">
        <AccordionTrigger value="a">What's included in the stay?</AccordionTrigger>
        <AccordionContent value="a">
          Bedouin tent accommodation, three meals a day, guided desert hikes, and
          evening fire sessions.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger value="b">Do you offer transfers?</AccordionTrigger>
        <AccordionContent value="b">
          Yes — private transfers from Sharm El-Sheikh, Dahab, and El-Tor can be
          arranged for an additional fee.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="c">
        <AccordionTrigger value="c">What should I bring?</AccordionTrigger>
        <AccordionContent value="c">
          Warm layers for the evening, sunscreen, comfortable shoes, and a
          headlamp if you plan to join sunrise hikes.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" defaultValue={['a']}>
      <AccordionItem value="a">
        <AccordionTrigger value="a">Item one</AccordionTrigger>
        <AccordionContent value="a">Multiple panels can stay open.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger value="b">Item two</AccordionTrigger>
        <AccordionContent value="b">Independent open state.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
