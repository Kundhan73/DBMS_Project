import { api } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = api({ roles: ['ADMIN', 'MANAGER'] }, async () =>
  query('SELECT * FROM v_vendor_performance ORDER BY service_category, name'));
