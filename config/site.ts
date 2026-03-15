import { ROUTES } from "@/lib/constants"
import { env } from "@/lib/env"

export const siteConfig = {
  name: "EcomDash2",
  description:
    "Reporting-first ecommerce performance dashboard rebuilt on the TRS starter core.",
  url: env.NEXT_PUBLIC_APP_URL,
  links: {
    home: ROUTES.home,
    dashboard: ROUTES.dashboard,
    preview: ROUTES.previewComponents,
    nextjs: "https://nextjs.org",
    shadcn: "https://ui.shadcn.com",
  },
} as const
