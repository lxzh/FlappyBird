import { forwardRef, type ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
// Locally owned, shadcn-style variants; no second UI framework.
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "outline" | "ghost";
    size?: "default" | "icon" | "small";
  }
>(function Button(
  { variant = "primary", size = "default", className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "button",
        `button-${variant}`,
        `button-${size}`,
        className,
      )}
      {...props}
    />
  );
});
