/** A complaint or repair request, as both the resident and the owner receive it. */
export type MaintenanceRequest = { id: string; title: string; category: MaintenanceCategory; details: string; status: MaintenanceStatus; ownerNote: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null; hasPhoto: boolean }

/** The owner's view adds where it came from. */
export type OwnerMaintenanceRequest = MaintenanceRequest & { property: string; resident: { id: string; name: string; room: string | null } | null }

/** Kinds of problem; the keys must match the backend's list in maintenance.ts. */
export const maintenanceCategoryLabels = { plumbing: 'Plumbing / water', electrical: 'Electrical', wifi: 'Wi-Fi', furniture: 'Furniture', cleaning: 'Cleaning', appliance: 'Appliance (AC, geyser…)', other: 'Other' } as const
export type MaintenanceCategory = keyof typeof maintenanceCategoryLabels

export const maintenanceStatusLabels = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' } as const
export const maintenanceStatusTones = { open: 'coral', in_progress: 'gold', resolved: 'sage' } as const
export type MaintenanceStatus = keyof typeof maintenanceStatusLabels

/** "3 Oct, 2:15 pm" in IST. */
export const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
