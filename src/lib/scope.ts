// Row-level visibility rules shared by the API routes.
import type { PoolClient } from 'pg';
import { query, queryOne } from './db';
import { HttpError } from './api';
import type { SessionUser } from './session';

/** Complex ids the user may see (from v_user_complex_scope). */
export async function visibleComplexIds(user: SessionUser): Promise<number[]> {
  const rows = await query<{ complex_id: number }>(
    'SELECT complex_id FROM v_user_complex_scope WHERE user_id = $1 ORDER BY complex_id', [user.id]);
  return rows.map((r) => r.complex_id);
}

export async function assertComplexVisible(user: SessionUser, complexId: number) {
  const ok = await queryOne('SELECT 1 FROM v_user_complex_scope WHERE user_id = $1 AND complex_id = $2', [user.id, complexId]);
  if (!ok) throw new HttpError(403, 'That complex is outside your access.');
}

/**
 * Units the user is connected to:
 *   staff    -> every unit in their complexes
 *   owner    -> units they currently own
 *   tenant   -> units they currently lease (ACTIVE / PENDING)
 */
export const UNIT_ACCESS_SQL = `
  EXISTS (SELECT 1 FROM app_user au WHERE au.user_id = $U AND au.role IN ('ADMIN','MANAGER')
           AND EXISTS (SELECT 1 FROM v_user_complex_scope s
                        JOIN block bb ON bb.complex_id = s.complex_id
                        JOIN unit uu  ON uu.block_id = bb.block_id
                       WHERE s.user_id = $U AND uu.unit_id = UNIT_COL))
  OR EXISTS (SELECT 1 FROM ownership o JOIN owner_profile op USING (owner_id)
              WHERE o.unit_id = UNIT_COL AND op.user_id = $U AND o.owned_until IS NULL)
  OR EXISTS (SELECT 1 FROM lease l JOIN tenant_profile t USING (tenant_id)
              WHERE l.unit_id = UNIT_COL AND t.user_id = $U AND l.status IN ('ACTIVE','PENDING'))`;

/** Build the unit-access predicate for a given unit column and parameter index. */
export function unitAccess(unitCol: string, paramIdx: number): string {
  return '(' + UNIT_ACCESS_SQL.replaceAll('UNIT_COL', unitCol).replaceAll('$U', `$${paramIdx}`) + ')';
}

export async function assertUnitAccess(user: SessionUser, unitId: number, client?: PoolClient) {
  const sql = `SELECT 1 FROM unit u WHERE u.unit_id = $1 AND ${unitAccess('u.unit_id', 2)}`;
  const ok = client ? (await client.query(sql, [unitId, user.id])).rows[0] : await queryOne(sql, [unitId, user.id]);
  if (!ok) throw new HttpError(403, 'You do not have access to that unit.');
}
