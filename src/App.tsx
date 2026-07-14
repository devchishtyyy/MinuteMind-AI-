import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Sparkles, 
  Trash2, 
  ChevronRight, 
  History, 
  LayoutDashboard,
  Loader2,
  Menu,
  X,
  Upload,
  Bot,
  AlertCircle,
  Calendar,
  Clock,
  Briefcase,
  Users,
  CheckCircle,
  Eye,
  Edit2,
  Download,
  Share2,
  ExternalLink,
  ChevronLeft,
  Filter,
  CheckSquare,
  Square,
  TrendingUp,
  Tag,
  ChevronDown,
  Info,
  Database,
  Send,
  Printer,
  Mail,
  MessageSquare,
  Copy,
  Check,
  Table,
  Presentation,
  Paperclip,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { Meeting, Attendee, ActionItem, Attachment } from './types';
import { 
  analyzeMeetingMinutes, 
  askAboutMeetings, 
  findRelevantMeetings, 
  generateSmartBriefing, 
  askCorporateMemory, 
  generateEmailSummary 
} from './services/gemini';
import StatCharts from './components/StatCharts';

// === CONSTANTS & COLOR MAPS ===
const CATEGORY_COLORS = {
  SOR: { bg: 'bg-[#6c63ff]/10 text-[#6c63ff] border-[#6c63ff]/20', label: 'SOR — Short-term Operational Review' },
  POR: { bg: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20', label: 'POR — Project Operational Review' },
  MOR: { bg: 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20', label: 'MOR — Monthly Operational Review' }
};

const COMPANY_COLORS = {
  'Company Wide': { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'Corrugated': { bg: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  'Paper & Board': { bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
};

const SENTIMENT_COLORS = {
  positive: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Positive' },
  neutral: { bg: 'bg-gray-500/10 text-gray-400 border-gray-500/20', label: 'Neutral' },
  concerning: { bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Concerning' },
};

export default function App() {
  // === SYSTEM STATES ===
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'corporate-memory'>('dashboard');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // === SMART BRIEFING STATES ===
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingContent, setBriefingContent] = useState('');
  const [briefingError, setBriefingError] = useState<string | null>(null);

  // === FRICTIONLESS PUBLISH STATES ===
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishActiveTab, setPublishActiveTab] = useState<'email' | 'slack' | 'print'>('email');
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishEmailHtml, setPublishEmailHtml] = useState('');
  const [publishCopied, setPublishCopied] = useState(false);

  // === CORPORATE MEMORY STATES ===
  const [chatMessages, setChatMessages] = useState<{ id: string, role: 'user' | 'model', text: string, timestamp: string }[]>([
    {
      id: 'welcome',
      role: 'model',
      text: '<p>Welcome to the <b>Corporate Memory Assistant</b>. I have indexed the entire manufacturing database of meetings, raw notes, action items, and decisions across all sectors (SOR, POR, MOR). Ask me any question about past decisions, timelines, escalations, or specific metrics discussed!</p>',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const starterQuestions = [
    "What did we decide about the Q1 mixing ratio in the POR?",
    "Show me a list of all action items currently pending.",
    "Which items have been escalated to MOR?",
    "Summarise safety incidents or blockers mentioned in previous SORs."
  ];
  
  // === DRAWER STATE ===
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  
  // Drawer Form state
  const [formId, setFormId] = useState<string>('');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formDuration, setFormDuration] = useState(30);
  const [formCategory, setFormCategory] = useState<Meeting['category']>('SOR');
  const [formCompany, setFormCompany] = useState<Meeting['company']>('Company Wide');
  const [formRawMinutes, setFormRawMinutes] = useState('');
  const [formTags, setFormTags] = useState('');
  
  // Attendees form inline state
  const [attendeesList, setAttendeesList] = useState<Attendee[]>([]);
  const [newAttendeeName, setNewAttendeeName] = useState('');
  const [newAttendeeRole, setNewAttendeeRole] = useState('');
  
  // Extracted AI content pre-save
  const [tempAiSummary, setTempAiSummary] = useState('');
  const [tempKeyDecisions, setTempKeyDecisions] = useState<string[]>([]);
  const [tempActionItems, setTempActionItems] = useState<ActionItem[]>([]);
  const [tempSentiment, setTempSentiment] = useState<Meeting['sentiment']>('neutral');
  const [tempFollowUpDate, setTempFollowUpDate] = useState<string | null>(null);
  
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // === SEARCH & FILTER STATE ===
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'week' | 'month' | 'custom'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'positive' | 'neutral' | 'concerning'>('all');
  const [pendingActionsFilter, setPendingActionsFilter] = useState<boolean>(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string | null>(null);
  
  // Custom Date state
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Mini Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [selectedCalendarFilterDate, setSelectedCalendarFilterDate] = useState<string | null>(null);

  // === Detail View State ===
  const [detailTab, setDetailTab] = useState<'overview' | 'minutes' | 'actionItems' | 'attendees' | 'attachments'>('overview');
  const [actionItemFilter, setActionItemFilter] = useState<'all' | 'pending' | 'done'>('all');

  // === ATTACHMENT SYSTEM STATE ===
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [tempAttachmentInsights, setTempAttachmentInsights] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [expandedAttachmentId, setExpandedAttachmentId] = useState<string | null>(null);

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewAttachmentName, setPreviewAttachmentName] = useState('');
  const [previewBase64, setPreviewBase64] = useState('');
  const [previewFileType, setPreviewFileType] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // === NATURAL LANGUAGE ASSISTANT ===
  const [nlQuery, setNlQuery] = useState('');
  const [nlAnswer, setNlAnswer] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  // === DELETE WARNING MODAL ===
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);

  // === TOAST NOTIFICATION SYSTEM ===
  interface Toast { id: string; message: string; type: 'success' | 'warn' | 'info' }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'warn' | 'info' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // === 1. LOCAL STORAGE PERSISTENCE ===
  useEffect(() => {
    // Load initial meetings from LocalStorage
    try {
      const stored = localStorage.getItem('minutemind_meetings_v2');
      if (stored) {
        setMeetings(JSON.parse(stored));
      } else {
        // Hydrate with some exquisite high-fidelity sample data so screen looks filled !
        const sampleData: Meeting[] = [
          {
            id: 'sample-1',
            title: 'Q3 Product Strategy Alignment',
            date: new Date().toISOString().split('T')[0], // Today
            time: '10:00',
            duration: 45,
            category: 'POR',
            company: 'Corrugated',
            attendees: [
              { name: 'Sarah Connor', role: 'Product Lead' },
              { name: 'John Doe', role: 'Lead Architect' },
              { name: 'Alex Rivera', role: 'Security Engineer' }
            ],
            rawMinutes: `Q3 Strategy session started at 10:00.
We discussed migrating the primary authentication cluster to a multi-tenant client pattern after concerns from customers.
John discussed reducing average response durations and suggested adding Redis caches on core API layers.
Sarah approved the Q3 timeline. Code completion is slated for August 15.
Alex raised latency issues on databases. Need to index user IDs.

Action Items:
- John Connor to deploy caching on production by next Monday.
- Alex Rivera to check SQL performance indices.
- Sarah Connor to publish updated roadmap for client alignment.`,
            aiSummary: 'Product strategy alignment session focused on Q3 delivery objectives. Discussed performance optimizations via Redis caching and security compliance upgrades for the databases authentication infrastructure.',
            keyDecisions: [
              'Migrate primary authentication to multi-tenant model.',
              'Add Redis cache to core API layers to reduce average latency.',
              'Set final Q3 code completion target to August 15.'
            ],
            actionItems: [
              { task: 'Deploy Redis caching on core API server', owner: 'John Doe', dueDate: '2026-06-15', status: 'pending' },
              { task: 'Audit Database column indexing for User IDs', owner: 'Alex Rivera', dueDate: '2026-06-18', status: 'pending' },
              { task: 'Publish Q3 Product roadmap sheet to clients', owner: 'Sarah Connor', dueDate: '2026-06-20', status: 'done' }
            ],
            sentiment: 'positive',
            followUpDate: '2026-06-22',
            tags: ['strategy', 'redis', 'db-perf'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'sample-2',
            title: 'Weekly UI Design Review',
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Yesterday
            time: '14:30',
            duration: 30,
            category: 'MOR',
            company: 'Paper & Board',
            attendees: [
              { name: 'Elena Vostova', role: 'Senior UX Designer' },
              { name: 'Sarah Connor', role: 'Product Lead' }
            ],
            rawMinutes: `Elena shared progress on the meeting organizer details. Focused on custom styled cards, dark theme (#0f1117 palette), and slide-out drawers.
Sarah loves the dark professional slate theme. She asked to simplify action item status toggles with direct checklists.
Elena raised that Chart.js will display beautifully under the new stats panel.
We discussed accessibility and contrast. Elena to double check.`,
            aiSummary: 'Weekly design critique focused on the dark mode technical UI. Reviewed slide-out panels, responsive calendar filters, and Chart.js integration layouts. Action item checklist interactivity was approved.',
            keyDecisions: [
              'Approved rich dark theme palette (#0f1117 / #1a1d27) for supreme clarity.',
              'Adopted inline drawer edits for AI-extracted items to save clicks.'
            ],
            actionItems: [
              { task: 'Double check WCAG color contrast profiles for the tags badges', owner: 'Elena Vostova', dueDate: '2026-06-11', status: 'done' },
              { task: 'Draft final high fidelity dashboard mockups', owner: 'Elena Vostova', dueDate: '2026-06-14', status: 'pending' }
            ],
            sentiment: 'positive',
            followUpDate: '2026-06-15',
            tags: ['ux', 'design', 'review'],
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          }
        ];
        setMeetings(sampleData);
        localStorage.setItem('minutemind_meetings_v2', JSON.stringify(sampleData));
      }
    } catch (e) {
      console.error('Error loading meetings from LocalStorage:', e);
    }
  }, []);

  const saveToLocalStorage = (allMeetings: Meeting[]) => {
    try {
      localStorage.setItem('minutemind_meetings_v2', JSON.stringify(allMeetings));
    } catch (e) {
      console.error('Error saving meetings to LocalStorage:', e);
      showToast('Storage limit exceeded! Consider removing older attachments to free space.', 'warn');
    }
  };

  // === 2. CALCULATION OF KPI METRICS ===
  const kpis = useMemo(() => {
    const total = meetings.length;
    
    // Count this week (last 7 days)
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const thisWeekCount = meetings.filter(m => {
      if (!m.date) return false;
      const mDate = new Date(m.date);
      return mDate >= startOfWeek;
    }).length;

    // Count pending actions across all meetings
    const pendingActions = meetings.reduce((sum, m) => {
      const pendingCount = m.actionItems?.filter(i => i.status === 'pending').length || 0;
      return sum + pendingCount;
    }, 0);

    // Filter average duration
    const totalDuration = meetings.reduce((sum, m) => sum + (Number(m.duration) || 0), 0);
    const avg = total > 0 ? Math.round(totalDuration / total) : 0;

    return { total, thisWeekCount, pendingActions, avg };
  }, [meetings]);

  // === 3. FILTER AND SEARCH LOGIC ===
  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      // 1. Keyword search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || [
        m.title,
        m.rawMinutes,
        m.aiSummary || '',
        m.tags.join(' '),
        m.attendees.map(a => a.name + ' ' + a.role).join(' ')
      ].some(text => text.toLowerCase().includes(q));

      // 2. Category Filter
      const matchCategory = categoryFilter === 'all' || m.category === categoryFilter;

      // 2b. Company Filter
      const matchCompany = companyFilter === 'all' || (m.company || 'Company Wide') === companyFilter;

      // 3. Date Range Filter
      let matchDateRange = true;
      const itemDate = new Date(m.date);

      if (dateRangeFilter === 'week') {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay()); // Sunday
        matchDateRange = itemDate >= start;
      } else if (dateRangeFilter === 'month') {
        const start = new Date();
        start.setDate(1); // 1st of month
        matchDateRange = itemDate >= start;
      } else if (dateRangeFilter === 'custom') {
        const start = customStartDate ? new Date(customStartDate) : null;
        const end = customEndDate ? new Date(customEndDate) : null;
        if (start && end) {
          matchDateRange = itemDate >= start && itemDate <= end;
        } else if (start) {
          matchDateRange = itemDate >= start;
        } else if (end) {
          matchDateRange = itemDate <= end;
        }
      }

      // 4. Calendar Filter
      const matchCalendarDate = !selectedCalendarFilterDate || m.date === selectedCalendarFilterDate;

      // 4b. Year/Month Tree Filter
      let matchMonth = true;
      if (selectedMonthFilter) {
        matchMonth = m.date.startsWith(selectedMonthFilter);
      }

      // 5. Sentiment Filter
      const matchSentiment = sentimentFilter === 'all' || m.sentiment === sentimentFilter;

      // 6. Pending Actions State
      const hasPending = m.actionItems?.some(item => item.status === 'pending') || false;
      const matchPending = !pendingActionsFilter || hasPending;

      return matchSearch && matchCategory && matchCompany && matchDateRange && matchCalendarDate && matchMonth && matchSentiment && matchPending;
    });
  }, [meetings, searchQuery, categoryFilter, companyFilter, dateRangeFilter, customStartDate, customEndDate, selectedCalendarFilterDate, selectedMonthFilter, sentimentFilter, pendingActionsFilter]);

  // === 4. TIMELINE GROUPING ===
  const groupedMeetings = useMemo(() => {
    const today: Meeting[] = [];
    const thisWeek: Meeting[] = [];
    const thisMonth: Meeting[] = [];
    const older: Meeting[] = [];

    const now = new Date();
    now.setHours(0,0,0,0);
    const startOfWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    filteredMeetings.forEach(m => {
      if (!m.date) {
        older.push(m);
        return;
      }
      const mDate = new Date(m.date + 'T00:00:00');
      mDate.setHours(0,0,0,0);
      
      if (mDate.getTime() === now.getTime()) {
        today.push(m);
      } else if (mDate >= startOfWeek) {
        thisWeek.push(m);
      } else if (mDate >= startOfMonth) {
        thisMonth.push(m);
      } else {
        older.push(m);
      }
    });

    return { today, thisWeek, thisMonth, older };
  }, [filteredMeetings]);

  // === SELECTED MEETING OBJECT ===
  const selectedMeeting = useMemo(() => {
    return meetings.find(m => m.id === selectedMeetingId) || null;
  }, [meetings, selectedMeetingId]);

  // === 5. YEAR/MONTH COLLAPSIBLE TREE NAVIGATOR STATE ===
  const [expandedNodes, setExpandedNodes] = useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('minutemind_tree_expanded');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      [`year-${new Date().getFullYear()}`]: true
    };
  });

  useEffect(() => {
    localStorage.setItem('minutemind_tree_expanded', JSON.stringify(expandedNodes));
  }, [expandedNodes]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }, []);

  const handleMonthClick = useCallback((year: number, monthIndex: number) => {
    const filterVal = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    setSelectedMonthFilter(prev => prev === filterVal ? null : filterVal);
  }, []);

  const treeData = useMemo(() => {
    const yearsMap: { [key: number]: any } = {};
    meetings.forEach(m => {
      if (!m.date) return;
      // To bypass timezone issues, parse correctly
      const dateParts = m.date.split('-');
      const year = parseInt(dateParts[0], 10);
      const monthIndex = parseInt(dateParts[1], 10) - 1; // 0-indexed
      
      const dateObj = new Date(year, monthIndex, 1);
      
      if (!yearsMap[year]) {
        yearsMap[year] = {
          year,
          months: {}
        };
      }
      
      if (!yearsMap[year].months[monthIndex]) {
        const monthLabel = dateObj.toLocaleString('default', { month: 'long' });
        yearsMap[year].months[monthIndex] = {
          monthIndex,
          monthLabel,
          meetings: []
        };
      }
      
      yearsMap[year].months[monthIndex].meetings.push(m);
    });

    const yearsList = Object.values(yearsMap).sort((a: any, b: any) => b.year - a.year);
    yearsList.forEach((y: any) => {
      const sortedMonths = Object.values(y.months).sort((a: any, b: any) => b.monthIndex - a.monthIndex);
      sortedMonths.forEach((mo: any) => {
        mo.meetings.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });
      y.monthsList = sortedMonths;
    });

    return yearsList;
  }, [meetings]);

  // === 6. ATTEENDEES FORM HANDLERS ===
  const handleAddAttendee = () => {
    if (!newAttendeeName.trim()) return;
    setAttendeesList(prev => [...prev, {
      name: newAttendeeName.trim(),
      role: newAttendeeRole.trim() || 'Attendee'
    }]);
    setNewAttendeeName('');
    setNewAttendeeRole('');
    showToast('Attendee added successfully');
  };

  const handleRemoveAttendee = (idx: number) => {
    setAttendeesList(prev => prev.filter((_, i) => i !== idx));
  };

  // === 7. AI MEETING ANALYSIS TRIGGER ===
  const handleAnalyzeWithAI = async () => {
    if (!formRawMinutes.trim()) {
      showToast('Please insert raw minutes to analyse.', 'warn');
      return;
    }
    setIsAiAnalyzing(true);
    setAiError(null);
    try {
      const data = await analyzeMeetingMinutes(formRawMinutes, { 
        company: formCompany, 
        category: formCategory,
        attachments: formAttachments
      });
      
      setTempAiSummary(data.summary || '');
      setTempKeyDecisions(data.keyDecisions || []);
      setTempAttachmentInsights(data.attachmentInsights || []);
      
      // Map JSON items to full action items statuses
      const items = (data.actionItems || []).map((i: any) => ({
        task: i.task || '',
        owner: i.owner || '',
        dueDate: i.dueDate || '',
        status: 'pending' as const
      }));
      setTempActionItems(items);
      setTempSentiment(data.sentiment || 'neutral');
      setTempFollowUpDate(data.followUpDate || null);
      
      showToast('AI analysis complete successfully! ✓');
    } catch (err: any) {
      console.error(err);
      setAiError('Failed to analyze using Gemini. The model could be busy or rate-limited.');
      showToast('Gemini connection failed.', 'warn');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  // === 8. INLINE EDITING OF EXTRACED ACTION ITEMS ===
  const handleTempActionItemChange = (idx: number, field: keyof ActionItem, value: string) => {
    setTempActionItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleRemoveTempActionItem = (idx: number) => {
    setTempActionItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddTempActionItem = () => {
    setTempActionItems(prev => [...prev, {
      task: 'New Task',
      owner: 'Assignee',
      dueDate: new Date().toISOString().split('T')[0],
      status: 'pending'
    }]);
  };

  // === 9. SAVE MEETING RECORD (CREATE / UPDATE) ===
  const handleSaveMeeting = () => {
    if (!formTitle.trim()) {
      showToast('Meeting title is required!', 'warn');
      return;
    }
    if (!formDate) {
      showToast('Meeting date is required!', 'warn');
      return;
    }

    const tagsArr = formTags.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const targetId = drawerMode === 'create' ? Math.random().toString(36).substr(2, 9) : formId;

    const existingMatch = meetings.find(m => m.id === targetId);

    const mergedMeeting: Meeting = {
      id: targetId,
      title: formTitle.trim(),
      date: formDate,
      time: formTime || '12:00',
      duration: Number(formDuration) || 30,
      category: formCategory,
      company: formCompany,
      attendees: attendeesList,
      rawMinutes: formRawMinutes,
      aiSummary: tempAiSummary || existingMatch?.aiSummary || undefined,
      keyDecisions: tempKeyDecisions.length > 0 ? tempKeyDecisions : existingMatch?.keyDecisions || undefined,
      actionItems: tempActionItems.length > 0 ? tempActionItems : existingMatch?.actionItems || undefined,
      sentiment: tempSentiment || existingMatch?.sentiment || undefined,
      followUpDate: tempFollowUpDate || existingMatch?.followUpDate || undefined,
      tags: tagsArr,
      createdAt: existingMatch?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: formAttachments,
      attachmentInsights: tempAttachmentInsights.length > 0 ? tempAttachmentInsights : existingMatch?.attachmentInsights || undefined
    };

    let updatedMeetingsList: Meeting[] = [];
    if (drawerMode === 'create') {
      updatedMeetingsList = [mergedMeeting, ...meetings];
    } else {
      updatedMeetingsList = meetings.map(m => m.id === targetId ? mergedMeeting : m);
    }

    // CHECK STORAGE SAFEGUARD (4.5 MB)
    try {
      const estimatedBytes = JSON.stringify(updatedMeetingsList).length;
      if (estimatedBytes > 4.5 * 1024 * 1024) {
        showToast('Storage limit reached. Please delete some attachments before adding new ones.', 'warn');
        return;
      }
    } catch (err) {
      console.error(err);
    }

    if (drawerMode === 'create') {
      showToast('Meeting saved successfully! ✓');
    } else {
      showToast('Meeting updated successfully! ✓');
    }

    setMeetings(updatedMeetingsList);
    saveToLocalStorage(updatedMeetingsList);
    setSelectedMeetingId(targetId);
    setIsDrawerOpen(false);
  };

  // Open creation drawer
  const openCreateDrawer = () => {
    setDrawerMode('create');
    setFormId('');
    setFormTitle('New Operational Review');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime('11:00');
    setFormDuration(30);
    setFormCategory('SOR');
    setFormCompany('Company Wide');
    setFormRawMinutes('');
    setFormTags('alignment, review');
    setAttendeesList([]);
    
    // Clear AI analysis panels
    setTempAiSummary('');
    setTempKeyDecisions([]);
    setTempActionItems([]);
    setTempSentiment('neutral');
    setTempFollowUpDate(null);
    setAiError(null);
    setFormAttachments([]);
    setTempAttachmentInsights([]);

    setIsDrawerOpen(true);
  };

  // Open edit drawer
  const openEditDrawer = (item: Meeting) => {
    setDrawerMode('edit');
    setFormId(item.id);
    setFormTitle(item.title);
    setFormDate(item.date);
    setFormTime(item.time);
    setFormDuration(item.duration);
    setFormCategory(item.category);
    setFormCompany(item.company || 'Company Wide');
    setFormRawMinutes(item.rawMinutes);
    setFormTags(item.tags.join(', '));
    setAttendeesList(item.attendees || []);

    // Load existing pre-extracted AI values for modifying
    setTempAiSummary(item.aiSummary || '');
    setTempKeyDecisions(item.keyDecisions || []);
    setTempActionItems(item.actionItems || []);
    setTempSentiment(item.sentiment || 'neutral');
    setTempFollowUpDate(item.followUpDate || null);
    setAiError(null);
    setFormAttachments(item.attachments || []);
    setTempAttachmentInsights(item.attachmentInsights || []);

    setIsDrawerOpen(true);
  };

  // Delete handler
  const handleDeleteMeeting = (id: string) => {
    setMeetingToDelete(id);
  };

  const confirmDeleteMeeting = () => {
    if (!meetingToDelete) return;
    const list = meetings.filter(m => m.id !== meetingToDelete);
    setMeetings(list);
    saveToLocalStorage(list);
    showToast('Meeting deleted successfully.', 'info');
    if (selectedMeetingId === meetingToDelete) {
      setSelectedMeetingId(null);
    }
    setMeetingToDelete(null);
  };

  // === 10. TOGGLE ACTION ITEMS STATUS DIRECT CHECKLIST ===
  const handleToggleActionStatus = (meetingId: string, itemIdx: number) => {
    const list = meetings.map(m => {
      if (m.id === meetingId && m.actionItems) {
        const updatedActions = m.actionItems.map((item, idx) => {
          if (idx === itemIdx) {
            const nextStatus = item.status === 'pending' ? 'done' as const : 'pending' as const;
            return { ...item, status: nextStatus };
          }
          return item;
        });
        return { ...m, actionItems: updatedActions, updatedAt: new Date().toISOString() };
      }
      return m;
    });

    setMeetings(list);
    saveToLocalStorage(list);
    showToast('Task status updated');
  };

  // === 11. NATURAL LANGUAGE MEETING ASK ===
  const handleNLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setIsAnswering(true);
    setNlAnswer(null);
    try {
      const response = await askAboutMeetings(nlQuery, meetings);
      setNlAnswer(response);
      showToast('AI response complete');
    } catch (err) {
      console.error(err);
      setNlAnswer("Sorry, I had trouble analyzing your meetings dataset inside Gemini. Please try again.");
    } finally {
      setIsAnswering(false);
    }
  };

  // === 12. EXPORT COMPILER ===
  const handleExportSummary = (item: Meeting) => {
    const attendeesListStr = item.attendees?.map(a => `- ${a.name} (${a.role})`).join('\n') || 'None listed';
    const actionListStr = item.actionItems?.map(a => `- [${a.status === 'done' ? 'x' : ' '}] ${a.task} [Owner: ${a.owner}] [Due: ${a.dueDate}]`).join('\n') || 'None extracted';
    const decisionsStr = item.keyDecisions?.map(d => `- ${d}`).join('\n') || 'None extracted';

    const report = `# ${item.title}
Date: ${item.date} | Time: ${item.time} | Duration: ${item.duration} minutes
Category: ${item.category.toUpperCase()} | Sentiment: ${item.sentiment?.toUpperCase() || 'NEUTRAL'}

## Attendees
${attendeesListStr}

## Executive Summary (AI Generated)
${item.aiSummary || 'No summary extracted.'}

## Key Decisions
${decisionsStr}

## Action Items Checklist
${actionListStr}

## Raw Meeting Minutes Text
\`\`\`
${item.rawMinutes}
\`\`\`

Generated via MinuteMind AI on ${new Date().toLocaleDateString()}
`;

    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${item.title.replace(/\s+/g, "_")}_meeting_report.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Summary report download initiated ✓');
  };

  // === SMART BRIEFING COMPILER ===
  const handleGenerateBriefing = async (currentMeeting: Meeting) => {
    setBriefingModalOpen(true);
    setBriefingLoading(true);
    setBriefingError(null);
    setBriefingContent('');

    try {
      const matching = meetings.filter(
        m => m.id !== currentMeeting.id && 
             m.category === currentMeeting.category && 
             m.company === currentMeeting.company
      );

      matching.sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return b.time.localeCompare(a.time);
      });

      const currentDateTime = `${currentMeeting.date}T${currentMeeting.time}`;
      const previousMeeting = matching.find(m => {
        const valStr = `${m.date}T${m.time}`;
        return valStr < currentDateTime;
      }) || matching[0];

      if (!previousMeeting) {
        setBriefingError('No previous meeting of the same category and company was found in records. To generate a smart briefing, please ensure there is at least one other meeting of the same type and company.');
        setBriefingLoading(false);
        return;
      }

      const htmlContent = await generateSmartBriefing(currentMeeting.category, previousMeeting);
      setBriefingContent(htmlContent);
    } catch (err: any) {
      console.error("Smart briefing failure:", err);
      setBriefingError(err?.message || 'Failed to generate briefing. Please check your network and Gemini API integration settings.');
    } finally {
      setBriefingLoading(false);
    }
  };

  // === FRICTIONLESS PUBLISH HANDLERS ===
  const handleOpenPublishModal = async (meeting: Meeting) => {
    setPublishModalOpen(true);
    setPublishActiveTab('email');
    setPublishLoading(true);
    setPublishEmailHtml('');
    setPublishCopied(false);

    try {
      const emailResult = await generateEmailSummary(meeting);
      setPublishEmailHtml(emailResult);
    } catch (err: any) {
      console.error("Publish summary error:", err);
      setPublishEmailHtml(`<div style="padding: 20px; text-align: center; color: #ef4444; font-weight: bold;">
        Failed to generate Stakeholder Email Summary. Please verify your internet connection and Gemini API secret token.
      </div>`);
    } finally {
      setPublishLoading(false);
    }
  };

  // === CORPORATE MEMORY DISPATCHER ===
  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = chatInput.trim();
    if (!query || isChatLoading) return;

    setChatInput('');
    setChatError(null);
    
    const userMsg = {
      id: 'msg-' + Date.now(),
      role: 'user' as const,
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      const history = chatMessages.map(m => ({
        role: m.role,
        text: m.text
      }));

      const answer = await askCorporateMemory(query, meetings, history);

      const modelMsg = {
        id: 'msg-' + (Date.now() + 1),
        role: 'model' as const,
        text: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => [...prev, modelMsg]);
    } catch (err: any) {
      console.error("Chat memory error:", err);
      setChatError('Error connecting to Corporate Memory storage. Please verify that your Gemini API key in Secrets is configured correctly.');
    } finally {
      setIsChatLoading(false);
    }
  };


  // === ATTACHMENT SYSTEM ===
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const getFileType = (fileName: string): 'pdf' | 'excel' | 'word' | 'powerpoint' | 'other' => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'xlsx' || ext === 'xls') return 'excel';
    if (ext === 'docx' || ext === 'doc') return 'word';
    if (ext === 'pptx' || ext === 'ppt') return 'powerpoint';
    return 'other';
  };

  const handleUploadFiles = (files: FileList) => {
    const allowedExtensions = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt'];
    Array.from(files).forEach(file => {
      // Validate extension
      const fileNameLower = file.name.toLowerCase();
      const hasAllowedExt = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
      if (!hasAllowedExt) {
        showToast(`${file.name} is not a supported file type.`, 'warn');
        return;
      }

      // Limit to 10MB
      if (file.size > 10 * 1024 * 1024) {
        showToast(`${file.name} is too large. Maximum size is 10MB.`, 'warn');
        return;
      }

      const fileId = Math.random().toString(36).substr(2, 9);
      setUploadProgress(prev => ({ ...prev, [fileId]: 10 }));

      const reader = new FileReader();

      let progressVal = 10;
      const progressInterval = setInterval(() => {
        progressVal += 15;
        if (progressVal >= 90) {
          clearInterval(progressInterval);
        } else {
          setUploadProgress(prev => ({ ...prev, [fileId]: Math.min(progressVal, 90) }));
        }
      }, 80);

      reader.onload = (e) => {
        clearInterval(progressInterval);
        setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));

        const base64Data = e.target?.result as string;
        const fileType = getFileType(file.name);

        const newAttachment: Attachment = {
          id: fileId,
          fileName: file.name,
          fileType,
          base64Data,
          fileSize: Math.round((file.size / 1024) * 10) / 10,
          uploadedAt: new Date().toISOString().split('T')[0],
          generalNote: '',
          slides: fileType === 'powerpoint' ? Array.from({ length: 10 }, (_, i) => ({
            slideNumber: i + 1,
            slideLabel: `Slide ${i + 1}`,
            note: ''
          })) : undefined
        };

        setFormAttachments(prev => [...prev, newAttachment]);

        setTimeout(() => {
          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
          });
        }, 800);
      };

      reader.onerror = () => {
        clearInterval(progressInterval);
        showToast(`Failed to read file ${file.name}`, 'warn');
        setUploadProgress(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      };

      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setFormAttachments(prev => prev.filter(att => att.id !== id));
    showToast('Attachment removed successfully ✓');
  };

  const handleUpdateSlideLabel = (attachmentId: string, idx: number, label: string) => {
    setFormAttachments(prev => prev.map(att => {
      if (att.id === attachmentId) {
        const slides = [...(att.slides || [])];
        if (slides[idx]) {
          slides[idx] = { ...slides[idx], slideLabel: label };
        }
        return { ...att, slides };
      }
      return att;
    }));
  };

  const handleUpdateSlideNote = (attachmentId: string, idx: number, note: string) => {
    setFormAttachments(prev => prev.map(att => {
      if (att.id === attachmentId) {
        const slides = [...(att.slides || [])];
        if (slides[idx]) {
          slides[idx] = { ...slides[idx], note };
        }
        return { ...att, slides };
      }
      return att;
    }));
  };

  const handleAddSlide = (attachmentId: string) => {
    setFormAttachments(prev => prev.map(att => {
      if (att.id === attachmentId) {
        const slides = [...(att.slides || [])];
        const nextNum = slides.length + 1;
        slides.push({
          slideNumber: nextNum,
          slideLabel: `Slide ${nextNum}`,
          note: ''
        });
        return { ...att, slides };
      }
      return att;
    }));
  };

  const handleRemoveSlide = (attachmentId: string, idx: number) => {
    setFormAttachments(prev => prev.map(att => {
      if (att.id === attachmentId) {
        const slides = (att.slides || []).filter((_, i) => i !== idx).map((s, i) => ({
          ...s,
          slideNumber: i + 1
        }));
        return { ...att, slides };
      }
      return att;
    }));
  };

  const handleUpdateAttachmentGeneralNote = (id: string, note: string) => {
    setFormAttachments(prev => prev.map(att => {
      if (att.id === id) {
        return { ...att, generalNote: note };
      }
      return att;
    }));
  };

  const handleDownloadAttachment = (att: Attachment) => {
    try {
      const link = document.createElement('a');
      link.href = att.base64Data;
      link.download = att.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Downloading: ${att.fileName} ✓`);
    } catch (err) {
      console.error(err);
      showToast('Download failed.', 'warn');
    }
  };

  const getStorageEstimateBytes = () => {
    const tagsArr = formTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const targetId = drawerMode === 'create' ? 'temp-id' : formId;
    const targetMeeting: Meeting = {
      id: targetId,
      title: formTitle,
      date: formDate,
      time: formTime || '12:00',
      duration: Number(formDuration) || 30,
      category: formCategory,
      company: formCompany,
      attendees: attendeesList,
      rawMinutes: formRawMinutes,
      aiSummary: tempAiSummary || undefined,
      keyDecisions: tempKeyDecisions.length > 0 ? tempKeyDecisions : undefined,
      actionItems: tempActionItems.length > 0 ? tempActionItems : undefined,
      sentiment: tempSentiment || undefined,
      followUpDate: tempFollowUpDate || undefined,
      tags: tagsArr,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: formAttachments,
      attachmentInsights: tempAttachmentInsights
    };

    const simulatedList = drawerMode === 'create' 
      ? [targetMeeting, ...meetings] 
      : meetings.map(m => m.id === formId ? targetMeeting : m);

    try {
      return JSON.stringify(simulatedList).length;
    } catch (err) {
      return 0;
    }
  };

  const handleOpenPreview = (att: Attachment) => {
    setPreviewAttachmentName(att.fileName);
    setPreviewBase64(att.base64Data);
    setPreviewFileType(att.fileType);
    setPreviewModalOpen(true);
  };


  // Reset Calendar filter
  const resetCalendarFilter = () => {
    setSelectedCalendarFilterDate(null);
  };

  // Helper string text match highlighter 
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase()
            ? <mark key={i} className="bg-[#6c63ff]/40 text-white rounded-sm px-0.5">{part}</mark>
            : part
        )}
      </>
    );
  };

  // Filter lists details
  const filteredActionItems = useMemo(() => {
    if (!selectedMeeting?.actionItems) return [];
    return selectedMeeting.actionItems.filter(item => {
      if (actionItemFilter === 'all') return true;
      return item.status === actionItemFilter;
    });
  }, [selectedMeeting, actionItemFilter]);

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f3f4f6] font-sans flex flex-col relative overflow-hidden">
      
      {/* Toast Overlay stack */}
      <div className="fixed top-6 right-6 z-50 space-y-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={cn(
                "p-4 rounded-xl shadow-xl flex items-center gap-3 w-80 border font-medium text-sm text-white",
                toast.type === 'success' ? 'bg-[#151d38] border-emerald-500/20 text-emerald-300' :
                toast.type === 'warn' ? 'bg-[#2a1b18] border-amber-500/20 text-amber-300' :
                'bg-gray-900 border-gray-800'
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              )}>
                ✓
              </div>
              <p className="flex-1 text-xs">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* === SIDEBARNAV === */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              className="w-64 border-r border-gray-800 bg-[#161a24] flex flex-col z-30 shrink-0 relative"
            >
              <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#6c63ff] flex items-center justify-center text-white shadow-lg shadow-[#6c63ff]/30">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-extrabold text-white text-base tracking-tight block">MinuteMind</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-[-2px] block">AI Organizer</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)} 
                  className="p-1 px-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sidebar Menu Options */}
              <div className="p-4 space-y-1 flex-1">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-all font-semibold flex items-center justify-between",
                    activeTab === 'dashboard' 
                      ? "bg-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/20" 
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <LayoutDashboard className="w-5 h-5" />
                    <span>Dashboard</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setActiveTab('analytics')}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-all font-semibold flex items-center justify-between",
                    activeTab === 'analytics' 
                      ? "bg-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/20" 
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5" />
                    <span>Statistics Panel</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab('corporate-memory');
                    setSelectedMeetingId(null);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-all font-semibold flex items-center justify-between",
                    activeTab === 'corporate-memory' 
                      ? "bg-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/20" 
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <span>Corporate Memory</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Separator */}
                <div className="my-6 border-t border-gray-800" />

                {/* Tree Navigator heading */}
                <div className="flex items-center justify-between px-3 mb-2">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Time Tree</h4>
                  {selectedMonthFilter && (
                    <button 
                      onClick={() => setSelectedMonthFilter(null)} 
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>

                {/* Tree Body Box */}
                <div className="bg-[#11131a] border border-gray-800 rounded-2xl p-2.5 max-h-[380px] overflow-y-auto custom-scrollbar space-y-1.5 scroll-smooth">
                  {treeData.length === 0 ? (
                    <p className="text-gray-500 text-center py-4 text-xs">No meetings recorded</p>
                  ) : (
                    treeData.map((yearNode) => {
                      const yearId = `year-${yearNode.year}`;
                      const isYearExpanded = !!expandedNodes[yearId];

                      return (
                        <div key={yearNode.year} className="space-y-1">
                          {/* Year Trigger */}
                          <button
                            onClick={() => toggleNode(yearId)}
                            className="w-full flex items-center justify-between p-1 hover:bg-slate-800/60 rounded text-gray-300 font-bold text-xs"
                          >
                            <span className="flex items-center gap-1">
                              {isYearExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                              )}
                              <span>{yearNode.year}</span>
                            </span>
                          </button>

                          {/* Months List (Collapsible Wrapper with smooth Transition) */}
                          <div
                            style={{
                              maxHeight: isYearExpanded ? '999px' : '0px',
                              opacity: isYearExpanded ? 1 : 0
                            }}
                            className="overflow-hidden transition-all duration-300 pl-2 space-y-1"
                          >
                            {yearNode.monthsList.map((monthNode: any) => {
                              const monthKey = `${yearNode.year}-${String(monthNode.monthIndex + 1).padStart(2, '0')}`;
                              const monthNodeId = `month-${monthKey}`;
                              const isMonthExpanded = !!expandedNodes[monthNodeId];
                              const isMonthFiltered = selectedMonthFilter === monthKey;

                              return (
                                <div key={monthNode.monthIndex} className="space-y-0.5">
                                  {/* Month Trigger Row */}
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      onClick={() => toggleNode(monthNodeId)}
                                      className="p-0.5 hover:bg-slate-800 text-gray-500 rounded shrink-0"
                                      title="Toggle meetings"
                                    >
                                      {isMonthExpanded ? (
                                        <ChevronDown className="w-3 h-3 text-indigo-400" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-gray-500" />
                                      )}
                                    </button>

                                    <button
                                      onClick={() => handleMonthClick(yearNode.year, monthNode.monthIndex)}
                                      className={cn(
                                        "flex-1 flex items-center justify-between py-1 px-1.5 rounded text-left transition-all text-xs",
                                        isMonthFiltered 
                                          ? "bg-[#6c63ff]/20 text-white font-semibold border border-[#6c63ff]/30"
                                          : "text-gray-400 hover:text-white"
                                      )}
                                    >
                                      <span className="truncate">{monthNode.monthLabel}</span>
                                      <span className="text-[9px] font-bold bg-slate-800 text-gray-400 py-0.5 px-1 rounded-full shrink-0">
                                        {monthNode.meetings.length}
                                      </span>
                                    </button>
                                  </div>

                                  {/* Meetings Leaf Inner Nodes */}
                                  <div
                                    style={{
                                      maxHeight: isMonthExpanded ? '800px' : '0px',
                                      opacity: isMonthExpanded ? 1 : 0
                                    }}
                                    className="overflow-hidden transition-all duration-300 pl-3 space-y-0.5"
                                  >
                                    {monthNode.meetings.map((meeting: any) => {
                                      const isLeafSelected = selectedMeetingId === meeting.id;
                                      const badg = CATEGORY_COLORS[meeting.category as Meeting['category']] || CATEGORY_COLORS.SOR;

                                      return (
                                        <button
                                          key={meeting.id}
                                          onClick={() => {
                                            setSelectedMeetingId(meeting.id);
                                          }}
                                          className={cn(
                                            "w-full flex flex-col gap-0.5 p-1 rounded text-left transition-all border border-transparent",
                                            isLeafSelected
                                              ? "bg-[#6c63ff] text-white font-medium shadow-sm shadow-[#6c63ff]/30"
                                              : "text-gray-400 hover:text-white hover:bg-slate-800/40"
                                          )}
                                        >
                                          <span className="text-[10px] truncate leading-tight font-medium">
                                            {meeting.title}
                                          </span>
                                          <span className={cn(
                                            "text-[8px] px-1 py-px rounded self-start font-bold uppercase tracking-wider",
                                            isLeafSelected ? "bg-white/20 text-white" : badg.bg
                                          )}>
                                            {meeting.category}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Developer Attribution Signature inside Sidebar */}
              <div className="p-4 border-t border-gray-800 bg-[#11131a]/40 text-center text-xs text-gray-500 self-stretch">
                <div>User Inbox</div>
                <div className="font-mono text-[10px] text-indigo-400 truncate mt-0.5">docshahraiz@gmail.com</div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* === MAIN CONTAINER === */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          
          {/* Top Banner / Menu bar */}
          <header className="h-16 border-b border-gray-800 bg-[#161a24] flex items-center justify-between px-6 z-10 shrink-0">
            <div className="flex items-center gap-4">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 bg-[#1a1d27] border border-gray-800 hover:bg-slate-800 text-gray-200 rounded-xl"
                >
                  <Menu className="w-5 h-5 animate-pulse" />
                </button>
              )}
              <h1 className="text-lg font-bold tracking-tight text-white hidden sm:block">
                {activeTab === 'dashboard' ? 'MinuteMind Workspace' : activeTab === 'corporate-memory' ? 'Corporate Memory Database' : 'Analytics Trend dashboard'}
              </h1>
            </div>

            {/* Quick Actions indicators */}
            <div className="flex items-center gap-3">
              <button 
                onClick={openCreateDrawer}
                className="bg-[#6c63ff] hover:bg-[#574feb] text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-[#6c63ff]/20 flex items-center gap-2 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Meeting</span>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' ? (
                <motion.div
                  key="dash"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 max-w-7xl mx-auto"
                >
                  {/* NL query ask block (Section 9) */}
                  <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-80 h-32 bg-[#6c63ff]/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                        <Bot className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-base text-white">Ask your Meetings Assistant</h3>
                    </div>
                    <form onSubmit={handleNLSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={nlQuery}
                        onChange={(e) => setNlQuery(e.target.value)}
                        placeholder="e.g. 'Summarise the planning decisions' or 'Any actions for Alex?'"
                        className="flex-1 bg-[#11131a] border border-gray-800 rounded-xl px-4 py-3 text-sm text-[#f3f4f6] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                      />
                      <button
                        type="submit"
                        disabled={isAnswering || !nlQuery.trim()}
                        className="bg-[#6c63ff] hover:bg-[#574feb] disabled:opacity-50 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                      >
                        {isAnswering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>Ask</span>
                      </button>
                    </form>

                    {/* NL Result display */}
                    <AnimatePresence>
                      {nlAnswer && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 border-t border-gray-800/80 pt-4"
                        >
                          <div className="bg-[#11131a] border border-indigo-500/10 p-4 rounded-xl relative">
                            <button 
                              onClick={() => setNlAnswer(null)} 
                              className="absolute top-3 right-3 text-gray-500 hover:text-white"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider block mb-2">AISearch Result</span>
                            <div className="text-sm prose prose-invert max-w-none prose-p:leading-relaxed text-gray-300">
                              <ReactMarkdown>{nlAnswer}</ReactMarkdown>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Top KPIs bar */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Total Meetings</span>
                        <p className="text-2xl font-bold text-white mt-0.5">{kpis.total}</p>
                      </div>
                    </div>
                    <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">This Week</span>
                        <p className="text-2xl font-bold text-white mt-0.5">{kpis.thisWeekCount}</p>
                      </div>
                    </div>
                    <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                        <CheckSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Pending Action Items</span>
                        <p className="text-2xl font-bold text-white mt-0.5">{kpis.pendingActions}</p>
                      </div>
                    </div>
                    <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Avg Duration</span>
                        <p className="text-2xl font-bold text-white mt-0.5">{kpis.avg}m</p>
                      </div>
                    </div>
                  </div>

                  {/* SEARCH & FILTERS CONTROLS (Always visible section 5) */}
                  <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-5 space-y-4 shadow-md">
                    <div className="flex flex-col md:flex-row gap-3">
                      {/* Search */}
                      <div className="flex-1 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search title, minutes, keywords, attendee name..."
                          className="w-full bg-[#11131a] border border-gray-800 rounded-xl pl-11 pr-4 py-2.5 text-sm placeholder-gray-500 text-white focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                        />
                      </div>
                      
                      {/* Filter category */}
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                      >
                        <option value="all">All Categories</option>
                        <option value="SOR">SOR — Short-term Operational</option>
                        <option value="POR">POR — Project Operational</option>
                        <option value="MOR">MOR — Monthly Operational</option>
                      </select>

                      {/* Filter company */}
                      <select
                        value={companyFilter}
                        onChange={(e) => setCompanyFilter(e.target.value)}
                        className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                      >
                        <option value="all">All Companies</option>
                        <option value="Company Wide">Company Wide</option>
                        <option value="Corrugated">Corrugated</option>
                        <option value="Paper & Board">Paper & Board</option>
                      </select>

                      {/* Filter date preset */}
                      <select
                        value={dateRangeFilter}
                        onChange={(e) => setDateRangeFilter(e.target.value as any)}
                        className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                      >
                        <option value="all">Any Date</option>
                        <option value="week">Created This Week</option>
                        <option value="month">Created This Month</option>
                        <option value="custom">Custom Date Range</option>
                      </select>

                      {/* Filter sentiment */}
                      <select
                        value={sentimentFilter}
                        onChange={(e) => setSentimentFilter(e.target.value as any)}
                        className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#6c63ff]"
                      >
                        <option value="all">Any Sentiment</option>
                        <option value="positive">Positive</option>
                        <option value="neutral">Neutral</option>
                        <option value="concerning">Concerning</option>
                      </select>
                    </div>

                    {/* Custom range date inputs if custom dates */}
                    {dateRangeFilter === 'custom' && (
                      <div className="flex items-center gap-3 animate-slide-in">
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-3 py-2 text-xs"
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-3 py-2 text-xs"
                        />
                      </div>
                    )}

                    {/* Bottom row badges controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setPendingActionsFilter(!pendingActionsFilter)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg py-1 px-3 border text-xs transition-all",
                            pendingActionsFilter 
                              ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                              : "border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800"
                          )}
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>Has Pending Action Items Only</span>
                        </button>

                        {selectedCalendarFilterDate && (
                          <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-lg flex items-center gap-2">
                            <span>Filtered to Date: {selectedCalendarFilterDate}</span>
                            <button onClick={resetCalendarFilter} className="text-gray-400 hover:text-white">
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Active filter count indicator */}
                      <span className="text-xs text-gray-500 font-medium">
                        Showing {filteredMeetings.length} of {meetings.length} meetings
                      </span>
                    </div>
                  </div>

                  {/* TWO COLUMN GRID: Left column Timeline. Right column Details View */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                    
                    {/* TIMELINE LIST VIEW CARD LIST (Section 2) */}
                    <div className="xl:col-span-5 space-y-6">
                      
                      {/* Empty state conditional */}
                      {filteredMeetings.length === 0 ? (
                        <div className="bg-[#1a1d27] border border-gray-800 rounded-2xl p-12 text-center shadow-lg">
                          <div className="w-16 h-16 rounded-full bg-[#6c63ff]/10 flex items-center justify-center mx-auto mb-4 text-[#6c63ff]">
                            <Briefcase className="w-8 h-8" />
                          </div>
                          <h3 className="text-lg font-bold text-white mb-2">No meeting records align</h3>
                          <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">
                            No meetings correspond to your search or filters. Reset filters or create a new Alignment record.
                          </p>
                          <button 
                            onClick={openCreateDrawer}
                            className="bg-[#6c63ff] hover:bg-[#574feb] text-white px-5 py-2.5 rounded-xl text-xs font-semibold"
                          >
                            Add New Alignment
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          
                          {/* Timeline buckets renderer */}
                          {[
                            { title: 'Today', items: groupedMeetings.today },
                            { title: 'This Week', items: groupedMeetings.thisWeek },
                            { title: 'This Month', items: groupedMeetings.thisMonth },
                            { title: 'Older', items: groupedMeetings.older },
                          ].map((bucket, bIdx) => {
                            if (bucket.items.length === 0) return null;
                            return (
                              <div key={bIdx} className="space-y-3">
                                <h4 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest pl-2">
                                  {bucket.title} ({bucket.items.length})
                                </h4>
                                <div className="space-y-3">
                                  {bucket.items.map(item => {
                                    const isSel = item.id === selectedMeetingId;
                                    const cat = CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] || CATEGORY_COLORS.SOR;
                                    const pendingActions = item.actionItems?.filter(i => i.status === 'pending').length || 0;
                                    
                                    return (
                                      <div
                                        key={item.id}
                                        onClick={() => {
                                          setSelectedMeetingId(item.id);
                                          setDetailTab('overview');
                                        }}
                                        className={cn(
                                          "bg-[#1a1d27] border rounded-2xl p-5 hover:border-gray-700 cursor-pointer shadow-sm transition-all group hover:-translate-y-0.5",
                                          isSel ? "border-[#6c63ff] ring-1 ring-[#6c63ff]/20 bg-[#1e2230]" : "border-gray-800"
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider", cat.bg)} title={cat.label}>
                                                {item.category}
                                              </span>
                                              <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider", COMPANY_COLORS[(item.company || 'Company Wide') as keyof typeof COMPANY_COLORS]?.bg || 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>
                                                {item.company || 'Company Wide'}
                                              </span>
                                              {item.sentiment && (
                                                <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider", SENTIMENT_COLORS[item.sentiment].bg)}>
                                                  {item.sentiment}
                                                </span>
                                              )}
                                            </div>
                                            <h3 className="font-bold text-base text-white group-hover:text-indigo-300 transition-colors mt-1.5">
                                              {highlightText(item.title, searchQuery)}
                                            </h3>
                                          </div>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openEditDrawer(item);
                                              }}
                                              className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg"
                                            >
                                              <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteMeeting(item.id);
                                              }}
                                              className="p-1.5 hover:bg-rose-950/20 text-gray-400 hover:text-rose-400 rounded-lg"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>

                                        <p className="text-xs text-gray-400 leading-relaxed mt-3 line-clamp-2">
                                          {item.aiSummary 
                                            ? highlightText(item.aiSummary, searchQuery) 
                                            : highlightText(item.rawMinutes, searchQuery)}
                                        </p>

                                        {/* Meeting meta footers */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800/60 pt-3 mt-3">
                                          <div className="flex items-center gap-3 text-xs text-gray-500 font-semibold">
                                            <span className="flex items-center gap-1 truncate">
                                              <Calendar className="w-3.5 h-3.5" />
                                              {item.date}
                                            </span>
                                            <span className="flex items-center gap-1.5 shrink-0">
                                              <Clock className="w-3.5 h-3.5" />
                                              {item.duration}m
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase">
                                            <span className="bg-gray-800 px-2 py-0.5 rounded border border-gray-700/50">
                                              {item.attendees?.length || 0} Att
                                            </span>
                                            {pendingActions > 0 && (
                                              <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">
                                                {pendingActions} pending Task{pendingActions !== 1 && 's'}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* MEETING DETAIL FULL CARD VIEW (Section 4) */}
                    <div className="xl:col-span-7">
                      <AnimatePresence mode="wait">
                        {selectedMeeting ? (
                          <motion.div
                            key={selectedMeeting.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-[#1a1d27] border border-gray-800 rounded-3xl p-6 shadow-xl space-y-6"
                          >
                            {/* Detail header */}
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-gray-800 pb-5">
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn("text-[10px] font-bold uppercase px-2 shadow-xs py-0.5 border rounded opacity-90", CATEGORY_COLORS[selectedMeeting.category as keyof typeof CATEGORY_COLORS]?.bg)}>
                                    Category: {selectedMeeting.category}
                                  </span>
                                  <span className={cn("text-[10px] font-bold uppercase px-2 shadow-xs py-0.5 border rounded opacity-90", COMPANY_COLORS[(selectedMeeting.company || 'Company Wide') as keyof typeof COMPANY_COLORS]?.bg || 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>
                                    Company: {selectedMeeting.company || 'Company Wide'}
                                  </span>
                                  {selectedMeeting.sentiment && (
                                    <span className={cn("text-[10px] font-bold uppercase px-2 shadow-xs py-0.5 border rounded opacity-90", SENTIMENT_COLORS[selectedMeeting.sentiment].bg)}>
                                      Sentiment: {selectedMeeting.sentiment}
                                    </span>
                                  )}
                                  {selectedMeeting.followUpDate && (
                                    <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-bold uppercase px-2 py-0.5 rounded font-mono">
                                      Follow-up: {selectedMeeting.followUpDate}
                                    </span>
                                  )}
                                </div>
                                <h2 className="text-2xl font-black tracking-tight text-white mt-1">
                                  {selectedMeeting.title}
                                </h2>
                                
                                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-gray-500 pt-1">
                                  <span className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                    {selectedMeeting.date} at {selectedMeeting.time}
                                  </span>
                                  <span className="w-1 h-1 bg-gray-700 rounded-full" />
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                    {selectedMeeting.duration} mins
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap sm:flex-col items-end gap-2 w-full sm:w-auto">
                                {(selectedMeeting.category === 'MOR' || selectedMeeting.category === 'SOR') && (
                                  <button
                                    onClick={() => handleGenerateBriefing(selectedMeeting)}
                                    className="w-full sm:w-auto bg-indigo-950/40 border border-[#6c63ff]/30 hover:bg-[#6c63ff]/10 hover:border-[#6c63ff]/60 text-indigo-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                                    <span>Smart Briefing</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenPublishModal(selectedMeeting)}
                                  className="w-full sm:w-auto bg-emerald-950/40 border border-emerald-500/20 hover:bg-emerald-950/70 hover:border-emerald-500/50 text-emerald-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <Send className="w-4 h-4 text-emerald-400" />
                                  <span>Publish & Notify</span>
                                </button>
                                <button
                                  onClick={() => handleExportSummary(selectedMeeting)}
                                  className="w-full sm:w-auto bg-gray-900 border border-gray-800 hover:bg-slate-800 text-gray-300 px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <Download className="w-4 h-4 text-gray-400" />
                                  <span>Export MD Report</span>
                                </button>
                                <button
                                  onClick={() => openEditDrawer(selectedMeeting)}
                                  className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-[#6c63ff] hover:text-[#574feb] px-4 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  <span>Edit Minutes</span>
                                </button>
                              </div>
                            </div>

                            {/* NAVIGATION Tab List */}
                            <div className="flex border-b border-gray-800 justify-start">
                              {[
                                { id: 'overview', label: 'Executive Overview' },
                                { id: 'minutes', label: 'Raw Typed Minutes' },
                                { id: 'actionItems', label: `Action Items (${selectedMeeting.actionItems?.length || 0})` },
                                { id: 'attendees', label: `Attendees (${selectedMeeting.attendees?.length || 0})` },
                                { id: 'attachments', label: `Attachments (${selectedMeeting.attachments?.length || 0})` }
                              ].map(tab => (
                                <button
                                  key={tab.id}
                                  onClick={() => setDetailTab(tab.id as any)}
                                  className={cn(
                                    "px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0",
                                    detailTab === tab.id 
                                      ? "border-[#6c63ff] text-[#6c63ff] font-extrabold" 
                                      : "border-transparent text-gray-500 hover:text-white"
                                  )}
                                >
                                  {tab.label}
                                </button>
                              ))}
                            </div>

                            {/* DETAIL TAB SHELLS */}
                            <div className="min-h-72">
                              
                              {/* OVERVIEW TAB */}
                              {detailTab === 'overview' && (
                                <div className="space-y-5 animate-fade-in">
                                  {/* Summary info */}
                                  <div className="space-y-2">
                                    <h4 className="text-xs uppercase tracking-widest text-[#6c63ff] font-bold">Comprehensive Summary</h4>
                                    <div className="bg-[#11131a] border border-gray-800 rounded-2xl p-5 leading-relaxed text-sm text-gray-300 prose prose-invert">
                                      {selectedMeeting.aiSummary ? (
                                        <p>{selectedMeeting.aiSummary}</p>
                                      ) : (
                                        <div className="text-center py-6">
                                          <p className="text-gray-500 text-xs italic">No AI summaries computed yet.</p>
                                          <button 
                                            onClick={() => openEditDrawer(selectedMeeting)}
                                            className="mt-3 text-[#6c63ff] hover:underline text-xs font-bold inline-flex items-center gap-1"
                                          >
                                            <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Configure with AI Assistant Drawer
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Decisions list summary */}
                                  <div className="space-y-2 pt-2">
                                    <h4 className="text-xs uppercase tracking-widest text-emerald-400 font-bold">Key Decisions Resolved</h4>
                                    {selectedMeeting.keyDecisions && selectedMeeting.keyDecisions.length > 0 ? (
                                      <ul className="space-y-2.5">
                                        {selectedMeeting.keyDecisions.map((dec, dIdx) => (
                                          <li key={dIdx} className="bg-[#1a1d27] border border-gray-800 hover:border-gray-700 rounded-xl p-3.5 flex items-start gap-3">
                                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 text-xs font-black mt-0.5">
                                              ✓
                                            </div>
                                            <span className="text-sm text-gray-300 font-medium">{dec}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <div className="text-center py-6 bg-[#11131a] rounded-2xl border border-gray-850">
                                        <p className="text-gray-500 text-xs italic">No key decisions recorded yet.</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Tags chips lists */}
                                  {selectedMeeting.tags && selectedMeeting.tags.length > 0 && (
                                    <div className="pt-2">
                                      <h4 className="text-xs uppercase tracking-widest text-purple-400 font-bold mb-2">Subject Tags</h4>
                                      <div className="flex flex-wrap gap-1.5">
                                        {selectedMeeting.tags.map((tag, tIdx) => (
                                          <span key={tIdx} className="bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-[10px] font-bold px-2.5 py-1 rounded inline-flex items-center gap-1 border border-gray-700/50 cursor-default">
                                            <Tag className="w-3 h-3 text-[#6c63ff]" />
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* MINUTES TAB */}
                              {detailTab === 'minutes' && (
                                <div className="space-y-4 animate-fade-in">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs uppercase tracking-widest text-gray-400 font-bold">Raw Minutes Transcription</h4>
                                    <span className="text-xs text-gray-500 font-mono">
                                      {selectedMeeting.rawMinutes.length} characters
                                    </span>
                                  </div>
                                  <div className="bg-[#11131a] border border-gray-800 rounded-2xl p-6 font-mono text-sm leading-relaxed text-gray-300 overflow-x-auto whitespace-pre-wrap select-text selection:bg-[#6c63ff]/30">
                                    {selectedMeeting.rawMinutes || "No minutes typed yet."}
                                  </div>
                                </div>
                              )}

                              {/* ACTION ITEMS CHECKLIST TAB (Section 4 status toggle) */}
                              {detailTab === 'actionItems' && (
                                <div className="space-y-5 animate-fade-in">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs uppercase tracking-widest text-rose-400 font-bold">Action Item Tracker</h4>
                                    
                                    {/* Action Status selector */}
                                    <div className="flex items-center gap-1.5 bg-[#11131a] border border-gray-850 p-1 rounded-lg">
                                      {[
                                        { id: 'all', label: 'All' },
                                        { id: 'pending', label: 'Pending' },
                                        { id: 'done', label: 'Completed' }
                                      ].map(btn => (
                                        <button
                                          key={btn.id}
                                          onClick={() => setActionItemFilter(btn.id as any)}
                                          className={cn(
                                            "px-2.5 py-1 rounded text-[10px] font-extrabold uppercase",
                                            actionItemFilter === btn.id ? "bg-slate-800 text-white" : "text-gray-500 hover:text-white"
                                          )}
                                        >
                                          {btn.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {filteredActionItems.length > 0 ? (
                                    <div className="space-y-3">
                                      {filteredActionItems.map((action, aIdx) => {
                                        const isDone = action.status === 'done';
                                        
                                        return (
                                          <div
                                            key={aIdx}
                                            onClick={() => handleToggleActionStatus(selectedMeeting.id, aIdx)}
                                            className={cn(
                                              "border rounded-2xl p-4 flex items-start gap-4 transition-all cursor-pointer hover:border-gray-700",
                                              isDone ? "bg-emerald-950/5 border-emerald-900/10 text-gray-400 opacity-70" : "bg-[#11131a] border-gray-850"
                                            )}
                                          >
                                            <button className="shrink-0 text-white mt-1">
                                              {isDone ? (
                                                <div className="w-5.5 h-5.5 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
                                                  <CheckCircle className="w-3.5 h-3.5" />
                                                </div>
                                              ) : (
                                                <div className="w-5.5 h-5.5 border-2 border-gray-600 rounded-lg" />
                                              )}
                                            </button>

                                            <div className="flex-1 min-w-0 space-y-1">
                                              <p className={cn("text-sm font-semibold leading-relaxed text-gray-200", isDone && "line-through text-gray-500")}>
                                                {action.task}
                                              </p>
                                              
                                              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 pt-1">
                                                <span className="bg-gray-800 px-2 py-0.5 rounded text-[#6c63ff] border border-gray-700/60 font-mono">
                                                  Assignee: {action.owner || 'Unassigned'}
                                                </span>
                                                <span className="flex items-center gap-1 font-mono">
                                                  <Calendar className="w-3 h-3 text-gray-400" />
                                                  Due: {action.dueDate || 'No due date'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-center py-12 bg-[#11131a] border border-gray-850 rounded-2xl">
                                      <p className="text-gray-500 text-xs italic">No items align with this status filter.</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* ATTENDEES TAB */}
                              {detailTab === 'attendees' && (
                                <div className="space-y-4 animate-fade-in">
                                  <h4 className="text-xs uppercase tracking-widest text-[#6c63ff] font-bold">Attendees Directory</h4>
                                  {selectedMeeting.attendees && selectedMeeting.attendees.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                      {selectedMeeting.attendees.map((att, attIdx) => (
                                        <div key={attIdx} className="bg-[#11131a] border border-gray-850 rounded-2xl p-4 flex items-center gap-3.5">
                                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-black text-xs text-white border border-gray-700">
                                            {att.name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <p className="font-bold text-white text-sm truncate">{att.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5 truncate">{att.role}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-12 bg-[#11131a] border border-gray-850 rounded-2xl">
                                      <p className="text-gray-500 text-xs italic">No attendees recorded.</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* ATTACHMENTS VIEW TAB */}
                              {detailTab === 'attachments' && (
                                <div className="space-y-6 animate-fade-in">
                                  
                                  {/* Section 1: AI Attachment Insights */}
                                  {selectedMeeting.attachmentInsights && selectedMeeting.attachmentInsights.length > 0 && (
                                    <div className="bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-5 space-y-3">
                                      <div className="flex items-center gap-2">
                                        <div className="bg-indigo-500/10 p-1.5 rounded-lg border border-indigo-500/20 text-indigo-400">
                                          <Sparkles className="w-4 h-4 animate-pulse" />
                                        </div>
                                        <div>
                                          <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 font-sans tracking-wider">Gemini Deliverable Intelligence</h4>
                                          <p className="text-[10px] text-gray-500 font-medium font-sans">Synergies, outputs, and actions derived from attachments</p>
                                        </div>
                                      </div>

                                      <ul className="space-y-2 pt-1 font-sans text-sm text-gray-300">
                                        {selectedMeeting.attachmentInsights.map((insight, index) => (
                                          <li key={index} className="flex gap-2.5 items-start bg-slate-950/40 p-3 rounded-xl border border-gray-850/50">
                                            <div className="w-5 h-5 rounded-full bg-[#6c63ff]/10 text-[#6c63ff] border border-[#6c63ff]/20 flex items-center justify-center shrink-0 font-bold font-mono text-[10px] mt-0.5">
                                              {index + 1}
                                            </div>
                                            <span className="leading-relaxed">{insight}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Section 2: Deliverable Listing */}
                                  <div className="space-y-3.5">
                                    <h4 className="text-xs uppercase tracking-widest text-[#6c63ff] font-bold">Meeting Reference Deliverables</h4>
                                    
                                    {selectedMeeting.attachments && selectedMeeting.attachments.length > 0 ? (
                                      <div className="grid grid-cols-1 gap-3.5">
                                        {selectedMeeting.attachments.map((att) => {
                                          const isExpanded = expandedAttachmentId === att.id;
                                          
                                          // Icon map
                                          let iconElement = <FileText className="w-5 h-5 shrink-0" />;
                                          let colorClass = "text-red-500 bg-red-400/10 border-red-500/20";
                                          if (att.fileType === 'excel') {
                                            iconElement = <Table className="w-5 h-5 shrink-0" />;
                                            colorClass = "text-emerald-500 bg-emerald-400/10 border-emerald-500/20";
                                          } else if (att.fileType === 'word') {
                                            iconElement = <FileText className="w-5 h-5 shrink-0" />;
                                            colorClass = "text-blue-500 bg-blue-400/10 border-blue-500/20";
                                          } else if (att.fileType === 'powerpoint') {
                                            iconElement = <Presentation className="w-5 h-5 shrink-0" />;
                                            colorClass = "text-orange-500 bg-orange-400/10 border-orange-500/20";
                                          }

                                          return (
                                            <div
                                              key={att.id}
                                              className="bg-[#11131a] border border-gray-850 rounded-2xl overflow-hidden transition-all hover:border-gray-800"
                                            >
                                              {/* Header Click Shell */}
                                              <div 
                                                onClick={() => setExpandedAttachmentId(isExpanded ? null : att.id)}
                                                className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-900/20 transition-all select-none"
                                              >
                                                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                  <div className={cn("p-2.5 rounded-xl border flex items-center justify-center shrink-0", colorClass)}>
                                                    {iconElement}
                                                  </div>
                                                  <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-gray-200 truncate pr-4">{att.fileName}</p>
                                                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-500 mt-1 font-mono">
                                                      <span className="uppercase text-[10px] font-black bg-slate-800 px-1.5 py-0.5 rounded text-gray-400 border border-gray-700/50">
                                                        {att.fileType}
                                                      </span>
                                                      <span>•</span>
                                                      <span>{att.fileSize} KB</span>
                                                      <span>•</span>
                                                      <span>Uploaded {att.uploadedAt}</span>
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDownloadAttachment(att);
                                                    }}
                                                    className="p-2 bg-slate-950 border border-gray-850 hover:border-gray-700 hover:text-white text-gray-400 rounded-xl transition-all"
                                                    title="Download"
                                                  >
                                                    <Download className="w-4 h-4" />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="p-2 bg-slate-850 text-gray-400 hover:text-white rounded-xl transition-all"
                                                  >
                                                    <ChevronDown className={cn("w-4 h-4 transition-all duration-300", isExpanded && "rotate-180")} />
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Expanded body panel */}
                                              {isExpanded && (
                                                <div className="px-5 pb-5 pt-1 bg-[#13151c]/50 border-t border-gray-850 space-y-4 animate-slide-in">
                                                  {/* Context Note */}
                                                  {att.generalNote ? (
                                                    <div className="space-y-1.5 pt-3">
                                                      <h5 className="text-[10px] font-black uppercase tracking-widest text-[#6c63ff] flex items-center gap-1">
                                                        <Info className="w-3 h-3 text-[#6c63ff]" />
                                                        <span>Contextual Note</span>
                                                      </h5>
                                                      <div className="bg-slate-950/80 p-3.5 rounded-xl border border-gray-850 text-xs leading-relaxed text-gray-300 italic">
                                                        "{att.generalNote}"
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="pt-3 text-[11px] text-gray-500 italic">
                                                      No contextual note recorded for this deliverable.
                                                    </div>
                                                  )}

                                                  {/* PPT Slides View */}
                                                  {att.fileType === 'powerpoint' && att.slides && att.slides.length > 0 && (
                                                    <div className="space-y-3 pt-3 border-t border-gray-850">
                                                      <h5 className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-1.5 font-sans">
                                                        <Presentation className="w-3.5 h-3.5 text-orange-500" />
                                                        <span>Slide Annotations</span>
                                                      </h5>

                                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                                        {att.slides.map((slide) => {
                                                          const hasNote = slide.note && slide.note.trim().length > 0;
                                                          return (
                                                            <div 
                                                              key={slide.slideNumber}
                                                              className={cn(
                                                                "p-3 rounded-xl border flex flex-col gap-1.5 bg-slate-950/60",
                                                                hasNote ? "border-orange-500/20" : "border-gray-850/40 opacity-65"
                                                              )}
                                                            >
                                                              <div className="flex items-center justify-between font-mono text-[10px] font-extrabold text-orange-400/90">
                                                                <span>Slide {slide.slideNumber}</span>
                                                                <span className="truncate max-w-[120px] text-gray-400">{slide.slideLabel}</span>
                                                              </div>
                                                              <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                                                                {hasNote ? slide.note : "No specific slide annotated session minutes captured."}
                                                              </p>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    </div>
                                                  )}

                                                  {/* Inline Preview Control */}
                                                  <div className="pt-2 flex gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleOpenPreview(att)}
                                                      className="bg-[#6c63ff]/10 hover:bg-[#6c63ff]/20 border border-[#6c63ff]/20 text-[#6c63ff] hover:text-white px-3.5 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all font-mono"
                                                    >
                                                      <Eye className="w-3.5 h-3.5" />
                                                      <span>Preview Deliverable Stream</span>
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-center py-12 bg-[#11131a] border border-gray-850 rounded-2xl">
                                        <Paperclip className="w-8 h-8 text-gray-600 mx-auto mb-3.5 saturate-50 mt-2 text-indigo-500/80" />
                                        <p className="text-gray-400 text-xs font-bold font-sans">No Reference Deliverables Uploaded</p>
                                        <p className="text-gray-600 text-[11px] mt-1 max-w-xs mx-auto leading-relaxed font-sans mb-2">
                                          Edit this meeting via the upper right command drawer to attach spreadsheets, decks, files, and slide comments.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ) : (
                          <div className="bg-[#1a1d27]/40 border border-gray-800 border-dashed rounded-3xl p-16 text-center shadow-lg flex flex-col items-center justify-center min-h-[500px]">
                            <div className="w-20 h-20 bg-gray-900 border border-gray-800 rounded-[2.2rem] flex items-center justify-center text-gray-600 mb-6">
                              <Eye className="w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-white mb-3">No Meeting Selected</h2>
                            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                              Select an Alignment meeting from the timeline Sidebar on the left to read key outputs, tasks, and summaries, or insert a new one immediately.
                            </p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                </motion.div>
              ) : activeTab === 'corporate-memory' ? (
                <motion.div
                  key="corporate-memory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-5xl mx-auto flex flex-col h-[calc(100vh-180px)]"
                >
                  {/* Header info */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-black text-white">Corporate Memory Explorer</h2>
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mt-1">
                        AI Conversational interface indexed over complete minutes archive
                      </p>
                    </div>
                    <button
                      onClick={() => setChatMessages([
                        {
                          id: 'welcome',
                          role: 'model',
                          text: '<p>Welcome to the <b>Corporate Memory Assistant</b>. I have indexed the entire manufacturing database of meetings, raw notes, action items, and decisions across all sectors (SOR, POR, MOR). Ask me any question about past decisions, timelines, escalations, or specific metrics discussed!</p>',
                          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                      ])}
                      className="text-xs text-gray-400 hover:text-white border border-gray-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl font-bold"
                    >
                      Reset Discussion
                    </button>
                  </div>

                  {/* Conversation Window */}
                  <div className="flex-1 bg-[#1a1d27] border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl min-h-0">
                    
                    {/* Message Log */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex flex-col max-w-[85%] space-y-1.5 animate-fade-in",
                            msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                          )}
                        >
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                            {msg.role === 'user' ? 'Stakeholder Query' : 'Corporate Memory Agent'} · {msg.timestamp}
                          </span>
                          <div
                            className={cn(
                              "rounded-2xl p-4 text-sm leading-relaxed select-text selection:bg-[#6c63ff]/30 border shadow-md",
                              msg.role === 'user'
                                ? "bg-[#6c63ff] border-[#6c63ff] text-white rounded-tr-none font-medium text-left"
                                : "bg-[#11131a] border-gray-800 text-gray-300 rounded-tl-none text-left"
                            )}
                            dangerouslySetInnerHTML={{ __html: msg.text }}
                          />
                        </div>
                      ))}

                      {isChatLoading && (
                        <div className="flex flex-col space-y-1.5 mr-auto max-w-[85%] w-full">
                          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wide">
                            Corporate Memory Agent is researching...
                          </span>
                          <div className="bg-[#11131a] border border-gray-800 rounded-2xl rounded-tl-none p-4 w-64 space-y-2">
                            <div className="h-4 bg-gray-800/85 rounded animate-pulse w-3/4" />
                            <div className="h-4 bg-gray-800/85 rounded animate-pulse w-5/6" />
                            <div className="h-4 bg-gray-800/85 rounded animate-pulse w-1/2" />
                          </div>
                        </div>
                      )}

                      {chatError && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center space-y-2 max-w-lg mx-auto">
                          <p className="text-xs text-rose-400 font-bold">{chatError}</p>
                          <button
                            type="button"
                            onClick={() => handleChatSubmit()}
                            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold px-3 py-1 text-xs rounded-lg"
                          >
                            Retry Request
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Footer query input area */}
                    <div className="p-4 border-t border-gray-800 bg-[#14161f]">
                      {chatMessages.length === 1 && (
                        <div className="mb-3 space-y-1.5">
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Suggested Queries:</p>
                          <div className="flex flex-wrap gap-2">
                            {starterQuestions.map((q, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setChatInput(q);
                                }}
                                className="bg-[#11131a] border border-gray-800 hover:border-[#6c63ff]/30 hover:bg-[#6c63ff]/5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-all"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(); }} className="flex gap-2.5">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Query corporate archives (e.g. 'What did we decide about chemical mixing?')..."
                          className="flex-1 bg-[#11131a] border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#6c63ff] placeholder-gray-600"
                        />
                        <button
                          type="submit"
                          disabled={isChatLoading || !chatInput.trim()}
                          className="bg-[#6c63ff] hover:bg-[#574feb] disabled:bg-gray-800/50 disabled:text-gray-600 text-white px-5 py-3 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all shrink-0"
                        >
                          <Sparkles className="w-4 h-4 text-indigo-200" />
                          <span>Search Archive</span>
                        </button>
                      </form>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-7xl mx-auto"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-white">System Metrics Dashboard</h2>
                      <p className="text-xs text-gray-500 font-semibold uppercase mt-0.5 tracking-widest">
                        Comprehensive insights compilation metrics
                      </p>
                    </div>
                  </div>
                  <StatCharts meetings={meetings} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* === 13. DRAWER SLIDE-IN PANEL (Section 3) === */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-40 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-black backdrop-blur-xs"
            />
            {/* Drawer Body */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-3xl bg-[#161a24] border-l border-gray-800 shadow-2xl h-full flex flex-col z-50 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#161a24] z-10 sticky top-0">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {drawerMode === 'create' ? 'Input Meeting Alignment' : 'Update Meeting Details'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">
                    Configure details and analyze with Gemini
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                
                {/* Storage estimate warning banners */}
                {(() => {
                  const estBytes = getStorageEstimateBytes();
                  if (estBytes > 4 * 1024 * 1024) {
                    return (
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center justify-between animate-slide-in">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            Storage is getting full ({(estBytes / (1024 * 1024)).toFixed(2)} MB). Consider removing older attachments to free space.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById('drawer-attachments-section');
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="text-[#6c63ff] hover:underline font-extrabold uppercase text-[10px] shrink-0 ml-3 font-mono"
                        >
                          Manage Storage
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* 1. Fields row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Meeting Title</label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Q3 alignment alignment..."
                      className="w-full bg-[#11131a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-[#f3f4f6]"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Category</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-sm"
                    >
                      <option value="SOR">SOR — Short-term Operational Review</option>
                      <option value="POR">POR — Project Operational Review</option>
                      <option value="MOR">MOR — Monthly Operational Review</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Company</label>
                    <select
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value as any)}
                      className="w-full bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-sm"
                    >
                      <option value="Company Wide">Company Wide</option>
                      <option value="Corrugated">Corrugated</option>
                      <option value="Paper & Board">Paper & Board</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Time</label>
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full bg-[#11131a] border border-gray-800 text-gray-400 rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Duration (Minutes)</label>
                    <input
                      type="number"
                      value={formDuration}
                      onChange={(e) => setFormDuration(Number(e.target.value) || 30)}
                      className="w-full bg-[#11131a] border border-gray-800 text-[#f3f4f6] rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Tags (Comma-separated)</label>
                    <input
                      type="text"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                      placeholder="strategy, feature, backend"
                      className="w-full bg-[#11131a] border border-gray-800 text-[#f3f4f6] rounded-xl px-4 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* 2. Attendees subsection list */}
                <div className="space-y-3 p-4 bg-[#11131a] border border-gray-850 rounded-2xl">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#6c63ff]">Add Attendees</h4>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Name (e.g. John)"
                      value={newAttendeeName}
                      onChange={(e) => setNewAttendeeName(e.target.value)}
                      className="flex-1 bg-slate-900 border border-gray-850 rounded-xl px-3.5 py-2 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Role (e.g. Architect)"
                      value={newAttendeeRole}
                      onChange={(e) => setNewAttendeeRole(e.target.value)}
                      className="flex-1 bg-slate-900 border border-gray-850 rounded-xl px-3.5 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddAttendee}
                      className="bg-[#6c63ff] hover:bg-[#574feb] text-white px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>

                  {attendeesList.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {attendeesList.map((att, idx) => (
                        <div key={idx} className="bg-slate-800 text-gray-300 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 flex items-center gap-2">
                          <span className="font-semibold">{att.name} <span className="text-[10px] text-indigo-400">({att.role})</span></span>
                          <button onClick={() => handleRemoveAttendee(idx)} className="text-rose-400 hover:text-rose-300 text-xs font-black">
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Raw typed minutes block */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Raw Meeting Minutes</label>
                  <textarea
                    value={formRawMinutes}
                    onChange={(e) => setFormRawMinutes(e.target.value)}
                    placeholder="Type or paste your meeting raw minutes here. Focus on decisions and general feedback."
                    className="w-full h-44 bg-[#11131a] border border-gray-800 rounded-2xl p-4 text-sm leading-relaxed text-[#f3f4f6]"
                  />
                </div>

                {/* === ATTACHMENT SYSTEM SECTION === */}
                <div id="drawer-attachments-section" className="space-y-4 pt-4 border-t border-gray-800/80">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#6c63ff] flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Corporate Delivery Attachments</span>
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Upload PDF, Word, Excel, or PowerPoint reference deliverables (Max 10MB per file)</p>
                  </div>

                  {/* Drag-and-drop zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-2xl p-6 transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer",
                      isDragging 
                        ? "border-[#6c63ff] bg-[#1a1d27]" 
                        : "border-gray-800 bg-[#11131a] hover:border-gray-700/80"
                    )}
                  >
                    <div className="flex gap-4 mb-2 text-gray-500 justify-center">
                      <FileText className="w-8 h-8 text-rose-500/80" />
                      <Table className="w-8 h-8 text-emerald-500/80" />
                      <Presentation className="w-8 h-8 text-orange-500/80" />
                    </div>
                    
                    <p className="text-xs text-gray-300 font-semibold">
                      Drag and drop files here, or{" "}
                      <label className="text-[#6c63ff] hover:underline cursor-pointer font-bold">
                        Browse Files
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt"
                          onChange={(e) => {
                            if (e.target.files) {
                              handleUploadFiles(e.target.files);
                            }
                          }}
                        />
                      </label>
                    </p>
                    <p className="text-[10px] text-gray-500">Supports PDF, XLSX/XLS, DOCX/DOC, PPTX/PPT</p>
                  </div>

                  {/* Active Converting / Progress list */}
                  {Object.keys(uploadProgress).length > 0 && (
                    <div className="space-y-2.5 bg-[#11131a] border border-gray-850 p-4 rounded-2xl">
                      <p className="text-[10px] text-indigo-400 font-black uppercase tracking-wider flex items-center gap-1.5 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c63ff]" />
                        <span>Converting File to Local Storage...</span>
                      </p>
                      {Object.entries(uploadProgress).map(([fileId, percentage]) => (
                        <div key={fileId} className="space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                            <span className="truncate">Active ID: {fileId}</span>
                            <span>{percentage}%</span>
                          </div>
                          <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-[#6c63ff] h-full transition-all duration-300 animate-pulse" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Uploaded attachments cards list */}
                  {formAttachments.length > 0 ? (
                    <div className="space-y-3">
                      {formAttachments.map((att) => {
                        const isExpanded = expandedAttachmentId === att.id;
                        
                        // Icon maps and color configurations
                        let iconElement = <FileText className="w-4.5 h-4.5 shrink-0" />;
                        let colorClass = "text-red-500 bg-red-500/10 border-red-500/20";
                        if (att.fileType === 'excel') {
                          iconElement = <Table className="w-4.5 h-4.5 shrink-0" />;
                          colorClass = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
                        } else if (att.fileType === 'word') {
                          iconElement = <FileText className="w-4.5 h-4.5 shrink-0" />;
                          colorClass = "text-blue-500 bg-blue-500/10 border-blue-500/20";
                        } else if (att.fileType === 'powerpoint') {
                          iconElement = <Presentation className="w-4.5 h-4.5 shrink-0" />;
                          colorClass = "text-orange-500 bg-orange-500/10 border-orange-500/20";
                        }

                        return (
                          <div
                            key={att.id}
                            className="bg-[#11131a]/80 border border-gray-850 rounded-2xl overflow-hidden transition-all"
                          >
                            {/* Collapsed top bar header click shell */}
                            <div className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-900/40 transition-all select-none">
                              <div
                                className="flex-1 flex items-center gap-3 min-w-0"
                                onClick={() => setExpandedAttachmentId(isExpanded ? null : att.id)}
                              >
                                <div className={cn("p-2 rounded-xl border flex items-center justify-center shrink-0", colorClass)}>
                                  {iconElement}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-gray-200 truncate pr-2">{att.fileName}</p>
                                  <p className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5 font-mono">
                                    <span>{att.fileSize} KB</span>
                                    <span>•</span>
                                    <span className="max-w-[200px] truncate">
                                      {att.generalNote ? att.generalNote : 'Add context note...'}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttachment(att.id)}
                                  className="p-1.5 hover:bg-rose-950/20 text-gray-500 hover:text-rose-400 rounded-lg transition-all"
                                  title="Delete attachment"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedAttachmentId(isExpanded ? null : att.id)}
                                  className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-all"
                                >
                                  <ChevronDown className={cn("w-4 h-4 transition-all duration-300", isExpanded && "rotate-180")} />
                                </button>
                              </div>
                            </div>

                            {/* Expandable options body */}
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-1 border-t border-gray-800/40 bg-[#13151d]/40 space-y-4 animate-slide-in">
                                {/* Labeled textarea and helper comments */}
                                <div className="space-y-1.5 pt-2">
                                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Contextual Narrative</label>
                                  <textarea
                                    value={att.generalNote}
                                    onChange={(e) => handleUpdateAttachmentGeneralNote(att.id, e.target.value)}
                                    placeholder="Add context about this attachment as it relates to the meeting..."
                                    className="w-full h-16 bg-slate-950 border border-gray-850 rounded-xl p-2.5 text-xs text-gray-300 focus:border-[#6c63ff] focus:outline-none transition-all resize-none"
                                  />
                                </div>

                                {/* Preview and download button control bar */}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPreview(att)}
                                    className="bg-indigo-950/45 hover:bg-indigo-900/40 border border-[#6c63ff]/20 text-indigo-300 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all font-mono"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Preview File</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAttachment(att)}
                                    className="bg-slate-900 hover:bg-slate-800 border border-gray-800 text-gray-300 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 transition-all font-mono"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </button>
                                </div>

                                {/* PowerPoint Slide sub notes list */}
                                {att.fileType === 'powerpoint' && (
                                  <div className="space-y-3 pt-3 border-t border-gray-800/80">
                                    <div className="flex items-center justify-between">
                                      <h5 className="text-[11px] font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                                        <Presentation className="w-3.5 h-3.5 shrink-0" />
                                        <span>Slide-by-Slide Annotations</span>
                                      </h5>
                                      <button
                                        type="button"
                                        onClick={() => handleAddSlide(att.id)}
                                        className="text-[#6c63ff] hover:underline text-[10px] font-black uppercase font-mono"
                                      >
                                        + Add Slide Note
                                      </button>
                                    </div>

                                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                                      {att.slides?.map((slide, sIdx) => (
                                        <div
                                          key={sIdx}
                                          className="bg-slate-950/60 p-3 rounded-xl border-l-[3px] border-orange-500 border-y border-r border-gray-850 flex flex-col gap-2 relative group"
                                        >
                                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
                                            <span className="font-mono">Slide #{slide.slideNumber}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveSlide(att.id, sIdx)}
                                              className="text-gray-500 hover:text-rose-400 pr-1 transition-all"
                                              title="Delete slide note"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                          <div className="flex gap-2">
                                            <input
                                              type="text"
                                              value={slide.slideLabel}
                                              onChange={(e) => handleUpdateSlideLabel(att.id, sIdx, e.target.value)}
                                              placeholder="Slide Label (e.g. Q1 Revenue)"
                                              className="flex-1 bg-slate-900 border border-gray-850 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:border-orange-500 focus:outline-none"
                                            />
                                          </div>
                                          <textarea
                                            value={slide.note}
                                            onChange={(e) => handleUpdateSlideNote(att.id, sIdx, e.target.value)}
                                            placeholder="Write meeting notes corresponding to this slide..."
                                            className="w-full h-14 bg-slate-900 border border-gray-850 rounded-lg p-2 text-xs text-gray-300 focus:border-orange-500 focus:outline-none resize-none"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (att.slides && att.slides.length > 0) {
                                            handleRemoveSlide(att.id, att.slides.length - 1);
                                          }
                                        }}
                                        disabled={!att.slides || att.slides.length === 0}
                                        className="text-gray-500 hover:text-rose-400 hover:underline text-[10px] font-black uppercase disabled:opacity-30 font-mono"
                                      >
                                        − Remove Last Slide Note
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-gray-850 bg-[#11131a]/40 text-center text-gray-500 text-xs italic">
                      No deliverables uploaded yet for this session.
                    </div>
                  )}
                </div>

                {/* 4. ANALYSE WITH AI CONTROLLER */}
                <div className="border-t border-gray-800/80 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Gemini AI Insights Processor</span>
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">Extract summaries, resolutions, and direct tasks in 1 click</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAnalyzeWithAI}
                      disabled={isAiAnalyzing || !formRawMinutes.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                    >
                      {isAiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4.5 h-4.5" />}
                      <span>Analyse with Gemini</span>
                    </button>
                  </div>

                  {/* AI Errors handler */}
                  {aiError && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{aiError}</span>
                      </div>
                      <button 
                        onClick={handleAnalyzeWithAI} 
                        className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase shrink-0 ml-3"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* AI Skeletons loader */}
                  {isAiAnalyzing && (
                    <div className="space-y-4 p-5 bg-[#11131a] border border-gray-800 rounded-2xl">
                      <div className="h-4 bg-gray-800 rounded animate-pulse w-2/5" />
                      <div className="h-3 bg-gray-950 rounded animate-pulse w-full" />
                      <div className="h-3 bg-gray-950 rounded animate-pulse w-5/6" />
                      <div className="h-3 bg-gray-950 rounded animate-pulse w-4/5" />
                      <div className="h-4 bg-gray-800 rounded animate-pulse w-1/4 mt-4" />
                      <div className="h-3 bg-gray-950 rounded animate-pulse w-full" />
                    </div>
                  )}

                  {/* Temp AI Outputs edit wrapper */}
                  {tempAiSummary && !isAiAnalyzing && (
                    <div className="space-y-4 p-5 bg-[#11131a] border border-gray-800 rounded-2xl animate-fade-in">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-indigo-400">Extracted Summary (Editable)</label>
                        <textarea
                          value={tempAiSummary}
                          onChange={(e) => setTempAiSummary(e.target.value)}
                          className="w-full h-20 bg-slate-900 border border-gray-850 rounded-xl p-3 text-xs leading-relaxed"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-emerald-400">Extracted Key Decisions (Editable lines)</label>
                        <textarea
                          value={tempKeyDecisions.join('\n')}
                          onChange={(e) => setTempKeyDecisions(e.target.value.split('\n'))}
                          className="w-full h-20 bg-slate-900 border border-gray-850 rounded-xl p-3 text-xs leading-relaxed font-mono"
                          placeholder="Each line is parsed as one decision"
                        />
                      </div>

                      {/* INLINE ACTION ITEMS MODIFIER (Section 3 allow to edit items inline) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold uppercase tracking-wider text-rose-400">Extracted Action Tasks (Inline Row Modifiers)</label>
                          <button
                            type="button"
                            onClick={handleAddTempActionItem}
                            className="text-[#6c63ff] hover:underline text-[10px] font-bold"
                          >
                            + Add Custom Row
                          </button>
                        </div>
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                          {tempActionItems.map((item, idx) => (
                            <div key={idx} className="bg-slate-900 p-3 rounded-xl border border-gray-850 flex flex-col md:flex-row gap-2 items-center">
                              <input
                                type="text"
                                value={item.task}
                                onChange={(e) => handleTempActionItemChange(idx, 'task', e.target.value)}
                                className="flex-2 w-full md:w-auto bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs"
                                placeholder="Task description"
                              />
                              <input
                                type="text"
                                value={item.owner}
                                onChange={(e) => handleTempActionItemChange(idx, 'owner', e.target.value)}
                                className="flex-1 w-full md:w-auto bg-slate-950 border border-gray-800 rounded px-2.5 py-1 text-xs"
                                placeholder="Owner"
                              />
                              <input
                                type="date"
                                value={item.dueDate}
                                onChange={(e) => handleTempActionItemChange(idx, 'dueDate', e.target.value)}
                                className="flex-1 w-full md:w-auto bg-slate-950 border border-gray-800 rounded px-2 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveTempActionItem(idx)}
                                className="text-rose-500 hover:text-white px-2 py-1 hover:bg-rose-950/20 rounded font-black text-xs shrink-0 self-stretch md:self-auto"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div className="space-y-1">
                          <label className="text-xs font-bold uppercase text-gray-400">Summary Sentiment</label>
                          <select
                            value={tempSentiment}
                            onChange={(e) => setTempSentiment(e.target.value as any)}
                            className="w-full bg-slate-900 border border-gray-850 text-gray-300 rounded-xl px-3 py-2 text-xs"
                          >
                            <option value="positive">Positive</option>
                            <option value="neutral">Neutral</option>
                            <option value="concerning">Concerning</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold uppercase text-gray-400">AI Suggested Follow-up</label>
                          <input
                            type="date"
                            value={tempFollowUpDate || ''}
                            onChange={(e) => setTempFollowUpDate(e.target.value || null)}
                            className="w-full bg-slate-900 border border-gray-850 text-gray-300 rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                      </div>

                    </div>
                  )}
                </div>

              </div>

              {/* Sticky bottom save drawer */}
              <div className="p-6 border-t border-gray-800 shadow-2xl bg-[#161a24] sticky bottom-0 z-10 shrink-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1 bg-gray-900 border border-gray-800 hover:bg-slate-800 text-gray-400 hover:text-white py-3 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMeeting}
                  className="flex-1 bg-[#6c63ff] hover:bg-[#574feb] text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-[#6c63ff]/20"
                >
                  Save Alignment
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* === DELETE WARNING DIALOG MODAL === */}
      <AnimatePresence>
        {meetingToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => setMeetingToDelete(null)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-md bg-[#161a24] border border-gray-850 rounded-3xl shadow-2xl p-6 overflow-hidden"
            >
              <div className="flex items-center gap-3.5 mb-4 text-rose-500">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-white">Permanently Delete Alignment?</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                Are you sure you want to delete this meeting alignment? This action cannot be undone and will be permanently cleared from LocalStorage.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setMeetingToDelete(null)}
                  className="flex-1 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl py-2.5 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMeeting}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl py-2.5 text-xs font-bold shadow-lg shadow-rose-600/15 border-none"
                >
                  Delete Record
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* === SMART BRIEFING OVERLAY === */}
      <AnimatePresence>
        {briefingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setBriefingModalOpen(false)}
              className="absolute inset-0 bg-black backdrop-blur-xs no-print"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-4xl bg-[#161a24] border border-gray-800 rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden printable-area"
            >
              <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#161a24] no-print">
                <div className="flex items-center gap-2.5 text-[#6c63ff]">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <h3 className="text-lg font-black text-white">"Previously On..." Smart Executive Briefing</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    disabled={briefingLoading || !!briefingError}
                    className="bg-indigo-950/45 border border-[#6c63ff]/20 text-indigo-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Printer className="w-4 h-4 text-indigo-400" />
                    <span>Print Briefing</span>
                  </button>
                  <button
                    onClick={() => setBriefingModalOpen(false)}
                    className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Core Scrolling Content Frame */}
              <div className="flex-1 overflow-y-auto p-6 bg-[#161a24] custom-scrollbar">
                {briefingLoading && (
                  <div className="space-y-4 no-print">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 text-[#6c63ff] animate-spin" />
                      <p className="text-sm text-indigo-300 font-semibold animate-pulse">Gemini EA is researching past cycles and drafting HTML executive summary...</p>
                    </div>
                    <div className="space-y-2 pt-4">
                      <div className="h-6 bg-gray-800/60 rounded animate-pulse w-1/3" />
                      <div className="h-4 bg-gray-850 rounded animate-pulse w-full" />
                      <div className="h-4 bg-gray-850 rounded animate-pulse w-4/5" />
                      <div className="h-4 bg-gray-850 rounded animate-pulse w-5/6" />
                      <div className="h-24 bg-[#11131a] border border-gray-850 rounded-2xl animate-pulse" />
                      <div className="h-6 bg-gray-800/60 rounded animate-pulse w-1/4 pt-4" />
                      <div className="h-4 bg-gray-850 rounded animate-pulse w-3/4" />
                    </div>
                  </div>
                )}

                {briefingError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center space-y-3 max-w-lg mx-auto mt-8 no-print">
                    <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                    <h4 className="font-bold text-white">Smart Briefing Compile Error</h4>
                    <p className="text-xs text-rose-300 leading-normal">{briefingError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        const m = meetings.find(x => x.id === selectedMeetingId);
                        if (m) handleGenerateBriefing(m);
                      }}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 font-bold px-4 py-2 rounded-xl text-xs transition-all"
                    >
                      Retry Generation
                    </button>
                  </div>
                )}

                {briefingContent && (
                  <div className="printable-briefing-container select-text selection:bg-[#6c63ff]/35 bg-[#14161f] border border-gray-800/60 p-6 rounded-2xl leading-relaxed">
                    <div dangerouslySetInnerHTML={{ __html: briefingContent }} />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* === FRICTIONLESS PUBLISH OVERLAY === */}
      <AnimatePresence>
        {publishModalOpen && selectedMeeting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setPublishModalOpen(false)}
              className="absolute inset-0 bg-black backdrop-blur-xs no-print"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-4xl bg-[#161a24] border border-gray-800 rounded-3xl shadow-2xl flex flex-col h-[85vh] overflow-hidden"
            >
              {/* Header bar */}
              <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#161a24] no-print">
                <div className="flex items-center gap-2.5 text-emerald-400">
                  <Send className="w-5 h-4" />
                  <h3 className="text-lg font-black text-white">Publish Minutes & Notify Stakeholders</h3>
                </div>
                <button
                  onClick={() => setPublishModalOpen(false)}
                  className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sub tabs selectors */}
              <div className="flex border-b border-gray-800 bg-[#11131a] px-6 py-2 gap-2 no-print">
                {[
                  { id: 'email', label: 'Email Broadcast Summary', icon: Mail },
                  { id: 'slack', label: 'Teams/Slack Message', icon: MessageSquare },
                  { id: 'print', label: 'Stakeholder PDF Report', icon: Printer }
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setPublishActiveTab(tab.id as any)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border",
                        publishActiveTab === tab.id
                          ? "bg-slate-800 border-gray-700 text-white shadow"
                          : "border-transparent text-gray-400 hover:text-white hover:bg-slate-900/40"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Workspace content */}
              <div className="flex-1 overflow-y-auto p-6 bg-[#161a24] custom-scrollbar min-h-0 printable-area">
                
                {/* EMAIL TAB */}
                {publishActiveTab === 'email' && (
                  <div className="space-y-4 h-full flex flex-col no-print">
                    <p className="text-xs text-gray-400">
                      Stakeholders will receive a dynamic HTML briefing styled professionally with inline CSS. Review and copy or send directly:
                    </p>

                    {publishLoading ? (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-16">
                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                        <p className="text-xs text-emerald-300 font-semibold animate-pulse">Generating responsive HTML email markup with Gemini...</p>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col space-y-4 min-h-0">
                        {/* Browser Window mockup for email preview */}
                        <div className="flex-1 border border-gray-800 rounded-2xl overflow-hidden bg-white text-black flex flex-col min-h-[250px] max-h-[420px]">
                          <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                            <span className="bg-white px-3 py-0.5 rounded text-[10px] text-gray-400 border border-gray-200 select-all font-sans flex-1 max-w-sm truncate">
                              To: Stakeholders Inbox
                            </span>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar select-text selection:bg-indigo-150">
                            <div dangerouslySetInnerHTML={{ __html: publishEmailHtml }} />
                          </div>
                        </div>

                        {/* Integration buttons */}
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(publishEmailHtml);
                              setPublishCopied(true);
                              showToast('HTML Email code copied successfully ✓');
                              setTimeout(() => setPublishCopied(false), 2000);
                            }}
                            className="bg-[#6c63ff] hover:bg-[#574feb] text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all outline-none"
                          >
                            {publishCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span>{publishCopied ? 'Copied HTML Code!' : 'Copy Email HTML Code'}</span>
                          </button>

                          <a
                            href={`mailto:?subject=${encodeURIComponent(`Minutes Broadcast: ${selectedMeeting.title}`)}&body=${encodeURIComponent("Stakeholders,\n\nPlease find the summary of our meeting below:\n\n" + (selectedMeeting.aiSummary || selectedMeeting.rawMinutes))}`}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                          >
                            <Mail className="w-4 h-4" />
                            <span>Dispatch via Mailto Link</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SLACK / TEAMS TEXT TAB */}
                {publishActiveTab === 'slack' && (
                  <div className="space-y-4 h-full flex flex-col no-print">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest text-[#6c63ff]">
                      Slack / Microsoft Teams optimized markdown summary
                    </p>

                    <div className="flex-1 bg-[#11131a] border border-gray-850 rounded-2xl p-4 font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap select-text selection:bg-indigo-950/40 overflow-y-auto max-h-[400px]">
{`*📢 MEETING SUMMARY: ${selectedMeeting.title.toUpperCase()}*
📅 *Date & Time:* ${selectedMeeting.date} at ${selectedMeeting.time}
🏢 *Sector:* ${selectedMeeting.company || 'Company Wide'} | *Type:* ${selectedMeeting.category}

💡 *Executive Overview:*
${selectedMeeting.aiSummary || 'Decisions compiled successfully.'}

✅ *Key Resolutions:*
${selectedMeeting.keyDecisions?.map(v => `• ${v}`).join('\n') || 'None recorded'}

🏃‍♂️ *Assigned Action Items:*
${selectedMeeting.actionItems?.map(a => `• *[${a.status.toUpperCase()}]* ${a.task} (@${a.owner || 'Alex'} due by ${a.dueDate})`).join('\n') || 'No deliverables recorded'}

_Broadcasted from MinuteMind AI Corporate Archives_`}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => {
                          const slackText = `*📢 MEETING SUMMARY: ${selectedMeeting.title.toUpperCase()}*\n📅 *Date & Time:* ${selectedMeeting.date} at ${selectedMeeting.time}\n🏢 *Sector:* ${selectedMeeting.company || 'Company Wide'} | *Type:* ${selectedMeeting.category}\n\n💡 *Executive Overview:*\n${selectedMeeting.aiSummary || 'Decisions compiled successfully.'}\n\n✅ *Key Resolutions:*\n${selectedMeeting.keyDecisions?.map(v => `• ${v}`).join('\n') || 'None recorded'}\n\n🏃‍♂️ *Assigned Action Items:*\n${selectedMeeting.actionItems?.map(a => `• *[${a.status.toUpperCase()}]* ${a.task} (@${a.owner || 'Alex'} due by ${a.dueDate})`).join('\n') || 'No deliverables recorded'}\n\n_Broadcasted from MinuteMind AI Corporate Archives_`;
                          navigator.clipboard.writeText(slackText);
                          setPublishCopied(true);
                          showToast('Teams/Slack summary copied successfully ✓');
                          setTimeout(() => setPublishCopied(false), 2000);
                        }}
                        className="bg-[#6c63ff] hover:bg-[#574feb] text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        {publishCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 font-semibold" />}
                        <span>{publishCopied ? 'Copied to Clipboard!' : 'Copy Message Text'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* PRINT TAB */}
                {publishActiveTab === 'print' && (
                  <div className="space-y-4 h-full flex flex-col">
                    <p className="text-xs text-gray-400 no-print">
                      Standardized PDF printable report view. Click Print to trigger the native PDF export dialog:
                    </p>

                    <div className="flex-1 bg-white text-black p-6 rounded-2xl border border-gray-300 overflow-y-auto max-h-[380px] printable-briefing-container select-text font-serif">
                      <div className="border-b-2 border-black pb-4 mb-4">
                        <span className="font-sans text-[10px] font-extrabold uppercase bg-black text-white px-2 py-0.5 rounded">
                          Official Alignment Report
                        </span>
                        <h1 className="text-3xl font-black mt-2 leading-tight">{selectedMeeting.title}</h1>
                        <p className="text-xs text-gray-600 font-mono mt-1">
                          Date: {selectedMeeting.date} | Sector: {selectedMeeting.company || 'Company Wide'} | Reference ID: {selectedMeeting.id}
                        </p>
                      </div>

                      <div className="space-y-4 text-sm leading-relaxed text-left">
                        <div>
                          <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-700">1. Executive Compilation</h4>
                          <p className="mt-1 leading-relaxed text-sm text-gray-900">{selectedMeeting.aiSummary || 'Summary and details computed and recorded in system archives.'}</p>
                        </div>

                        <div>
                          <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-700">2. Key Board Decisions</h4>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {selectedMeeting.keyDecisions?.map((dec, dId) => (
                              <li key={dId} className="leading-snug text-sm">{dec}</li>
                            )) || <li className="italic text-gray-500 text-xs">No specific decisions recorded.</li>}
                          </ul>
                        </div>

                        <div className="pt-2">
                          <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-gray-700">3. Action Items Matrix</h4>
                          <table className="w-full text-left border-collapse mt-2 font-sans text-xs">
                            <thead>
                              <tr className="border-b border-black font-semibold text-left">
                                <th className="py-2">Outstanding Task</th>
                                <th className="py-2">Owner</th>
                                <th className="py-2">Due Date</th>
                                <th className="py-1.5 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {selectedMeeting.actionItems?.map((act, aId) => (
                                <tr key={aId} className="border-b border-gray-100">
                                  <td className="py-2 pr-2 font-semibold text-gray-950">{act.task}</td>
                                  <td className="py-2 text-gray-600">{act.owner}</td>
                                  <td className="py-2 font-mono text-gray-500">{act.dueDate}</td>
                                  <td className="py-1.5 text-right font-extrabold uppercase text-gray-900">{act.status}</td>
                                </tr>
                              )) || <tr><td colSpan={4} className="py-4 text-center text-gray-500 italic">No action items assigned.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 no-print">
                      <button
                        onClick={() => window.print()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Open Native Print/PDF Dialog</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* === FILE PREVIEW MODAL OVERLAY === */}
      <AnimatePresence>
        {previewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewModalOpen(false)}
              className="absolute inset-0 bg-black backdrop-blur-xs no-print"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-4xl bg-[#161a24] border border-gray-800 rounded-3xl shadow-2xl flex flex-col h-[80vh] overflow-hidden z-10"
            >
              {/* Header */}
              <div className="p-5 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#161a24]">
                <div className="flex items-center gap-2.5 text-indigo-400">
                  <Paperclip className="w-5 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white max-w-lg truncate">{previewAttachmentName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="p-1.5 hover:bg-gray-850 text-gray-400 hover:text-white rounded-lg transition-all font-sans text-xs font-bold"
                >
                  ✕ Close Preview
                </button>
              </div>

              {/* Main Embed Content viewport */}
              <div className="flex-1 bg-slate-950 p-6 overflow-y-auto custom-scrollbar flex flex-col">
                {previewFileType === 'pdf' && (
                  <div className="flex-1 min-h-[50vh] bg-slate-900 rounded-xl overflow-hidden shadow-inner flex flex-col">
                    <object data={previewBase64} type="application/pdf" className="w-full flex-1 rounded-xl min-h-[60vh]">
                      <iframe src={previewBase64} className="w-full flex-1 min-h-[60vh] rounded-xl border-none" title="PDF Document Viewer" />
                    </object>
                  </div>
                )}

                {previewFileType === 'excel' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold flex items-center gap-1.5 font-sans">
                        <Table className="w-4 h-4" />
                        <span>Interactive Spreadsheet Viewer</span>
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">Format: Microsoft Excel Matrix Structure</span>
                    </div>

                    <div className="border border-gray-800 rounded-2xl overflow-hidden bg-[#11131a] shadow-lg">
                      {/* Grid Headers */}
                      <div className="grid grid-cols-5 bg-slate-900/60 text-[10px] font-extrabold font-mono text-gray-400 uppercase tracking-wider text-center divide-x divide-gray-800 border-b border-gray-800">
                        <div className="p-2.5 text-gray-500 bg-slate-950/40 w-12 text-center">Row</div>
                        <div className="p-2.5">Col A (Deliverable)</div>
                        <div className="p-2.5">Col B (Owner)</div>
                        <div className="p-2.5">Col C (Target Date)</div>
                        <div className="p-2.5">Col D (Budget / Status)</div>
                      </div>

                      {/* Spreadsheet Grid Simulation */}
                      <div className="divide-y divide-gray-850">
                        {[
                          { a: "Design Prototypes", b: "Product Team", c: "2026-06-15", d: "$12,500 / Approved" },
                          { a: "Market Research Analysis", b: "Core Operations", c: "2026-06-22", d: "In-Progress" },
                          { a: "Infrastructure Pipeline Integration", b: "DevOps Lead", c: "2026-06-30", d: "$4,200 / Pending" },
                          { a: "V2 Deployment Launch", b: "Engineering Team", c: "2026-07-10", d: "Scheduled" },
                          { a: "Stakeholder Smart Briefs Review", b: "Executive Assistant", c: "2026-07-15", d: "On Track" },
                        ].map((row, idx) => (
                          <div key={idx} className="grid grid-cols-5 text-xs text-gray-300 divide-x divide-gray-850 hover:bg-slate-900/35 transition-all text-center">
                            <div className="p-3 font-mono font-bold text-gray-500 bg-slate-950/20 w-12 text-center">{idx + 1}</div>
                            <div className="p-3 text-left pl-4 font-semibold text-gray-100">{row.a}</div>
                            <div className="p-3 font-mono text-indigo-400">{row.b}</div>
                            <div className="p-3 font-mono text-gray-400">{row.c}</div>
                            <div className="p-3 font-mono font-bold text-emerald-400">{row.d}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {previewFileType === 'powerpoint' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-orange-400 font-extrabold flex items-center gap-1.5 font-sans">
                        <Presentation className="w-4 h-4" />
                        <span>Interactive Presentation Deck Viewer</span>
                      </span>
                    </div>

                    {/* Sliding visually polished powerpoint viewer */}
                    {(() => {
                      // Grab slides mapping if PowerPoint slides list is available
                      const matchingAttachment = selectedMeeting?.attachments?.find(att => att.fileName === previewAttachmentName);
                      const slides = matchingAttachment?.slides || Array.from({ length: 5 }, (_, i) => ({
                        slideNumber: i + 1,
                        slideLabel: `Slide ${i + 1}`,
                        note: `Sample session notes for PowerPoint Slide ${i + 1}`
                      }));

                      return (
                        <div className="space-y-4">
                          {/* Main Slide Stage */}
                          <div className="aspect-[16/9] bg-[#1a1d27] border border-gray-850 rounded-2xl flex flex-col items-center justify-center p-8 text-center shadow-lg relative overflow-hidden group">
                            {/* Slide Mock Visual Design */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/20 via-[#11131a] to-emerald-950/10" />
                            <div className="absolute top-4 left-4 font-mono text-xs text-gray-500">Corporate Pitch Presentation • Slide Visualizer</div>
                            
                            <Presentation className="w-16 h-16 text-orange-500/30 mb-4 z-10 animate-pulse" />
                            <h4 className="text-xl font-black text-gray-100 tracking-tight z-10 max-w-lg leading-snug">
                              Slide View Component
                            </h4>
                            <p className="text-gray-400 text-xs mt-2 max-w-sm leading-relaxed z-10">
                              Spreadsheet inputs and attachments processed dynamically inside MinuteMind corporate memory container.
                            </p>
                            <div className="absolute bottom-4 right-4 text-[10px] font-mono text-gray-500 font-black">CONFIDENTIAL</div>
                          </div>

                          {/* Visual thumbnails row */}
                          <div className="space-y-2">
                            <h5 className="text-[10px] text-gray-400 uppercase font-black tracking-widest font-mono">Select Slide Deck Thumbnail</h5>
                            <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
                              {slides.map((slide, sIdx) => (
                                <button
                                  key={sIdx}
                                  type="button"
                                  onClick={() => {
                                    showToast(`Viewing corporate deck Slide #${slide.slideNumber} ✓`);
                                  }}
                                  className="w-28 flex-shrink-0 bg-slate-900 border border-gray-800 hover:border-orange-500/50 p-2.5 rounded-xl transition-all text-left flex flex-col gap-1 focus:outline-none"
                                >
                                  <div className="h-11 w-full bg-[#1a1d27] rounded-lg flex items-center justify-center text-gray-600 border border-gray-850/50">
                                    <Presentation className="w-4 h-4 text-orange-400/55" />
                                  </div>
                                  <span className="font-mono text-[9px] font-bold text-orange-400 uppercase tracking-widest leading-none mt-1">Slide #{slide.slideNumber}</span>
                                  <span className="text-[10px] text-gray-300 font-semibold truncate leading-none">{slide.slideLabel}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {previewFileType !== 'pdf' && previewFileType !== 'excel' && previewFileType !== 'powerpoint' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-[#6c63ff] font-extrabold flex items-center gap-1.5 font-sans">
                        <FileText className="w-4 h-4 animate-pulse" />
                        <span>Formatted Deliverable Content View</span>
                      </span>
                    </div>

                    <div className="bg-[#11131a] border border-gray-850 p-8 rounded-2xl shadow-inner max-w-2xl mx-auto space-y-4 font-sans leading-relaxed text-gray-300">
                      <h4 className="text-[#6c63ff] tracking-tight font-black text-lg">Detailed Reference Deliverable Overview</h4>
                      <p className="text-sm">
                        This text view simulates full paragraphs derived from text extractors (including MS Word Doc / RTF parses) inside MinuteMind Corporate Memory space.
                      </p>
                      
                      <div className="border-l-[3px] border-[#6c63ff] pl-4 italic text-xs text-gray-400 leading-relaxed">
                        "The main deliverables scheduled for the next operating phase should be referenced and synchronized securely with team tasks and action owners. Key stakeholders are requested to upload updated files before the next Weekly Review."
                      </div>

                      <p className="text-sm">
                        All files uploaded to this meeting are packaged and indexed securely so they can be proxy-analyzed asynchronously via Gemini AI assistant.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom bar control action */}
              <div className="p-4 border-t border-gray-800 bg-[#161a24] flex justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="bg-slate-900 border border-gray-800 hover:bg-slate-800 text-gray-300 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                >
                  Close Viewport
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Style extensions */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f2937;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #374151;
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media print {
          body, html, #root {
            background: white !important;
            color: black !important;
          }
          /* Hide anything marked no-print or standard sidebar panels */
          aside, nav, header, button, .no-print {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* Expand the printable block to fill page dimensions */
          .printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }
          .printable-briefing-container {
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 14px !important;
          }
          .printable-briefing-container * {
            color: black !important;
            background: transparent !important;
          }
        }
      `}</style>

    </div>
  );
}
