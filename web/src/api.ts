export interface Property {
  id: string
  label: string
  address: string | null
  created_at: string
  visit_count?: number
  import_count?: number
}

export interface Visit {
  id: string
  property_id: string
  kind: string
  visit_date: string | null
  notes: string | null
  created_at: string
  import_count?: number
  latest_import_id?: string | null
  latest_status?: string | null
}

export interface Check {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: unknown
}

export interface ImportReport {
  import: {
    id: string
    status: 'ok' | 'ok_with_warnings' | 'failed'
    importedAt: string
    manifestSchemaVersion: number
    appVersion: string | null
    mediaMode: string
    config: { id: string | null; version: string | null; hash: string | null }
  }
  property: { id: string; label: string; address: string | null }
  visit: { id: string; kind: string; visitDate: string | null }
  session: {
    sessionId: string | null
    propertyLabel: string | null
    flags: string[]
    startedAt: string | null
    completedAt: string | null
    exportedAt: string | null
    lifecycle: { type?: string; at?: string; reason?: string }[]
    declaredTotals: Record<string, number>
    orphanEvents: unknown[]
  }
  counts: {
    zones: number
    canvases: number
    pins: {
      total: number
      typeless: number
      retired: number
      unanchored: number
      flagged: { flag: string | null; n: number }[]
      byTypeKind: { type_kind: string | null; n: number }[]
      anomalousDistinct: number
      anomalous: { number: number; pinId: string; flags: string[] }[]
    }
    media: {
      total: number
      bytes: number
      verified: number
      byKind: { kind: string | null; count: number; bytes: number }[]
      byOwner: { owner_kind: string | null; count: number; bytes: number }[]
      byFileStatus: { file_status: string; n: number }[]
    }
    notes: number
    chatThreads: number
    chatMessages: number
    inboxRefs: { ref_kind: string; n: number }[]
    inboxTotal: number
    events: number
    eventsByType: { type: string | null; n: number }[]
    orphanEvents: number
  }
  checklist: {
    total: number
    byKind: { kind: string | null; n: number }[]
    byScope: { scope_kind: string | null; n: number }[]
    byResult: { result: string | null; n: number }[]
    naByReason: { reason_id: string | null; n: number }[]
    gaps: { count: number; rows: { item_id: string; reason_id: string | null; scope_kind: string | null }[] }
    findings: {
      total: number
      failedChecks: number
      confirmedAbsences: number
      rows: {
        item_id: string
        kind: string | null
        result: string | null
        reason_id: string | null
        scope_kind: string | null
      }[]
    }
    eventReconciliation: {
      itemResolved: number
      itemReopened: number
      net: number
      resolutionsLength: number
    }
  }
  zones: {
    zoneId: string
    type: string | null
    label: string | null
    level: string | null
    closedAt: string | null
    pinCount: number
    mediaCount: number
    canvasCount: number
    resolutionCount: number
    coreUnresolved: string[]
    standardUnresolved: number
    naCount: number
    closeCount: number
    reopenCount: number
    reopenReasons: string[]
    closedWithNoWork: boolean
  }[]
  validation: {
    status: string
    checks: Check[]
    checksRun: string[]
    counts: { errors: number; warnings: number; infos: number }
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
    Object.assign(err, body)
    throw err
  }
  return body as T
}

export const api = {
  listProperties: () => req<Property[]>('/api/properties'),

  createProperty: (label: string, address: string) =>
    req<Property>('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, address }),
    }),

  getProperty: (id: string) => req<{ property: Property; visits: Visit[] }>(`/api/properties/${id}`),

  createVisit: (propertyId: string, kind: string, visitDate: string) =>
    req<Visit>(`/api/properties/${propertyId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, visitDate: visitDate || null }),
    }),

  importFile: (visitId: string, file: File) => {
    const fd = new FormData()
    fd.append('manifest', file)
    return req<{ importId: string; status: string }>(`/api/visits/${visitId}/import`, {
      method: 'POST',
      body: fd,
    })
  },

  importReferenceFixture: (visitId: string) =>
    req<{ importId: string; status: string }>(`/api/visits/${visitId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useReferenceFixture: true }),
    }),

  getReport: (importId: string) => req<ImportReport>(`/api/imports/${importId}/report`),
}

export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export const fmtTime = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
