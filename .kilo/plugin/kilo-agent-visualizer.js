import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

const BRIDGE_VERSION = "0.0.16"
const BRIDGE_RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
const MAX_DETAIL = 180
const MAX_LOG_BYTES = 4 * 1024 * 1024
const KEEP_LOG_BYTES = 768 * 1024
const MAX_LOG_ARCHIVES = 2
const OBSERVED_EVENT_TYPES = new Set([
  "session.created", "session.updated", "session.deleted",
  "session.status", "session.idle", "session.error",
  "permission.asked", "permission.replied",
  "file.edited",
  "message.updated"
])

function text(value) {
  return typeof value === "string" ? value : undefined
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "")
}

function sessionID(event) {
  const p = event?.properties ?? {}
  const type = String(event?.type || "")
  const common = first(
    text(event?.sessionID), text(event?.sessionId),
    text(p?.sessionID), text(p?.sessionId),
    text(p?.session?.id), text(p?.session?.sessionID),
    text(p?.info?.sessionID), text(p?.info?.sessionId),
    text(p?.message?.sessionID), text(p?.message?.sessionId),
    text(p?.part?.sessionID), text(p?.part?.sessionId),
    text(p?.permission?.sessionID), text(p?.permission?.sessionId),
    text(p?.request?.sessionID), text(p?.request?.sessionId)
  )
  if (common) return common
  // Session lifecycle events commonly expose the session object itself as info.
  // Do not use info.id for unrelated event families, where it may be a message/file id.
  return type.startsWith("session.") ? text(p?.info?.id) : undefined
}


function safeLabel(value, max = 96) {
  if (typeof value !== "string") return undefined
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ")
  return cleaned ? cleaned.slice(0, max) : undefined
}

function sanitizeEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {}
  const sanitized = {}
  const fields = [
    ["type", 64],
    ["sessionID", 128],
    ["agent", 96],
    ["parentID", 128],
    ["status", 64],
    ["tool", 96],
    ["activity", 64],
    ["detail", MAX_DETAIL]
  ]
  for (const [key, max] of fields) {
    const value = safeLabel(source[key], max)
    if (value) sanitized[key] = value
  }
  return sanitized
}

function sessionIdentity(event) {
  const p = event?.properties ?? {}
  const info = p?.info ?? {}
  return {
    agent: safeLabel(first(info?.agent, p?.agent, event?.agent)),
    parentID: safeLabel(first(info?.parentID, p?.parentID, event?.parentID), 128)
  }
}

function messageIdentity(event) {
  const p = event?.properties ?? {}
  const info = p?.info ?? {}
  return { agent: safeLabel(info?.agent) }
}

function statusOf(event) {
  const p = event?.properties ?? {}
  const value = first(p?.status?.type, p?.status, event?.status?.type, event?.status)
  return typeof value === "string" ? value : undefined
}


function toolActivity(tool) {
  const name = String(tool || "").toLowerCase()
  if (["read", "glob", "grep"].includes(name)) return "reading"
  if (["edit", "write", "apply_patch", "patch"].includes(name)) return "editing"
  if (["bash", "shell", "terminal"].includes(name)) return "terminal"
  if (["webfetch", "websearch", "fetch", "search"].includes(name)) return "web"
  if (["task", "subagent"].includes(name)) return "delegating"
  if (["question"].includes(name)) return "waiting"
  if (["todowrite", "todoread", "plan", "skill"].includes(name)) return "planning"
  return "tool"
}

function sanitizeRelativePath(candidate, directory) {
  if (typeof candidate !== "string" || !candidate) return undefined
  try {
    const projectRoot = resolve(directory)
    const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(projectRoot, candidate)
    const rel = relative(projectRoot, absolute)
    if (!rel || rel === ".") return "."
    if (rel.startsWith("..") || isAbsolute(rel)) return undefined
    return rel.replaceAll("\\", "/").slice(0, MAX_DETAIL)
  } catch {
    return undefined
  }
}

function sanitizeDetail(tool, args, directory) {
  const name = String(tool || "").toLowerCase()
  if (["read", "edit", "write", "apply_patch", "patch"].includes(name)) {
    const candidate = first(args?.filePath, args?.filepath, args?.path, args?.file, args?.target)
    return sanitizeRelativePath(candidate, directory)
  }
  if (["webfetch", "fetch"].includes(name)) {
    const candidate = first(args?.url, args?.href)
    if (typeof candidate !== "string") return undefined
    try {
      const url = new URL(candidate)
      return url.hostname.slice(0, MAX_DETAIL)
    } catch {
      return undefined
    }
  }
  // Deliberately do not log bash commands, grep/search queries, prompts, patterns,
  // tool output, or arbitrary argument objects.
  return undefined
}

function fileDetail(event, directory) {
  const p = event?.properties ?? {}
  return sanitizeRelativePath(first(p?.file, p?.filePath, p?.path), directory)
}

async function safeStatSize(file) {
  try {
    return (await stat(file)).size
  } catch {
    return 0
  }
}

function mergeIdentity(previous, entry) {
  const next = { ...(previous || {}) }
  const agent = safeLabel(entry?.agent)
  const parentID = safeLabel(entry?.parentID, 128)
  if (agent) next.agent = agent
  if (parentID) next.parentID = parentID
  return next
}

function sameIdentity(a, b) {
  return (a?.agent || null) === (b?.agent || null) && (a?.parentID || null) === (b?.parentID || null)
}

async function createObserverWriter(kiloDir, options = {}) {
  const maxLogBytes = Math.max(8 * 1024, Number(options.maxLogBytes) || MAX_LOG_BYTES)
  const keepLogBytes = Math.max(0, Math.min(maxLogBytes - 4096, Number(options.keepLogBytes) || KEEP_LOG_BYTES))
  const maxArchives = Math.max(1, Number(options.maxArchives) || MAX_LOG_ARCHIVES)
  const logFile = resolve(kiloDir, "visual-events.jsonl")
  const identityFile = resolve(kiloDir, "visual-identities.json")
  const archiveFile = (index) => resolve(kiloDir, `visual-events.${index}.jsonl`)
  const identities = new Map()
  let chain = Promise.resolve()
  let seq = 0
  let currentLogBytes = await safeStatSize(logFile)

  const applyIdentityRecord = (entry) => {
    const id = safeLabel(entry?.sessionID, 128)
    if (!id) return { entry, changed: false }

    if (entry?.type === "session.deleted") {
      const known = identities.get(id)
      const enriched = known ? { ...known, ...entry } : entry
      const changed = identities.delete(id)
      return { entry: enriched, changed }
    }

    if (!entry?.agent && !entry?.parentID) return { entry, changed: false }
    const previous = identities.get(id)
    const next = mergeIdentity(previous, entry)
    if (sameIdentity(previous, next)) return { entry, changed: false }
    identities.set(id, next)
    return { entry, changed: true }
  }

  const loadIdentityFile = async () => {
    try {
      const parsed = JSON.parse(await readFile(identityFile, "utf8"))
      const sessions = parsed && typeof parsed === "object" ? parsed.sessions : null
      if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) return false
      for (const [sessionID, value] of Object.entries(sessions)) {
        const id = safeLabel(sessionID, 128)
        if (!id || !value || typeof value !== "object") continue
        const identity = mergeIdentity(null, value)
        if (identity.agent || identity.parentID) identities.set(id, identity)
      }
      return true
    } catch {
      return false
    }
  }

  const replayIdentityLogs = async () => {
    const files = []
    for (let index = maxArchives; index >= 1; index -= 1) files.push(archiveFile(index))
    files.push(logFile)
    for (const file of files) {
      let raw
      try { raw = await readFile(file, "utf8") } catch { continue }
      for (const line of raw.split(/\r?\n/)) {
        if (!line) continue
        let entry
        try { entry = JSON.parse(line) } catch { continue }
        applyIdentityRecord(entry)
      }
    }
  }

  const persistIdentities = async () => {
    const sessions = Object.create(null)
    for (const [sessionID, identity] of identities.entries()) sessions[sessionID] = identity
    await writeFile(identityFile, JSON.stringify({ sessions }), "utf8")
  }

  const identityLoaded = await loadIdentityFile()
  if (!identityLoaded) await replayIdentityLogs()
  try { await persistIdentities() } catch {}

  const serialize = (entry) => JSON.stringify({
    ts: Date.now(),
    seq: ++seq,
    bridgeVersion: BRIDGE_VERSION,
    bridgeRunId: BRIDGE_RUN_ID,
    ...entry
  }) + "\n"

  const rotate = async () => {
    let raw
    try { raw = await readFile(logFile) } catch { raw = Buffer.alloc(0) }
    const roughStart = Math.max(0, raw.length - keepLogBytes)
    let tailStart = roughStart
    if (roughStart > 0) {
      const firstNewline = raw.indexOf(0x0a, roughStart)
      tailStart = firstNewline >= 0 ? firstNewline + 1 : raw.length
    }
    const archived = raw.subarray(0, tailStart)
    const tail = raw.subarray(tailStart)

    if (archived.length) {
      try { await unlink(archiveFile(maxArchives)) } catch {}
      for (let index = maxArchives - 1; index >= 1; index -= 1) {
        try { await rename(archiveFile(index), archiveFile(index + 1)) } catch {}
      }
      await writeFile(archiveFile(1), archived)
    }

    await writeFile(logFile, tail)
    currentLogBytes = tail.length
  }

  const write = (rawEntry) => {
    const entry = sanitizeEntry(rawEntry)
    const prepared = applyIdentityRecord(entry)
    chain = chain
      .then(async () => {
        if (prepared.changed) {
          try { await persistIdentities() } catch {}
        }
        const line = serialize(prepared.entry)
        const incomingBytes = Buffer.byteLength(line)
        if (currentLogBytes + incomingBytes > maxLogBytes) await rotate()
        await appendFile(logFile, line, "utf8")
        currentLogBytes += incomingBytes
      })
      .catch(() => {})
    return chain
  }

  return { write }
}

const VisualBridge = async ({ directory }) => {
  const kiloDir = resolve(directory, ".kilo")
  await mkdir(kiloDir, { recursive: true })
  const observer = await createObserverWriter(kiloDir)
  const write = observer.write

  await write({ type: "bridge.loaded" })

  return {
    "tool.execute.before": (input, output) => {
      const tool = safeLabel(String(input?.tool || "unknown")) || "unknown"
      void write({
        type: "tool.before",
        sessionID: input?.sessionID,
        agent: safeLabel(input?.agent),
        tool,
        activity: toolActivity(tool),
        detail: sanitizeDetail(tool, output?.args, directory)
      })
    },

    "tool.execute.after": (input) => {
      void write({
        type: "tool.after",
        sessionID: input?.sessionID,
        agent: safeLabel(input?.agent),
        tool: safeLabel(String(input?.tool || "unknown")) || "unknown"
      })
    },

    event: ({ event }) => {
      const type = String(event?.type || "")
      if (!type || !OBSERVED_EVENT_TYPES.has(type)) return
      const id = sessionID(event)

      if (type === "session.status") {
        void write({ type, sessionID: id, status: statusOf(event) || "unknown" })
        return
      }
      if (type === "session.idle") {
        void write({ type, sessionID: id, status: "idle" })
        return
      }
      if (type === "session.error") {
        void write({ type, sessionID: id, status: "error" })
        return
      }
      if (type === "permission.asked") {
        void write({ type, sessionID: id, status: "waiting", activity: "permission" })
        return
      }
      if (type === "permission.replied") {
        void write({ type, sessionID: id, status: "busy", activity: "working" })
        return
      }
      if (type === "file.edited") {
        void write({ type, sessionID: id, activity: "editing", detail: fileDetail(event, directory) })
        return
      }
      if (["session.created", "session.deleted", "session.updated"].includes(type)) {
        const identity = sessionIdentity(event)
        void write({ type, sessionID: id, ...identity })
        return
      }
      if (type === "message.updated") {
        const identity = messageIdentity(event)
        if (identity.agent) void write({ type: "identity.updated", sessionID: id, ...identity })
      }
    }
  }
}

export { createObserverWriter }

export default { id: "kilo-agent-visualizer-bridge", server: VisualBridge }
