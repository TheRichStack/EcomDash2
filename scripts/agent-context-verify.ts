import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

type Violation = {
  file: string
  message: string
}

const WORK_ORDER_DIR = path.join(process.cwd(), "docs", "ecomdash2", "work-orders")
const WORK_ORDER_MAX_READ_FIRST = 8
const WORK_ORDER_MAX_ALLOWED_EDIT_SCOPE = 3
const WORK_ORDER_MAX_V1_REFERENCES = 3

const AGENT_LINE_WARN_THRESHOLD = 900
const AGENT_LINE_FAIL_THRESHOLD = 1200

const AGENT_LINE_ALLOWLIST: Record<string, number> = {
  "lib/agent/orchestrator.ts": 4600,
  "lib/agent/tools.ts": 1400,
  "components/agent/agent-chat-sheet.tsx": 1300,
}

const CHECK_DIRS = ["lib/agent", "components/agent"]
const CHECK_EXTENSIONS = new Set([".ts", ".tsx"])

function normalizeRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/")
}

function listFilesRecursive(
  baseDir: string,
  predicate: (filePath: string) => boolean
) {
  const files: string[] = []
  const queue = [baseDir]

  while (queue.length > 0) {
    const current = queue.pop()

    if (!current) {
      continue
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name)

      if (entry.isDirectory()) {
        queue.push(absolutePath)
        continue
      }

      if (predicate(absolutePath)) {
        files.push(absolutePath)
      }
    }
  }

  return files
}

function extractSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = markdown.match(
    new RegExp(
      `^##\\s+${escapedHeading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`,
      "im"
    )
  )

  return match ? String(match[1] ?? "").trim() : null
}

function countBulletItems(sectionBody: string | null) {
  if (!sectionBody) {
    return 0
  }

  return sectionBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ")).length
}

function verifyWorkOrderFile(filePath: string) {
  const markdown = readFileSync(filePath, "utf8")
  const violations: Violation[] = []

  const readFirstCount = countBulletItems(extractSection(markdown, "Read first"))
  const allowedScopeCount = countBulletItems(
    extractSection(markdown, "Allowed edit scope")
  )
  const v1RefsCount = countBulletItems(
    extractSection(markdown, "V1 references allowed")
  )
  const outOfScopeSection = extractSection(markdown, "Out of scope")
  const outOfScopeCount = countBulletItems(outOfScopeSection)

  if (readFirstCount > WORK_ORDER_MAX_READ_FIRST) {
    violations.push({
      file: normalizeRelativePath(filePath),
      message: `Read first has ${readFirstCount} items; max is ${WORK_ORDER_MAX_READ_FIRST}.`,
    })
  }

  if (allowedScopeCount > WORK_ORDER_MAX_ALLOWED_EDIT_SCOPE) {
    violations.push({
      file: normalizeRelativePath(filePath),
      message: `Allowed edit scope has ${allowedScopeCount} items; max is ${WORK_ORDER_MAX_ALLOWED_EDIT_SCOPE}.`,
    })
  }

  if (v1RefsCount > WORK_ORDER_MAX_V1_REFERENCES) {
    violations.push({
      file: normalizeRelativePath(filePath),
      message: `V1 references allowed has ${v1RefsCount} items; max is ${WORK_ORDER_MAX_V1_REFERENCES}.`,
    })
  }

  if (!outOfScopeSection) {
    violations.push({
      file: normalizeRelativePath(filePath),
      message: 'Missing required "Out of scope" section.',
    })
  } else if (outOfScopeCount === 0) {
    violations.push({
      file: normalizeRelativePath(filePath),
      message: '"Out of scope" must contain at least one bullet item.',
    })
  }

  return violations
}

function verifyWorkOrders() {
  const files = listFilesRecursive(WORK_ORDER_DIR, (absolutePath) => {
    if (path.extname(absolutePath).toLowerCase() !== ".md") {
      return false
    }

    const fileName = path.basename(absolutePath).toLowerCase()
    return fileName !== "readme.md"
  })

  return files.flatMap((filePath) => verifyWorkOrderFile(filePath))
}

function countFileLines(filePath: string) {
  const content = readFileSync(filePath, "utf8")
  return content.split(/\r?\n/).length
}

function verifyAgentFileLineBudgets() {
  const warnings: string[] = []
  const violations: Violation[] = []

  const files = CHECK_DIRS.flatMap((dir) =>
    listFilesRecursive(path.join(process.cwd(), dir), (absolutePath) =>
      CHECK_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())
    )
  )

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath)
    const lines = countFileLines(filePath)

    if (lines > AGENT_LINE_WARN_THRESHOLD) {
      warnings.push(
        `${relativePath}: ${lines} lines (warning threshold ${AGENT_LINE_WARN_THRESHOLD}).`
      )
    }

    const allowlistedMax = AGENT_LINE_ALLOWLIST[relativePath]

    if (typeof allowlistedMax === "number") {
      if (lines > allowlistedMax) {
        violations.push({
          file: relativePath,
          message: `Allowlisted file exceeds ceiling: ${lines} > ${allowlistedMax}.`,
        })
      }
      continue
    }

    if (lines > AGENT_LINE_FAIL_THRESHOLD) {
      violations.push({
        file: relativePath,
        message: `Line budget exceeded: ${lines} > ${AGENT_LINE_FAIL_THRESHOLD}.`,
      })
    }
  }

  return { violations, warnings }
}

function printRatchetReport() {
  console.log("agent-context-ratchet: current allowlist ceilings")

  for (const [relativePath, ceiling] of Object.entries(AGENT_LINE_ALLOWLIST)) {
    const absolutePath = path.join(process.cwd(), ...relativePath.split("/"))
    const lines = countFileLines(absolutePath)
    const suggestedNext = Math.max(AGENT_LINE_FAIL_THRESHOLD, ceiling - 100)
    console.log(
      `${relativePath}: current=${lines}, ceiling=${ceiling}, suggested_next_ceiling=${suggestedNext}`
    )
  }
}

function main() {
  const ratchetReportOnly = process.argv.includes("--ratchet-report")

  const workOrderViolations = verifyWorkOrders()
  const lineBudgetResult = verifyAgentFileLineBudgets()
  const violations = [...workOrderViolations, ...lineBudgetResult.violations]

  for (const warning of lineBudgetResult.warnings) {
    console.warn(`WARN: ${warning}`)
  }

  if (ratchetReportOnly) {
    printRatchetReport()
  }

  if (violations.length > 0) {
    console.error("agent-context-verify: FAIL")
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.message}`)
    }
    process.exitCode = 1
    return
  }

  console.log("agent-context-verify: PASS")
}

main()
