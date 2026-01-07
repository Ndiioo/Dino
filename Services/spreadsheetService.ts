
import Papa from 'papaparse';
import { Assignment, Station, User } from '../types';

const SHEET_ID = '1NSFmEGm3i1RgLCt1tSIaP9lYlfe8fnMMrsHeke_ZCiI';
const APPS_SCRIPT_URL = `https://script.google.com/macros/s/AKfycbz_Placeholder/exec`;

/**
 * Fetches assignments for a specific station hub.
 */
export const fetchSpreadsheetData = async (station: Station): Promise<Assignment[]> => {
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(station)}`;
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`Sheet '${station}' not found.`);
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const assignments: Assignment[] = results.data.map((row: any, index: number) => {
            const courierName = row['Nama Kurir'] || row['nama_kurir'] || row['Name'] || row['Nama'] || 'Tanpa Nama';
            const packageCount = parseInt(row['Jumlah Paket'] || row['jumlah_paket'] || row['Count']) || 0;
            const taskId = row['Task ID'] || row['task_id'] || `TASK-${station}-${index + 1}`;
            const statusStr = (row['Status'] || 'Pending').trim();
            const lastUpdated = row['Update Terakhir'] || row['update_terakhir'] || '-';
            return {
              id: `${station}-${index}`,
              courierName,
              packageCount,
              station,
              taskId,
              status: (['Pending', 'Ongoing', 'Completed'].includes(statusStr) ? statusStr : 'Pending') as any,
              lastUpdated
            };
          });
          resolve(assignments.filter(a => a.courierName !== 'Tanpa Nama'));
        },
        error: reject
      });
    });
  } catch (error) {
    console.error(`Error fetching ${station}:`, error);
    return [];
  }
};

/**
 * Uploads previewed data to the spreadsheet. 
 * This action is designed to trigger the creation of a new database sheet in the Apps Script.
 */
export const uploadImportedData = async (station: Station, data: any[]): Promise<boolean> => {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'importNewSheet', 
        station, 
        data, 
        timestamp: new Date().toLocaleString() 
      })
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Fetch Staff Access data.
 */
export const fetchStaffData = async (): Promise<User[]> => {
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Staff%20Akses`;
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const staff: User[] = results.data.map((row: any) => {
            const pwd = (row['Password user'] || row['Password default'] || row['Password'] || '123456').toString().trim();
            return {
              id: (row['User ID'] || row['ID'] || '').toString().trim(),
              name: row['Name'] || row['Nama Lengkap'] || 'Staff Member',
              role: (row['Role'] || row['Akses'] || 'operator').toLowerCase() as any,
              position: row['Position'] || row['Jabatan'] || 'Hub Staff',
              password: pwd,
              nickname: row['Nickname'] || '',
              whatsapp: row['WhatsApp'] || '',
              photoUrl: row['Photo'] || '',
              dateOfBirth: row['DOB'] || row['Tanggal Lahir'] || ''
            };
          });
          resolve(staff.filter(u => u.id));
        }
      });
    });
  } catch {
    return [];
  }
};

/**
 * Fetch Courier Access data.
 */
export const fetchCourierLoginData = async (): Promise<User[]> => {
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Kurir%20Akses`;
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) return [];
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const couriers: User[] = results.data.map((row: any) => {
            const pwd = (row['Password user'] || row['Password default'] || row['Password'] || '123456').toString().trim();
            return {
              id: (row['User ID'] || row['ID'] || '').toString().trim(),
              name: row['Name'] || row['Nama Lengkap'] || 'Courier Partner',
              role: 'courier' as const,
              position: row['Position'] || row['Jabatan'] || 'Field Agent',
              password: pwd,
              nickname: row['Nickname'] || '',
              whatsapp: row['WhatsApp'] || '',
              photoUrl: row['Photo'] || '',
              dateOfBirth: row['DOB'] || row['Tanggal Lahir'] || ''
            };
          });
          resolve(couriers.filter(u => u.id));
        }
      });
    });
  } catch {
    return [];
  }
};

/**
 * Update task status.
 */
export const updateSpreadsheetTask = async (taskId: string, status: string, station: Station): Promise<boolean> => {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateStatus', taskId, status, station, timestamp: new Date().toLocaleString() })
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * Update user profile in database.
 */
export const updateUserProfile = async (userId: string, profile: any): Promise<boolean> => {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateProfile', userId, ...profile })
    });
    return true;
  } catch {
    return false;
  }
};
