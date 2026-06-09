import type { CalResource, ResourceInput } from '../types'

/** Normalises resources, reads the configured group/order fields, and sorts. */
export class ResourceStore {
  private list: CalResource[] = []

  constructor(
    private groupField = 'group',
    private orderField = 'order',
  ) {}

  normalize(input: ResourceInput): CalResource {
    const groupVal = input[this.groupField]
    const orderVal = input[this.orderField]
    return {
      id: String(input.id),
      title: input.title ?? '',
      group: groupVal != null ? String(groupVal) : null,
      order: typeof orderVal === 'number' ? orderVal : 0,
      raw: input,
    }
  }

  set(inputs: ResourceInput[]): void {
    this.list = inputs.map((i) => this.normalize(i))
  }

  all(): CalResource[] {
    return [...this.list]
  }

  get(id: string | number): CalResource | undefined {
    return this.list.find((r) => r.id === String(id))
  }

  /**
   * Resources in display order. With `resourceOrder: 'id'` they are sorted by a
   * natural id comparison (so 'E2' precedes 'E10'); with a numeric order field
   * they sort by it; otherwise the original input order is preserved (sort is
   * stable), matching FullCalendar's default.
   */
  ordered(): CalResource[] {
    if (this.orderField === 'id') {
      return [...this.list].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    }
    if (this.list.every((r) => r.order === 0)) {
      return [...this.list] // no explicit order → keep input order
    }
    return [...this.list].sort((a, b) => a.order - b.order)
  }

  /**
   * Grouped resources preserving first-seen group order. Returns a flat list of
   * `{ group, resources }` buckets; ungrouped resources land in a `null` bucket.
   */
  grouped(): Array<{ group: string | null; resources: CalResource[] }> {
    const buckets: Array<{ group: string | null; resources: CalResource[] }> = []
    const index = new Map<string | null, number>()
    for (const r of this.ordered()) {
      let i = index.get(r.group)
      if (i === undefined) {
        i = buckets.length
        index.set(r.group, i)
        buckets.push({ group: r.group, resources: [] })
      }
      buckets[i].resources.push(r)
    }
    return buckets
  }
}
