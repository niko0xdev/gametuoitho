// Shape all realtime WS messages as a flat object: `{ event, ...payload }`.
// Extracted so it can be unit-tested in node (the DO classes themselves need
// the Workers runtime).
export function wsMessage(event: string, data: Record<string, unknown>): string {
  return JSON.stringify({ event, ...data });
}
