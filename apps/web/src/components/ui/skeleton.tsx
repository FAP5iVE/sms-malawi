import { cn } from "@/lib/utils"

// [R15 fix] Was "animate-pulse bg-muted" — a fourth, visually distinct
// loading-placeholder treatment alongside the shared .skeleton shimmer
// utility (globals.css), PermissionGuard's old bespoke pulse, and
// DataTable's old bespoke pulse. All four now resolve to the same shimmer.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
