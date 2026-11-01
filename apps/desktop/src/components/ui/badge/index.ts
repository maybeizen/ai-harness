import { cva, type VariantProps } from 'class-variance-authority';
export { default as Badge } from './Badge.vue';
export const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
export type BadgeVariants = VariantProps<typeof badgeVariants>;
