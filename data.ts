
import { Assignment, Station } from './types';

export const MOCK_ASSIGNMENTS: Assignment[] = [
  // Tompobulu
  { id: '1', courierName: 'Budi Santoso', packageCount: 45, station: 'Tompobulu', taskId: 'SPX-TPB-001', status: 'Ongoing', lastUpdated: '08:30' },
  { id: '2', courierName: 'Siti Aminah', packageCount: 38, station: 'Tompobulu', taskId: 'SPX-TPB-002', status: 'Pending', lastUpdated: '09:15' },
  { id: '3', courierName: 'Agus Salim', packageCount: 52, station: 'Tompobulu', taskId: 'SPX-TPB-003', status: 'Ongoing', lastUpdated: '07:45' },
  { id: '4', courierName: 'Dewi Sartika', packageCount: 29, station: 'Tompobulu', taskId: 'SPX-TPB-004', status: 'Completed', lastUpdated: '10:00' },
  
  // Biringbulu
  { id: '5', courierName: 'Andi Pratama', packageCount: 61, station: 'Biringbulu', taskId: 'SPX-BIR-001', status: 'Ongoing', lastUpdated: '08:00' },
  { id: '6', courierName: 'Rina Wijaya', packageCount: 42, station: 'Biringbulu', taskId: 'SPX-BIR-002', status: 'Pending', lastUpdated: '09:30' },
  { id: '7', courierName: 'Eko Prasetyo', packageCount: 55, station: 'Biringbulu', taskId: 'SPX-BIR-003', status: 'Ongoing', lastUpdated: '08:15' },
  
  // Bungaya
  { id: '8', courierName: 'Fajar Ramadhan', packageCount: 33, station: 'Bungaya', taskId: 'SPX-BGY-001', status: 'Ongoing', lastUpdated: '08:45' },
  { id: '9', courierName: 'Lina Marlina', packageCount: 47, station: 'Bungaya', taskId: 'SPX-BGY-002', status: 'Completed', lastUpdated: '10:30' },
  { id: '10', courierName: 'Hendra Gunawan', packageCount: 50, station: 'Bungaya', taskId: 'SPX-BGY-003', status: 'Pending', lastUpdated: '09:00' },
  { id: '11', courierName: 'Yuni Astuti', packageCount: 41, station: 'Bungaya', taskId: 'SPX-BGY-004', status: 'Ongoing', lastUpdated: '08:20' },
];

export const STATIONS: Station[] = ['Tompobulu', 'Biringbulu', 'Bungaya'];
