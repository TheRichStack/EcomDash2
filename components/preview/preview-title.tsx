import { CardDescription, CardTitle } from "@/components/ui/card"

type PreviewTitleProps = {
  title: string
  description: string
}

export function PreviewTitle({ title, description }: PreviewTitleProps) {
  return (
    <div className="flex flex-col gap-1">
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </div>
  )
}
