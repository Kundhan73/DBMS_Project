'use client';
import { createContext, useContext } from 'react';

export type Me = {
  user: { id: number; role: 'ADMIN' | 'MANAGER' | 'OWNER' | 'TENANT'; name: string; email: string };
  complexes: { complex_id: number; name: string }[];
};

export const SessionContext = createContext<Me | null>(null);
export function useMe(): Me {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useMe outside session');
  return me;
}
export const isStaffRole = (r: string) => r === 'ADMIN' || r === 'MANAGER';
