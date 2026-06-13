export function shortAddr(addr: string, len = 6): string {
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}
