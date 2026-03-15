"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  BellIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CreditCardIcon,
  FolderKanbanIcon,
  InfoIcon,
  LayoutPanelTopIcon,
  LifeBuoyIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PreviewSection } from "@/components/preview/preview-section"
import { PreviewTitle } from "@/components/preview/preview-title"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeader } from "@/components/shared/section-header"
import { StatCard } from "@/components/shared/stat-card"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { previewSections } from "@/config/preview"

const teamRows = [
  {
    name: "Rich Stack Core",
    owner: "RS",
    status: "Stable",
    route: "/dashboard",
  },
  {
    name: "Preview Surface",
    owner: "TC",
    status: "Review",
    route: "/preview/components",
  },
  {
    name: "Marketing Shell",
    owner: "ML",
    status: "Ready",
    route: "/",
  },
]

const accordionItems = [
  {
    value: "item-1",
    title: "What belongs in components/ui?",
    content:
      "Only shadcn-generated primitives. Keep app-specific compositions out of that folder.",
  },
  {
    value: "item-2",
    title: "When should something move into shared?",
    content:
      "When the composition is generic, small, and clearly reused across multiple screens.",
  },
  {
    value: "item-3",
    title: "Where do page shells live?",
    content:
      "Headers, sidebars, wrappers, and shell-only pieces belong in components/layout.",
  },
]

const updates = [
  "Preview every new starter component before shipping it in an app flow.",
  "Keep starter docs current when folders or conventions move.",
  "Prefer variant props and semantic tokens over custom color classes.",
  "Install new primitives through the shadcn CLI instead of hand-rolling them.",
]

export default function ComponentPreviewPage() {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    new Date(2026, 2, 9)
  )
  const [billingPlan, setBillingPlan] = React.useState("growth")
  const [reviewChannel, setReviewChannel] = React.useState("email")
  const [emailUpdates, setEmailUpdates] = React.useState(true)
  const [autoArchive, setAutoArchive] = React.useState(false)

  const getSection = (id: string) => {
    const section = previewSections.find((entry) => entry.id === id)

    if (!section) {
      throw new Error(`Missing preview section config for ${id}.`)
    }

    return section
  }

  const actions = getSection("actions")
  const inputs = getSection("inputs")
  const navigation = getSection("navigation")
  const overlays = getSection("overlays")
  const feedback = getSection("feedback")
  const dataDisplay = getSection("data-display")

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <SectionHeader
          eyebrow="Starter system route"
          title="Component preview"
          description="A single page for inspecting every bundled starter component in light and dark mode."
          action={
            <>
              <Button asChild variant="outline">
                <Link href="/">
                  <ArrowRightIcon data-icon="inline-start" />
                  Home
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">
                  <FolderKanbanIcon data-icon="inline-start" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/preview/dashboard-patterns">
                  <LayoutPanelTopIcon data-icon="inline-start" />
                  Dashboard patterns
                </Link>
              </Button>
              <ThemeToggle />
            </>
          }
        />

        <div className="grid gap-8 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-8 xl:self-start">
            <Card>
              <CardHeader>
                <PreviewTitle
                  title="Preview index"
                  description="Jump between sections while reviewing the bundled primitives."
                />
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[60vh]">
                  <div className="flex gap-2 xl:flex-col">
                    {previewSections.map((section) => (
                      <Button
                        key={section.id}
                        asChild
                        variant="ghost"
                        className="justify-start"
                      >
                        <a href={`#${section.id}`}>{section.title}</a>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          <main className="flex flex-col gap-10">
            <PreviewSection {...actions}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Button"
                    description="Default, secondary, outline, ghost, destructive, link, and size variants."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Button>
                      <PlusIcon data-icon="inline-start" />
                      Create starter
                    </Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link action</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">
                      Continue
                      <ArrowRightIcon data-icon="inline-end" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="More actions"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </PreviewSection>

            <PreviewSection {...inputs}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Input / Label / Textarea"
                    description="A tidy starter form without custom wrappers or one-off styling."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="project-name">Project name</Label>
                      <Input
                        id="project-name"
                        placeholder="Rich Stack starter"
                        defaultValue="Rich Stack Starter"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="owner-email">Owner email</Label>
                      <Input
                        id="owner-email"
                        type="email"
                        placeholder="rich@example.com"
                        defaultValue="rich@example.com"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="starter-notes">Notes</Label>
                    <Textarea
                      id="starter-notes"
                      defaultValue="Keep this repo lean, inspectable, and based on shadcn composition."
                      rows={5}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Checkbox / Switch / Radio Group / Select"
                    description="Common filter and settings controls using the generated primitives directly."
                  />
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="email-updates">Email updates</Label>
                        <p className="text-sm text-muted-foreground">
                          Send release notes to the project owner.
                        </p>
                      </div>
                      <Checkbox
                        id="email-updates"
                        checked={emailUpdates}
                        onCheckedChange={(checked) =>
                          setEmailUpdates(checked === true)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="auto-archive">
                          Auto archive previews
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Move inactive preview examples into history.
                        </p>
                      </div>
                      <Switch
                        id="auto-archive"
                        checked={autoArchive}
                        onCheckedChange={setAutoArchive}
                      />
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border p-3">
                      <Label>Review channel</Label>
                      <RadioGroup
                        value={reviewChannel}
                        onValueChange={setReviewChannel}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="email" id="channel-email" />
                          <Label htmlFor="channel-email">Email summary</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="slack" id="channel-slack" />
                          <Label htmlFor="channel-slack">Slack digest</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="notion" id="channel-notion" />
                          <Label htmlFor="channel-notion">Notion doc</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border p-3">
                    <Label>Billing plan</Label>
                    <Select value={billingPlan} onValueChange={setBillingPlan}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Plans</SelectLabel>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="scale">Scale</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                      Current selection:
                      <span className="ml-2 font-medium text-foreground">
                        {billingPlan}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Calendar"
                    description="Use the bundled calendar for date picking and small planning views."
                  />
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    captionLayout="dropdown"
                    className="rounded-lg border"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Command"
                    description="Inline command palette usage with grouped actions and shortcuts."
                  />
                </CardHeader>
                <CardContent>
                  <Command className="rounded-lg border">
                    <CommandInput placeholder="Search starter commands..." />
                    <CommandList>
                      <CommandEmpty>No results found.</CommandEmpty>
                      <CommandGroup heading="Starter actions">
                        <CommandItem
                          onSelect={() =>
                            toast.success("Opened dashboard preview.")
                          }
                        >
                          <FolderKanbanIcon />
                          Open dashboard
                          <CommandShortcut>G D</CommandShortcut>
                        </CommandItem>
                        <CommandItem
                          onSelect={() =>
                            toast.success("Opened component preview.")
                          }
                        >
                          <SparklesIcon />
                          Open component preview
                          <CommandShortcut>G P</CommandShortcut>
                        </CommandItem>
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup heading="Support">
                        <CommandItem>
                          <LifeBuoyIcon />
                          Starter docs
                          <CommandShortcut>?</CommandShortcut>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </CardContent>
              </Card>
            </PreviewSection>

            <PreviewSection {...navigation}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Breadcrumb / Separator"
                    description="Use these to keep trails and section dividers consistent."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link href="/">Home</Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link href="/preview/components">Preview</Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>Components</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>

                  <Separator />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm">
                      Overview
                    </Button>
                    <Button variant="ghost" size="sm">
                      Inventory
                    </Button>
                    <Button variant="ghost" size="sm">
                      Docs
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Tabs / Pagination"
                    description="Two navigation primitives that work well together for list and detail screens."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <Tabs defaultValue="overview" className="flex flex-col gap-4">
                    <TabsList className="w-fit">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="activity">Activity</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value="overview"
                      className="m-0 text-sm text-muted-foreground"
                    >
                      Neutral tab layouts are usually enough for starter
                      dashboards.
                    </TabsContent>
                    <TabsContent
                      value="activity"
                      className="m-0 text-sm text-muted-foreground"
                    >
                      Keep tab content thin and compose existing cards or tables
                      underneath.
                    </TabsContent>
                    <TabsContent
                      value="history"
                      className="m-0 text-sm text-muted-foreground"
                    >
                      Promote patterns into shared components only when reuse is
                      clear.
                    </TabsContent>
                  </Tabs>

                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious href="#navigation" />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#navigation" isActive>
                          1
                        </PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationLink href="#feedback">2</PaginationLink>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext href="#data-display" />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </CardContent>
              </Card>

              <Card className="xl:col-span-2">
                <CardHeader>
                  <PreviewTitle
                    title="Sidebar / Scroll Area"
                    description="The starter app shell is built from the sidebar primitives; scroll areas keep longer content contained."
                  />
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-lg border">
                    <SidebarProvider defaultOpen>
                      <div className="flex min-h-80 bg-muted/20">
                        <Sidebar collapsible="none" className="border-r">
                          <SidebarHeader>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-sm font-medium">
                                Preview shell
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Minimal sidebar composition
                              </p>
                            </div>
                          </SidebarHeader>
                          <SidebarSeparator />
                          <SidebarContent>
                            <SidebarGroup>
                              <SidebarGroupLabel>Sections</SidebarGroupLabel>
                              <SidebarGroupContent>
                                <SidebarMenu>
                                  <SidebarMenuItem>
                                    <SidebarMenuButton isActive>
                                      Overview
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                  <SidebarMenuItem>
                                    <SidebarMenuButton>
                                      Components
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                  <SidebarMenuItem>
                                    <SidebarMenuButton>Docs</SidebarMenuButton>
                                  </SidebarMenuItem>
                                </SidebarMenu>
                              </SidebarGroupContent>
                            </SidebarGroup>
                          </SidebarContent>
                          <SidebarFooter>
                            <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
                              Sidebar footer content
                            </div>
                          </SidebarFooter>
                        </Sidebar>

                        <ScrollArea className="h-80 flex-1">
                          <div className="flex flex-col gap-4 p-4">
                            {updates.map((update) => (
                              <div
                                key={update}
                                className="rounded-lg border bg-background p-4"
                              >
                                <p className="text-sm text-muted-foreground">
                                  {update}
                                </p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </SidebarProvider>
                  </div>
                </CardContent>
              </Card>
            </PreviewSection>

            <PreviewSection {...overlays}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Dialog / Sheet"
                    description="Use dialogs for focused decisions and sheets for larger secondary workflows."
                  />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>Open dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Starter dialog</DialogTitle>
                        <DialogDescription>
                          Use this for focused confirmation or lightweight
                          forms.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        Keep content short and lean on the generated header,
                        body, and footer structure.
                      </div>
                      <DialogFooter>
                        <Button variant="outline">Cancel</Button>
                        <Button>Continue</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">Open sheet</Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Starter sheet</SheetTitle>
                        <SheetDescription>
                          Useful for filters, settings, or secondary data entry.
                        </SheetDescription>
                      </SheetHeader>
                      <div className="flex flex-col gap-4 px-4 text-sm text-muted-foreground">
                        <div className="rounded-lg border p-3">
                          Add composed primitives here rather than building a
                          custom drawer wrapper.
                        </div>
                        <div className="rounded-lg border p-3">
                          The sheet component already handles the overlay and
                          transitions.
                        </div>
                      </div>
                      <SheetFooter>
                        <Button variant="outline">Close</Button>
                        <Button>Save changes</Button>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Dropdown Menu / Popover"
                    description="Contextual actions and small supporting panels should stay on these primitives."
                  />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Actions
                        <ChevronsUpDownIcon data-icon="inline-end" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                      <DropdownMenuGroup>
                        <DropdownMenuItem>
                          <UserIcon />
                          View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <CreditCardIcon />
                          Billing settings
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem>
                          <Settings2Icon />
                          Workspace preferences
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">
                        Filters
                        <Settings2Icon data-icon="inline-end" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="flex w-80 flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="popover-search">Search scope</Label>
                        <Input
                          id="popover-search"
                          placeholder="Starter components"
                          defaultValue="Starter components"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="popover-updates">Only updated</Label>
                          <p className="text-xs text-muted-foreground">
                            Limit results to recently touched files.
                          </p>
                        </div>
                        <Switch id="popover-updates" defaultChecked />
                      </div>
                    </PopoverContent>
                  </Popover>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Hover Card / Tooltip"
                    description="Use tooltip for quick labels and hover card for slightly richer context."
                  />
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-4">
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Button variant="ghost" className="px-0">
                        @richstack
                      </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="flex w-80 items-start gap-3">
                      <Avatar className="size-10">
                        <AvatarImage
                          src="/placeholder-avatar.png"
                          alt="Rich Stack placeholder avatar"
                        />
                        <AvatarFallback>RS</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium">
                          Rich Stack starter
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Neutral project foundation with preview coverage and a
                          minimal app shell.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="Info">
                        <InfoIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Tooltips are best for short labels, not full explanations.
                    </TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            </PreviewSection>

            <PreviewSection {...feedback}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Alert"
                    description="Callouts and warnings should use the built-in alert variants."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Alert>
                    <InfoIcon />
                    <AlertTitle>Starter guidance</AlertTitle>
                    <AlertDescription>
                      Keep cards, filters, tables, and tabs composed from the
                      bundled primitives first.
                    </AlertDescription>
                  </Alert>

                  <Alert variant="destructive">
                    <CircleAlertIcon />
                    <AlertTitle>Do not bypass lint</AlertTitle>
                    <AlertDescription>
                      Avoid ignore-during-build hacks in the starter repo.
                    </AlertDescription>
                    <AlertAction>
                      <Button variant="outline" size="sm">
                        Review rules
                      </Button>
                    </AlertAction>
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Progress / Skeleton"
                    description="Use progress for explicit completion and skeletons for loading placeholders."
                  />
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Starter docs refresh</span>
                        <span className="text-muted-foreground">68%</span>
                      </div>
                      <Progress value={68} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Preview inventory</span>
                        <span className="text-muted-foreground">42%</span>
                      </div>
                      <Progress value={42} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Sonner"
                    description="Toast feedback is handled by sonner through the generated shadcn wrapper."
                  />
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button
                    onClick={() =>
                      toast.success("Starter preview saved.", {
                        description:
                          "Use toasts for transient confirmations, not primary content.",
                      })
                    }
                  >
                    <CheckIcon data-icon="inline-start" />
                    Success toast
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast("Review scheduled", {
                        description:
                          "A teammate will inspect the new component preview.",
                      })
                    }
                  >
                    <BellIcon data-icon="inline-start" />
                    Neutral toast
                  </Button>
                </CardContent>
              </Card>
            </PreviewSection>

            <PreviewSection {...dataDisplay}>
              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Card / Badge / Avatar"
                    description="Starter list surfaces usually rely on these three primitives together."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {teamRows.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10">
                          <AvatarImage
                            src="/placeholder-avatar.png"
                            alt={row.owner}
                          />
                          <AvatarFallback>{row.owner}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Route: {row.route}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{row.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Table"
                    description="Use the table primitives for dense operational surfaces instead of ad hoc markup."
                  />
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Route</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamRows.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="font-medium">
                            {row.name}
                          </TableCell>
                          <TableCell>{row.owner}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {row.route}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Accordion"
                    description="Good for compact documentation and settings disclosure blocks."
                  />
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {accordionItems.map((item) => (
                      <AccordionItem key={item.value} value={item.value}>
                        <AccordionTrigger>{item.title}</AccordionTrigger>
                        <AccordionContent>{item.content}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <PreviewTitle
                    title="Starter assemblies"
                    description="Shared starter components stay tiny and generic while composing shadcn primitives."
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <SectionHeader
                    title="Shared components"
                    description="SectionHeader, StatCard, and EmptyState are small starter-level assemblies."
                  />
                  <StatCard
                    title="Preview coverage"
                    value="Complete"
                    description="Bundled components are visible in one place."
                    change="+1 route"
                  />
                  <EmptyState
                    title="No archived examples"
                    description="When a surface has no records, keep the layout in place rather than leaving a blank hole."
                    action={
                      <Button variant="outline">
                        <CalendarDaysIcon data-icon="inline-start" />
                        Schedule review
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            </PreviewSection>
          </main>
        </div>
      </div>
    </div>
  )
}
