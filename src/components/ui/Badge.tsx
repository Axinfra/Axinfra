
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-[4px] border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
    {
        variants: {
            variant: {
                default:
                    "border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.12)] text-[#c4a35a]",
                secondary:
                    "border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)]",
                destructive:
                    "border-[rgba(224,96,80,0.3)] bg-[rgba(220,80,60,0.1)] text-[#e06050]",
                outline: "text-[#e8e4dc] border-[rgba(255,255,255,0.12)]",
                success: "border-[rgba(92,186,128,0.3)] bg-[rgba(50,200,120,0.1)] text-[#5cba80]",
                warning: "border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.12)] text-[#c4a35a]",
                neutral: "border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)]",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
