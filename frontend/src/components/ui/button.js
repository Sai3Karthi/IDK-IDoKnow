import * as React from 'react';
import { cn } from '../../lib/utils';

// Minimal shadcn/ui style button implementation
const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
};

export const Button = React.forwardRef(function Button(
  { className, variant = 'default', asChild = false, ...props }, ref
) {
  const Comp = asChild ? 'span' : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 disabled:pointer-events-none h-9 px-4 py-2 shadow',
        buttonVariants[variant] || buttonVariants.default,
        className
      )}
      {...props}
    />
  );
});

export default Button;
