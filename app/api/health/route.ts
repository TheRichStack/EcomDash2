import { siteConfig } from "@/config/site"

export function GET() {
  return Response.json({
    status: "ok",
    app: siteConfig.name,
    timestamp: new Date().toISOString(),
  })
}
