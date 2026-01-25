export type Plan = {
  planCode: string
  name?: string
  price_in_cents?: number
  features?: Record<string, unknown>
}

