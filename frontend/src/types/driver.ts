export type DriverStatus = 'active' | 'on_break' | 'off_duty';

export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  assignedVehicleId?: string;
  shift: 'Primera Jornada' | 'Segunda Jornada' | 'Tercera Jornada';
  status: DriverStatus;
  contactPhone: string;
  rating?: number;
}
