import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { all, execRaw, get, initDb, nextLibraryId, nowIso, run, scalar, tx, RESOURCE_DIR, BACKUP_DIR } from '../db.js';
import { hashPassword } from '../auth.js';
import { clearSettingsCache, DEFAULT_SETTINGS } from '../settings.js';
import { makePdf, wasscePaper } from './pdf.js';
import { pruneToDemoAccounts } from './prune.js';

// Deterministic PRNG so every fresh install looks the same.
let seedState = 20261020;
function rng() {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)];
const between = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const isoDays = (days: number, hour = 10, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
};
const dateOnly = (iso: string) => iso.slice(0, 10);

const CATEGORIES = [
  { name: 'African Literature', icon: 'BookOpen', description: 'Novels, plays and poetry by African writers.' },
  { name: 'Fiction', icon: 'Library', description: 'Novels and short stories from around the world.' },
  { name: 'Science', icon: 'FlaskConical', description: 'Biology, chemistry, physics and general science.' },
  { name: 'Mathematics', icon: 'Calculator', description: 'Core and elective mathematics texts and revision aids.' },
  { name: 'Languages', icon: 'Languages', description: 'English, French, dictionaries and grammar references.' },
  { name: 'Social Sciences', icon: 'Globe2', description: 'History, geography, government, economics and social studies.' },
  { name: 'Business', icon: 'Briefcase', description: 'Business management, accounting and cost accounting.' },
  { name: 'ICT & Computing', icon: 'Laptop', description: 'Information technology and computer science.' },
  { name: 'Reference', icon: 'BookMarked', description: 'Dictionaries, encyclopaedias and almanacs.' },
  { name: 'Religion', icon: 'Church', description: 'Christian religious studies and comparative religion.' },
  { name: 'Arts & Music', icon: 'Palette', description: 'Music, visual arts and creative practice.' },
  { name: 'Health & Wellbeing', icon: 'HeartPulse', description: 'Physical education, health and personal development.' },
  { name: 'Careers & Life Skills', icon: 'Compass', description: 'Career guidance, study skills and life skills.' },
  { name: 'Children & Young Readers', icon: 'Baby', description: 'Illustrated stories and readers for younger students.' },
];

const SUBJECTS: [string, string][] = [
  ['English Language', 'ENG'], ['Core Mathematics', 'MTH'], ['Integrated Science', 'SCI'], ['Social Studies', 'SOC'],
  ['Physics', 'PHY'], ['Chemistry', 'CHE'], ['Biology', 'BIO'], ['Elective Mathematics', 'EMAT'],
  ['Economics', 'ECO'], ['Geography', 'GEO'], ['History', 'HIS'], ['Government', 'GOV'],
  ['Literature in English', 'LIT'], ['French', 'FRE'], ['Information Technology', 'ICT'],
  ['Christian Religious Studies', 'CRS'], ['Business Management', 'BME'], ['Financial Accounting', 'ACC'],
  ['Cost Accounting', 'COST'], ['Technical Drawing', 'TDR'], ['Food & Nutrition', 'FNU'],
  ['Clothing & Textiles', 'CTA'], ['General Agriculture', 'AGR'], ['Music', 'MUS'],
  ['Visual Arts', 'VPA'], ['Ghanaian Language', 'GHL'], ['Physical Education', 'PEH'], ['Life Skills', 'LSK'],
];

type BookSeed = {
  title: string; author: string; category: string; subject: string; year: number; publisher: string;
  description: string; edition?: string; featured?: boolean; classLevel?: string; programme?: string;
  copies?: number; archived?: boolean; color?: string;
};

const BOOKS: BookSeed[] = [
  { title: 'Things Fall Apart', author: 'Chinua Achebe', category: 'African Literature', subject: 'LIT', year: 1958, publisher: 'Heinemann', description: 'The classic tragedy of Okonkwo and the arrival of colonial rule in Igbo society — a set text for Literature in English.', featured: true, copies: 8, color: '#7A3B2E' },
  { title: 'Arrow of God', author: 'Chinua Achebe', category: 'African Literature', subject: 'LIT', year: 1964, publisher: 'Heinemann', description: 'Ezeulu, chief priest of Ulu, confronts the encroaching British administration and the tensions within his own community.' },
  { title: 'The Beautyful Ones Are Not Yet Born', author: 'Ayi Kwei Armah', category: 'African Literature', subject: 'LIT', year: 1968, publisher: 'Heinemann', description: 'A searing Ghanaian novel about integrity and corruption in the years after independence.' },
  { title: 'The Healers', author: 'Ayi Kwei Armah', category: 'African Literature', subject: 'LIT', year: 1978, publisher: 'Longman', description: 'A historical novel set in nineteenth-century Asante, exploring the fall of the Asante empire.' },
  { title: 'Ake: The Years of Childhood', author: 'Wole Soyinka', category: 'African Literature', subject: 'LIT', year: 1981, publisher: 'Rex Collings', description: 'Nobel laureate Wole Soyinka’s vivid memoir of growing up in Abeokuta.' },
  { title: 'Death and the King\u2019s Horseman', author: 'Wole Soyinka', category: 'African Literature', subject: 'LIT', year: 1975, publisher: 'Methuen', description: 'A powerful play about duty, colonial interference and the clash of cultures.' },
  { title: 'Purple Hibiscus', author: 'Chimamanda Ngozi Adichie', category: 'African Literature', subject: 'LIT', year: 2003, publisher: 'Fourth Estate', description: 'Kambili navigates faith, family and freedom in modern Nigeria.', featured: true, copies: 6, color: '#6B3A5E' },
  { title: 'Half of a Yellow Sun', author: 'Chimamanda Ngozi Adichie', category: 'African Literature', subject: 'LIT', year: 2006, publisher: 'Knopf', description: 'Three lives are bound together by the Biafran war.', copies: 4 },
  { title: 'So Long a Letter', author: 'Mariama Bâ', category: 'African Literature', subject: 'LIT', year: 1979, publisher: 'Nouvelles Éditions Africaines', description: 'Ramatoulaye’s letter to a friend is a landmark of West African feminist literature.' },
  { title: 'The Joys of Motherhood', author: 'Buchi Emecheta', category: 'African Literature', subject: 'LIT', year: 1979, publisher: 'Allison & Busby', description: 'Nnu Ego’s life story examines motherhood, tradition and the city.' },
  { title: 'Efuru', author: 'Flora Nwapa', category: 'African Literature', subject: 'LIT', year: 1966, publisher: 'Heinemann', description: 'The first novel by a Nigerian woman to be published in English.' },
  { title: 'This Earth, My Brother', author: 'Kofi Awoonor', category: 'African Literature', subject: 'LIT', year: 1971, publisher: 'Doubleday', description: 'A poetic Ghanaian novel of loss, memory and national identity.' },
  { title: 'The Gab Boys', author: 'Cameron Duodu', category: 'African Literature', subject: 'LIT', year: 1967, publisher: 'André Deutsch', description: 'A witty Ghanaian coming-of-age novel set in Accra.', copies: 4 },
  { title: 'A Woman in Her Prime', author: 'S. A. Konadu', category: 'African Literature', subject: 'LIT', year: 1967, publisher: 'Heinemann', description: 'A Ghanaian novel about tradition and change in a rural community.' },

  { title: 'Animal Farm', author: 'George Orwell', category: 'Fiction', subject: 'ENG', year: 1945, publisher: 'Secker & Warburg', description: 'A satirical fable about power, revolution and the corruption of ideals.', featured: true, copies: 9, color: '#4A5A3C' },
  { title: 'Nineteen Eighty-Four', author: 'George Orwell', category: 'Fiction', subject: 'ENG', year: 1949, publisher: 'Secker & Warburg', description: 'Winston Smith rebels against a totalitarian state where truth itself is controlled.', copies: 5 },
  { title: 'The Old Man and the Sea', author: 'Ernest Hemingway', category: 'Fiction', subject: 'ENG', year: 1952, publisher: 'Charles Scribner’s Sons', description: 'Santiago’s solitary struggle with a giant marlin — a study in endurance and dignity.' },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee', category: 'Fiction', subject: 'ENG', year: 1960, publisher: 'J. B. Lippincott', description: 'Scout Finch’s childhood in Alabama and her father’s defence of an innocent man.', copies: 6 },
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Fiction', subject: 'ENG', year: 1925, publisher: 'Charles Scribner’s Sons', description: 'Jay Gatsby’s pursuit of the American Dream on Long Island.' },
  { title: 'Lord of the Flies', author: 'William Golding', category: 'Fiction', subject: 'ENG', year: 1954, publisher: 'Faber & Faber', description: 'Schoolboys stranded on an island descend into savagery.', copies: 7 },
  { title: 'Jane Eyre', author: 'Charlotte Brontë', category: 'Fiction', subject: 'ENG', year: 1847, publisher: 'Smith, Elder & Co.', description: 'A governess asserts her independence in Victorian England.' },
  { title: 'Pride and Prejudice', author: 'Jane Austen', category: 'Fiction', subject: 'ENG', year: 1813, publisher: 'T. Egerton', description: 'Elizabeth Bennet and Mr Darcy — a comedy of manners and misunderstanding.' },
  { title: 'The Kite Runner', author: 'Khaled Hosseini', category: 'Fiction', subject: 'ENG', year: 2003, publisher: 'Riverhead Books', description: 'Amir returns to Afghanistan to atone for a childhood betrayal.', copies: 1 },
  { title: 'Life of Pi', author: 'Yann Martel', category: 'Fiction', subject: 'ENG', year: 2001, publisher: 'Knopf Canada', description: 'Pi Patel survives 227 days adrift with a Bengal tiger.' },
  { title: 'The Book Thief', author: 'Markus Zusak', category: 'Fiction', subject: 'ENG', year: 2005, publisher: 'Picador', description: 'A young girl in Nazi Germany finds refuge in stolen books.' },
  { title: 'Petals of Blood', author: 'Ngũgĩ wa Thiong’o', category: 'Fiction', subject: 'LIT', year: 1977, publisher: 'Heinemann', description: 'Four lives intersect in post-independence Kenya.' },
  { title: 'Weep Not, Child', author: 'Ngũgĩ wa Thiong’o', category: 'Fiction', subject: 'LIT', year: 1964, publisher: 'Heinemann', description: 'A boy’s dream of education during the Mau Mau emergency.' },
  { title: 'Mine Boy', author: 'Peter Abrahams', category: 'Fiction', subject: 'LIT', year: 1946, publisher: 'Crisp', description: 'A young man from the countryside arrives in Johannesburg’s mines.' },

  { title: 'Core Science for Senior High Schools', author: 'K. Mensah & A. Owusu', category: 'Science', subject: 'SCI', year: 2019, publisher: 'Tema Educational Press', description: 'A complete core science course aligned with the Ghanaian SHS curriculum, with practical activities and WASSCE-style questions.', copies: 10, featured: true, color: '#1F4A35' },
  { title: 'Biology: A Modern Approach', author: 'D. K. Acquah', category: 'Science', subject: 'BIO', year: 2018, publisher: 'Afram Publications', description: 'Comprehensive biology for SHS elective students, with diagrams and revision exercises.', copies: 7 },
  { title: 'Chemistry in Focus for SHS', author: 'N. Adjei', category: 'Science', subject: 'CHE', year: 2020, publisher: 'Sedco Publishing', description: 'Theory and practical chemistry written for West African senior high schools.', copies: 6 },
  { title: 'Physics for Senior High Schools', author: 'J. K. Amoako', category: 'Science', subject: 'PHY', year: 2019, publisher: 'Aki-Ola Publications', description: 'Mechanics, waves, electricity and modern physics with worked examples.', copies: 6 },
  { title: 'Campbell Biology', author: 'Lisa A. Urry, Michael L. Cain et al.', category: 'Science', subject: 'BIO', year: 2020, publisher: 'Pearson', edition: '12th', description: 'The standard university-level biology reference for advanced students and teachers.', featured: true, copies: 3, color: '#245C4A' },
  { title: 'Conceptual Physics', author: 'Paul G. Hewitt', category: 'Science', subject: 'PHY', year: 2014, publisher: 'Pearson', edition: '12th', description: 'Physics explained through ideas rather than mathematics — an excellent bridge text.', copies: 3 },
  { title: 'A Brief History of Time', author: 'Stephen Hawking', category: 'Science', subject: 'PHY', year: 1988, publisher: 'Bantam Books', description: 'Black holes, the Big Bang and the nature of time, written for the general reader.' },
  { title: 'Silent Spring', author: 'Rachel Carson', category: 'Science', subject: 'BIO', year: 1962, publisher: 'Houghton Mifflin', description: 'The landmark book that launched the modern environmental movement.' },
  { title: 'The Selfish Gene', author: 'Richard Dawkins', category: 'Science', subject: 'BIO', year: 1976, publisher: 'Oxford University Press', description: 'A gene-centred view of evolution and natural selection.' },
  { title: 'Practical Chemistry for West African Schools', author: 'A. B. Osei', category: 'Science', subject: 'CHE', year: 2017, publisher: 'Sam-Woode', description: 'Laboratory skills, qualitative analysis and practical examination technique.', copies: 5 },

  { title: 'Core Mathematics for SHS', author: 'K. Y. Appiah', category: 'Mathematics', subject: 'MTH', year: 2021, publisher: 'Tema Educational Press', description: 'Number, algebra, geometry, trigonometry, statistics and probability for the core mathematics curriculum.', featured: true, copies: 12, color: '#8C5A1C' },
  { title: 'Elective Mathematics for SHS', author: 'K. Osei-Bonsu', category: 'Mathematics', subject: 'EMAT', year: 2020, publisher: 'Aki-Ola Publications', description: 'Extended mathematics for science and business students, with past-question practice.', copies: 7 },
  { title: 'Pure Mathematics 1', author: 'L. Bostock & S. Chandler', category: 'Mathematics', subject: 'EMAT', year: 1978, publisher: 'Stanley Thornes', description: 'A rigorous introduction to algebra, calculus and vectors.', copies: 3 },
  { title: 'Calculus Made Easy', author: 'Silvanus P. Thompson', category: 'Mathematics', subject: 'EMAT', year: 1910, publisher: 'Macmillan', description: 'A famously clear and friendly introduction to differential and integral calculus.' },
  { title: 'How to Solve It', author: 'George Pólya', category: 'Mathematics', subject: 'MTH', year: 1945, publisher: 'Princeton University Press', description: 'A classic guide to mathematical problem-solving method.' },
  { title: 'A Mathematician’s Apology', author: 'G. H. Hardy', category: 'Mathematics', subject: 'EMAT', year: 1940, publisher: 'Cambridge University Press', description: 'Hardy’s celebrated essay on the beauty and value of mathematics.' },

  { title: 'Oxford Advanced Learner’s Dictionary', author: 'Oxford University Press', category: 'Languages', subject: 'ENG', year: 2020, publisher: 'Oxford University Press', edition: '10th', description: 'The definitive learner’s dictionary for senior high school students.', copies: 5 },
  { title: 'Longman Dictionary of Contemporary English', author: 'Pearson Education', category: 'Languages', subject: 'ENG', year: 2014, publisher: 'Pearson', edition: '6th', description: 'Clear definitions and examples for learners of English.', copies: 4 },
  { title: 'English Grammar in Use', author: 'Raymond Murphy', category: 'Languages', subject: 'ENG', year: 2019, publisher: 'Cambridge University Press', edition: '5th', description: 'Self-study grammar reference and practice for intermediate learners.', copies: 6 },
  { title: 'The Elements of Style', author: 'William Strunk Jr. & E. B. White', category: 'Languages', subject: 'ENG', year: 1959, publisher: 'Macmillan', description: 'A concise guide to clear, effective writing.' },
  { title: 'High School English Grammar & Composition', author: 'Wren & Martin', category: 'Languages', subject: 'ENG', year: 2005, publisher: 'S. Chand', description: 'Grammar rules, composition and comprehension exercises.' },
  { title: 'French for Senior High Schools', author: 'A. Kouassi', category: 'Languages', subject: 'FRE', year: 2018, publisher: 'Afram Publications', description: 'A structured French course for SHS learners with listening and speaking practice.', copies: 4 },

  { title: 'A History of Ghana', author: 'F. K. Buah', category: 'Social Sciences', subject: 'HIS', year: 1998, publisher: 'Macmillan', description: 'The standard survey of Ghanaian history from early states to the Fourth Republic.', featured: true, copies: 8, color: '#5B4636' },
  { title: 'Government for Senior High Schools', author: 'J. Amankwah', category: 'Social Sciences', subject: 'GOV', year: 2019, publisher: 'Aki-Ola Publications', description: 'Constitutional government, political theory and Ghanaian institutions.', copies: 6 },
  { title: 'Economics for Senior High Schools', author: 'E. Owusu-Ansah', category: 'Social Sciences', subject: 'ECO', year: 2020, publisher: 'Sedco Publishing', description: 'Micro and macroeconomics with West African case studies.', copies: 6 },
  { title: 'Geography for Senior High Schools', author: 'M. Adjei', category: 'Social Sciences', subject: 'GEO', year: 2018, publisher: 'Aki-Ola Publications', description: 'Physical, human and regional geography with map work practice.', copies: 5 },
  { title: 'Social Studies for Senior High Schools', author: 'R. Osei', category: 'Social Sciences', subject: 'SOC', year: 2021, publisher: 'Tema Educational Press', description: 'Citizenship, culture, governance and development for the core social studies curriculum.', copies: 8 },

  { title: 'Business Management for SHS', author: 'A. Boateng', category: 'Business', subject: 'BME', year: 2019, publisher: 'Aki-Ola Publications', description: 'Management principles, business ownership and entrepreneurship.', copies: 5 },
  { title: 'Financial Accounting for SHS', author: 'K. Asare', category: 'Business', subject: 'ACC', year: 2020, publisher: 'Sedco Publishing', description: 'Double-entry bookkeeping, final accounts and partnership accounting.', copies: 6 },
  { title: 'Cost Accounting for SHS', author: 'Y. Mensah', category: 'Business', subject: 'COST', year: 2018, publisher: 'Aki-Ola Publications', description: 'Costing methods, budgeting and decision-making for business students.', copies: 4 },

  { title: 'Information Technology for SHS', author: 'K. Amoah', category: 'ICT & Computing', subject: 'ICT', year: 2021, publisher: 'Aki-Ola Publications', description: 'Computer hardware, software, networks and practical ICT skills.', copies: 7 },
  { title: 'Python Crash Course', author: 'Eric Matthes', category: 'ICT & Computing', subject: 'ICT', year: 2023, publisher: 'No Starch Press', edition: '3rd', description: 'A hands-on introduction to programming with Python projects.', copies: 1 },
  { title: 'Computer Science Illuminated', author: 'Nell Dale & John Lewis', category: 'ICT & Computing', subject: 'ICT', year: 2019, publisher: 'Jones & Bartlett', edition: '7th', description: 'A broad introduction to computer science, from binary to algorithms.', copies: 2 },

  { title: 'Oxford School Dictionary & Thesaurus', author: 'Oxford University Press', category: 'Reference', subject: 'ENG', year: 2018, publisher: 'Oxford University Press', description: 'Two reference works in one volume, designed for secondary students.', copies: 4 },
  { title: 'Guinness World Records 2025', author: 'Guinness World Records', category: 'Reference', subject: 'ENG', year: 2024, publisher: 'Guinness World Records', description: 'The latest edition of the record-breaking annual.', copies: 2 },

  { title: 'Introduction to African Religion', author: 'John S. Mbiti', category: 'Religion', subject: 'CRS', year: 1975, publisher: 'Heinemann', description: 'A foundational study of traditional African religious thought and practice.', copies: 3 },
  { title: 'The Holy Bible (Revised Standard Version)', author: 'Bible Society of Ghana', category: 'Religion', subject: 'CRS', year: 2010, publisher: 'Bible Society of Ghana', description: 'A reference copy of the RSV Bible for religious studies.', copies: 3 },
  { title: 'The Qur’an: English Translation', author: 'Abdullah Yusuf Ali (trans.)', category: 'Religion', subject: 'CRS', year: 2004, publisher: 'Wordsworth Editions', description: 'An accessible English translation with commentary.' },

  { title: 'Studies in African Music', author: 'J. H. Kwabena Nketia', category: 'Arts & Music', subject: 'MUS', year: 1958, publisher: 'Oxford University Press', description: 'The landmark study of rhythm and structure in African music by a Ghanaian scholar.', copies: 1 },
  { title: 'The Art of Ghana: A Visual History', author: 'A. Addo', category: 'Arts & Music', subject: 'VPA', year: 2016, publisher: 'Sub-Saharan Publishers', description: 'Adinkra, kente, sculpture and contemporary Ghanaian art in one illustrated volume.', copies: 2 },

  { title: 'Health and Physical Education for SHS', author: 'G. Ofori', category: 'Health & Wellbeing', subject: 'PEH', year: 2019, publisher: 'Afram Publications', description: 'Health education, first aid, nutrition and physical activity for senior high schools.', copies: 5 },
  { title: 'The 7 Habits of Highly Effective Teens', author: 'Sean Covey', category: 'Careers & Life Skills', subject: 'LSK', year: 1998, publisher: 'Fireside', description: 'Practical habits for study, relationships and personal responsibility.', copies: 1 },
  { title: 'Careers and Life Skills for Ghanaian Youth', author: 'B. Amankwah', category: 'Careers & Life Skills', subject: 'LSK', year: 2021, publisher: 'Tema Educational Press', description: 'Career pathways, CV writing, interview skills and financial literacy.', copies: 4 },
  { title: 'Mansa Musa: The Golden King of Mali', author: 'K. Diarra', category: 'Children & Young Readers', subject: 'HIS', year: 2015, publisher: 'Africa World Press', description: 'An illustrated introduction to the wealth and scholarship of medieval Mali.', copies: 3 },
  { title: 'The Moon over Tema', author: 'E. Adjei', category: 'Children & Young Readers', subject: 'ENG', year: 2018, publisher: 'Sub-Saharan Publishers', description: 'A gentle illustrated story set in the harbour city of Tema.', copies: 2 },
  { title: 'Government for Senior High Schools (2008 edition)', author: 'J. Amankwah', category: 'Social Sciences', subject: 'GOV', year: 2008, publisher: 'Aki-Ola Publications', description: 'Previous edition retained for reference. Replaced by the 2019 edition.', archived: true, copies: 2 },
  { title: 'The World Book Encyclopedia (2010)', author: 'World Book Inc.', category: 'Reference', subject: 'ENG', year: 2010, publisher: 'World Book', description: 'Older print encyclopaedia retained for reference only. Archived in favour of digital reference.', archived: true, copies: 1 },
];

const FIRST_M = ['Kwame', 'Kofi', 'Yaw', 'Kojo', 'Kwabena', 'Kwaku', 'Nana', 'Fiifi', 'Ebo', 'Kobina', 'Samuel', 'Daniel', 'Emmanuel', 'Prince', 'Michael', 'Isaac', 'Joseph', 'Bright', 'Elikem', 'Selorm', 'Henry', 'Godwin'];
const FIRST_F = ['Ama', 'Akosua', 'Abena', 'Akua', 'Yaa', 'Afia', 'Esi', 'Efua', 'Adwoa', 'Naa', 'Gifty', 'Priscilla', 'Comfort', 'Grace', 'Mary', 'Abigail', 'Serwaa', 'Esinam', 'Dzifa', 'Nana Ama', 'Vida', 'Gloria'];
const LAST = ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Appiah', 'Amoah', 'Adjei', 'Agyeman', 'Frimpong', 'Danso', 'Antwi', 'Nyarko', 'Ofori', 'Tetteh', 'Quaye', 'Annan', 'Baidoo', 'Darko', 'Sarpong', 'Bonsu', 'Amankwah'];
const CLASSES = ['Form 1 Science A', 'Form 1 Arts A', 'Form 1 Business A', 'Form 2 Science A', 'Form 2 Arts A', 'Form 2 Business A', 'Form 3 Science A', 'Form 3 Arts A', 'Form 3 Business A'];
const PROGRAMMES: Record<string, string> = { Science: 'General Science', Arts: 'General Arts', Business: 'Business' };
const HOUSES = ['House 1', 'House 2', 'House 3', 'House 4', 'House 5'];

function classProgramme(className: string) {
  const form = className.match(/^Form \d/)?.[0] ?? 'Form 1';
  void form;
  const programme = className.includes('Science') ? 'General Science' : className.includes('Arts') ? 'General Arts' : 'Business';
  return programme;
}


async function wipe() {
  const tables = [
    'notification_deliveries', 'notifications', 'resource_favorites', 'resource_events', 'saved_books',
    'reading_list_items', 'reading_lists', 'stocktake_scans', 'stocktakes', 'payments', 'charges',
    'loan_events', 'reservations', 'loans', 'acquisitions', 'book_requests', 'announcements',
    'library_visits', 'contact_messages', 'audit_logs', 'password_resets', 'resources', 'copies', 'titles', 'users',
    'categories', 'subjects', 'terms', 'academic_years', 'settings', 'id_sequences',
  ];
  // Children first, so foreign keys stay satisfied without disabling them.
  for (const table of tables) await execRaw(`DELETE FROM ${table}`);
  try {
    await execRaw('DELETE FROM sqlite_sequence');
  } catch {
    /* sqlite_sequence only exists once an AUTOINCREMENT row has been written */
  }
}

async function seedAcademicYears() {
  const current = new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const years = [
    { name: `${current - 1}/${current}`, start: `${current - 1}-09-09`, end: `${current}-07-25`, current: false },
    { name: `${current}/${current + 1}`, start: `${current}-09-09`, end: `${current + 1}-07-24`, current: true },
  ];
  for (const year of years) {
    const r = await run('INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?, ?, ?, ?)',
      [year.name, year.start, year.end, year.current ? 1 : 0]);
    const terms = [
      { name: 'First Term', start: `${year.start.slice(0, 4)}-09-09`, end: `${year.start.slice(0, 4)}-12-18`, current: year.current },
      { name: 'Second Term', start: `${Number(year.start.slice(0, 4)) + 1}-01-12`, end: `${Number(year.start.slice(0, 4)) + 1}-04-02`, current: false },
      { name: 'Third Term', start: `${Number(year.start.slice(0, 4)) + 1}-04-27`, end: `${Number(year.start.slice(0, 4)) + 1}-07-24`, current: false },
    ];
    for (const term of terms) {
      await run('INSERT INTO terms (academic_year_id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?)',
        [r.lastInsertRowid, term.name, term.start, term.end, term.current ? 1 : 0]);
    }
  }
}

type SeedUser = { id: number; schoolId: string; libraryId: string; firstName: string; lastName: string; role: string; className: string | null; email: string; status: string; house?: string | null };

async function addUser(opts: {
  schoolId: string; email: string; firstName: string; lastName: string; role: string;
  passwordHash: string; status?: string; className?: string | null; programme?: string | null;
  department?: string | null; phone?: string; gender?: string; house?: string | null;
}): Promise<SeedUser> {
  const stamp = nowIso();
  // Demo accounts are library members too: issue a library number at creation.
  const libraryId = await nextLibraryId(new Date(stamp));
  const r = await run(
    `INSERT INTO users (school_id, library_id, email, password_hash, first_name, last_name, role, status, class_name,
      programme, department, phone, gender, house, avatar_hue, last_login, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [opts.schoolId, libraryId, opts.email.toLowerCase(), opts.passwordHash, opts.firstName, opts.lastName, opts.role,
      opts.status ?? 'active', opts.className ?? null, opts.programme ?? null, opts.department ?? null,
      opts.phone ?? `+233 24 ${between(100, 999)} ${between(1000, 9999)}`, opts.gender ?? null,
      opts.house ?? null, between(0, 359), isoDays(between(0, 25)), stamp, stamp]
  );
  return {
    id: r.lastInsertRowid, schoolId: opts.schoolId, libraryId, firstName: opts.firstName, lastName: opts.lastName,
    role: opts.role, className: opts.className ?? null, email: opts.email, status: opts.status ?? 'active',
    house: opts.house ?? null,
  };
}

export async function seed(options: { force?: boolean } = {}) {
  await initDb();
  const existing = await scalar<number>('SELECT COUNT(*) FROM users');
  if (existing > 0 && !options.force) return { seeded: false, users: existing };
  if (options.force) await wipe();
  clearSettingsCache();

  seedState = 20261020;
  const stamp = nowIso();
  const pub = {
    admin: hashPassword('Admin@123'),
    librarian: hashPassword('Library@123'),
    teacher: hashPassword('Teacher@123'),
    student: hashPassword('Student@123'),
    common: hashPassword('Library@123'),
  };

  await tx(async () => {
    await seedAcademicYears();

    // Categories + subjects
    const categoryIds = new Map<string, number>();
for (const [index, category] of CATEGORIES.entries()) {
      const r = await run('INSERT INTO categories (name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        [category.name, category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), category.description, category.icon, index]);
      categoryIds.set(category.name, r.lastInsertRowid);
    }    const subjectIds = new Map<string, number>();
    for (const [name, code] of SUBJECTS) {
      const r = await run('INSERT INTO subjects (name, code, description) VALUES (?, ?, ?)',
        [name, code, `Senior high school ${name.toLowerCase()} collection.`]);
      subjectIds.set(code, r.lastInsertRowid);
    }

    // Titles + copies
    const palette = ['#1F4A35', '#7A3B2E', '#6B3A5E', '#3B4A6B', '#8C5A1C', '#4A5A3C', '#245C4A', '#5B4636', '#3E5C63', '#6E2D21'];
    type CopyState = { id: number; titleId: number; status: string; section: string; condition: string; cost: number };
    const copies: CopyState[] = [];
    const titleIds = new Map<string, number>();
    let barcodeSeq = 100000;
    let accessionSeq = 0;
    let bookIndex = 0;

    for (const book of BOOKS) {
      const categoryId = categoryIds.get(book.category) ?? null;
      const subjectId = subjectIds.get(book.subject) ?? null;
      const colour = book.color ?? palette[bookIndex % palette.length];
      const r = await run(
        `INSERT INTO titles (isbn, title, author, publisher, published_year, edition, language, description,
          category_id, subject_id, programme, class_level, pages, cover_color, cover_style, featured, archived_at,
          created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'English', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`978-9988-${String(10000 + bookIndex)}`, book.title, book.author, book.publisher, book.year,
          book.edition ?? null, book.description, categoryId, subjectId, book.programme ?? null,
          book.classLevel ?? null, between(120, 640), colour, bookIndex % 6, book.featured ? 1 : 0,
          book.archived ? isoDays(between(60, 200)) : null, null, isoDays(280 - bookIndex, 9), isoDays(280 - bookIndex, 9)]
      );
      titleIds.set(book.title, r.lastInsertRowid);
      const count = book.copies ?? between(2, 6);
      for (let i = 0; i < count; i++) {
        barcodeSeq++;
        accessionSeq++;
        const condition = book.archived ? 'fair' : pick(['new', 'good', 'good', 'good', 'fair', 'poor']);
        const c = await run(
          `INSERT INTO copies (title_id, barcode, accession_no, shelf, rack, section, condition, status, acquisition,
            acquired_on, cost, donor, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)`,
          [r.lastInsertRowid, `TSS-${barcodeSeq}`, `ACC-${book.year}-${String(accessionSeq).padStart(4, '0')}`,
            `${book.category.slice(0, 1).toUpperCase()}${between(1, 9)}`, `R${between(1, 4)}`,
            book.category, condition, rng() > 0.78 ? 'donation' : 'purchase',
            isoDays(between(60, 260), 9).slice(0, 10), between(25, 95),
            rng() > 0.8 ? 'Old Students Association' : null, isoDays(280 - bookIndex, 9), isoDays(280 - bookIndex, 9)]
        );
        copies.push({ id: c.lastInsertRowid, titleId: r.lastInsertRowid, status: 'available', section: book.category, condition, cost: 40 });
      }
      bookIndex++;
    }

    const tid = (title: string) => {
      const id = titleIds.get(title);
      if (!id) throw new Error(`Seed data references a missing title: ${title}`);
      return id;
    };

    // Users
    const admin = await addUser({ schoolId: 'ADM-001', email: 'admin@tema.edu.gh', firstName: 'Akosua', lastName: 'Mensah', role: 'admin', passwordHash: pub.admin, department: 'Administration', gender: 'female' });
    const librarian = await addUser({ schoolId: 'LIB-001', email: 'librarian@tema.edu.gh', firstName: 'Efua', lastName: 'Owusu', role: 'librarian', passwordHash: pub.librarian, department: 'Library', gender: 'female' });
    const librarian2 = await addUser({ schoolId: 'LIB-002', email: 'k.asante@tema.edu.gh', firstName: 'Kwame', lastName: 'Asante', role: 'librarian', passwordHash: pub.common, department: 'Library', gender: 'male' });

    const teacherDemo = await addUser({ schoolId: 'TCH-001', email: 'teacher@tema.edu.gh', firstName: 'Daniel', lastName: 'Appiah', role: 'teacher', passwordHash: pub.teacher, department: 'English', gender: 'male' });
    const teacherNames = [
      ['Grace', 'Addo', 'Mathematics'], ['Yaw', 'Frimpong', 'Science'], ['Priscilla', 'Owusu-Ansah', 'Social Studies'],
      ['Michael', 'Amoah', 'ICT'], ['Comfort', 'Tetteh', 'Business'], ['Isaac', 'Osei', 'Languages'],
      ['Naa', 'Quaye', 'Arts'], ['Joseph', 'Baidoo', 'Science'], ['Abigail', 'Annan', 'Careers'],
    ] as [string, string, string][];
    const teachers: SeedUser[] = [teacherDemo];
for (const [index, [first, last, dept]] of teacherNames.entries()) {
      teachers.push(await addUser({
        schoolId: `TCH-${String(index + 2).padStart(3, '0')}`,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@tema.edu.gh`,
        firstName: first, lastName: last, role: 'teacher', passwordHash: pub.common,
        department: dept, gender: index % 2 === 0 ? 'female' : 'male',
        house: HOUSES[index % HOUSES.length],
      }));
    }
    const students: SeedUser[] = [];
    const demoStudent = await addUser({
      schoolId: 'TSS-2024-001', email: 'student@tema.edu.gh', firstName: 'Ama', lastName: 'Boateng',
      role: 'student', passwordHash: pub.student, className: 'Form 2 Science A',
      programme: 'General Science', gender: 'female', house: 'House 1',
    });
    students.push(demoStudent);
    for (let i = 0; i < 44; i++) {
      const female = rng() > 0.5;
      const first = female ? pick(FIRST_F) : pick(FIRST_M);
      const last = pick(LAST);
      const className = CLASSES[i % CLASSES.length];
      const schoolId = `TSS-2026-${String(i + 2).padStart(3, '0')}`;
      const status = i === 9 ? 'suspended' : i === 17 ? 'pending' : i === 27 ? 'graduated' : i === 33 ? 'transferred' : 'active';
      students.push(await addUser({
        schoolId, email: `${first.toLowerCase().replace(/[^a-z]/g, '')}.${last.toLowerCase()}${i + 1}@student.tema.edu.gh`,
        firstName: first, lastName: last, role: 'student', passwordHash: pub.common,
        className, programme: classProgramme(className), status, gender: female ? 'female' : 'male',
        house: HOUSES[i % HOUSES.length],
      }));
    }

    // Historical loans
    const activeCopyIds = new Set<number>();
    const activeCounts = new Map<number, number>();
    const lostCopyIds = new Set<number>();
    const chargedLoans: { loanId: number; userId: number; amount: number; days: number; title: string }[] = [];
    const borrowerPool = [...students.filter((s) => s.status === 'active'), ...teachers];

    const issueLoanSeed = async (opts: {
      copy: CopyState; user: SeedUser; issuedBy: number; issue: string; due: string; returnDate?: string | null;
      status?: string; renewal?: number; lost?: boolean;
    }) => {
      const status = opts.status ?? (opts.lost ? 'lost' : opts.returnDate ? 'returned' : 'active');
      const r = await run(
        `INSERT INTO loans (copy_id, user_id, issued_by, issue_date, due_date, return_date, returned_by, renewal_count, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [opts.copy.id, opts.user.id, opts.issuedBy, opts.issue, opts.due, opts.returnDate ?? null,
          opts.returnDate ? opts.issuedBy : null, opts.renewal ?? 0, status, opts.issue]
      );
      await run(`INSERT INTO loan_events (loan_id, type, actor_id, created_at) VALUES (?, 'issued', ?, ?)`, [r.lastInsertRowid, opts.issuedBy, opts.issue]);
      if (opts.returnDate) {
        await run(`INSERT INTO loan_events (loan_id, type, actor_id, created_at) VALUES (?, 'returned', ?, ?)`, [r.lastInsertRowid, opts.issuedBy, opts.returnDate]);
      }
      if (opts.lost) {
        opts.copy.status = 'lost';
        lostCopyIds.add(opts.copy.id);
      }
      return r.lastInsertRowid;
    };

    for (let i = 0; i < 84; i++) {
      const copy = pick(copies);
      if (copy.status !== 'available' || copy.condition === 'poor' || lostCopyIds.has(copy.id)) continue;
      const user = pick(borrowerPool);
      const issuedDaysAgo = between(18, 260);
      const loanDays = user.role === 'teacher' ? 30 : 14;
      const issue = isoDays(issuedDaysAgo, between(8, 15), between(0, 59));
      const due = new Date(new Date(issue).getTime() + loanDays * 86400000).toISOString();
      const late = rng() > 0.68;
      const returnOffset = late ? loanDays + between(1, 9) : Math.max(1, loanDays - between(2, 8));
      const returnedAt = new Date(new Date(issue).getTime() + returnOffset * 86400000);
      if (returnedAt.getTime() >= Date.now() - 86400000) continue;
      const returnDate = returnedAt.toISOString();
      const loanId = await issueLoanSeed({ copy, user, issuedBy: librarian.id, issue, due, returnDate });
      const overdue = Math.floor((returnedAt.getTime() - new Date(due).getTime()) / 86400000);
      if (late && overdue > 2) {
        const amount = Math.min((overdue - 2) * DEFAULT_SETTINGS.overdueRatePerDay, DEFAULT_SETTINGS.maxFine);
        if (amount > 0) chargedLoans.push({ loanId, userId: user.id, amount, days: overdue, title: 'overdue' });
      }
    }

    // A couple of lost books
    for (let i = 0; i < 2; i++) {
      const copy = copies.find((c) => c.status === 'available' && c.condition !== 'poor');
      if (!copy) break;
      const user = students[between(1, students.length - 1)];
      const issue = isoDays(between(70, 140), 11);
      const due = new Date(new Date(issue).getTime() + 14 * 86400000).toISOString();
      const loanId = await issueLoanSeed({ copy, user, issuedBy: librarian.id, issue, due, returnDate: isoDays(between(20, 50), 14), lost: true });
      copy.status = 'lost';
      await run(`INSERT INTO charges (user_id, loan_id, type, amount, description, status, created_by, created_at)
           VALUES (?, ?, 'lost', 60, 'Replacement cost — lost book', 'outstanding', ?, ?)`,
        [user.id, loanId, librarian.id, isoDays(between(19, 49), 15)]);
    }

    // Active loans for demo users
    const chooseAvailable = (preferredTitle?: string) => {
      const pool = copies.filter((c) => c.status === 'available' && !activeCopyIds.has(c.id) && c.condition !== 'poor');
      if (preferredTitle) {
        const titleId = titleIds.get(preferredTitle);
        const match = pool.find((c) => c.titleId === titleId);
        if (match) return match;
      }
      return pool.length ? pick(pool) : null;
    };
    const issueActive = async (user: SeedUser, dueInDays: number, preferredTitle?: string) => {
      const copy = chooseAvailable(preferredTitle);
      if (!copy) return null;
      activeCopyIds.add(copy.id);
      copy.status = 'borrowed';
      activeCounts.set(user.id, (activeCounts.get(user.id) ?? 0) + 1);
      const issued = isoDays(between(3, 20), between(9, 14));
      const due = new Date(Date.now() + dueInDays * 86400000).toISOString();
      return await issueLoanSeed({ copy, user, issuedBy: librarian.id, issue: issued, due });
    };

    await issueActive(demoStudent, 4, 'Things Fall Apart');
    await issueActive(demoStudent, -3, 'Purple Hibiscus');
    await issueActive(teacherDemo, 12, 'Campbell Biology');
    await issueActive(teacherDemo, 20, 'English Grammar in Use');

    // Recent finished reads for the demo student so the termly reading challenge shows progress.
    for (const [daysAgo, title] of [[18, 'The Old Man and the Sea'], [9, 'Animal Farm']] as Array<[number, string]>) {
      const copy = chooseAvailable(title);
      if (!copy) continue;
      activeCopyIds.add(copy.id);
      activeCounts.set(demoStudent.id, (activeCounts.get(demoStudent.id) ?? 0) + 1);
      await issueLoanSeed({
        copy,
        user: demoStudent,
        issuedBy: librarian.id,
        issue: isoDays(daysAgo + 16, 10),
        due: isoDays(daysAgo + 2, 9),
        returnDate: isoDays(daysAgo, 16),
      });
    }

    const activePlan = [-9, -5, -1, 0, 3, 6, 10, 14, 21, -12, 2, 8, -2, 5, 18, 25];
    let planIndex = 0;
    for (const student of students) {
      if (student.id === demoStudent.id || student.status !== 'active') continue;
      const count = planIndex < activePlan.length ? between(0, 1) : (rng() > 0.75 ? 1 : 0);
      for (let n = 0; n < count; n++) {
        if (await issueActive(student, activePlan[planIndex] ?? between(-10, 20))) planIndex++;
      }
      if (planIndex >= activePlan.length + 4) break;
    }
    for (const teacher of teachers.slice(1)) {
      if (rng() > 0.55) await issueActive(teacher, between(-4, 25));
    }

    // Charges for late historical returns
for (const [index, entry] of chargedLoans.entries()) {
      const status = index % 4 === 0 ? 'paid' : index % 7 === 0 ? 'waived' : index % 3 === 0 ? 'partial' : 'outstanding';
      const paid = status === 'paid' ? entry.amount : status === 'partial' ? Math.round(entry.amount * 0.5 * 100) / 100 : 0;
      const waived = status === 'waived' ? entry.amount : 0;
      const charge = await run(
        `INSERT INTO charges (user_id, loan_id, type, amount, paid_amount, waived_amount, description, status, created_by, created_at, settled_at)
         VALUES (?, ?, 'overdue', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.userId, entry.loanId, entry.amount, paid, waived,
          `${entry.days} days overdue — late return`, status, librarian.id, isoDays(between(10, 60), 15),
          status === 'outstanding' || status === 'partial' ? null : isoDays(between(5, 30), 15)]
      );
      if (paid > 0) {
        await run(`INSERT INTO payments (charge_id, amount, method, reference, notes, received_by, created_at)
             VALUES (?, ?, ?, ?, 'Paid at the library desk', ?, ?)`,
          [charge.lastInsertRowid, paid, pick(['cash', 'momo']), `RCPT-${between(10000, 99999)}`, librarian.id, isoDays(between(1, 25), 16)]);
      }
    }
    // Overdue charges for active overdue loans
    const overdueActive = await all<any>(
      `SELECT l.id, l.user_id, l.due_date, u.first_name, t.title FROM loans l
       JOIN users u ON u.id = l.user_id JOIN copies c ON c.id = l.copy_id JOIN titles t ON t.id = c.title_id
       WHERE l.status = 'active' AND date(l.due_date) < date('now') LIMIT 3`
    );
    for (const loan of overdueActive) {
      const days = Math.floor((Date.now() - new Date(loan.due_date).getTime()) / 86400000);
      const amount = Math.min(Math.max(0, days - 2) * DEFAULT_SETTINGS.overdueRatePerDay, DEFAULT_SETTINGS.maxFine);
      if (amount > 0) {
        await run(`INSERT INTO charges (user_id, loan_id, type, amount, description, status, created_by, created_at)
             VALUES (?, ?, 'overdue', ?, ?, 'outstanding', ?, ?)`,
          [loan.user_id, loan.id, amount, `${days} days overdue — “${loan.title}”`, librarian.id, isoDays(2, 11)]);
      }
    }

    // Reservations — make four in-demand titles fully checked out so waiting lists are realistic.
    const demandTitles = ['The Kite Runner', 'Studies in African Music', 'Python Crash Course', 'The 7 Habits of Highly Effective Teens'];
    const availableStudent = () => students.find((s) => s.status === 'active' && s.id !== demoStudent.id && (activeCounts.get(s.id) ?? 0) < 2);
    for (const title of demandTitles) {
      const titleId = titleIds.get(title);
      if (!titleId) continue;
      const available = copies.filter((c) => c.titleId === titleId && c.status === 'available');
      for (const copy of available) {
        const user = availableStudent();
        if (!user) break;
        activeCopyIds.add(copy.id);
        copy.status = 'borrowed';
        activeCounts.set(user.id, (activeCounts.get(user.id) ?? 0) + 1);
        const due = new Date(Date.now() + between(4, 16) * 86400000).toISOString();
        await issueLoanSeed({ copy, user, issuedBy: librarian.id, issue: isoDays(between(3, 12), 11), due });
      }
    }
    const demandTitleIds = demandTitles.map((title) => titleIds.get(title)).filter((id): id is number => Boolean(id));
    const waitingStudents = students.filter((s) => s.status === 'active' && s.id !== demoStudent.id);
    let queueSeedIndex = 0;
for (const [index, titleId] of demandTitleIds.entries()) {
      for (let position = 0; position < 2; position++) {
        const user = waitingStudents[(queueSeedIndex++) % waitingStudents.length];
        await run(`INSERT INTO reservations (title_id, user_id, status, queue_position, created_at) VALUES (?, ?, 'waiting', ?, ?)`,
          [titleId, user.id, position + 1, isoDays(between(2, 14), 11)]);
      }
      if (index === 0) {
        await run(`INSERT INTO reservations (title_id, user_id, status, queue_position, created_at) VALUES (?, ?, 'waiting', 3, ?)`,
          [titleId, demoStudent.id, isoDays(1, 10)]);
      }
    }    // A ready hold on a title that still has a shelved copy.
    const holdTitleId = titleIds.get('The Book Thief') ?? demandTitleIds[0];
    const holdCopy = copies.find((c) => c.titleId === holdTitleId && c.status === 'available');
    const holdUser = waitingStudents.find((s) => s.id !== demoStudent.id && (activeCounts.get(s.id) ?? 0) < 2);
    if (holdTitleId && holdCopy && holdUser) {
      holdCopy.status = 'reserved';
      await run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [isoDays(1, 9), holdCopy.id]);
      await run(`INSERT INTO reservations (title_id, user_id, status, queue_position, created_at, ready_at, expires_at)
           VALUES (?, ?, 'ready', 1, ?, ?, ?)`,
        [holdTitleId, holdUser.id, isoDays(4, 9), isoDays(1, 9), new Date(Date.now() + 2 * 86400000).toISOString()]);
    }

    // Persist copy statuses
    await run(`UPDATE copies SET status = 'borrowed' WHERE id IN (SELECT copy_id FROM loans WHERE status = 'active')`);
    await run(`UPDATE copies SET status = 'lost' WHERE id IN (SELECT copy_id FROM loans WHERE status = 'lost')`);

    // Digital resources
    fs.mkdirSync(RESOURCE_DIR, { recursive: true });
    if (options.force) {
      for (const file of fs.readdirSync(RESOURCE_DIR)) {
        if (file.endsWith('.pdf')) fs.unlinkSync(path.join(RESOURCE_DIR, file));
      }
    }
    const pdfCache = new Map<string, string>();
    const writePdf = (key: string, opts: Parameters<typeof makePdf>[0]) => {
      if (pdfCache.has(key)) return pdfCache.get(key)!;
      const name = `${crypto.randomUUID()}.pdf`;
      const buffer = makePdf(opts);
      fs.writeFileSync(path.join(RESOURCE_DIR, name), buffer);
      pdfCache.set(key, name);
      return name;
    };

    const addResource = async (opts: {
      title: string; description: string; kind: string; subjectCode?: string; examYear?: number; paper?: string;
      level?: string; author?: string; publisher?: string; publishedYear?: number; allowDownload: boolean;
      access: string; status?: string; submittedBy: number; views: number; downloads: number; daysAgo: number;
      body: string[]; color: string; subtitle?: string; meta?: string[]; category?: string;
    }) => {
      const fileKey = writePdf(opts.title, {
        title: opts.title, subtitle: opts.subtitle, meta: opts.meta, body: opts.body, accent: opts.color,
      });
      const stat = fs.statSync(path.join(RESOURCE_DIR, fileKey));
      // Everything in the library is now a downloadable book, whatever shelf it
      // came from. The old kind values survive only as a category hint.
      const category = opts.category ?? ({
        wassce: 'Past questions', notes: 'Study guides', handout: 'Workbooks', syllabus: 'Syllabus',
      } as Record<string, string>)[opts.kind] ?? 'Library';
      const r = await run(
        `INSERT INTO resources (title, description, kind, category, subject_id, exam_year, paper, level, author, publisher,
          published_year, language, file_key, file_name, file_mime, file_size, cover_color, allow_download, access,
          status, submitted_by, approved_by, approved_at, view_count, download_count, created_at, updated_at)
         VALUES (?, ?, 'ebook', ?, ?, ?, ?, ?, ?, ?, ?, 'English', ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [opts.title, opts.description, category, opts.subjectCode ? subjectIds.get(opts.subjectCode) ?? null : null,
          opts.examYear ?? null, opts.paper ?? null, opts.level ?? 'SHS', opts.author ?? null, opts.publisher ?? null,
          opts.publishedYear ?? null, fileKey, `${opts.title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60)}.pdf`, stat.size,
          opts.color, opts.allowDownload ? 1 : 0, opts.access, opts.status ?? 'approved', opts.submittedBy,
          (opts.status ?? 'approved') === 'approved' ? librarian.id : null,
          (opts.status ?? 'approved') === 'approved' ? isoDays(opts.daysAgo, 12) : null,
          opts.views, opts.downloads, isoDays(opts.daysAgo, 12), isoDays(opts.daysAgo, 12)]
      );
      return r.lastInsertRowid;
    };

    const wasscePlan = [
      { subject: 'Core Mathematics', code: 'MTH', year: 2024, paper: 'Paper 1' },
      { subject: 'Core Mathematics', code: 'MTH', year: 2023, paper: 'Paper 2' },
      { subject: 'Core Mathematics', code: 'MTH', year: 2022, paper: 'Paper 1' },
      { subject: 'English Language', code: 'ENG', year: 2024, paper: 'Paper 1' },
      { subject: 'English Language', code: 'ENG', year: 2022, paper: 'Paper 2' },
      { subject: 'Integrated Science', code: 'SCI', year: 2024, paper: 'Paper 2' },
      { subject: 'Integrated Science', code: 'SCI', year: 2023, paper: 'Paper 1' },
      { subject: 'Social Studies', code: 'SOC', year: 2024, paper: 'Paper 2' },
      { subject: 'Social Studies', code: 'SOC', year: 2022, paper: 'Paper 1' },
      { subject: 'Elective Mathematics', code: 'EMAT', year: 2023, paper: 'Paper 1' },
      { subject: 'Biology', code: 'BIO', year: 2022, paper: 'Paper 2' },
      { subject: 'Economics', code: 'ECO', year: 2023, paper: 'Paper 2' },
      { subject: 'Government', code: 'GOV', year: 2022, paper: 'Paper 1' },
      { subject: 'Physics', code: 'PHY', year: 2021, paper: 'Paper 2' },
      { subject: 'Chemistry', code: 'CHE', year: 2021, paper: 'Paper 1' },
      { subject: 'Literature in English', code: 'LIT', year: 2023, paper: 'Paper 2' },
      { subject: 'Financial Accounting', code: 'ACC', year: 2022, paper: 'Paper 1' },
    ];
for (const [index, paper] of wasscePlan.entries()) {
      await addResource({
        title: `WASSCE ${paper.subject} ${paper.year} — ${paper.paper}`,
        description: `West African Senior School Certificate Examination ${paper.subject} paper for ${paper.year}. Exam-style questions with a sample marking scheme for revision.`,
        kind: 'wassce', subjectCode: paper.code, examYear: paper.year, paper: paper.paper, level: 'SHS 3',
        publisher: 'West African Examinations Council', allowDownload: index % 4 !== 0, access: 'all',
        submittedBy: librarian.id, views: between(60, 420), downloads: between(10, 190),
        daysAgo: between(20, 300), color: '#1F4A35',
        subtitle: `West African Examinations Council • ${paper.year}`,
        meta: [`Subject: ${paper.subject}`, `Paper: ${paper.paper}  |  Duration: 2 hours 30 minutes`, 'Sample revision paper — Libra digital library'],
        body: wasscePaper(paper.subject, paper.year, paper.paper).body,
      });
    }
    const ebooks: [string, string, string, number, string[]][] = [
      ['West African Literature: A Student Companion', 'LIT', 'A guide to the major West African novels, plays and poems studied at senior high school.', 2022, ['Reading African literature', 'Things Fall Apart remains one of the most widely studied novels in West Africa. This companion explores its themes, characters and context, with essay questions and model answers.', 'Each chapter closes with discussion questions, key quotations and suggestions for further reading.']],
      ['Study Skills for Senior High School', 'LSK', 'Practical advice on time management, note-taking, revision and examination technique.', 2023, ['Successful study is a set of habits', 'This short guide covers planning a study timetable, active reading, memory techniques and preparing for examinations.', 'Set aside a regular time each day. Review your notes within 24 hours. Practise past questions under timed conditions.']],
      ['Introduction to Ghanaian History', 'HIS', 'From the great empires of West Africa to the Fourth Republic — an accessible survey.', 2021, ['Early states and kingdoms', 'This book traces the history of the territory that became Ghana from the medieval empires of Ghana, Mali and Songhai through Asante and the coastal states to independence in 1957.', 'It closes with the constitutional history of the Fourth Republic and the role of citizens in a democracy.']],
      ['Basic Chemistry Practicals', 'CHE', 'Laboratory techniques, qualitative analysis and practical examination preparation.', 2022, ['Working safely in the laboratory', 'This resource covers apparatus, safety rules, titration, qualitative analysis and recording observations accurately.', 'Always read the label before opening a reagent. Report spills immediately. Record data as you collect it, not afterwards.']],
      ['Reading for Pleasure: Short Stories from Ghana', 'ENG', 'A collection of twelve short stories by emerging Ghanaian writers, with comprehension questions.', 2023, ['The sounds of home', 'Twelve short stories explore family, friendship, ambition and the changing rhythms of Ghanaian life.', 'Each story is followed by vocabulary notes and comprehension questions suitable for class discussion.']],
      ['Digital Citizenship Handbook', 'ICT', 'Staying safe, respectful and effective online — a handbook for students and teachers.', 2024, ['Being a good digital citizen', 'This handbook covers password security, privacy, respectful communication, spotting misinformation and healthy screen habits.', 'Treat every online space as a public space. Think before you post, and never share another person\'s personal information.']],
    ];
    const ebookCategories = ['Literature', 'Study skills', 'History', 'Science', 'Literature', 'Reference'];
for (const [index, [title, code, description, year, body]] of ebooks.entries()) {
      await addResource({
        title, description, kind: 'ebook', category: ebookCategories[index], subjectCode: code, allowDownload: index % 3 !== 0, access: 'all',
        submittedBy: librarian.id, views: between(40, 260), downloads: between(8, 110), daysAgo: between(15, 200),
        author: 'Tema Secondary Library Editorial Team', publisher: 'Tema Educational Press', publishedYear: year,
        color: ['#5B4636', '#245C4A', '#3B4A6B', '#6E2D21', '#6B3A5E', '#1F4A35'][index],
        subtitle: 'Tema Secondary School digital library', body,
      });
    }
    const notes: [string, string, string, string[]][] = [
      ['Core Mathematics Formula Booklet', 'MTH', 'Every formula needed for the core mathematics examination, in one printable booklet.', ['Algebra: quadratic formula', 'For ax² + bx + c = 0, x = (-b ± √(b² - 4ac)) / 2a.', 'Mensuration, trigonometry, statistics and probability formulae are collected in this booklet.', 'Use it alongside past questions, not instead of them.']],
      ['Biology Revision Notes — Genetics', 'BIO', 'Mendelian genetics, DNA, mutation and biotechnology summarised for revision.', ['Genetics essentials', 'Genes are units of inheritance found on chromosomes. Alleles are alternative forms of a gene.', 'Practice dihybrid crosses and pedigree diagrams. Define key terms precisely.']],
      ['English Essay Writing Guide', 'ENG', 'Planning, structuring and polishing narrative, descriptive, argumentative and expository essays.', ['The four essay types', 'Every essay needs a clear plan: introduction, body paragraphs and conclusion.', 'Use topic sentences. Support each point with evidence or example. Leave time to proofread.']],
      ['Integrated Science Practical Guide', 'SCI', 'Experimental skills, data handling and practical question technique for core science.', ['Preparing for the practical exam', 'Read the whole question before touching the apparatus. Write observations, not conclusions.', 'Record units. Draw tables with ruled lines. State sources of error honestly.']],
      ['Government Essay Questions', 'GOV', 'A bank of essay questions with outline answers on Ghanaian government and politics.', ['Practising essay questions', 'Select questions that ask you to analyse, discuss or evaluate — then plan before writing.', 'Refer to the 1992 Constitution, the separation of powers and the role of the civil service where relevant.']],
    ];
for (const [index, [title, code, description, body]] of notes.entries()) {
      await addResource({
        title, description, kind: 'notes', subjectCode: code, allowDownload: true, access: 'all',
        submittedBy: librarian.id, views: between(20, 180), downloads: between(5, 80), daysAgo: between(10, 160),
        author: 'Tema Secondary Library Study Support', color: ['#8C5A1C', '#245C4A', '#5B4636', '#3E5C63', '#6E2D21'][index],
        subtitle: 'Revision notes', body,
      });
    }
    const handouts: [string, string, string, string, number][] = [
      ['Physics: Waves Worksheet', 'PHY', 'Teacher handout with practice problems on wave motion, sound and light.', 'Yaw Frimpong', 6],
      ['Accounting: Trial Balance Exercises', 'ACC', 'Graded trial balance and correction-of-errors exercises with answers.', 'Comfort Tetteh', 5],
      ['Literature: Things Fall Apart Study Guide', 'LIT', 'Chapter questions, character maps and essay prompts.', 'Daniel Appiah', 4],
    ];
for (const [title, code, description, author, daysAgo] of handouts) {
      await addResource({
        title, description, kind: 'handout', subjectCode: code, allowDownload: true, access: 'all',
        submittedBy: teachers[1]?.id ?? librarian.id, views: between(10, 90), downloads: between(2, 40),
        daysAgo, author, color: '#7A3B2E', subtitle: 'Teacher handout',
        body: ['Worksheet instructions', 'Complete all questions in your exercise book. Show your working clearly.', 'Submit your work to your subject teacher by the end of the week.'] ,
      });
    }
    const syllabi: [string, string][] = [
      ['WAEC Core Mathematics Syllabus', 'MTH'], ['GES English Language Syllabus', 'ENG'],
    ];
for (const [title, code] of syllabi) {
      await addResource({
        title, description: 'Official syllabus outline, objectives and assessment structure.', kind: 'syllabus',
        subjectCode: code, allowDownload: true, access: 'all', submittedBy: librarian.id,
        views: between(15, 120), downloads: between(4, 55), daysAgo: between(30, 240), color: '#3B4A6B',
        subtitle: 'Curriculum document',
        body: ['Aims and objectives', 'The syllabus sets out the knowledge, skills and attitudes expected at each level.', 'Assessment combines continuous assessment with a final external examination.'],
      });
    }
    // Pending + rejected teacher submissions
    const pendingId = await addResource({
      title: 'Form 2 Science — Cell Division Worksheet', description: 'Teacher-prepared worksheet on mitosis and meiosis with diagrams and answers.',
      kind: 'handout', subjectCode: 'BIO', allowDownload: false, access: 'students', status: 'pending',
      submittedBy: teachers[2]?.id ?? teacherDemo.id, views: 0, downloads: 0, daysAgo: 2,
      author: 'Yaw Frimpong', color: '#245C4A', subtitle: 'Awaiting librarian approval',
      body: ['Mitosis and meiosis', '1. State three differences between mitosis and meiosis.', '2. Draw labelled diagrams of the stages of mitosis in an onion root tip cell.', '3. Explain the importance of crossing over during meiosis.'],
    });
    void pendingId;
    await addResource({
      title: 'Economics Field Trip Notes', description: 'Unofficial notes from a market visit — submitted without sources.',
      kind: 'notes', subjectCode: 'ECO', allowDownload: true, access: 'students', status: 'rejected',
      submittedBy: teachers[5]?.id ?? teacherDemo.id, views: 0, downloads: 0, daysAgo: 6,
      author: 'Isaac Osei', color: '#8C5A1C', subtitle: 'Not approved',
      body: ['These notes were submitted for review and were not approved because references were missing.'],
    });

    // Resource events & favourites
    const approvedResources = await all<any>(`SELECT id FROM resources WHERE status = 'approved'`);
    for (let i = 0; i < 60; i++) {
      const resource = pick(approvedResources);
      const user = pick(students.filter((s) => s.status === 'active'));
      await run(`INSERT OR IGNORE INTO resource_events (resource_id, user_id, type, created_at) VALUES (?, ?, 'view', ?)`,
        [resource.id, user.id, isoDays(between(1, 30), between(8, 16))]);
    }
    ['Things Fall Apart', 'Purple Hibiscus', 'Campbell Biology'].forEach(() => {});
for (const resource of approvedResources.slice(0, 3)) {
      await run(`INSERT OR IGNORE INTO resource_favorites (user_id, resource_id, created_at) VALUES (?, ?, ?)`,
        [demoStudent.id, resource.id, isoDays(between(2, 20), 12)]);
    }
    // Saved books
for (const [index, title] of ['Things Fall Apart', 'Half of a Yellow Sun', 'How to Solve It'].entries()) {
      const status = index === 0 ? 'finished' : index === 1 ? 'reading' : 'want';
      await run(`INSERT OR IGNORE INTO saved_books (user_id, title_id, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [demoStudent.id, tid(title), status, status === 'finished' ? 100 : status === 'reading' ? 45 : 0, isoDays(20 - index, 12), isoDays(3, 12)]);
    }
    // Reading lists
    const literatureList = await run(`INSERT INTO reading_lists (owner_id, title, description, subject_id, class_level, is_published, created_at, updated_at)
      VALUES (?, 'African Literature Essentials', 'The novels and plays we will study this term, in reading order.', ?, 'Form 3 Arts A', 1, ?, ?)`,
      [teacherDemo.id, subjectIds.get('LIT') ?? null, isoDays(30, 9), isoDays(4, 9)]);
for (const [index, title] of ['Things Fall Apart', 'The Beautyful Ones Are Not Yet Born', 'Purple Hibiscus', 'Death and the King\u2019s Horseman', 'So Long a Letter'].entries()) {
      await run(`INSERT INTO reading_list_items (list_id, title_id, note, position) VALUES (?, ?, ?, ?)`,
        [literatureList.lastInsertRowid, tid(title), index === 0 ? 'Start here — read chapters 1–6 for the first class.' : null, index + 1]);
    }    const scienceList = await run(`INSERT INTO reading_lists (owner_id, title, description, subject_id, class_level, is_published, created_at, updated_at)
      VALUES (?, 'Form 2 Science — Wider Reading', 'Popular science books and revision resources to stretch beyond the textbook.', ?, 'Form 2 Science A', 1, ?, ?)`,
      [teachers[2]?.id ?? teacherDemo.id, subjectIds.get('BIO') ?? null, isoDays(18, 10), isoDays(6, 10)]);
for (const [index, title] of ['A Brief History of Time', 'The Selfish Gene', 'Campbell Biology', 'Silent Spring'].entries()) {
      await run(`INSERT INTO reading_list_items (list_id, title_id, note, position) VALUES (?, ?, ?, ?)`,
        [scienceList.lastInsertRowid, tid(title), null, index + 1]);
    }    await run(`INSERT INTO reading_lists (owner_id, title, description, subject_id, class_level, is_published, created_at, updated_at)
      VALUES (?, 'WASSCE Mathematics Boosters', 'Draft list of revision materials for Form 3 students.', ?, 'Form 3 Science A', 0, ?, ?)`,
      [librarian.id, subjectIds.get('MTH') ?? null, isoDays(5, 11), isoDays(2, 11)]);

    // Announcements
    const announcements: [string, string, string, number, number][] = [
      ['Extended opening hours during examination week', 'From Monday, the library will open at 6:30 am and close at 7:00 pm to support WASSCE revision. Bring your student ID card — entry after 5:00 pm requires it.', 'all', 1, 2],
      ['New WASSCE past questions added', 'Seventeen new WASSCE past papers for Core Mathematics, English, Integrated Science, Social Studies and elective subjects are now in the online library. Filter by subject and year to find them.', 'students', 0, 5],
      ['Library closed on Friday afternoon', 'The library will close at 12:30 pm this Friday for stocktaking. Please return any books due that day before noon.', 'all', 0, 8],
      ['Read the library from anywhere', 'Every book the library has digitised is now available online. Sign in with your library ID and open a book on any phone, tablet or computer — no need to come to the desk.', 'all', 0, 16],
      ['Staff briefing — the new front desk', 'A short refresher on the kiosk sign-in and sign-out flow will be held in the library office on Wednesday at 3:00 pm. Librarians and administrators only.', 'staff', 0, 21],
    ];
for (const [title, body, audience, pinned, daysAgo] of announcements) {
      await run(`INSERT INTO announcements (title, body, audience, pinned, status, publish_at, expires_at, created_by, created_at)
           VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?)`,
        [title, body, audience, pinned, isoDays(daysAgo, 8), daysAgo < 5 ? null : isoDays(-30), librarian.id, isoDays(daysAgo, 8)]);
    }    await run(`INSERT INTO announcements (title, body, audience, pinned, status, publish_at, created_by, created_at)
         VALUES ('Draft: Reading challenge results', 'Draft announcement awaiting final numbers from the reading challenge.', 'students', 0, 'draft', ?, ?, ?)`,
      [isoDays(0, 8), librarian.id, isoDays(0, 8)]);

    // Book requests
    const requests: [string, string, number, string][] = [
      ['The Fate of Africa', 'Martin Meredith', students[3].id, 'pending'],
      ['Atomic Habits', 'James Clear', students[7].id, 'pending'],
      ['A Brief History of Time', 'Stephen Hawking', students[12].id, 'approved'],
      ['The Concise Oxford Dictionary', 'Oxford University Press', teacherDemo.id, 'acquired'],
      ['Homegoing', 'Yaa Gyasi', students[15].id, 'rejected'],
      ['Rich Dad Poor Dad', 'Robert Kiyosaki', students[21].id, 'pending'],
    ];
for (const [title, author, userId, status] of requests) {
      await run(`INSERT INTO book_requests (user_id, title, author, reason, status, review_notes, reviewed_by, reviewed_at, created_at)
           VALUES (?, ?, ?, 'Requested for the library collection.', ?, ?, ?, ?, ?)`,
        [userId, title, author, status, status === 'pending' ? null : status === 'approved' ? 'Approved for acquisition.' : status === 'acquired' ? 'Purchased and added to stock.' : 'We already hold two copies — please borrow at the desk.',
          status === 'pending' ? null : librarian.id, status === 'pending' ? null : isoDays(between(2, 15), 12), isoDays(between(3, 45), 12)]);
    }
    // Acquisitions
    const acquisitions: [string, string, number, number, string | null, string | null, number][] = [
      ['Things Fall Apart', 'purchase', 6, 35, 'EduBooks Ghana Ltd', null, 210],
      ['Core Mathematics for SHS', 'purchase', 10, 42, 'Aki-Ola Depot', null, 180],
      ['Animal Farm', 'donation', 4, 0, null, 'Old Students Association (2004 year group)', 150],
      ['Campbell Biology', 'purchase', 2, 320, 'Cambridge Depot', null, 120],
      ['Purple Hibiscus', 'purchase', 4, 38, 'EduBooks Ghana Ltd', null, 90],
      ['Introduction to African Religion', 'donation', 2, 0, null, 'Rotary Club of Accra', 70],
      ['Information Technology for SHS', 'purchase', 5, 45, 'Aki-Ola Depot', null, 55],
      ['The 7 Habits of Highly Effective Teens', 'donation', 1, 0, null, 'Mrs. B. Amankwah', 30],
    ];
for (const [title, type, quantity, unitCost, supplier, donor, daysAgo] of acquisitions) {
      await run(`INSERT INTO acquisitions (title_id, type, quantity, unit_cost, total_cost, supplier, donor, invoice_ref, acquired_on, notes, recorded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tid(title), type, quantity, unitCost, type === 'donation' ? 0 : quantity * unitCost, supplier, donor,
          type === 'purchase' ? `INV-${between(1000, 9999)}` : null, isoDays(daysAgo, 9).slice(0, 10),
          type === 'donation' ? 'Donated copy record' : 'Purchase order', librarian.id, isoDays(daysAgo, 9)]);
    }
    // Completed stocktake in Fiction
    const fictionCopies = await all<any>(
      `SELECT c.id FROM copies c JOIN titles t ON t.id = c.title_id
       WHERE c.section = 'Fiction' AND c.status = 'available' LIMIT 40`
    );
    if (fictionCopies.length > 3) {
      const expected = await scalar<number>(
        `SELECT COUNT(*) FROM copies WHERE section = 'Fiction' AND status IN ('available','reserved','damaged','missing')`
      );
      const stocktake = await run(
        `INSERT INTO stocktakes (reference, location, status, expected_count, found_count, notes, started_by, started_at, completed_at)
         VALUES (?, 'Fiction', 'completed', ?, ?, 'Termly stocktake of the fiction shelves.', ?, ?, ?)`,
        [`STK-${isoDays(30, 9).slice(0, 10)}-101`, fictionCopies.length, fictionCopies.length - 2, librarian.id, isoDays(30, 9), isoDays(30, 16)]
      );
for (const [index, copy] of fictionCopies.entries()) {
        if (index >= fictionCopies.length - 2) continue;
        await run(`INSERT INTO stocktake_scans (stocktake_id, copy_id, condition, scanned_by, scanned_at) VALUES (?, ?, 'good', ?, ?)`,
          [stocktake.lastInsertRowid, copy.id, librarian.id, isoDays(30, 10)]);
      }for (const copy of fictionCopies.slice(-2)) {
        await run(`UPDATE copies SET status = 'missing', updated_at = ? WHERE id = ?`, [isoDays(30, 16), copy.id]);
      }    }

    // Contact messages
for (const [name, email, subject, message, status, daysAgo] of ([
      ['Kofi Mensah', 'kofi.mensah@example.com', 'Question about borrowing', 'Good afternoon. Can Form 1 students borrow two books at a time? I would also like to know whether the library has old examination papers for Integrated Science.', 'new', 1],
      ['Linda Owusu', 'linda.owusu@example.com', 'Donation of books', 'My family would like to donate a box of novels and textbooks. Who should we speak to about dropping them off?', 'read', 4],
    ] as [string, string, string, string, string, number][])) {
      await run(`INSERT INTO contact_messages (name, email, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, subject, message, status, isoDays(Number(daysAgo), 13)]);
    }
    // Inboxes. Each published notice is delivered to the demo accounts that
    // should see it — the same rows a broadcast from the admin screen creates.
    // The newest notice stays unread so the bell has something to show.
    const published = await all<{ id: number; title: string; body: string; audience: string; publish_at: string }>(
      "SELECT id, title, body, audience, publish_at FROM announcements WHERE status = 'published' ORDER BY publish_at DESC"
    );
    const demoAccounts = [admin, librarian, teacherDemo, demoStudent];
    const audienceRoles: Record<string, string[]> = {
      all: ['student', 'teacher', 'librarian', 'admin'],
      students: ['student'],
      teachers: ['teacher'],
      staff: ['librarian', 'admin'],
    };
for (const [index, notice] of published.entries()) {
      const roles = audienceRoles[notice.audience] ?? ['student'];
      for (const account of demoAccounts) {
        if (!roles.includes(account.role)) continue;
        await run(
          `INSERT INTO notifications (user_id, type, title, body, link, dedupe_key, read_at, created_at)
           VALUES (?, 'broadcast', ?, ?, NULL, ?, ?, ?)`,
          [account.id, notice.title, notice.body, `announcement:${notice.id}:${account.id}`,
            index === 0 ? null : notice.publish_at, notice.publish_at]
        );
      }
    }
    // ── Front-desk visit register ──────────────────────────────────────
    // A realistic day of walk-ins: a few students still inside, the rest
    // already signed out. Book titles come from copies that exist.
    const visitBooks = await Promise.all(
      copies
        .filter((c) => c.status === 'available')
        .slice(0, 12)
        .map(async (c) => {
          const titleRow = await get<any>('SELECT title FROM titles WHERE id = ?', [c.titleId]);
          return { copyId: c.id, titleId: c.titleId, title: titleRow?.title ?? null };
        })
    );
    const attendeePool = students.filter((s) => s.status === 'active');
    const ITEMS = ['School bag', 'Backpack', 'Laptop', 'Textbook', 'None'];
    const PURPOSES = ['Reading', 'Research', 'Borrowing', 'Private study', 'Revision'];
    const visitRows: { user: SeedUser; daysAgo: number; hour: number; minute: number; open: boolean; book: boolean; item: string; purpose: string }[] = [
      { user: attendeePool[0], daysAgo: 0, hour: 7, minute: 35, open: true, book: true, item: 'Backpack', purpose: 'Private study' },
      { user: attendeePool[1], daysAgo: 0, hour: 8, minute: 10, open: true, book: true, item: 'School bag', purpose: 'Reading' },
      { user: attendeePool[2], daysAgo: 0, hour: 9, minute: 5, open: true, book: false, item: 'Laptop', purpose: 'Research' },
      { user: attendeePool[3], daysAgo: 0, hour: 10, minute: 20, open: true, book: true, item: 'Textbook', purpose: 'Revision' },
      { user: attendeePool[4], daysAgo: 0, hour: 11, minute: 0, open: false, book: false, item: 'None', purpose: 'Reading' },
      { user: attendeePool[5], daysAgo: 0, hour: 12, minute: 15, open: false, book: true, item: 'Backpack', purpose: 'Borrowing' },
      { user: attendeePool[6], daysAgo: 1, hour: 8, minute: 40, open: false, book: true, item: 'School bag', purpose: 'Reading' },
      { user: attendeePool[7], daysAgo: 1, hour: 9, minute: 30, open: false, book: false, item: 'None', purpose: 'Private study' },
      { user: attendeePool[8], daysAgo: 1, hour: 13, minute: 10, open: false, book: true, item: 'Laptop', purpose: 'Research' },
      { user: attendeePool[9], daysAgo: 1, hour: 15, minute: 25, open: false, book: false, item: 'Textbook', purpose: 'Revision' },
      { user: attendeePool[10], daysAgo: 2, hour: 7, minute: 50, open: false, book: true, item: 'Backpack', purpose: 'Borrowing' },
      { user: attendeePool[11], daysAgo: 2, hour: 10, minute: 5, open: false, book: false, item: 'None', purpose: 'Reading' },
      { user: attendeePool[12], daysAgo: 2, hour: 14, minute: 45, open: false, book: true, item: 'School bag', purpose: 'Private study' },
      { user: attendeePool[13], daysAgo: 3, hour: 8, minute: 15, open: false, book: false, item: 'Laptop', purpose: 'Research' },
      { user: attendeePool[14], daysAgo: 3, hour: 11, minute: 35, open: false, book: true, item: 'Textbook', purpose: 'Reading' },
      { user: attendeePool[15], daysAgo: 4, hour: 9, minute: 55, open: false, book: false, item: 'None', purpose: 'Revision' },
    ];
for (const [index, row] of visitRows.entries()) {
      const book = row.book ? visitBooks[index % visitBooks.length] : null;
      const signedIn = isoDays(row.daysAgo, row.hour, row.minute);
      const minutes = 35 + (index % 5) * 20;
      const signedOut = row.open ? null : new Date(new Date(signedIn).getTime() + minutes * 60_000).toISOString();
      await run(
        `INSERT INTO library_visits (user_id, full_name, school_id, email, class_name, house, item_brought,
          book_taken, copy_id, title_id, purpose, notes, signed_in_by, signed_in_at, signed_out_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [row.user.id, `${row.user.firstName} ${row.user.lastName}`, row.user.libraryId, row.user.email,
          row.user.className, row.user.house ?? null, row.item, book?.title ?? null, book?.copyId ?? null,
          book?.titleId ?? null, row.purpose, index % 3 === 0 ? librarian.id : admin.id,
          signedIn, signedOut, signedIn, signedOut ?? signedIn]
      );
    }    // A walk-in visitor who is not a registered member.
    await run(
      `INSERT INTO library_visits (user_id, full_name, school_id, email, class_name, house, item_brought,
        book_taken, copy_id, title_id, purpose, notes, signed_in_by, signed_in_at, signed_out_at, created_at, updated_at)
       VALUES (NULL, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
      ['Esi Amponsah', 'esi.amponsah@example.com', 'Form 1 Arts A', 'House 3', 'None', 'Research',
        'Visiting from another school for the WASSCE revision session.', librarian.id,
        isoDays(0, 9, 45), isoDays(0, 9, 45), isoDays(0, 9, 45)]
    );

    // Audit trail
    const auditSeed: [number, string, string, string, string, number][] = [
      [librarian.id, 'loan.issue', 'loan', 'Issued “Things Fall Apart” (TSS-100042) to Ama Boateng', '1', 1],
      [librarian.id, 'loan.return', 'loan', 'Returned “Animal Farm” (TSS-100102)', '2', 2],
      [admin.id, 'settings.update', 'settings', 'Updated library settings', '3', 3],
      [librarian.id, 'title.create', 'title', 'Added “Digital Citizenship Handbook” to the catalogue', '4', 5],
      [librarian.id, 'reservation.create', 'reservation', 'Reserved “Purple Hibiscus” for Ama Boateng', '5', 6],
      [admin.id, 'user.create', 'user', 'Created teacher account for Grace Addo', '6', 7],
      [librarian.id, 'payment.create', 'charge', 'Recorded payment of 3.00 (cash)', '7', 8],
      [librarian.id, 'copy.create', 'title', 'Added 4 copies of “Purple Hibiscus”', '8', 9],
      [admin.id, 'backup.create', 'backup', 'Created database backup libra-backup.db', '9', 10],
      [librarian.id, 'stocktake.complete', 'stocktake', 'Completed stocktake STK-101: 2 copies marked missing', '10', 11],
      [librarian.id, 'charge.waive', 'charge', 'Waived 2.00 — damaged on return', '11', 12],
      [admin.id, 'user.status', 'user', 'Set a student account to suspended', '12', 13],
      [librarian.id, 'resource.create', 'resource', 'Added resource “WASSCE Core Mathematics 2024 — Paper 1”', '13', 14],
      [librarian.id, 'loan.renew', 'loan', 'Renewed “Campbell Biology” for Daniel Appiah', '14', 15],
      [admin.id, 'academic.year_create', 'academic_year', 'Created academic year 2026/2027', '15', 20],
    ];
for (const [userId, action, entity, summary, entityId, daysAgo] of auditSeed) {
      await run(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, summary, details, ip, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, '10.10.0.12', ?)`,
        [userId, action, entity, entityId, summary, isoDays(daysAgo, 12)]);
    }
    await run(`INSERT INTO settings (key, value, updated_at) VALUES ('lastBackupAt', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(isoDays(1, 2)), stamp]);

    // The demo library opens with one account per role. Seeding builds a full
    // cast so the history looks lived-in, then everything except the four demo
    // logins is pruned (walk-in visits stay behind as anonymous records).
    await pruneToDemoAccounts();
  });

  // A verified backup on disk so the admin recovery screen has something real to show.
  const backupName = `libra-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  try {
    await run(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } catch {
    /* backups are best-effort during seeding */
  }

  return {
    seeded: true,
    users: await scalar<number>('SELECT COUNT(*) FROM users'),
    titles: await scalar<number>('SELECT COUNT(*) FROM titles'),
    copies: await scalar<number>('SELECT COUNT(*) FROM copies'),
    loans: await scalar<number>('SELECT COUNT(*) FROM loans'),
    resources: await scalar<number>('SELECT COUNT(*) FROM resources'),
  };
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const result = await seed({ force: process.argv.includes('--force') });
  console.log(result.seeded ? 'Library seeded:' : 'Library already initialised:', result);
}
