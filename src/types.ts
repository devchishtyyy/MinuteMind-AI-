export interface Attendee {
  name: string;
  role: string;
}

export interface ActionItem {
  task: string;
  owner: string;
  dueDate: string;
  status: 'pending' | 'done';
}

export interface PowerPointSlide {
  slideNumber: number;
  slideLabel: string;
  note: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'excel' | 'word' | 'powerpoint' | 'other';
  base64Data: string;
  fileSize: number;
  uploadedAt: string;
  generalNote: string;
  slides?: PowerPointSlide[];
}

export interface Meeting {
  id: string;
  title: string;
  date: string;         // YYYY-MM-DD
  time: string;         // HH:MM
  duration: number;     // minutes
  category: 'SOR' | 'POR' | 'MOR';
  company: 'Company Wide' | 'Corrugated' | 'Paper & Board';
  attendees: Attendee[];
  rawMinutes: string;
  aiSummary?: string;
  keyDecisions?: string[];
  actionItems?: ActionItem[];
  sentiment?: 'positive' | 'neutral' | 'concerning';
  followUpDate?: string | null;
  tags: string[];
  createdAt: string;    // ISO string
  updatedAt: string;    // ISO string
  attachments?: Attachment[];
  attachmentInsights?: string[];
}
