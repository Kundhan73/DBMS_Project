// Database-level tests: constraints, triggers, procedures and views.
// Every test runs in a transaction that is rolled back (see helpers.ts).
import { afterAll, describe, expect, it } from 'vitest';
import { BCRYPT, expectPgError, fixture, inTx, one, pool } from './helpers';

afterAll(() => pool.end());

describe('Domains and CHECK constraints', () => {
  it('rejects a malformed email (email_address domain)', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO app_user (email, password_hash, full_name, role) VALUES ('not-an-email',$1,'X Y','TENANT')`, [BCRYPT], '23514');
  }));
  it('rejects a phone number that is not a 10-digit Indian mobile', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO app_user (email, password_hash, full_name, phone, role) VALUES ('a@b.in',$1,'X Y','12345','TENANT')`, [BCRYPT], '23514');
  }));
  it('refuses to store a plain-text password', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO app_user (email, password_hash, full_name, role) VALUES ('a@b.in','hunter2','X Y','TENANT')`, [], '23514', /chk_password_bcrypt/);
  }));
  it('treats emails case-insensitively for uniqueness', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO app_user (email, password_hash, full_name, role) VALUES ('ADMIN@APTMGR.IN',$1,'Dup Admin','ADMIN')`, [BCRYPT], '23505');
  }));
  it('rejects negative money values (money_inr domain)', () => inTx(async (c) => {
    await expectPgError(c, `UPDATE unit SET base_rent = -1 WHERE unit_id = 1`, [], '23514');
  }));
  it('rejects an invalid vehicle registration number', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type) VALUES (1, 'XYZ', 'CAR')`, [], '23514', /chk_vehicle_reg/);
  }));
});

describe('Structural triggers', () => {
  it('blocks a unit on a floor its block does not have', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO unit (block_id, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent, monthly_maintenance)
                            VALUES (1, '9901', 99, '2BHK', 1000, 20000, 2000)`, [], '23514', /only has/);
  }));
  it('only lets TENANT users have a tenant profile', () => inTx(async (c) => {
    await expectPgError(c, `INSERT INTO tenant_profile (user_id, emergency_contact_name, emergency_contact_phone) VALUES (1,'X','9000000000')`, [], '23514', /expected TENANT/);
  }));
  it('keeps joint ownership shares at or below 100%', () => inTx(async (c) => {
    const f = await fixture(c);
    const u2 = await one(c, `INSERT INTO app_user (email, password_hash, full_name, role) VALUES ('co@test.in',$1,'Co Owner','OWNER') RETURNING user_id`, [BCRYPT]);
    const o2 = await one(c, `INSERT INTO owner_profile (user_id, mailing_address) VALUES ($1,'Somewhere 1') RETURNING owner_id`, [u2.user_id]);
    await expectPgError(c, `INSERT INTO ownership (unit_id, owner_id, share_pct, owned_from) VALUES ($1,$2,10,'2021-01-01')`, [f.unitId, o2.owner_id], '23514', /max 100/);
  }));
});

describe('Leases', () => {
  const insertLease = `INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit)
                       VALUES ($1,$2,$3::date,$4::date,$5,$6) RETURNING lease_id`;

  it('marks the unit LEASED when an active lease is created', () => inTx(async (c) => {
    const f = await fixture(c);
    await c.query(insertLease, [f.unitId, f.tenantId, '2026-09-01', '2027-08-01', 30000, 90000]);
    expect((await one(c, 'SELECT occupancy_status FROM unit WHERE unit_id = $1', [f.unitId])).occupancy_status).toBe('LEASED');
  }));

  it('rejects overlapping live leases on the same unit (EXCLUDE constraint)', () => inTx(async (c) => {
    const f = await fixture(c);
    await c.query(insertLease, [f.unitId, f.tenantId, '2026-09-01', '2027-08-01', 30000, 90000]);
    await expectPgError(c, insertLease, [f.unitId, f.tenantId, '2027-01-01', '2027-12-01', 30000, 90000], '23P01', /ex_lease_no_overlap/);
    // back-to-back is fine: the range is half-open [start, end)
    await c.query(`INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent, status) VALUES ($1,$2,'2027-08-01','2028-07-01',31000,'PENDING')`, [f.unitId, f.tenantId]);
  }));

  it('caps the deposit at ten months of rent', () => inTx(async (c) => {
    const f = await fixture(c);
    await expectPgError(c, insertLease, [f.unitId, f.tenantId, '2026-09-01', '2027-08-01', 30000, 300001], '23514', /chk_lease_deposit/);
  }));

  it('refuses to lease a unit that has no owner', () => inTx(async (c) => {
    const f = await fixture(c);
    const u = await one(c, `INSERT INTO unit (block_id, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent, monthly_maintenance)
                            VALUES (1, 'T998', 1, '1BHK', 600, 15000, 1500) RETURNING unit_id`);
    await expectPgError(c, insertLease, [u.unit_id, f.tenantId, '2026-09-01', '2027-08-01', 15000, 30000], '23514', /no owner/);
  }));

  it('sp_terminate_lease closes the lease, voids later rent, releases parking and frees the unit', () => inTx(async (c) => {
    const f = await fixture(c);
    const l = await one(c, insertLease, [f.unitId, f.tenantId, '2026-06-01', '2027-05-01', 30000, 90000]);
    const v = await one(c, `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type) VALUES ($1,'KA01ZZ0001','CAR') RETURNING vehicle_id`, [f.tenantUser]);
    const slot = await one(c, `SELECT ps.slot_id FROM parking_slot ps WHERE ps.complex_id = $1 AND ps.slot_type = 'CAR'
                                  AND NOT EXISTS (SELECT 1 FROM parking_allocation pa WHERE pa.slot_id = ps.slot_id AND (pa.end_date IS NULL OR pa.end_date > '2026-06-01')) LIMIT 1`, [f.complexId]);
    await c.query(`INSERT INTO parking_allocation (slot_id, unit_id, vehicle_id, start_date, monthly_charge) VALUES ($1,$2,$3,'2026-06-01',750)`, [slot.slot_id, f.unitId, v.vehicle_id]);
    await c.query(`SELECT fn_generate_monthly_invoices('2026-09-01')`);

    await c.query(`CALL sp_terminate_lease($1, '2026-08-31', 'Relocating to Pune')`, [l.lease_id]);

    const lease = await one(c, 'SELECT status, terminated_on FROM lease WHERE lease_id = $1', [l.lease_id]);
    expect(lease.status).toBe('TERMINATED');
    const sepRent = await one(c, `SELECT status FROM invoice WHERE lease_id = $1 AND billing_month = '2026-09-01'`, [l.lease_id]);
    expect(sepRent.status).toBe('VOID');
    const alloc = await one(c, 'SELECT end_date FROM parking_allocation WHERE vehicle_id = $1', [v.vehicle_id]);
    expect(alloc.end_date).not.toBeNull();
    expect((await one(c, 'SELECT occupancy_status FROM unit WHERE unit_id = $1', [f.unitId])).occupancy_status).toBe('VACANT');
  }));

  it('sp_terminate_lease rejects a date outside the lease period', () => inTx(async (c) => {
    const f = await fixture(c);
    const l = await one(c, insertLease, [f.unitId, f.tenantId, '2026-06-01', '2027-05-01', 30000, 90000]);
    await expectPgError(c, `CALL sp_terminate_lease($1, '2028-01-01', 'Some reason')`, [l.lease_id], '23514', /outside the lease period/);
  }));
});

describe('Billing', () => {
  it('fn_generate_monthly_invoices is idempotent', () => inTx(async (c) => {
    const month = (await one(c, `SELECT date_trunc('month', current_date)::date AS m`)).m;
    const second = (await c.query(`SELECT * FROM fn_generate_monthly_invoices($1)`, [month])).rows;
    expect(second.every((r) => r.invoices_created === 0)).toBe(true);
  }));

  it('refuses to bill a future month', () => inTx(async (c) => {
    await expectPgError(c, `SELECT fn_generate_monthly_invoices((current_date + interval '2 months')::date)`, [], '23514', /future month/);
  }));

  it('prorates rent for a lease that starts mid-month', () => inTx(async (c) => {
    const f = await fixture(c);
    const l = await one(c, `INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent) VALUES ($1,$2,'2026-09-16','2027-08-16',30000) RETURNING lease_id`, [f.unitId, f.tenantId]);
    await c.query(`SELECT fn_generate_monthly_invoices('2026-09-01')`);
    const inv = await one(c, `SELECT amount, notes FROM invoice WHERE lease_id = $1`, [l.lease_id]);
    expect(inv.amount).toBe('15000.00'); // 15 of 30 days
    expect(inv.notes).toMatch(/Prorated: 15 of 30 days/);
  }));

  it('tracks partial and full payments through the payment trigger', () => inTx(async (c) => {
    const inv = await one(c, `SELECT invoice_id, amount FROM invoice WHERE status = 'UNPAID' AND invoice_type = 'RENT' LIMIT 1`);
    await c.query(`SELECT fn_record_payment($1, $2, 'UPI')`, [inv.invoice_id, Number(inv.amount) / 2]);
    expect((await one(c, 'SELECT status FROM invoice WHERE invoice_id = $1', [inv.invoice_id])).status).toBe('PARTIAL');
    await c.query(`SELECT fn_record_payment($1, $2, 'UPI')`, [inv.invoice_id, Number(inv.amount) / 2]);
    const after = await one(c, 'SELECT status, amount_paid, amount FROM invoice WHERE invoice_id = $1', [inv.invoice_id]);
    expect(after.status).toBe('PAID');
    expect(after.amount_paid).toBe(after.amount);
  }));

  it('rejects overpayment', () => inTx(async (c) => {
    const inv = await one(c, `SELECT invoice_id, amount FROM invoice WHERE status = 'UNPAID' LIMIT 1`);
    await expectPgError(c, `SELECT fn_record_payment($1, $2, 'UPI')`, [inv.invoice_id, Number(inv.amount) + 1], '23514', /exceeds outstanding balance/);
  }));

  it('rejects payments on a void invoice', () => inTx(async (c) => {
    const inv = await one(c, `SELECT invoice_id FROM invoice WHERE status = 'VOID' LIMIT 1`);
    await expectPgError(c, `SELECT fn_record_payment($1, 100, 'UPI')`, [inv.invoice_id], '23514', /void/);
  }));

  it('makes payments immutable and recalculates the invoice when one is deleted', () => inTx(async (c) => {
    const p = await one(c, `SELECT p.payment_id, p.invoice_id FROM payment p JOIN invoice i USING (invoice_id)
                             WHERE i.status = 'PAID' AND (SELECT count(*) FROM payment x WHERE x.invoice_id = i.invoice_id) = 1 LIMIT 1`);
    await expectPgError(c, `UPDATE payment SET amount = 1 WHERE payment_id = $1`, [p.payment_id], '23514', /immutable/);
    await c.query(`DELETE FROM payment WHERE payment_id = $1`, [p.payment_id]);
    const inv = await one(c, 'SELECT status, amount_paid FROM invoice WHERE invoice_id = $1', [p.invoice_id]);
    expect(inv.status).toBe('UNPAID');
    expect(inv.amount_paid).toBe('0.00');
  }));

  it('will not void an invoice that has payments', () => inTx(async (c) => {
    const inv = await one(c, `SELECT invoice_id FROM invoice WHERE status = 'PAID' LIMIT 1`);
    await expectPgError(c, `UPDATE invoice SET status = 'VOID' WHERE invoice_id = $1`, [inv.invoice_id], '23514', /cannot be voided/);
  }));

  it('applies at most one late fee per overdue invoice, minimum Rs 100', () => inTx(async (c) => {
    await c.query(`SELECT fn_apply_late_fees(current_date + 30)`);
    const again = await one(c, `SELECT fn_apply_late_fees(current_date + 30) AS n`);
    expect(again.n).toBe(0);
    const min = await one(c, `SELECT min(amount) AS m FROM invoice WHERE invoice_type = 'LATE_FEE'`);
    expect(Number(min.m)).toBeGreaterThanOrEqual(100);
  }));
});

describe('Parking rules', () => {
  async function setup(c: any) {
    const f = await fixture(c);
    await c.query(`INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent) VALUES ($1,$2,'2026-09-01','2027-08-01',30000)`, [f.unitId, f.tenantId]);
    const bike = await one(c, `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type) VALUES ($1,'KA01ZZ0002','BIKE') RETURNING vehicle_id`, [f.tenantUser]);
    const car = await one(c, `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type) VALUES ($1,'KA01ZZ0003','CAR') RETURNING vehicle_id`, [f.tenantUser]);
    const free = (type: string, cx = f.complexId) => one(c, `SELECT slot_id FROM parking_slot ps WHERE complex_id = $1 AND slot_type = $2
       AND NOT EXISTS (SELECT 1 FROM parking_allocation pa WHERE pa.slot_id = ps.slot_id AND (pa.end_date IS NULL OR pa.end_date > current_date)) LIMIT 1`, [cx, type]);
    return { f, bike: bike.vehicle_id, car: car.vehicle_id, free };
  }
  const alloc = `INSERT INTO parking_allocation (slot_id, unit_id, vehicle_id, start_date) VALUES ($1,$2,$3,current_date)`;

  it('does not let a bike take a car slot, or a petrol car an EV slot', () => inTx(async (c) => {
    const s = await setup(c);
    await expectPgError(c, alloc, [(await s.free('CAR')).slot_id, s.f.unitId, s.bike], '23514', /cannot hold/);
    // the type check is a BEFORE trigger, so it fires even if the EV slot happens to be taken
    const ev = await one(c, `SELECT slot_id FROM parking_slot WHERE complex_id = $1 AND slot_type = 'EV' LIMIT 1`, [s.f.complexId]);
    await expectPgError(c, alloc, [ev.slot_id, s.f.unitId, s.car], '23514', /cannot hold/);
  }));

  it('does not allocate a slot from a different complex', () => inTx(async (c) => {
    const s = await setup(c);
    const other = await one(c, `SELECT complex_id FROM complex WHERE complex_id <> $1 LIMIT 1`, [s.f.complexId]);
    await expectPgError(c, alloc, [(await s.free('CAR', other.complex_id)).slot_id, s.f.unitId, s.car], '23514', /different complex/);
  }));

  it('blocks double-booking a slot (EXCLUDE constraint)', () => inTx(async (c) => {
    const s = await setup(c);
    const slot = (await s.free('CAR')).slot_id;
    await c.query(alloc, [slot, s.f.unitId, s.car]);
    const car2 = await one(c, `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type) VALUES ($1,'KA01ZZ0004','CAR') RETURNING vehicle_id`, [s.f.tenantUser]);
    await expectPgError(c, alloc, [slot, s.f.unitId, car2.vehicle_id], '23P01', /ex_slot_overlap/);
  }));

  it('rejects a vehicle whose owner does not live in the unit', () => inTx(async (c) => {
    const s = await setup(c);
    const stranger = await one(c, `SELECT vehicle_id FROM vehicle WHERE owner_user_id <> $1 LIMIT 1`, [s.f.tenantUser]);
    await expectPgError(c, alloc, [(await s.free('CAR')).slot_id, s.f.unitId, stranger.vehicle_id], '23514');
  }));
});

describe('Maintenance workflow', () => {
  async function newRequest(c: any) {
    const f = await fixture(c);
    await c.query(`INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent) VALUES ($1,$2,'2026-09-01','2027-08-01',30000)`, [f.unitId, f.tenantId]);
    const r = await one(c, `INSERT INTO maintenance_request (unit_id, raised_by, category, title, description)
                           VALUES ($1,$2,'PLUMBING','Leaking pipe','Water leaking under the kitchen sink since morning') RETURNING request_id`, [f.unitId, f.tenantUser]);
    return { f, id: r.request_id };
  }

  it('rejects an illegal status jump (OPEN -> RESOLVED)', () => inTx(async (c) => {
    const { id } = await newRequest(c);
    await expectPgError(c, `UPDATE maintenance_request SET status = 'RESOLVED', vendor_id = 1 WHERE request_id = $1`, [id], '23514', /Invalid status change/);
  }));

  it('requires a vendor before a request can be assigned', () => inTx(async (c) => {
    const { id } = await newRequest(c);
    await expectPgError(c, `UPDATE maintenance_request SET status = 'ASSIGNED' WHERE request_id = $1`, [id], '23514', /chk_mr_vendor/);
  }));

  it('stamps timestamps and writes history for every transition', () => inTx(async (c) => {
    const { id } = await newRequest(c);
    await c.query(`SELECT set_config('app.user_id', '2', true)`);
    await c.query(`UPDATE maintenance_request SET status = 'ASSIGNED', vendor_id = 1 WHERE request_id = $1`, [id]);
    await c.query(`UPDATE maintenance_request SET status = 'IN_PROGRESS' WHERE request_id = $1`, [id]);
    await c.query(`UPDATE maintenance_request SET status = 'RESOLVED', actual_cost = 500 WHERE request_id = $1`, [id]);
    const r = await one(c, `SELECT assigned_at, resolved_at FROM maintenance_request WHERE request_id = $1`, [id]);
    expect(r.assigned_at).not.toBeNull();
    expect(r.resolved_at).not.toBeNull();
    const h = (await c.query(`SELECT new_status, changed_by FROM maintenance_status_history WHERE request_id = $1 ORDER BY history_id`, [id])).rows;
    expect(h.map((x) => x.new_status)).toEqual(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);
    expect(h[1].changed_by).toBe('2');
  }));

  it('refuses a request from someone unconnected to the unit', () => inTx(async (c) => {
    const f = await fixture(c);
    await expectPgError(c, `INSERT INTO maintenance_request (unit_id, raised_by, category, title, description)
                            VALUES ($1,$2,'PLUMBING','Leaking pipe','Water leaking under the kitchen sink')`, [f.unitId, f.tenantUser], '23514', /not a resident/);
  }));

  it('drops the stored embedding when the request text changes', () => inTx(async (c) => {
    const r = await one(c, `SELECT request_id FROM request_embedding LIMIT 1`);
    await c.query(`UPDATE maintenance_request SET description = description || ' Updated.' WHERE request_id = $1`, [r.request_id]);
    expect((await c.query(`SELECT 1 FROM request_embedding WHERE request_id = $1`, [r.request_id])).rowCount).toBe(0);
  }));
});

describe('Audit trail', () => {
  it('records who changed a lease, and never copies password hashes', () => inTx(async (c) => {
    await c.query(`SELECT set_config('app.user_id', '1', true)`);
    const l = await one(c, `SELECT lease_id FROM lease WHERE status = 'ACTIVE' LIMIT 1`);
    await c.query(`UPDATE lease SET rent_due_day = 3 WHERE lease_id = $1`, [l.lease_id]);
    const a = await one(c, `SELECT * FROM audit_log WHERE table_name = 'lease' AND row_pk = $1::text ORDER BY audit_id DESC LIMIT 1`, [l.lease_id]);
    expect(a.action).toBe('U');
    expect(a.changed_by).toBe('1');
    expect(a.new_data.rent_due_day).toBe(3);

    await c.query(`UPDATE app_user SET password_hash = $1 WHERE user_id = 2`, [BCRYPT]);
    const u = await one(c, `SELECT old_data, new_data FROM audit_log WHERE table_name = 'app_user' ORDER BY audit_id DESC LIMIT 1`);
    expect(u.new_data).not.toHaveProperty('password_hash');
    expect(u.new_data.password_changed).toBe(true);
    expect(u.old_data).not.toHaveProperty('password_hash');
  }));
});

describe('Views and materialized view', () => {
  it('v_complex_occupancy categories add up to the unit count', () => inTx(async (c) => {
    const rows = (await c.query(`SELECT * FROM v_complex_occupancy`)).rows;
    for (const r of rows) expect(Number(r.leased) + Number(r.owner_occupied) + Number(r.vacant) + Number(r.under_maintenance)).toBe(Number(r.total_units));
    const units = await one(c, `SELECT count(*)::int AS n FROM unit`);
    expect(rows.reduce((s, r) => s + Number(r.total_units), 0)).toBe(units.n);
  }));

  it('v_invoice_balance balance equals amount minus paid', () => inTx(async (c) => {
    const bad = await one(c, `SELECT count(*)::int AS n FROM v_invoice_balance WHERE balance <> amount - amount_paid`);
    expect(bad.n).toBe(0);
  }));

  it('mv_complex_kpis can be refreshed concurrently', async () => {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_complex_kpis');
    const r = await pool.query('SELECT count(*)::int AS n FROM mv_complex_kpis');
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
