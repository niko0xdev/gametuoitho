// A read may only update the UI if no newer read or write has started since it.
export function createLatestRequestGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => { generation++; },
    isCurrent: (token: number) => token === generation,
  };
}
