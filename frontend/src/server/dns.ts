import "server-only";
import dns from "node:dns";

const PUBLIC_DNS = ["8.8.8.8", "1.1.1.1"];

// mongodb+srv URIs need an SRV lookup, which Node does through its own
// resolver, not the OS one. Some local DNS proxies (VPNs, ad blockers at
// 127.0.0.1) refuse SRV queries; when that happens, resolve through public
// DNS for the rest of the process.
export async function ensureSrvResolvable(uri: string) {
  const match = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  if (!match) return;
  const name = `_mongodb._tcp.${match[1]}`;
  try {
    await dns.promises.resolveSrv(name);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "ECONNREFUSED" && code !== "ETIMEOUT" && code !== "ESERVFAIL") throw error;
    dns.setServers(PUBLIC_DNS);
    await dns.promises.resolveSrv(name);
  }
}
