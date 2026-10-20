import { calculateFine, overdueDays, publicUser } from '../http.js';

export function mapTitle(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    isbn: row.isbn,
    publisher: row.publisher,
    publishedYear: row.published_year,
    edition: row.edition,
    language: row.language,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    categorySlug: row.category_slug ?? null,
    subjectId: row.subject_id,
    subjectName: row.subject_name ?? null,
    subjectCode: row.subject_code ?? null,
    programme: row.programme,
    classLevel: row.class_level,
    pages: row.pages,
    coverColor: row.cover_color,
    coverStyle: row.cover_style,
    coverUrl: row.cover_url,
    featured: Boolean(row.featured),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    copiesTotal: Number(row.copies_total ?? 0),
    copiesAvailable: Number(row.copies_available ?? 0),
    copiesOut: Number(row.copies_out ?? 0),
    reservations: Number(row.reservations ?? 0),
    loanCount: Number(row.loan_count ?? 0),
  };
}

export function mapCopy(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    titleId: row.title_id,
    barcode: row.barcode,
    accessionNo: row.accession_no,
    shelf: row.shelf,
    rack: row.rack,
    section: row.section,
    condition: row.condition,
    status: row.status,
    acquisition: row.acquisition,
    acquiredOn: row.acquired_on,
    cost: row.cost,
    donor: row.donor,
    supplier: row.supplier,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title ?? null,
    author: row.author ?? null,
    coverColor: row.cover_color ?? null,
    categoryName: row.category_name ?? null,
    activeLoanId: row.active_loan_id ?? null,
    borrowerName: row.borrower_name ?? null,
    borrowerLibraryId: row.borrower_library_id ?? null,
    dueDate: row.due_date ?? null,
  };
}

export function mapLoan(row: any, opts: { withFine?: boolean } = {}) {
  if (!row) return null;
  const fine = row.status === 'active' && opts.withFine !== false ? calculateFine(row.due_date) : { days: 0, amount: 0 };
  return {
    id: row.id,
    copyId: row.copy_id,
    barcode: row.barcode,
    accessionNo: row.accession_no,
    titleId: row.title_id,
    title: row.title,
    author: row.author,
    coverColor: row.cover_color,
    userId: row.user_id,
    borrowerName: row.borrower_name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    borrowerLibraryId: row.borrower_library_id ?? row.library_id,
    borrowerRole: row.borrower_role ?? row.role,
    className: row.class_name,
    issuedBy: row.issued_by_name ?? null,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    returnDate: row.return_date,
    returnedBy: row.returned_by_name ?? null,
    renewalCount: row.renewal_count,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    overdueDays: row.status === 'active' ? overdueDays(row.due_date) : 0,
    fine: fine.amount,
  };
}

export function mapReservation(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    titleId: row.title_id,
    title: row.title,
    author: row.author,
    coverColor: row.cover_color,
    userId: row.user_id,
    userName: row.user_name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    libraryId: row.library_id ?? row.school_id,
    className: row.class_name,
    status: row.status,
    position: Number(row.position ?? row.queue_position ?? 1),
    createdAt: row.created_at,
    readyAt: row.ready_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    copiesAvailable: Number(row.copies_available ?? 0),
  };
}

export function mapResource(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind,
    subjectId: row.subject_id,
    subjectName: row.subject_name ?? null,
    subjectCode: row.subject_code ?? null,
    examYear: row.exam_year,
    paper: row.paper,
    level: row.level,
    author: row.author,
    publisher: row.publisher,
    publishedYear: row.published_year,
    language: row.language,
    fileName: row.file_name,
    fileMime: row.file_mime,
    fileSize: row.file_size,
    hasFile: Boolean(row.file_key),
    coverColor: row.cover_color,
    allowDownload: Boolean(row.allow_download),
    access: row.access,
    status: row.status,
    submittedBy: row.submitter_name ?? null,
    approvedBy: row.approver_name ?? null,
    approvedAt: row.approved_at,
    reviewNotes: row.review_notes ?? null,
    viewCount: row.view_count,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isFavorite: row.is_favorite != null ? Boolean(row.is_favorite) : undefined,
  };
}

export function mapCharge(row: any) {
  if (!row) return null;
  const outstanding = Math.max(0, Number(row.amount) - Number(row.paid_amount) - Number(row.waived_amount));
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    libraryId: row.library_id ?? row.school_id,
    className: row.class_name,
    loanId: row.loan_id,
    type: row.type,
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    waivedAmount: Number(row.waived_amount),
    outstanding: Math.round(outstanding * 100) / 100,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

export function mapUser(row: any) {
  return publicUser(row);
}

export function mapAnnouncement(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    pinned: Boolean(row.pinned),
    status: row.status,
    publishAt: row.publish_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    author: row.author_name ?? null,
  };
}

export function mapRequest(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    libraryId: row.library_id ?? row.school_id,
    className: row.class_name,
    title: row.title,
    author: row.author,
    reason: row.reason,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewer_name ?? null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export function mapAcquisition(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    titleId: row.title_id,
    bookTitle: row.book_title ?? null,
    type: row.type,
    quantity: row.quantity,
    unitCost: Number(row.unit_cost),
    totalCost: Number(row.total_cost),
    supplier: row.supplier,
    donor: row.donor,
    invoiceRef: row.invoice_ref,
    acquiredOn: row.acquired_on,
    notes: row.notes,
    recordedBy: row.recorder_name ?? null,
    createdAt: row.created_at,
  };
}

export function mapNotification(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export const LOAN_SELECT = `
  SELECT l.*, c.barcode, c.accession_no, t.title, t.author,
         t.cover_color, u.first_name, u.last_name, u.library_id AS borrower_library_id,
         u.role AS borrower_role, u.class_name,
         TRIM(COALESCE(ib.first_name,'') || ' ' || COALESCE(ib.last_name,'')) AS issued_by_name,
         TRIM(COALESCE(rb.first_name,'') || ' ' || COALESCE(rb.last_name,'')) AS returned_by_name,
         TRIM(u.first_name || ' ' || u.last_name) AS borrower_name
  FROM loans l
  JOIN copies c ON c.id = l.copy_id
  JOIN titles t ON t.id = c.title_id
  JOIN users u ON u.id = l.user_id
  LEFT JOIN users ib ON ib.id = l.issued_by
  LEFT JOIN users rb ON rb.id = l.returned_by
`;

export const TITLE_SELECT = `
  SELECT t.*, cat.name AS category_name, cat.slug AS category_slug,
         sub.name AS subject_name, sub.code AS subject_code,
         (SELECT COUNT(*) FROM copies cp WHERE cp.title_id = t.id AND cp.status NOT IN ('retired','lost','missing')) AS copies_total,
         (SELECT COUNT(*) FROM copies cp WHERE cp.title_id = t.id AND cp.status = 'available') AS copies_available,
         (SELECT COUNT(*) FROM loans l JOIN copies cp ON cp.id = l.copy_id WHERE cp.title_id = t.id AND l.status = 'active') AS copies_out,
         (SELECT COUNT(*) FROM reservations r WHERE r.title_id = t.id AND r.status IN ('waiting','ready')) AS reservations,
         (SELECT COUNT(*) FROM loans l JOIN copies cp ON cp.id = l.copy_id WHERE cp.title_id = t.id) AS loan_count
  FROM titles t
  LEFT JOIN categories cat ON cat.id = t.category_id
  LEFT JOIN subjects sub ON sub.id = t.subject_id
`;
