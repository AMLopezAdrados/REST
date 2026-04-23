import type { Sector } from '@/types/node';
import type { MainCategory } from '@/types/classification';

export const SECTOR_ANGLES: Record<Sector, { start: number; end: number }> = {
  Work: { start: 0, end: 60 },
  Personal: { start: 60, end: 120 },
  Travel: { start: 120, end: 180 },
  Orders: { start: 180, end: 240 },
  Admin: { start: 240, end: 300 },
  Other: { start: 300, end: 360 },
};

export const SECTORS: Sector[] = ['Work', 'Personal', 'Travel', 'Orders', 'Admin', 'Other'];

export function categoryToSector(main: MainCategory, subcategory: string | null): Sector {
  switch (main) {
    case 'work':
      return 'Work';
    case 'personal':
      return 'Personal';
    case 'reservation':
      if (subcategory && subcategory.startsWith('travel')) return 'Travel';
      if (subcategory === 'calendar_invite') return 'Personal';
      return 'Personal';
    case 'order':
      return 'Orders';
    case 'admin':
      return 'Admin';
    case 'marketing':
    case 'unknown':
    default:
      return 'Other';
  }
}

export function sectorMidAngle(sector: Sector): number {
  const s = SECTOR_ANGLES[sector];
  return (s.start + s.end) / 2;
}
