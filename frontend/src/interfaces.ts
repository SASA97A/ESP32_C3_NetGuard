export interface Profile {
  name: string;
  start: number;
  end: number;
  dns: string;
  mode?: number;
  limits?: string[];
  bl?: boolean;
  doh?: boolean;
}

export interface Client {
  ip: string;
  mac: string;
  profile: number;
  blocked: boolean;
  manualBlock?: boolean;
  name: string;
  q?: number;
  b?: number;
}

// 0 allowed, 1 blocklist/custom, 2 manual block, 3 bedtime, 4 app limit, 5 encrypted DNS
export type QueryReason = 0 | 1 | 2 | 3 | 4 | 5;

export interface QueryLogEntry {
  t: number;
  ip: string;
  mac: string;
  d: string;
  r: QueryReason;
  p: number;
}

export interface QueryLogResponse {
  now: number;
  log: QueryLogEntry[];
  top: { d: string; n: number }[];
}

export interface BlocklistInfo {
  url: string;
  interval: number;
  count: number;
  status: string;
  running: boolean;
}

export interface StatsResponse {
  ip: string;
  rssi: number;
  temp: number;
  heap: number;
  uptime: string;
  dhcp: boolean;
  defpwd: boolean;
  wifi: string;
  token: string;
  timezone: string;
  version?: string;
  clock?: 'ntp' | 'http' | 'restored' | 'set' | 'unset';
  blocked?: number;
  allowed?: number;
  blocklist?: BlocklistInfo;
  custom?: string[];
  profiles: Profile[];
  clients: Client[];
}
