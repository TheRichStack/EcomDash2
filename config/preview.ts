import type { PreviewSectionConfig } from "@/types"

export const previewSections: PreviewSectionConfig[] = [
  {
    id: "actions",
    title: "Actions",
    description:
      "Primary and secondary calls to action should stay on the button variants that ship with the starter.",
    components: ["Button"],
  },
  {
    id: "inputs",
    title: "Inputs",
    description:
      "Forms and filters should be composed from the standard shadcn controls rather than custom field wrappers.",
    components: [
      "Input",
      "Label",
      "Textarea",
      "Checkbox",
      "Radio Group",
      "Select",
      "Switch",
      "Calendar",
      "Command",
    ],
  },
  {
    id: "navigation",
    title: "Navigation",
    description:
      "Use the bundled navigation primitives for breadcrumbs, tabs, pagination, scroll regions, separators, and sidebars.",
    components: [
      "Breadcrumb",
      "Tabs",
      "Pagination",
      "Scroll Area",
      "Separator",
      "Sidebar",
    ],
  },
  {
    id: "overlays",
    title: "Overlays",
    description:
      "Dialogs, sheets, menus, and contextual overlays should stay close to the generated shadcn APIs.",
    components: [
      "Dialog",
      "Sheet",
      "Dropdown Menu",
      "Popover",
      "Hover Card",
      "Tooltip",
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    description:
      "Alerts, progress indicators, skeletons, and toasts provide the default response patterns for the starter.",
    components: ["Alert", "Progress", "Skeleton", "Sonner"],
  },
  {
    id: "data-display",
    title: "Data display",
    description:
      "Cards, badges, avatars, accordions, tables, and starter assemblies cover the common read-only surfaces.",
    components: [
      "Accordion",
      "Avatar",
      "Badge",
      "Card",
      "Table",
      "Empty State",
      "Stat Card",
    ],
  },
]
