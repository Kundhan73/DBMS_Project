// Seed script: builds a realistic, deterministic data set.
//   npm run db:seed
// All dates are relative to the day the script runs, so the dashboards
// always show "the last 18 months".
import bcrypt from 'bcryptjs';
import { pool } from '../src/lib/db';
import { TEMPLATES, type Template } from './seed-data/maintenance-templates';
import { embedMissing } from './embed';

// ---------------------------------------------------------------- utils
let seed = 20260927;
function rnd(): number {
  // mulberry32
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
function weighted<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
}
const DAY = 86400000;
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600000);
const round50 = (n: number) => Math.round(n / 50) * 50;
const round500 = (n: number) => Math.round(n / 500) * 500;

const NOW = new Date();
const TODAY = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
const MONTH0 = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1));
const GO_LIVE = addMonths(MONTH0, -17); // billing history starts 17 months back

// ---------------------------------------------------------------- names
const FIRST_M = ['Aarav','Vihaan','Arjun','Rohan','Karthik','Siddharth','Nikhil','Pranav','Rahul','Varun','Aditya','Harsha','Manoj','Suresh','Vivek','Ankit','Deepak','Ganesh','Kiran','Prakash','Ramesh','Sandeep','Tarun','Yash','Abhishek','Naveen','Srinivas','Vijay','Mohan','Imran','Faisal','Joseph','Anil','Rajesh','Sanjay'];
const FIRST_F = ['Ananya','Diya','Priya','Sneha','Kavya','Meera','Pooja','Lakshmi','Divya','Aishwarya','Nandini','Shruti','Swathi','Neha','Riya','Bhavana','Keerthi','Deepa','Harini','Pallavi','Asha','Sowmya','Tanvi','Isha','Farah','Mary','Rekha','Anjali','Revathi','Sunita'];
const LAST = ['Sharma','Iyer','Reddy','Rao','Nair','Menon','Gowda','Hegde','Kulkarni','Patil','Shetty','Pillai','Naidu','Verma','Gupta','Joshi','Bhat','Kamath','Desai','Mehta','Agarwal','Chatterjee','Banerjee','Das','Mukherjee','Singh','Kumar','Krishnan','Subramanian','Venkatesh','Prasad','Khan','DSouza','Fernandes','Thomas','Varghese','Mishra','Pandey','Saxena','Jain'];
const OCCUPATIONS: [string, string][] = [
  ['Software Engineer','Infosys'],['Senior Developer','Wipro'],['Product Manager','Flipkart'],['Data Analyst','Accenture'],
  ['QA Engineer','TCS'],['Consultant','Deloitte'],['Designer','Swiggy'],['Engineering Manager','Microsoft'],
  ['Doctor','Manipal Hospitals'],['Teacher','National Public School'],['Chartered Accountant','KPMG'],
  ['Research Scientist','IISc'],['Sales Manager','HDFC Bank'],['Architect','Self-employed'],['DevOps Engineer','Zerodha'],
  ['Business Analyst','Goldman Sachs'],['Nurse','Narayana Health'],['Entrepreneur','Self-employed'],
];

const usedEmails = new Set<string>();
function makePerson(): { name: string; email: string; phone: string; female: boolean } {
  const female = chance(0.5);
  const first = pick(female ? FIRST_F : FIRST_M);
  const last = pick(LAST);
  const base = `${first}.${last}`.toLowerCase();
  let email = `${base}@example.com`;
  let n = 2;
  while (usedEmails.has(email)) email = `${base}${n++}@example.com`;
  usedEmails.add(email);
  return { name: `${first} ${last}`, email, phone: String(randInt(6, 9)) + String(randInt(100000000, 999999999)), female };
}

// ---------------------------------------------------------------- property layout
const COMPLEXES = [
  { name: 'Lakeview Residency', address: '14, Varthur Main Road', locality: 'Whitefield', pincode: '560066', year: 2014,
    amenities: ['Clubhouse','Swimming pool','Gym','Power backup','Children play area'],
    blocks: ['A','B','C'], floors: 6, perFloor: 4, rentPerSqft: 30, maintPerSqft: 3.5 },
  { name: 'Palm Grove Towers', address: '27th Main, Sector 2', locality: 'HSR Layout', pincode: '560102', year: 2018,
    amenities: ['Gym','Rooftop garden','EV charging','Power backup'],
    blocks: ['North','South'], floors: 8, perFloor: 3, rentPerSqft: 40, maintPerSqft: 4.5 },
  { name: 'Sunrise Enclave', address: 'Neeladri Road, Phase 1', locality: 'Electronic City', pincode: '560100', year: 2021,
    amenities: ['Badminton court','Power backup','Jogging track'],
    blocks: ['T1','T2'], floors: 5, perFloor: 4, rentPerSqft: 20, maintPerSqft: 3.0 },
];
const TYPE_BY_POS: Record<number, [string, number][]> = {
  4: [['3BHK', 1450], ['2BHK', 1150], ['2BHK', 1100], ['3BHK', 1500]],
  3: [['3BHK', 1650], ['2BHK', 1200], ['4BHK', 2100]],
};

const VENDORS: { name: string; category: string; quality: number }[] = [
  { name: 'AquaFix Plumbing Services', category: 'PLUMBING', quality: 0.85 },
  { name: 'QuickFlow Plumbers', category: 'PLUMBING', quality: 0.6 },
  { name: 'Voltline Electricals', category: 'ELECTRICAL', quality: 0.8 },
  { name: 'Sri Ganesh Electric Works', category: 'ELECTRICAL', quality: 0.65 },
  { name: 'WoodCraft Carpentry', category: 'CARPENTRY', quality: 0.75 },
  { name: 'CoolAir Appliance Care', category: 'APPLIANCE', quality: 0.7 },
  { name: 'PestAway Solutions', category: 'PEST_CONTROL', quality: 0.8 },
  { name: 'LiftTech Elevators AMC', category: 'LIFT', quality: 0.7 },
  { name: 'SecureVision Systems', category: 'SECURITY', quality: 0.75 },
  { name: 'SparkleClean Housekeeping', category: 'CLEANING', quality: 0.6 },
  { name: 'ColourCoat Painters', category: 'PAINTING', quality: 0.8 },
  { name: 'FibreNet Installations', category: 'INTERNET', quality: 0.7 },
  { name: 'HandyHome Services', category: 'OTHER', quality: 0.7 },
];

const DEMO_PASSWORD = 'Password@123';
const ADMIN_PASSWORD = 'Admin@123';

// ---------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`TRUNCATE audit_log, maintenance_status_history, request_embedding, maintenance_request, vendor,
                   payment, invoice, parking_allocation, vehicle, parking_slot, lease, ownership,
                   tenant_profile, owner_profile, unit, block, complex_manager, complex, app_user
                   RESTART IDENTITY CASCADE`);

    const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const insUser = async (p: { name: string; email: string; phone: string }, role: string, hash = demoHash) =>
      (await c.query(`INSERT INTO app_user (email, password_hash, full_name, phone, role, created_at)
                      VALUES ($1,$2,$3,$4,$5,$6) RETURNING user_id`,
        [p.email, hash, p.name, p.phone, role, GO_LIVE.toISOString()])).rows[0].user_id as number;

    // ---- staff
    await insUser({ name: 'System Administrator', email: 'admin@aptmgr.in', phone: '9845000001' }, 'ADMIN', adminHash);
    const managers = [
      await insUser({ name: 'Ravi Kumar', email: 'ravi.manager@aptmgr.in', phone: '9845000011' }, 'MANAGER'),
      await insUser({ name: 'Priya Menon', email: 'priya.manager@aptmgr.in', phone: '9845000012' }, 'MANAGER'),
      await insUser({ name: 'Arjun Hegde', email: 'arjun.manager@aptmgr.in', phone: '9845000013' }, 'MANAGER'),
    ];
    for (const e of ['admin@aptmgr.in','ravi.manager@aptmgr.in','priya.manager@aptmgr.in','arjun.manager@aptmgr.in']) usedEmails.add(e);

    // ---- complexes, blocks, units
    type U = { unitId: number; complexIdx: number; complexId: number; rent: number; blockName: string; number: string };
    const units: U[] = [];
    const complexIds: number[] = [];
    for (const [ci, cx] of COMPLEXES.entries()) {
      const complexId = (await c.query(
        `INSERT INTO complex (name, address_line, locality, pincode, established_year, amenities)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING complex_id`,
        [cx.name, cx.address, cx.locality, cx.pincode, cx.year, cx.amenities])).rows[0].complex_id;
      complexIds.push(complexId);
      for (const bn of cx.blocks) {
        const blockId = (await c.query(`INSERT INTO block (complex_id, name, total_floors) VALUES ($1,$2,$3) RETURNING block_id`,
          [complexId, bn, cx.floors])).rows[0].block_id;
        for (let f = 1; f <= cx.floors; f++) {
          for (let p = 1; p <= cx.perFloor; p++) {
            const [type, area0] = TYPE_BY_POS[cx.perFloor][p - 1];
            const area = area0 + randInt(-40, 40);
            const rent = round500(area * cx.rentPerSqft * (1 + f * 0.005));
            const maint = Math.round(area * cx.maintPerSqft / 10) * 10;
            const num = `${f}${String(p).padStart(2, '0')}`;
            const unitId = (await c.query(
              `INSERT INTO unit (block_id, unit_number, floor_no, unit_type, carpet_area_sqft, base_rent, monthly_maintenance, facing)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING unit_id`,
              [blockId, num, f, type, area, rent, maint, pick(['N','S','E','W','NE','NW','SE','SW'])])).rows[0].unit_id;
            units.push({ unitId, complexIdx: ci, complexId, rent, blockName: bn, number: num });
          }
        }
      }
    }
    // managers: Ravi -> Lakeview + Sunrise, Priya -> Palm Grove, Arjun -> Lakeview
    await c.query(`INSERT INTO complex_manager (complex_id, manager_user_id, assigned_on) VALUES
      ($1,$4,$7),($3,$4,$7),($2,$5,$7),($1,$6,$7)`,
      [complexIds[0], complexIds[1], complexIds[2], managers[0], managers[1], managers[2], toISO(GO_LIVE)]);
    const managerFor = (ci: number) => (ci === 1 ? managers[1] : ci === 0 ? pick([managers[0], managers[2]]) : managers[0]);

    // ---- owners and ownership
    const ownerByUser = new Map<number, number>(); // user_id -> owner_id
    const ownerUsers: number[] = [];
    const newOwner = async (person = makePerson()) => {
      const uid = await insUser(person, 'OWNER');
      const oid = (await c.query(`INSERT INTO owner_profile (user_id, mailing_address, is_nri) VALUES ($1,$2,$3) RETURNING owner_id`,
        [uid, `${randInt(1, 300)}, ${pick(['8th Cross','3rd Main','Church Street','100 Feet Road','5th Block'])}, Bengaluru`, chance(0.12)])).rows[0].owner_id;
      ownerByUser.set(uid, oid); ownerUsers.push(uid);
      return uid;
    };
    const primaryOwner = new Map<number, number>(); // unit -> owner user
    const ownerOccupied = new Set<number>();
    let demoOwnerUid = 0;
    for (const [i, u] of units.entries()) {
      const cx = COMPLEXES[u.complexIdx];
      const from = toISO(addDays(new Date(Date.UTC(cx.year, 0, 1)), randInt(0, 500)));
      let uid: number;
      if (i === 0 || i === 30) {
        // demo owner holds two units in Lakeview
        if (!demoOwnerUid) { usedEmails.add('owner@example.com'); demoOwnerUid = await newOwner({ name: 'Anand Rao', email: 'owner@example.com', phone: '9876500001', female: false }); }
        uid = demoOwnerUid;
      } else if (ownerUsers.length > 10 && chance(0.12)) {
        uid = pick(ownerUsers); // investor with several flats
      } else {
        uid = await newOwner();
      }
      if (chance(0.08) && i !== 0 && i !== 30) {
        const co = await newOwner();
        const share = pick([50, 60, 70]);
        await c.query(`INSERT INTO ownership (unit_id, owner_id, share_pct, owned_from) VALUES ($1,$2,$3,$4),($1,$5,$6,$4)`,
          [u.unitId, ownerByUser.get(uid), share, from, ownerByUser.get(co), 100 - share]);
      } else {
        await c.query(`INSERT INTO ownership (unit_id, owner_id, share_pct, owned_from) VALUES ($1,$2,100,$3)`,
          [u.unitId, ownerByUser.get(uid), from]);
      }
      primaryOwner.set(u.unitId, uid);
      if (i !== 0 && i !== 30 && chance(0.17)) ownerOccupied.add(u.unitId);
    }
    // a few resales during the history window
    for (const u of units.filter((x) => !ownerOccupied.has(x.unitId)).slice(5, 60).filter(() => chance(0.1))) {
      if (u.unitId === units[0].unitId || u.unitId === units[30].unitId) continue;
      const saleDate = toISO(addDays(GO_LIVE, randInt(60, 400)));
      const r = await c.query(`SELECT count(*)::int n FROM ownership WHERE unit_id=$1`, [u.unitId]);
      if (r.rows[0].n !== 1) continue;
      await c.query(`UPDATE ownership SET owned_until=$2 WHERE unit_id=$1`, [u.unitId, saleDate]);
      const buyer = await newOwner();
      await c.query(`INSERT INTO ownership (unit_id, owner_id, share_pct, owned_from) VALUES ($1,$2,100,$3)`,
        [u.unitId, ownerByUser.get(buyer), saleDate]);
      primaryOwner.set(u.unitId, buyer);
    }
    await c.query(`UPDATE unit SET occupancy_status='OWNER_OCCUPIED' WHERE unit_id = ANY($1)`, [[...ownerOccupied]]);

    // ---- tenants and leases
    const newTenant = async (person = makePerson()) => {
      const uid = await insUser(person, 'TENANT');
      const [occ, emp] = pick(OCCUPATIONS);
      const ec = makePerson();
      const tid = (await c.query(
        `INSERT INTO tenant_profile (user_id, occupation, employer, family_size, emergency_contact_name, emergency_contact_phone)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING tenant_id`,
        [uid, occ, emp, randInt(1, 5), ec.name, ec.phone])).rows[0].tenant_id;
      return { uid, tid };
    };
    type Occ = { unitId: number; userId: number; from: Date; to: Date; complexIdx: number };
    const residencies: Occ[] = [];
    const activeLeases: { leaseId: number; unitId: number; tenantUid: number; start: Date; res: Occ }[] = [];
    let demoTenantDone = false;
    usedEmails.add('tenant@example.com');
    const rentalUnits = units.filter((u) => !ownerOccupied.has(u.unitId));
    const underMaint = new Set(rentalUnits.slice(1).filter(() => chance(0.02)).slice(0, 3).map((u) => u.unitId));
    for (const u of rentalUnits) {
      let cursor = addDays(GO_LIVE, -randInt(0, 320));
      let tenant: { uid: number; tid: number } | null = null;
      let rent = round500(u.rent * (0.95 + rnd() * 0.12));
      while (cursor <= addDays(TODAY, 20)) {
        const start = cursor;
        const end = addMonths(start, 11);
        const status = end <= TODAY ? 'ENDED' : start > TODAY ? 'PENDING' : 'ACTIVE';
        if (underMaint.has(u.unitId) && status !== 'ENDED') break; // unit taken off the market
        // the demo tenant always gets the current lease on the demo owner's first flat
        const makeDemo = !demoTenantDone && u.unitId === units[0].unitId && status === 'ACTIVE';
        const renew = !makeDemo && tenant && chance(0.35);
        if (!renew) {
          tenant = makeDemo
            ? await newTenant({ name: 'Sneha Iyer', email: 'tenant@example.com', phone: '9876500002', female: true })
            : await newTenant();
          if (makeDemo) demoTenantDone = true;
        } else {
          rent = round500(rent * 1.05);
        }
        const deposit = rent * randInt(3, 6);
        const leaseId = (await c.query(
          `INSERT INTO lease (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit, rent_due_day, status, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING lease_id`,
          [u.unitId, tenant!.tid, toISO(start), toISO(end), rent, deposit, pick([1, 5, 5, 5, 7, 10]), status,
           managerFor(u.complexIdx), addDays(start, -randInt(5, 20)).toISOString()])).rows[0].lease_id;
        const res: Occ = { unitId: u.unitId, userId: tenant!.uid, from: start, to: end < TODAY ? end : TODAY, complexIdx: u.complexIdx };
        if (status !== 'PENDING') residencies.push(res);
        if (status === 'ACTIVE') activeLeases.push({ leaseId, unitId: u.unitId, tenantUid: tenant!.uid, start, res });
        // gap before the next tenancy
        // gap before the next tenancy: sometimes immediate, usually a few weeks, occasionally months
        cursor = chance(0.3) ? end : addDays(end, chance(0.7) ? randInt(10, 50) : randInt(60, 160));
      }
    }
    await c.query(`UPDATE unit SET occupancy_status='UNDER_MAINTENANCE' WHERE unit_id = ANY($1) AND occupancy_status='VACANT'`, [[...underMaint]]);
    for (const u of units.filter((x) => ownerOccupied.has(x.unitId)))
      residencies.push({ unitId: u.unitId, userId: primaryOwner.get(u.unitId)!, from: addDays(GO_LIVE, -60), to: TODAY, complexIdx: u.complexIdx });

    // ---- vendors
    const vendorsByCat = new Map<string, { id: number; quality: number }[]>();
    for (const v of VENDORS) {
      const id = (await c.query(`INSERT INTO vendor (name, service_category, phone, email, rating) VALUES ($1,$2,$3,$4,$5) RETURNING vendor_id`,
        [v.name, v.category, '9' + String(randInt(100000000, 999999999)),
         v.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@example.com',
         Math.round((3 + v.quality * 2) * 10) / 10])).rows[0].vendor_id;
      vendorsByCat.set(v.category, [...(vendorsByCat.get(v.category) ?? []), { id, quality: v.quality }]);
    }

    // ---- parking slots, vehicles, allocations (current residents)
    const slotsByComplex = new Map<number, { CAR: number[]; BIKE: number[]; EV: number[] }>();
    for (const [ci, cx] of COMPLEXES.entries()) {
      const nUnits = cx.blocks.length * cx.floors * cx.perFloor;
      const pool_ = { CAR: [] as number[], BIKE: [] as number[], EV: [] as number[] };
      const mk = async (type: 'CAR' | 'BIKE' | 'EV', n: number, prefix: string) => {
        for (let k = 1; k <= n; k++) {
          const level = type === 'BIKE' ? pick(['B1','G']) : k <= n * 0.6 ? 'B1' : pick(['B2','G','OPEN']);
          const id = (await c.query(`INSERT INTO parking_slot (complex_id, slot_code, level, slot_type, is_covered) VALUES ($1,$2,$3,$4,$5) RETURNING slot_id`,
            [complexIds[ci], `${prefix}${String(k).padStart(3, '0')}`, level, type, level !== 'OPEN'])).rows[0].slot_id;
          pool_[type].push(id);
        }
      };
      await mk('CAR', Math.round(nUnits * 0.9), 'C');
      await mk('BIKE', Math.round(nUnits * 0.6), 'B');
      await mk('EV', ci === 1 ? 10 : 4, 'E');
      slotsByComplex.set(complexIds[ci], pool_);
    }
    const CARS = ['Maruti Swift','Hyundai Creta','Honda City','Tata Nexon','Kia Seltos','Toyota Innova','Mahindra XUV700','Maruti Baleno'];
    const EVS = ['Tata Nexon EV','MG ZS EV','Hyundai Ioniq 5','Tata Punch EV'];
    const BIKES = ['Honda Activa','Royal Enfield Classic','TVS Jupiter','Bajaj Pulsar','Ather 450X','Yamaha FZ'];
    const usedReg = new Set<string>();
    const reg = () => {
      let r: string;
      do { r = `KA${String(pick([1, 2, 3, 4, 5, 41, 51, 53, 59])).padStart(2, '0')}${pick(['M','MA','MB','N','P','AB','HK','JX'])}${randInt(1000, 9999)}`; } while (usedReg.has(r));
      usedReg.add(r); return r;
    };
    const currentResidents = [
      ...activeLeases.map((l) => ({ unitId: l.unitId, uid: l.tenantUid, start: l.start })),
      ...[...ownerOccupied].map((u) => ({ unitId: u, uid: primaryOwner.get(u)!, start: addDays(GO_LIVE, -30) })),
    ];
    const unitComplex = new Map(units.map((u) => [u.unitId, u.complexId]));
    for (const r of currentResidents) {
      const slots = slotsByComplex.get(unitComplex.get(r.unitId)!)!;
      const want: ('CAR' | 'EV' | 'BIKE')[] = [];
      if (chance(0.72)) want.push(chance(0.12) ? 'EV' : 'CAR');
      if (chance(0.5)) want.push('BIKE');
      for (const t of want) {
        const slot = slots[t].shift();
        if (!slot) continue;
        const vehicleId = (await c.query(
          `INSERT INTO vehicle (owner_user_id, registration_no, vehicle_type, is_electric, make_model) VALUES ($1,$2,$3,$4,$5) RETURNING vehicle_id`,
          [r.uid, reg(), t === 'BIKE' ? 'BIKE' : 'CAR', t === 'EV', t === 'EV' ? pick(EVS) : t === 'CAR' ? pick(CARS) : pick(BIKES)])).rows[0].vehicle_id;
        const charge = t === 'EV' ? 1500 : t === 'CAR' ? 750 : 250;
        await c.query(`INSERT INTO parking_allocation (slot_id, unit_id, vehicle_id, start_date, monthly_charge) VALUES ($1,$2,$3,$4,$5)`,
          [slot, r.unitId, vehicleId, toISO(r.start < GO_LIVE ? GO_LIVE : r.start), charge]);
      }
    }
    await c.query('COMMIT');
    console.log(`people, property, leases, parking: ${units.length} units, ${ownerUsers.length} owners, ${residencies.length} residencies`);

    // ---- billing history
    await c.query('BEGIN');
    for (let m = new Date(GO_LIVE); m <= MONTH0; m = addMonths(m, 1))
      await c.query(`SELECT * FROM fn_generate_monthly_invoices($1)`, [toISO(m)]);

    // two early terminations at the end of last month (voids this month's rent)
    const lastMonthEnd = toISO(addDays(MONTH0, -1));
    const toTerminate = activeLeases.filter((l) => l.start < addMonths(TODAY, -4) && l.unitId !== units[0].unitId).slice(3, 5);
    for (const l of toTerminate) {
      l.res.to = addDays(MONTH0, -1);
      await c.query(`CALL sp_terminate_lease($1, $2, $3)`, [l.leaseId, lastMonthEnd, pick(['Tenant relocating to Pune for work', 'Tenant bought their own flat'])]);
    }

    // ---- payments
    const profile = new Map<number, 'good' | 'late' | 'chronic' | 'defaulter'>();
    const profileOf = (uid: number) => {
      if (!profile.has(uid)) profile.set(uid, weighted([['good', 70], ['late', 18], ['chronic', 9], ['defaulter', 3]]));
      return profile.get(uid)!;
    };
    const invoices = (await c.query(`SELECT invoice_id, amount, due_date, issued_on, billed_to FROM invoice WHERE status <> 'VOID' ORDER BY invoice_id`)).rows;
    let refN = 100000;
    const pay = async (inv: { invoice_id: number; billed_to: number }, amount: number, at: Date) => {
      const method = weighted<string>([['UPI', 60], ['BANK_TRANSFER', 20], ['CARD', 10], ['CHEQUE', 5], ['CASH', 5]]);
      const prefix = { UPI: 'UPI', BANK_TRANSFER: 'NEFT', CARD: 'CRD', CHEQUE: 'CHQ', CASH: 'CSH' }[method];
      const recordedBy = method === 'CASH' || method === 'CHEQUE' ? pick(managers) : inv.billed_to;
      await c.query(`INSERT INTO payment (invoice_id, amount, paid_at, method, reference_no, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv.invoice_id, amount, addHours(at, 9 + rnd() * 12).toISOString(), method, `${prefix}${toISO(at).replace(/-/g, '')}${refN++}`, recordedBy]);
    };
    const demoTenantUid = (await c.query(`SELECT user_id FROM app_user WHERE email = 'tenant@example.com'`)).rows[0].user_id;
    for (const inv of invoices) {
      const due = new Date(inv.due_date + 'T00:00:00Z');
      // leave the demo tenant's current-month bills open so the "Pay" flow can be shown
      if (inv.billed_to === demoTenantUid && due >= MONTH0) continue;
      const issued = new Date(inv.issued_on + 'T00:00:00Z');
      const p = profileOf(inv.billed_to);
      let delay: number | null;
      let split = false;
      if (p === 'good') delay = randInt(-6, 3);
      else if (p === 'late') delay = randInt(3, 35);
      else if (p === 'chronic') {
        // chronic late payers eventually clear old dues; recent months may still be open
        const recent = due > addMonths(TODAY, -4);
        delay = recent && chance(0.25) ? null : randInt(10, 70); split = chance(0.35);
      }
      else {
        // defaulters paid slowly for most of the history, then stopped paying in recent months
        const recent = due > addMonths(TODAY, -5);
        delay = recent ? (chance(0.8) ? null : randInt(20, 60)) : randInt(15, 75);
      }
      if (delay === null) continue;
      let at = addDays(due, delay);
      if (at < issued) at = issued;
      if (at > TODAY) continue;
      const amt = Number(inv.amount);
      if (split) {
        const first = Math.round(amt * pick([0.4, 0.5, 0.6]));
        await pay(inv, first, at);
        const at2 = addDays(at, randInt(10, 45));
        if (at2 <= TODAY) await pay(inv, amt - first, at2);
      } else {
        await pay(inv, amt, at);
      }
    }
    const lateFees = (await c.query(`SELECT fn_apply_late_fees($1) n`, [toISO(TODAY)])).rows[0].n;
    await c.query('COMMIT');
    console.log(`billing: ${invoices.length} invoices, ${refN - 100000} payments, ${lateFees} late fees, ${toTerminate.length} terminations`);

    // ---- maintenance requests
    const catWeights: [string, number][] = [
      ['PLUMBING', 26], ['ELECTRICAL', 20], ['CARPENTRY', 9], ['APPLIANCE', 11], ['PEST_CONTROL', 7],
      ['LIFT', 6], ['SECURITY', 5], ['CLEANING', 5], ['PAINTING', 5], ['INTERNET', 3], ['OTHER', 3]];
    const byCat = new Map<string, Template[]>();
    for (const t of TEMPLATES) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
    const SUFFIX = ['', '', '', ' Please send someone after 6 pm on weekdays.', ' This is the second time this has happened this month.',
      ' We are available on the weekend.', ' Kindly treat this as a priority, we have small children at home.', ' Owner has been informed.',
      ' Can someone check today itself?', ' Happened after the heavy rain yesterday.'];
    const ASSIGN_H: Record<string, [number, number]> = { URGENT: [0.3, 4], HIGH: [2, 14], MEDIUM: [4, 40], LOW: [12, 96] };
    const FIX_H: Record<string, [number, number]> = { URGENT: [2, 20], HIGH: [6, 60], MEDIUM: [12, 150], LOW: [24, 300] };
    const between = ([a, b]: [number, number]) => a + rnd() * (b - a);
    const nowTs = new Date();
    const TARGET = 340;
    const RECENT = 14; // the last few requests are forced into the past week so the live queue is not empty
    const eligible = residencies.filter((r) => r.to > addDays(GO_LIVE, -60));
    let made = 0;
    while (made < TARGET) {
      const r = pick(eligible);
      const from = Math.max(r.from.getTime(), addDays(GO_LIVE, -60).getTime());
      const to = Math.min(r.to.getTime(), nowTs.getTime() - 3600000);
      if (to <= from) continue;
      const recentFloor = nowTs.getTime() - 6 * DAY;
      if (made >= TARGET - RECENT && to < recentFloor) continue;
      const created = made >= TARGET - RECENT
        ? new Date(Math.max(from, recentFloor) + rnd() * (to - Math.max(from, recentFloor)))
        : new Date(from + rnd() * (to - from));
      const month = created.getUTCMonth();
      const cat = month >= 5 && month <= 8 && chance(0.25) ? 'PLUMBING' : weighted(catWeights);
      const t = pick(byCat.get(cat)!);
      const description = t.description + pick(SUFFIX);
      const ageDays = (nowTs.getTime() - created.getTime()) / DAY;
      let final: string;
      if (ageDays > 14) final = weighted([['CLOSED', 84], ['RESOLVED', 7], ['CANCELLED', 5], ['IN_PROGRESS', 4]]);
      else if (ageDays > 4) final = weighted([['RESOLVED', 35], ['IN_PROGRESS', 25], ['ASSIGNED', 20], ['CLOSED', 15], ['CANCELLED', 5]]);
      else final = weighted([['OPEN', 50], ['ASSIGNED', 30], ['IN_PROGRESS', 20]]);
      const vendor = pick(vendorsByCat.get(cat)!);
      const assignedAt = addHours(created, between(ASSIGN_H[t.priority]));
      const resolvedAt = addHours(assignedAt, between(FIX_H[t.priority]) * (chance(1 - vendor.quality) ? 2.5 : 1));
      if (resolvedAt > nowTs && ['RESOLVED', 'CLOSED'].includes(final)) final = 'IN_PROGRESS';
      if (assignedAt > nowTs && final !== 'OPEN' && final !== 'CANCELLED') final = 'OPEN';
      const mgr = managerFor(r.complexIdx);
      const est = round50(between(t.cost));
      const actual = round50(est * (0.85 + rnd() * 0.45));

      await c.query('BEGIN');
      const id = (await c.query(
        `INSERT INTO maintenance_request (unit_id, raised_by, category, title, description, priority, created_at, is_common_area)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING request_id`,
        [r.unitId, r.userId, cat, t.title, description, t.priority, created.toISOString(), ['LIFT', 'SECURITY', 'CLEANING'].includes(cat)])).rows[0].request_id;
      await c.query(`SELECT set_config('app.user_id', $1, true)`, [String(mgr)]);
      const at = (d: Date) => c.query(`SELECT set_config('app.event_time', $1, true)`, [d.toISOString()]);
      if (final === 'CANCELLED') {
        await at(addHours(created, between([1, 30])));
        await c.query(`UPDATE maintenance_request SET status='CANCELLED' WHERE request_id=$1`, [id]);
      } else if (final !== 'OPEN') {
        await c.query(`UPDATE maintenance_request SET status='ASSIGNED', vendor_id=$2, estimated_cost=$3, assigned_at=$4 WHERE request_id=$1`,
          [id, vendor.id, est, assignedAt.toISOString()]);
        if (final !== 'ASSIGNED') {
          const startAt = addHours(assignedAt, Math.min(between([0.5, 12]), Math.max(0.1, (resolvedAt.getTime() - assignedAt.getTime()) / 3600000 / 2)));
          await at(startAt > nowTs ? nowTs : startAt);
          await c.query(`UPDATE maintenance_request SET status='IN_PROGRESS' WHERE request_id=$1`, [id]);
          if (final === 'RESOLVED' || final === 'CLOSED') {
            await c.query(`UPDATE maintenance_request SET status='RESOLVED', resolved_at=$2, actual_cost=$3, resolution_notes=$4 WHERE request_id=$1`,
              [id, resolvedAt.toISOString(), actual, t.resolution]);
            if (final === 'CLOSED') {
              const onTime = resolvedAt.getTime() - created.getTime() <= ({ URGENT: 24, HIGH: 72, MEDIUM: 168, LOW: 336 }[t.priority]) * 3600000;
              const rating = Math.max(1, Math.min(5, Math.round(2 + vendor.quality * 3 + (onTime ? 0.5 : -1.2) + (rnd() - 0.5))));
              const closeAt = addHours(resolvedAt, between([2, 72]));
              await at(closeAt > nowTs ? nowTs : closeAt);
              await c.query(`UPDATE maintenance_request SET status='CLOSED', tenant_rating=$2 WHERE request_id=$1`, [id, rating]);
            }
          }
        }
      }
      await c.query('COMMIT');
      made++;
    }
    console.log(`maintenance: ${made} requests`);

    // housekeeping
    await c.query(`SELECT fn_refresh_unit_status(unit_id) FROM unit`);
    await c.query(`TRUNCATE audit_log`); // seed import is not user activity
    await c.query(`REFRESH MATERIALIZED VIEW mv_complex_kpis`);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }

  const n = await embedMissing((msg) => console.log(msg));
  console.log(`embeddings: ${n} created`);
  await pool.query('VACUUM ANALYZE'); // fresh planner statistics after the bulk load
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`\nDemo logins:\n  admin@aptmgr.in / ${ADMIN_PASSWORD}\n  ravi.manager@aptmgr.in / ${DEMO_PASSWORD}\n  owner@example.com / ${DEMO_PASSWORD}\n  tenant@example.com / ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
