
import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[#1a1c22] px-3 py-2 text-sm text-[#e8e4dc] ring-offset-transparent file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[rgba(232,228,220,0.35)] focus-visible:outline-none focus-visible:border-[#c4a35a] focus-visible:ring-2 focus-visible:ring-[rgba(196,163,90,0.15)] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
