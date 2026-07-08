import { query } from "@/lib/db";

/**
 * Factory Master (foundation ruling #2): 7 active stations + reserved slots,
 * entirely data-driven. Activating station 8 later is an UPDATE on
 * factory.departments — no schema or code change.
 */

export type FactoryStation = {
  id: string;
  code: string;
  name: string;
  stationNo: number;
  status: "active" | "reserved";
  hodId: string | null;
  teamSize: number | null;
  notes: string | null;
};

export async function getStations(
  includeReserved = true,
): Promise<FactoryStation[]> {
  const rows = await query<{
    id: string;
    code: string;
    name: string;
    station_no: number;
    status: FactoryStation["status"];
    hod_id: string | null;
    team_size: number | null;
    notes: string | null;
  }>(
    `SELECT id, code, name, station_no, status, hod_id, team_size, notes
     FROM factory.departments
     ORDER BY station_no`,
  );
  const stations = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    stationNo: r.station_no,
    status: r.status,
    hodId: r.hod_id,
    teamSize: r.team_size,
    notes: r.notes,
  }));
  return includeReserved
    ? stations
    : stations.filter((s) => s.status === "active");
}
