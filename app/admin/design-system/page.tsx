"use client"

import * as React from "react"
import { toast } from "sonner"
import { ArrowUpRight, Inbox, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"

const sectionHeading =
  "text-2xl font-semibold tracking-tight mt-12 mb-4"

const gradientSwatches = [
  { name: "gradient-brand", className: "gradient-brand" },
  { name: "gradient-success", className: "gradient-success" },
  { name: "gradient-warning", className: "gradient-warning" },
  { name: "gradient-danger", className: "gradient-danger" },
  { name: "gradient-premium", className: "gradient-premium" },
] as const

const buttonVariants = [
  "default",
  "primary",
  "premium",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const
const buttonSizes = ["default", "sm", "lg", "icon"] as const

const badgeVariants = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "success",
  "brand",
  "warning",
  "danger",
] as const

export default function DesignSystemPage() {
  return (
    <div className="container mx-auto py-12 max-w-6xl">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">Design System</h1>
      <p className="text-muted-foreground">
        Phase 71 — every primitive variant + every glass pattern. Living style guide.
      </p>

      {/* ============ TOKENS ============ */}
      <h2 className={sectionHeading}>1. Gradient Tokens</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {gradientSwatches.map(({ name, className }) => (
          <div key={name} className="flex flex-col gap-2">
            <div className={`${className} h-20 w-full rounded-md shadow-glass`} />
            <code className="text-xs text-muted-foreground">.{name}</code>
          </div>
        ))}
      </div>

      {/* ============ GLASS SURFACES ============ */}
      <h2 className={sectionHeading}>2. Glass Surfaces (Card variants)</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="glass">
          <CardHeader>
            <CardTitle>variant=&quot;glass&quot;</CardTitle>
            <CardDescription>16px backdrop blur, subtle surface</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use for section panels, hover surfaces.
          </CardContent>
        </Card>
        <Card variant="glass-strong">
          <CardHeader>
            <CardTitle>variant=&quot;glass-strong&quot;</CardTitle>
            <CardDescription>24px blur, denser bg</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use for modal content, popovers, sidebars.
          </CardContent>
        </Card>
        <Card variant="stat">
          <CardHeader>
            <CardTitle>variant=&quot;stat&quot;</CardTitle>
            <CardDescription>3px gradient-brand top edge</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl">$42,180</div>
            <div className="text-xs text-emerald-400 mt-1">+12.4% vs last week</div>
          </CardContent>
        </Card>
      </div>

      {/* ============ BUTTONS ============ */}
      <h2 className={sectionHeading}>3. Buttons (variant × size)</h2>
      <div className="space-y-4">
        {buttonVariants.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <div className="w-24 text-xs text-muted-foreground">{variant}</div>
            {buttonSizes.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size === "icon" ? <Sparkles /> : `${variant} ${size}`}
              </Button>
            ))}
          </div>
        ))}
      </div>

      {/* ============ BADGES ============ */}
      <h2 className={sectionHeading}>4. Badges</h2>
      <div className="flex flex-wrap gap-2">
        {badgeVariants.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </div>

      {/* ============ INPUT + TEXTAREA ============ */}
      <h2 className={sectionHeading}>5. Input + Textarea (focused state)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <Input autoFocus placeholder="Focused input — gradient border + glow" />
        <Textarea placeholder="Click to focus the textarea" rows={3} />
      </div>

      {/* ============ TABS ============ */}
      <h2 className={sectionHeading}>6. Tabs (default + line)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <p className="text-xs text-muted-foreground mb-2">variant=&quot;default&quot;</p>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-3 text-sm text-muted-foreground">
              Overview panel
            </TabsContent>
            <TabsContent value="details" className="mt-3 text-sm text-muted-foreground">
              Details panel
            </TabsContent>
            <TabsContent value="settings" className="mt-3 text-sm text-muted-foreground">
              Settings panel
            </TabsContent>
          </Tabs>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">variant=&quot;line&quot; (gradient underline)</p>
          <Tabs defaultValue="estimate">
            <TabsList variant="line">
              <TabsTrigger value="estimate">Estimate</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="send">Send</TabsTrigger>
            </TabsList>
            <TabsContent value="estimate" className="mt-3 text-sm text-muted-foreground">
              Estimate panel
            </TabsContent>
            <TabsContent value="photos" className="mt-3 text-sm text-muted-foreground">
              Photos panel
            </TabsContent>
            <TabsContent value="send" className="mt-3 text-sm text-muted-foreground">
              Send panel
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ============ DIALOG ============ */}
      <h2 className={sectionHeading}>7. Dialog (glass-strong overlay)</h2>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>
              Dialog content uses glass-strong + 24px backdrop blur. The overlay also blurs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ SKELETON ============ */}
      <h2 className={sectionHeading}>8. Skeleton (brand-tinted shimmer)</h2>
      <div className="max-w-md space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* ============ PATTERNS ============ */}
      <h2 className={sectionHeading}>9. Patterns (UI-SPEC catalog)</h2>

      {/* Pattern 1: Hero */}
      <div className="mt-6 mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.1 Hero zone (gradient-hero backdrop)</p>
        <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] px-8 py-16">
          <div className="absolute inset-0 gradient-hero -z-10" />
          <h3
            className="font-semibold tracking-tight"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.05 }}
          >
            From job site to sent estimate in 5 minutes.
          </h3>
          <p className="mt-4 text-muted-foreground max-w-xl">
            Record audio, snap photos, and Xtimator does the rest.
          </p>
          <div className="mt-6">
            <Button variant="primary" size="lg">
              Get started <ArrowUpRight />
            </Button>
          </div>
        </div>
      </div>

      {/* Pattern 2: Stat card */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.2 Stat card</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Revenue (30d)", value: "$42,180", delta: "+12.4%" },
            { label: "Estimates sent", value: "128", delta: "+8" },
            { label: "Acceptance rate", value: "62%", delta: "+3pp" },
            { label: "Active projects", value: "21", delta: "+2" },
          ].map((s) => (
            <Card key={s.label} variant="stat">
              <CardHeader>
                <CardDescription className="text-xs uppercase tracking-wide">
                  {s.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-3xl">{s.value}</div>
                <div className="text-xs text-emerald-400 mt-1">{s.delta}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pattern 3: Modal — same as section 7 */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">
          9.3 Modal — see section 7 above.
        </p>
      </div>

      {/* Pattern 4: Sidebar nav item */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.4 Sidebar nav item (gradient active bar)</p>
        <aside className="glass border-r border-[var(--glass-border)] w-56 rounded-md p-2">
          <ul className="space-y-1">
            {[
              { label: "Dashboard", active: true },
              { label: "Projects", active: false },
              { label: "Clients", active: false },
            ].map((it) => (
              <li key={it.label}>
                <button
                  className={`relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition ${
                    it.active
                      ? "bg-[var(--glass-bg-light)] text-foreground before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[1.5px] before:rounded-full before:bg-[image:var(--gradient-brand)]"
                      : "text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground"
                  }`}
                >
                  <Inbox className="size-4" />
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* Pattern 5: Toast */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.5 Toast (glass + colored left border)</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast.success("Estimate saved")}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.error("Failed to save")}>
            Error toast
          </Button>
          <Button variant="outline" onClick={() => toast.warning("Trial expiring soon")}>
            Warning toast
          </Button>
          <Button variant="outline" onClick={() => toast.info("New version available")}>
            Info toast
          </Button>
        </div>
      </div>

      {/* Pattern 6: Empty state */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.6 Empty state</p>
        <Card variant="glass">
          <CardContent className="flex flex-col items-center text-center py-12">
            <div className="size-12 rounded-full gradient-brand flex items-center justify-center text-white">
              <Inbox className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No estimates yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create your first estimate to see it here. It takes 5 minutes from audio to sent PDF.
            </p>
            <div className="mt-6">
              <Button variant="primary">Create estimate</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pattern 7: Loading skeleton — same as section 8 */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">
          9.7 Loading skeleton — see section 8 above.
        </p>
      </div>

      {/* Pattern 8: Tier cards */}
      <div className="mb-10">
        <p className="text-xs text-muted-foreground mb-3">9.8 Tier cards (escalating gradient)</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>3 estimates / month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl">$0</div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">
                Current plan
              </Button>
            </CardFooter>
          </Card>
          <Card variant="stat">
            <CardHeader>
              <CardTitle>
                Pro <Badge variant="brand" className="ml-2">Most popular</Badge>
              </CardTitle>
              <CardDescription>Unlimited estimates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl">$29<span className="text-sm text-muted-foreground">/mo</span></div>
            </CardContent>
            <CardFooter>
              <Button variant="primary" className="w-full">
                Upgrade to Pro
              </Button>
            </CardFooter>
          </Card>
          <Card
            variant="glass"
            className="relative overflow-hidden before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[image:var(--gradient-premium)] before:rounded-t-[var(--radius-lg)]"
          >
            <CardHeader>
              <CardTitle>Business</CardTitle>
              <CardDescription>Teams + branding + SSO</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-3xl">$99<span className="text-sm text-muted-foreground">/mo</span></div>
            </CardContent>
            <CardFooter>
              <Button variant="premium" className="w-full">
                Talk to sales
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
