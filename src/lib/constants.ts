export const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'CARPENTRY', 'APPLIANCE', 'PEST_CONTROL', 'LIFT',
  'SECURITY', 'CLEANING', 'PAINTING', 'INTERNET', 'OTHER'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const REQUEST_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export const UNIT_STATUSES = ['VACANT', 'OWNER_OCCUPIED', 'LEASED', 'UNDER_MAINTENANCE'] as const;
export const UNIT_TYPES = ['STUDIO', '1BHK', '2BHK', '3BHK', '4BHK'] as const;
export const INVOICE_TYPES = ['RENT', 'MAINTENANCE', 'PARKING', 'LATE_FEE'] as const;
export const PAYMENT_METHODS = ['UPI', 'CARD', 'BANK_TRANSFER', 'CASH', 'CHEQUE'] as const;
