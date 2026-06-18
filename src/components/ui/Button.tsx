
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--ax-accent-rgb),0.3)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    {
        variants: {
            variant: {
                default: "bg-[var(--ax-accent)] text-[#0a0c10] hover:bg-[var(--ax-accent-hover)] font-semibold border border-transparent",
                destructive:
                    "bg-[#e06050] text-white hover:bg-[#c8503f] border border-transparent",
                outline:
                    "border border-[rgba(255,255,255,0.12)] bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[#e8e4dc]",
                secondary:
                    "bg-[rgba(255,255,255,0.05)] text-[#e8e4dc] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.07)]",
                ghost: "hover:bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]",
                link: "text-[var(--ax-accent)] underline-offset-4 hover:underline",
            },
            size: {
                default: "h-10 px-4 py-2",
                sm: "h-9 rounded-md px-3",
                lg: "h-12 rounded-xl px-8 text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
