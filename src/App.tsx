import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  auth, 
  db, 
  signInWithPopup, 
  microsoftProvider, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp,
  User 
} from './lib/firebase';
import { describeMeeting, extractMeetingName, findRelevantMeetings } from './services/gemini';
import { 
  Plus, 
  LogOut, 
  Search, 
  FileText, 
  Sparkles, 
  Trash2, 
  Save, 
  ChevronRight, 
  History, 
  LayoutDashboard,
  Loader2,
  Menu,
  X,
  Upload,
  Bot,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---
interface Meeting {
  id: string;
  name: string;
  minutes: string;
  aiDescription?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  authorName: string;
  authorEmail: string;
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-white text-black hover:bg-gray-200',
      secondary: 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700',
      ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-800',
      danger: 'bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50',
      accent: 'bg-blue-600 text-white hover:bg-blue-500',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none gap-2',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-[#151619] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-bold tracking-tight">{title}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // AI Search State
  const [isAISearchOpen, setIsAISearchOpen] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [isAISearching, setIsAISearching] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<Meeting[]>([]);

  // Delete Modal State
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);

  // Local Editor State to fix "broken" typing
  const [localMinutes, setLocalMinutes] = useState('');
  const [localName, setLocalName] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derived selected meeting
  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId) || null;

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, microsoftProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedMeetingId(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) {
      setMeetings([]);
      return;
    }

    const q = query(
      collection(db, 'meetings'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Meeting[];
      setMeetings(data);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Sync local state when selected meeting changes
  useEffect(() => {
    if (selectedMeeting) {
      setLocalMinutes(selectedMeeting.minutes);
      setLocalName(selectedMeeting.name);
    } else {
      setLocalMinutes('');
      setLocalName('');
    }
  }, [selectedMeetingId]);

  // --- Actions ---
  const createNewMeeting = async () => {
    if (!user) return;
    const newMeeting = {
      name: 'New Meeting',
      minutes: '',
      userId: user.uid,
      authorName: user.displayName || 'Unknown User',
      authorEmail: user.email || 'unknown@example.com',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    try {
      const docRef = await addDoc(collection(db, 'meetings'), newMeeting);
      setSelectedMeetingId(docRef.id);
    } catch (error) {
      console.error("Failed to create meeting:", error);
    }
  };

  const debouncedUpdate = useCallback((id: string, updates: Partial<Meeting>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const meeting = meetings.find(m => m.id === id);
        const backfill = (meeting && !meeting.authorName && user) ? {
          authorName: user.displayName || 'Unknown User',
          authorEmail: user.email || 'unknown@example.com'
        } : {};

        await updateDoc(doc(db, 'meetings', id), {
          ...updates,
          ...backfill,
          updatedAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("Failed to update meeting:", error);
      }
    }, 1000);
  }, [user, meetings]);

  const handleMinutesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalMinutes(val);
    if (selectedMeetingId) {
      debouncedUpdate(selectedMeetingId, { minutes: val });
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalName(val);
    if (selectedMeetingId) {
      debouncedUpdate(selectedMeetingId, { name: val });
    }
  };

  const confirmDelete = async () => {
    if (!meetingToDelete) return;
    try {
      await deleteDoc(doc(db, 'meetings', meetingToDelete));
      if (selectedMeetingId === meetingToDelete) setSelectedMeetingId(null);
      setMeetingToDelete(null);
    } catch (error) {
      console.error("Failed to delete meeting:", error);
    }
  };

  const generateAIInsights = async () => {
    if (!selectedMeetingId || !localMinutes) return;
    setIsGenerating(true);
    try {
      const description = await describeMeeting(localMinutes);
      const meeting = meetings.find(m => m.id === selectedMeetingId);
      const backfill = (meeting && !meeting.authorName && user) ? {
        authorName: user.displayName || 'Unknown User',
        authorEmail: user.email || 'unknown@example.com'
      } : {};

      await updateDoc(doc(db, 'meetings', selectedMeetingId), { 
        aiDescription: description,
        ...backfill,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error("AI Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMeetingId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        setLocalMinutes(text);
        const meeting = meetings.find(m => m.id === selectedMeetingId);
        const backfill = (meeting && !meeting.authorName && user) ? {
          authorName: user.displayName || 'Unknown User',
          authorEmail: user.email || 'unknown@example.com'
        } : {};

        await updateDoc(doc(db, 'meetings', selectedMeetingId), { 
          minutes: text,
          ...backfill,
          updatedAt: Timestamp.now()
        });
        
        // Auto-extract name if it's still default
        if (localName === 'New Meeting') {
          const newName = await extractMeetingName(text);
          setLocalName(newName);
          await updateDoc(doc(db, 'meetings', selectedMeetingId), { 
            name: newName,
            ...backfill,
            updatedAt: Timestamp.now()
          });
        }
      }
    };
    reader.readAsText(file);
  };

  const handleAISearch = async () => {
    if (!aiSearchQuery.trim()) return;
    setIsAISearching(true);
    try {
      const relevantIds = await findRelevantMeetings(aiSearchQuery, meetings);
      const results = meetings.filter(m => relevantIds.includes(m.id));
      setAiSearchResults(results);
    } catch (error) {
      console.error("AI Search failed:", error);
    } finally {
      setIsAISearching(false);
    }
  };

  // --- Filtering ---
  const filteredMeetings = meetings.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.minutes.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md"
        >
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/10">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">MinuteMind AI</h1>
          <p className="text-gray-400 mb-8 text-lg">
            Organize your meetings, generate instant summaries, and never lose a key decision again.
          </p>
          <Button size="lg" onClick={handleLogin} className="w-full bg-[#0078d4] hover:bg-[#005a9e] text-white">
            <img src="https://www.microsoft.com/favicon.ico" className="w-4 h-4 mr-2" alt="" />
            Sign in with Microsoft
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex overflow-hidden">
      {/* --- Sidebar --- */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-80 border-r border-gray-800 bg-[#0a0a0a] flex flex-col z-20"
          >
            <div className="p-6 border-bottom border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-white" />
                <span className="font-bold text-lg tracking-tight">MinuteMind</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="px-4 mb-4 space-y-2">
              <Button onClick={createNewMeeting} className="w-full justify-start gap-3">
                <Plus className="w-5 h-5" />
                New Meeting
              </Button>
              <Button variant="secondary" onClick={() => setIsAISearchOpen(true)} className="w-full justify-start gap-3">
                <Bot className="w-5 h-5 text-blue-400" />
                AI Assistant Search
              </Button>
            </div>

            <div className="px-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search meetings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
              <div className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Recent Meetings
              </div>
              {filteredMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => setSelectedMeetingId(meeting.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl transition-all group flex items-center gap-3",
                    selectedMeetingId === meeting.id 
                      ? "bg-white/5 border border-white/10" 
                      : "hover:bg-white/5 border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    selectedMeetingId === meeting.id ? "bg-white text-black" : "bg-gray-900 text-gray-500 group-hover:text-white"
                  )}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{meeting.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {meeting.updatedAt.toDate().toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 transition-all opacity-0 group-hover:opacity-100",
                    selectedMeetingId === meeting.id ? "text-white" : "text-gray-600"
                  )} />
                </button>
              ))}
              {filteredMeetings.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-600 text-sm italic">
                  No meetings found
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-800">
              <div className="flex items-center gap-3 px-2 py-2 mb-2">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="" className="w-8 h-8 rounded-full border border-gray-800" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.displayName}</div>
                  <div className="text-[10px] text-gray-500 truncate">{user.email}</div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/10">
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {!isSidebarOpen && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-6 left-6 z-10 bg-[#0a0a0a]/80 backdrop-blur-sm border border-gray-800"
          >
            <Menu className="w-4 h-4" />
          </Button>
        )}

        <AnimatePresence mode="wait">
          {selectedMeeting ? (
            <motion.div 
              key={selectedMeeting.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex h-full"
            >
              <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl w-full mx-auto space-y-8 pb-20">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={localName}
                        onChange={handleNameChange}
                        className="text-4xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full tracking-tight placeholder:text-gray-800"
                        placeholder="Meeting Name"
                      />
                      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500 uppercase tracking-widest font-medium">
                        <span className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5" />
                          Updated {selectedMeeting.updatedAt.toDate().toLocaleTimeString()}
                        </span>
                        <span className="w-1 h-1 bg-gray-800 rounded-full" />
                        <span className="flex items-center gap-1.5">
                          <LayoutDashboard className="w-3.5 h-3.5" />
                          {localMinutes.split(/\s+/).filter(Boolean).length} Words
                        </span>
                        <span className="w-1 h-1 bg-gray-800 rounded-full" />
                        <span className="flex items-center gap-1.5 text-blue-400">
                          Added by {selectedMeeting.authorName}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="danger" size="sm" onClick={() => setMeetingToDelete(selectedMeeting.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Editor Area */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Meeting Minutes</h3>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                          <input type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
                          <div className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
                            <Upload className="w-3.5 h-3.5" />
                            Upload Text
                          </div>
                        </label>
                      </div>
                    </div>
                    <textarea
                      value={localMinutes}
                      onChange={handleMinutesChange}
                      placeholder="Start typing or paste your meeting minutes here..."
                      className="w-full h-[50vh] bg-[#151619] border border-gray-800 rounded-2xl p-8 text-lg leading-relaxed focus:outline-none focus:ring-1 focus:ring-white/10 transition-all resize-none custom-scrollbar placeholder:text-gray-800"
                    />
                  </div>
                </div>
              </div>

              {/* AI Panel */}
              <div className="w-[400px] border-l border-gray-800 bg-[#0a0a0a] flex flex-col">
                <div className="p-8 border-b border-gray-800">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-white" />
                      <h3 className="font-bold tracking-tight">AI Insights</h3>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={generateAIInsights} 
                      disabled={isGenerating || !localMinutes}
                      className="rounded-full"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {selectedMeeting.aiDescription ? 'Refresh' : 'Generate'}
                    </Button>
                  </div>
                  
                  <div className="space-y-6">
                    {isGenerating ? (
                      <div className="space-y-4 py-8">
                        <div className="h-4 bg-gray-900 rounded animate-pulse w-3/4" />
                        <div className="h-4 bg-gray-900 rounded animate-pulse w-full" />
                        <div className="h-4 bg-gray-900 rounded animate-pulse w-5/6" />
                        <div className="h-4 bg-gray-900 rounded animate-pulse w-2/3" />
                        <p className="text-center text-xs text-gray-600 animate-pulse mt-8">Analyzing minutes and extracting key points...</p>
                      </div>
                    ) : selectedMeeting.aiDescription ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="prose prose-invert prose-sm max-w-none"
                      >
                        <div className="text-gray-400 leading-relaxed">
                          <ReactMarkdown>{selectedMeeting.aiDescription}</ReactMarkdown>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="text-center py-12 px-6 border-2 border-dashed border-gray-800 rounded-2xl">
                        <div className="w-12 h-12 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Sparkles className="w-6 h-6 text-gray-600" />
                        </div>
                        <p className="text-sm text-gray-500">
                          Click generate to get an AI-powered summary and action items from your minutes.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                   <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Quick Tips</h4>
                   <div className="space-y-4">
                      {[
                        { icon: Upload, text: "Upload .txt files to quickly import minutes." },
                        { icon: Save, text: "Changes are saved automatically in real-time." },
                        { icon: Search, text: "Use the search bar to find specific meetings." }
                      ].map((tip, i) => (
                        <div key={i} className="flex gap-3 text-xs text-gray-500">
                          <tip.icon className="w-4 h-4 shrink-0" />
                          <p>{tip.text}</p>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="w-24 h-24 bg-gray-900 rounded-[2rem] flex items-center justify-center mb-8 border border-gray-800">
                <FileText className="w-10 h-10 text-gray-600" />
              </div>
              <h2 className="text-3xl font-bold mb-4 tracking-tight">Select a meeting</h2>
              <p className="text-gray-500 max-w-sm mb-8">
                Choose a meeting from the sidebar or create a new one to start organizing your minutes.
              </p>
              <Button size="lg" onClick={createNewMeeting}>
                <Plus className="w-5 h-5" />
                Create New Meeting
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* --- AI Search Modal --- */}
      <Modal 
        isOpen={isAISearchOpen} 
        onClose={() => {
          setIsAISearchOpen(false);
          setAiSearchQuery('');
          setAiSearchResults([]);
        }} 
        title="AI Assistant Search"
      >
        <div className="space-y-6">
          <p className="text-sm text-gray-400">
            Describe the meeting you're looking for (e.g., "The one where we discussed the budget for Q3").
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiSearchQuery}
              onChange={(e) => setAiSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
              placeholder="Describe the meeting..."
              className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
            <Button onClick={handleAISearch} disabled={isAISearching || !aiSearchQuery.trim()}>
              {isAISearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </Button>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {isAISearching ? (
              <div className="py-8 text-center text-gray-500 text-sm animate-pulse">
                Searching through your minutes...
              </div>
            ) : aiSearchResults.length > 0 ? (
              aiSearchResults.map(meeting => (
                <button
                  key={meeting.id}
                  onClick={() => {
                    setSelectedMeetingId(meeting.id);
                    setIsAISearchOpen(false);
                  }}
                  className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="font-medium text-sm">{meeting.name}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{meeting.updatedAt.toDate().toLocaleDateString()}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
                </button>
              ))
            ) : aiSearchQuery && !isAISearching ? (
              <div className="py-8 text-center text-gray-600 text-sm italic">
                No matching meetings found.
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* --- Delete Confirmation Modal --- */}
      <Modal
        isOpen={!!meetingToDelete}
        onClose={() => setMeetingToDelete(null)}
        title="Delete Meeting"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-900/10 border border-red-900/20 rounded-xl">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
            <p className="text-sm text-red-200">
              Are you sure you want to delete this meeting? This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setMeetingToDelete(null)} className="flex-1">
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white border-none">
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
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
      `}</style>
    </div>
  );
}
