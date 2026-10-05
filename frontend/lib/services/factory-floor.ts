import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import type { Assignment, ForecastRow } from "@/lib/services/factory-floor-logic";

/**
 * S10 · NH8 production (Brief §30) — one station's PIO queue and its 14-day
 * capacity forecast, or every station's for leadership. Read-only.
 *
 * Which stations a viewer may open: leadership (scope 'all') sees every
 * active station; anyone else sees only the stations they are HOD of
 * (factory.departments.hod_id). Nobody else's queue is fetched.
 */

export type StationOption = { id: string; code: string; name: string };

export type FactoryFloor = {
  /** CURRENT_DATE as the database sees it. */
  today: string;
  stations: StationOption[];
  /** The station on screen, or null for "all stations". */
  selected: StationOption | null;
  queue: Assignment[];
  forecast: ForecastRow[];
};

export async function getFactoryFloor(
  user: SessionUser,
  leadership: boolean,
  stationCode: string | null,
): Promise<FactoryFloor> {
  return withUserContext(user, async (q) => {
    const [{ today }] = await q<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);

    const stations = await q<StationOption>(
      `SELECT id, COALESCE(code, name) AS code, name
         FROM factory.departments
        WHERE COALESCE(status, 'active') = 'active'
          AND ($1::boolean OR hod_id = $2::uuid)
        ORDER BY station_no NULLS LAST, name`,
      [leadership, user.id],
    );

    // An HOD of one station always lands on it; leadership starts on "all".
    const selected =
      stations.find((s) => s.code === stationCode) ?? (leadership || stations.length !== 1 ? null : stations[0]);
    const ids = selected ? [selected.id] : stations.map((s) => s.id);

    if (ids.length === 0) return { today, stations, selected, queue: [], forecast: [] };

    const queue = await q<Assignment>(
      `SELECT a.id, p.pio_number AS "pioNumber", pr.project_name AS project,
              d.name AS station, a.notes AS scope, a.status,
              a.target_complete::text AS target,
              (a.actual_complete IS NOT NULL) AS done
         FROM factory.pio_assignments a
         JOIN factory.departments d ON d.id = a.dept_id
         JOIN ee.pio p ON p.id = a.pio_id
         LEFT JOIN ee.projects pr ON pr.id = p.project_id
        WHERE a.dept_id = ANY($1::uuid[])
          AND a.actual_complete IS NULL`,
      [ids],
    );

    const forecast = await q<ForecastRow>(
      `SELECT forecast_date::text AS date,
              COALESCE(pios_arriving, 0)::int AS arriving,
              manpower_avail AS manpower
         FROM factory.capacity_forecast
        WHERE dept_id = ANY($1::uuid[])
          AND forecast_date >= CURRENT_DATE
          AND forecast_date < CURRENT_DATE + 14`,
      [ids],
    );

    return { today, stations, selected, queue, forecast };
  });
}
