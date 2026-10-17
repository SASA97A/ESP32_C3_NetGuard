export interface Profile {
  name: string;
  start: number;
  end: number;
  dns: string;
  mode?: number;
  limits?: string[];
  bl?: boolean;
}

export interface Client {
  ip: string;
  mac: string;
  profile: number;
  blocked: boolean;
  manualBlock?: boolean;
  name: string;
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
  clock?: 'ntp' | 'restored' | 'set' | 'unset';
  blocked?: number;
  allowed?: number;
  blocklist?: BlocklistInfo;
  custom?: string[];
  profiles: Profile[];
  clients: Client[];
}
