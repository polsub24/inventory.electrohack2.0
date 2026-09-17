import { Request, RequestStatus } from '../types';

// xlsx is a large library used behind two buttons that most users never click —
// importing it dynamically keeps it out of the main bundle and in its own
// chunk, fetched only the first time someone actually exports something.
const loadXLSX = () => import('xlsx');

const STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.Pending]: 'Pending Approval',
  [RequestStatus.Modified]: 'Modified by Admin',
  [RequestStatus.Approved]: 'Approved / Ready',
  [RequestStatus.Rejected]: 'Rejected',
  [RequestStatus.Collected]: 'Collected',
  [RequestStatus.Returned]: 'Returned to Inventory',
};

const statusLabel = (status: RequestStatus) => STATUS_LABELS[status] ?? status;
const formatTimestamp = (d: Date) => d.toLocaleString();

// Keeps generated filenames filesystem-safe across OSes without pulling in a
// slug library for one call site.
const safeFilenamePart = (s: string) =>
  s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'export';

/**
 * One request → a two-sheet workbook (team/status summary, then itemized
 * quantities). This is the per-request "Generate Excel Report" action, so
 * there's a paper trail for what was approved, collected, or returned.
 *
 * `item.component` is typed as always-present in RequestItem, but a component
 * can be deleted after the request that referenced it was created — the API
 * sends `component: null` in that case, so this reads defensively rather than
 * trusting the type.
 */
export const exportRequestReport = async (request: Request) => {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['Request ID', request.id],
    ['Team Name', request.team.teamName],
    ['Leader Name', request.team.leaderName],
    ['Registration Number', request.team.registrationNumber],
    ['Status', statusLabel(request.status)],
    ['Submitted At', formatTimestamp(request.timestamp)],
    ['Notes', request.notes ?? ''],
  ]);
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const itemRows = request.items.map((item) => ({
    Component: item.component?.name ?? 'Unknown component',
    Category: item.component?.category ?? '',
    Quantity: item.quantity,
  }));
  const itemsSheet = XLSX.utils.json_to_sheet(itemRows);
  itemsSheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, itemsSheet, 'Items');

  const filename = `request-${safeFilenamePart(request.team.teamName)}-${request.id.slice(0, 8)}.xlsx`;
  XLSX.writeFile(wb, filename);
};

/**
 * A flat, one-row-per-item export across many requests — "which teams
 * submitted/collected what," for the Queue/Approved/History tabs on the admin
 * dashboard. `sheetTitle` becomes both the filename and shows up nowhere else,
 * so it can just describe the current filter (e.g. "Approved Requests").
 */
export const exportRequestsReport = async (requests: Request[], sheetTitle: string) => {
  const rows: Record<string, string | number>[] = [];

  for (const request of requests) {
    const base = {
      'Team Name': request.team.teamName,
      'Leader Name': request.team.leaderName,
      'Registration Number': request.team.registrationNumber,
      Status: statusLabel(request.status),
      'Submitted At': formatTimestamp(request.timestamp),
      Notes: request.notes ?? '',
    };

    if (request.items.length === 0) {
      rows.push({ ...base, Component: '', Category: '', Quantity: '' });
      continue;
    }

    for (const item of request.items) {
      rows.push({
        ...base,
        Component: item.component?.name ?? 'Unknown component',
        Category: item.component?.category ?? '',
        Quantity: item.quantity,
      });
    }
  }

  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Team Name', 'Leader Name', 'Registration Number', 'Component', 'Category', 'Quantity', 'Status', 'Submitted At', 'Notes'],
  });
  sheet['!cols'] = [
    { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 26 }, { wch: 14 },
    { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, 'Requests');

  const filename = `${safeFilenamePart(sheetTitle)}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
};
