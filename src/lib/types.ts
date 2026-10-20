export type Role = 'student' | 'teacher' | 'librarian' | 'admin';
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'inactive' | 'graduated' | 'transferred';

export interface User {
  id: number;
  libraryId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: AccountStatus;
  className: string | null;
  programme: string | null;
  department: string | null;
  house: string | null;
  phone: string | null;
  gender: string | null;
  avatarHue: number;
  lastLogin: string | null;
  createdAt: string;
}

export interface Settings {
  siteName: string;
  siteDescription: string;
  schoolName: string;
  schoolShortName: string;
  motto: string;
  logoUrl: string;
  primaryColor: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  openingHours: string;
  libraryRules: string;
  borrowLimitStudent: number;
  borrowLimitTeacher: number;
  loanDaysStudent: number;
  loanDaysTeacher: number;
  renewalLimit: number;
  renewalDays: number;
  graceDays: number;
  reservationHoldDays: number;
  maxReservations: number;
  finesEnabled: boolean;
  overdueRatePerDay: number;
  maxFine: number;
  fineBlockThreshold: number;
  defaultReplacementCost: number;
  currency: string;
  allowStudentRenewals: boolean;
  allowStudentReservations: boolean;
  emailNotificationsEnabled: boolean;
  dueSoonReminderDays: number;
  maxLoginSessions: number;
}

export interface Period {
  year: string | null;
  term: string | null;
  termStart: string | null;
  termEnd: string | null;
}

export interface MeResponse {
  user: User | null;
  settings: Settings;
  period?: Period;
  unreadNotifications?: number;
  balance?: number;
  permissions: { manageLibrary: boolean; administer: boolean };
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder?: number;
  titleCount: number;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  titleCount: number;
}

export interface Title {
  id: number;
  title: string;
  subtitle: string | null;
  author: string;
  isbn: string | null;
  publisher: string | null;
  publishedYear: number | null;
  edition: string | null;
  language: string;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  subjectId: number | null;
  subjectName: string | null;
  subjectCode: string | null;
  programme: string | null;
  classLevel: string | null;
  pages: number | null;
  coverColor: string;
  coverStyle: number;
  coverUrl: string | null;
  featured: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  copiesTotal: number;
  copiesAvailable: number;
  copiesOut: number;
  reservations: number;
  loanCount: number;
}

export interface BookDetail extends Title {
  copies: Array<{
    id: number; barcode: string; accessionNo: string; shelf: string | null; rack: string | null;
    section: string | null; condition: string; status: string; acquisition: string; acquiredOn: string | null;
  }>;
  similar: Title[];
  saved: { status: string; progress: number } | null;
  reservation: { id: number; status: string; createdAt: string; readyAt: string | null; expiresAt: string | null } | null;
  myLoan: { id: number; dueDate: string } | null;
}

export interface Copy {
  id: number;
  titleId: number;
  barcode: string;
  accessionNo: string;
  shelf: string | null;
  rack: string | null;
  section: string | null;
  condition: string;
  status: string;
  acquisition: string;
  acquiredOn: string | null;
  cost: number | null;
  donor: string | null;
  supplier: string | null;
  notes: string | null;
  title: string | null;
  author: string | null;
  coverColor: string | null;
  categoryName: string | null;
  activeLoanId: number | null;
  borrowerName: string | null;
  borrowerLibraryId: string | null;
  dueDate: string | null;
}

export interface Loan {
  id: number;
  copyId: number;
  barcode: string;
  accessionNo: string;
  titleId: number;
  title: string;
  author: string;
  coverColor: string;
  userId: number;
  borrowerName: string;
  borrowerLibraryId: string;
  borrowerRole: Role;
  className: string | null;
  issuedBy: string | null;
  issueDate: string;
  dueDate: string;
  returnDate: string | null;
  returnedBy: string | null;
  renewalCount: number;
  status: 'active' | 'returned' | 'lost';
  notes: string | null;
  createdAt: string;
  overdueDays: number;
  fine: number;
}

export interface Reservation {
  id: number;
  titleId: number;
  title: string;
  author: string;
  coverColor: string;
  userId: number;
  userName: string;
  libraryId?: string;
  className: string | null;
  status: 'waiting' | 'ready' | 'fulfilled' | 'cancelled' | 'expired';
  position: number;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  copiesAvailable?: number;
}

export interface Resource {
  id: number;
  title: string;
  description: string | null;
  kind: 'ebook' | 'wassce' | 'notes' | 'handout' | 'syllabus';
  subjectId: number | null;
  subjectName: string | null;
  subjectCode: string | null;
  examYear: number | null;
  paper: string | null;
  level: string | null;
  author: string | null;
  publisher: string | null;
  publishedYear: number | null;
  language: string;
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
  hasFile: boolean;
  coverColor: string;
  allowDownload: boolean;
  access: 'all' | 'students' | 'teachers';
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  submittedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewNotes?: string | null;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export interface ResourceDetail extends Resource {
  canOpen: boolean;
  related: Resource[];
}

export interface Charge {
  id: number;
  userId: number;
  userName: string;
  libraryId: string;
  className: string | null;
  loanId: number | null;
  type: 'overdue' | 'lost' | 'damage' | 'replacement' | 'other';
  amount: number;
  paidAmount: number;
  waivedAmount: number;
  outstanding: number;
  description: string;
  status: 'outstanding' | 'partial' | 'paid' | 'waived';
  createdAt: string;
  settledAt: string | null;
}

export interface Payment {
  id: number;
  chargeId: number;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  description: string;
  type: string;
}

export interface ChargeResponse {
  charges: Charge[];
  payments: Payment[];
  balance: number;
}

export interface Member extends User {
  activeLoans: number;
  totalLoans: number;
  balance: number;
}

export interface LibraryVisit {
  id: number;
  userId: number | null;
  fullName: string;
  libraryId: string | null;
  email: string | null;
  className: string | null;
  house: string | null;
  itemBrought: string | null;
  bookTaken: string | null;
  copyId: number | null;
  titleId: number | null;
  barcode: string | null;
  purpose: string | null;
  notes: string | null;
  signedInBy: number | null;
  signedInByName: string | null;
  signedInAt: string;
  signedOutAt: string | null;
  isInside: boolean;
  minutesInside: number;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: 'all' | 'students' | 'teachers' | 'staff';
  pinned: boolean;
  status: 'draft' | 'published' | 'archived';
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  author: string | null;
}

export interface BookRequest {
  id: number;
  userId: number;
  userName: string;
  libraryId: string;
  className: string | null;
  title: string;
  author: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'acquired';
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Acquisition {
  id: number;
  titleId: number | null;
  bookTitle: string | null;
  type: 'purchase' | 'donation';
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier: string | null;
  donor: string | null;
  invoiceRef: string | null;
  acquiredOn: string;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ReadingList {
  id: number;
  title: string;
  description: string | null;
  subjectId: number | null;
  subjectName: string | null;
  classLevel: string | null;
  isPublished: boolean;
  ownerName: string;
  ownerId: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingListDetail {
  list: Omit<ReadingList, 'itemCount'>;
  items: Array<Title & { itemId: number; note: string | null }>;
}

export interface StaffDashboard {
  totals: {
    titles: number; totalCopies: number; available: number; borrowed: number; held: number;
    lost: number; damaged: number; missing: number; activeLoans: number; overdue: number; dueSoon: number;
    waiting: number; ready: number; students: number; teachers: number; outstanding: number;
    collected: number; loansThisMonth: number; loansLastMonth: number; utilisation: number;
  };
  monthly: Array<{ month: string; issued: number; returned: number }>;
  popular: Array<{ id: number; title: string; author: string; cover_color: string; loans: number }>;
  popularSubjects: Array<{ name: string; loans: number }>;
  recent: Loan[];
  overdueLoans: Loan[];
  alerts: { poorCondition: number; noCopies: number; longOverdue: number; pendingRequests: number; pendingResources: number };
  visits: { inside: number; today: number; booksTakenToday: number };
  settings: { currency: string; finesEnabled: boolean; graceDays: number; borrowLimitStudent: number; loanDaysStudent: number };
  period: Period;
  announcements: Announcement[];
}

export interface StudentDashboard {
  activeLoans: Loan[];
  dueSoon: Loan[];
  overdue: Loan[];
  reservations: Reservation[];
  history: Loan[];
  saved: Array<Title & { savedStatus: string; progress: number; updated_at: string }>;
  balance: number;
  totalBorrowed: number;
  booksRead: number;
  period: Period;
  settings: Settings & Record<string, unknown>;
  challenge: { target: number; completed: number; label: string; percent: number };
  recommendations: Title[];
  announcements: Announcement[];
  notifications: AppNotification[];
  unreadNotifications: number;
}

export interface ReportColumn { key: string; label: string; type?: 'money' | 'number' | 'date' }
export interface ReportData {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Array<{ label: string; value: string | number; hint?: string }>;
  note?: string;
  generatedAt?: string;
  filters?: Record<string, string>;
}

export interface QuickBook {
  id: number;
  title: string;
  author: string;
  coverColor: string;
  available: number;
  categoryName?: string | null;
}

export interface QuickSearchResult {
  books: QuickBook[];
  resources: Array<Pick<Resource, 'id' | 'title' | 'kind'>>;
}


/** A book uploaded by library staff to be read online. */
export interface Book {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  category: string | null;
  language: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  coverColor: string | null;
  fileSize: number | null;
  fileName: string | null;
  allowDownload: boolean;
  status: 'approved' | 'archived' | 'pending' | 'rejected';
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookListResponse {
  rows: Book[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  summary: { total: number; categories: Array<{ name: string; count: number }> };
}
