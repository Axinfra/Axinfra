
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-[10px] text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    {
        variants: {
            variant: {
                default: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-500/20 border border-transparent",
                destructive:
                    "bg-danger-600 text-white hover:bg-danger-700 shadow-sm shadow-danger-500/20 border border-transparent",
                outline:
                    "border border-surface-300 bg-white hover:bg-surface-50 hover:text-surface-900 text-surface-700 shadow-xs",
                secondary:
                    "bg-surface-100 text-surface-900 hover:bg-surface-200 border border-transparent",
                ghost: "hover:bg-surface-100 hover:text-surface-900 text-surface-600",
                link: "text-primary-600 underline-offset-4 hover:underline",
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
        // Basic implementation without Radix Slot if package not available, but user plan implied typical shadcn structure. 
        // To be safe, I'll avoid Slot if Radix isn't strictly requested, but "Stripe-like" often implies generic flexibility.
        // I'll stick to simple button for now unless I install @radix-ui/react-slot.
        // The previous plan didn't explicitly ask for Radix. I will use standard button.

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
