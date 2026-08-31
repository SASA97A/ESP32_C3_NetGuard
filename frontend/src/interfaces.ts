export interface Profile {
  name: string;
  start: number;
  end: number;
  dns: string;
}

export interface Client {
  ip: string;
  mac: string;
  profile: number;
  blocked: boolean;
  manualBlock?: boolean;
  name: string;
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
  profiles: Profile[];
  clients: Client[];
}
