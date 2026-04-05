import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDoc,
  limit,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Upload, 
  BarChart3, 
  LogOut, 
  Plus, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  X,
  ChevronRight,
  Database,
  ArrowRightLeft,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { cn } from './lib/utils';

// --- Types ---
interface Customer {
  id: string;
  name: string;
  customerId: string;
  taxId: string;
  address: string;
  createdBy: string;
  createdAt: any;
}

interface ComparisonLog {
  customerId: string;
  matchedAt: any;
  matchedBy: string;
}

interface ColumnMapping {
  name: string;
  customerId: string;
  taxId: string;
  address: string;
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
      secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 shadow-sm',
      ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
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
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "發生了錯誤，請稍後再試。";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error.includes("insufficient permissions")) {
          message = "權限不足，請聯繫管理員。";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-md w-full p-8 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">系統錯誤</h2>
            <p className="text-gray-600">{message}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              重新整理
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logs, setLogs] = useState<ComparisonLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'upload' | 'compare' | 'stats'>('search');
  
  // Excel Upload State
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ name: '', customerId: '', taxId: '', address: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Comparison State
  const [compareResults, setCompareResults] = useState<{ original: any, matched: Customer | null }[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Listen to customers
    const qCustomers = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    // Listen to logs
    const qLogs = query(collection(db, 'comparisonLogs'), orderBy('matchedAt', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as ComparisonLog);
      setLogs(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'comparisonLogs');
    });

    return () => {
      unsubCustomers();
      unsubLogs();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const lower = searchTerm.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(lower) ||
      c.customerId.toLowerCase().includes(lower) ||
      c.taxId.toLowerCase().includes(lower) ||
      c.address.toLowerCase().includes(lower)
    );
  }, [customers, searchTerm]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, mode: 'upload' | 'compare') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      if (data.length > 0) {
        const headers = data[0] as string[];
        const rows = data.slice(1);
        setExcelHeaders(headers);
        setExcelData(rows);
        
        // Auto-mapping attempt
        const newMapping = { ...mapping };
        headers.forEach(h => {
          const lower = h.toLowerCase();
          if (lower.includes('姓名') || lower.includes('name')) newMapping.name = h;
          if (lower.includes('客代') || lower.includes('customer id') || lower.includes('id')) newMapping.customerId = h;
          if (lower.includes('統編') || lower.includes('tax') || lower.includes('vat')) newMapping.taxId = h;
          if (lower.includes('地址') || lower.includes('address')) newMapping.address = h;
        });
        setMapping(newMapping);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processUpload = async () => {
    if (!user || !mapping.name || !mapping.customerId || !mapping.taxId || !mapping.address) {
      setUploadStatus({ type: 'error', message: '請確保所有欄位都已對應。' });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const nameIdx = excelHeaders.indexOf(mapping.name);
      const idIdx = excelHeaders.indexOf(mapping.customerId);
      const taxIdx = excelHeaders.indexOf(mapping.taxId);
      const addrIdx = excelHeaders.indexOf(mapping.address);

      let successCount = 0;
      for (const row of excelData) {
        if (!row[nameIdx] && !row[idIdx]) continue;
        
        await addDoc(collection(db, 'customers'), {
          name: String(row[nameIdx] || ''),
          customerId: String(row[idIdx] || ''),
          taxId: String(row[taxIdx] || ''),
          address: String(row[addrIdx] || ''),
          createdBy: user.uid,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'customers'));
        successCount++;
      }

      setUploadStatus({ type: 'success', message: `成功新增 ${successCount} 筆資料。` });
      setExcelData([]);
      setExcelHeaders([]);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadStatus({ type: 'error', message: '上傳失敗，請檢查權限或格式。' });
    } finally {
      setIsUploading(false);
    }
  };

  const processCompare = async () => {
    if (!mapping.name && !mapping.customerId && !mapping.taxId && !mapping.address) {
      setUploadStatus({ type: 'error', message: '請至少對應一個欄位進行比對。' });
      return;
    }

    const results = [];
    const nameIdx = excelHeaders.indexOf(mapping.name);
    const idIdx = excelHeaders.indexOf(mapping.customerId);
    const taxIdx = excelHeaders.indexOf(mapping.taxId);
    const addrIdx = excelHeaders.indexOf(mapping.address);

    for (const row of excelData) {
      const rowName = String(row[nameIdx] || '').toLowerCase();
      const rowId = String(row[idIdx] || '').toLowerCase();
      const rowTax = String(row[taxIdx] || '').toLowerCase();
      const rowAddr = String(row[addrIdx] || '').toLowerCase();

      const matched = customers.find(c => 
        (rowId && c.customerId.toLowerCase() === rowId) ||
        (rowTax && c.taxId.toLowerCase() === rowTax) ||
        (rowName && c.name.toLowerCase() === rowName)
      );

      if (matched) {
        // Log the match for stats
        await addDoc(collection(db, 'comparisonLogs'), {
          customerId: matched.customerId,
          matchedAt: serverTimestamp(),
          matchedBy: user?.uid
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'comparisonLogs'));
      }

      results.push({
        original: {
          name: row[nameIdx],
          customerId: row[idIdx],
          taxId: row[taxIdx],
          address: row[addrIdx]
        },
        matched: matched || null
      });
    }

    setCompareResults(results);
    setUploadStatus({ type: 'success', message: `比對完成，共 ${results.length} 筆。` });
  };

  const statsData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      counts[log.customerId] = (counts[log.customerId] || 0) + 1;
    });
    
    return Object.entries(counts)
      .map(([id, count]) => {
        const customer = customers.find(c => c.customerId === id);
        return {
          name: customer ? customer.name : id,
          count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [logs, customers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Database className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">客戶資料管理系統</h1>
            <p className="text-gray-500 mb-8">請登入以管理客戶資料與進行 Excel 比對</p>
            <Button onClick={handleLogin} className="w-full py-6 text-base">
              使用 Google 帳號登入
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Data Manager</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('search')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === 'search' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <Search className="w-4 h-4" />
            資料搜尋
          </button>
          <button 
            onClick={() => setActiveTab('upload')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === 'upload' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <Plus className="w-4 h-4" />
            新增資料
          </button>
          <button 
            onClick={() => setActiveTab('compare')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === 'compare' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <ArrowRightLeft className="w-4 h-4" />
            資料比對
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
              activeTab === 'stats' ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            統計分析
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
            <LogOut className="w-4 h-4 mr-2" />
            登出
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 md:hidden">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-gray-900">Data Manager</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'search' && (
              <motion.div 
                key="search"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">資料搜尋</h2>
                    <p className="text-gray-500">搜尋資料庫中的客戶資訊</p>
                  </div>
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      placeholder="輸入姓名、客代、統編或地址..." 
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">姓名</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">客代</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">統編</th>
                          <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">地址</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((c) => (
                            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-sm text-gray-900 font-medium">{c.name}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{c.customerId}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{c.taxId}</td>
                              <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{c.address}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                              找不到符合條件的資料
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">新增資料</h2>
                  <p className="text-gray-500">從 Excel 上傳客戶資料到資料庫</p>
                </div>

                <Card className="p-8">
                  <div className="max-w-2xl mx-auto space-y-8">
                    {!excelData.length ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-indigo-300 transition-colors cursor-pointer relative">
                        <input 
                          type="file" 
                          accept=".xlsx, .xls" 
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => handleFileUpload(e, 'upload')}
                        />
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Upload className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">點擊或拖拽 Excel 檔案</h3>
                        <p className="text-gray-500">支援 .xlsx, .xls 格式</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-6 h-6 text-green-600" />
                            <span className="font-medium text-gray-900">已載入 {excelData.length} 筆資料</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setExcelData([]); setExcelHeaders([]); }}>
                            <X className="w-4 h-4 mr-2" /> 重選
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(['name', 'customerId', 'taxId', 'address'] as const).map((key) => (
                            <div key={key} className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                {key === 'name' ? '姓名' : key === 'customerId' ? '客代' : key === 'taxId' ? '統編' : '地址'} 對應欄位
                              </label>
                              <select 
                                className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                value={mapping[key]}
                                onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                              >
                                <option value="">請選擇...</option>
                                {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>

                        <Button 
                          onClick={processUpload} 
                          className="w-full py-6" 
                          disabled={isUploading}
                        >
                          {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                          開始上傳到資料庫
                        </Button>
                      </div>
                    )}

                    {uploadStatus && (
                      <div className={cn(
                        "p-4 rounded-lg flex items-center gap-3",
                        uploadStatus.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}>
                        {uploadStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="text-sm font-medium">{uploadStatus.message}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'compare' && (
              <motion.div 
                key="compare"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">資料比對</h2>
                  <p className="text-gray-500">上傳 Excel 並與資料庫比對尋找客代</p>
                </div>

                <Card className="p-8">
                  <div className="max-w-4xl mx-auto space-y-8">
                    {!excelData.length ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-indigo-300 transition-colors cursor-pointer relative">
                        <input 
                          type="file" 
                          accept=".xlsx, .xls" 
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => handleFileUpload(e, 'compare')}
                        />
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ArrowRightLeft className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">上傳待比對的 Excel</h3>
                        <p className="text-gray-500">系統將自動尋找匹配的客代</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-6 h-6 text-green-600" />
                            <span className="font-medium text-gray-900">已載入 {excelData.length} 筆待比對資料</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setExcelData([]); setExcelHeaders([]); setCompareResults([]); }}>
                            <X className="w-4 h-4 mr-2" /> 重選
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(['name', 'customerId', 'taxId', 'address'] as const).map((key) => (
                            <div key={key} className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                {key === 'name' ? '姓名' : key === 'customerId' ? '客代' : key === 'taxId' ? '統編' : '地址'} 對應欄位
                              </label>
                              <select 
                                className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                                value={mapping[key]}
                                onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                              >
                                <option value="">請選擇...</option>
                                {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>

                        <Button onClick={processCompare} className="w-full py-6">
                          <Search className="w-4 h-4 mr-2" />
                          開始比對
                        </Button>

                        {compareResults.length > 0 && (
                          <div className="mt-8 space-y-4">
                            <h3 className="font-bold text-gray-900">比對結果</h3>
                            <div className="overflow-x-auto border border-gray-100 rounded-lg">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Excel 資料</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">比對狀態</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">資料庫客代</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {compareResults.map((res, i) => (
                                    <tr key={i}>
                                      <td className="px-4 py-3 text-sm text-gray-600">
                                        {res.original.name || res.original.taxId || '未知'}
                                      </td>
                                      <td className="px-4 py-3">
                                        {res.matched ? (
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> 已匹配
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                            未找到
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-sm font-bold text-indigo-600">
                                        {res.matched?.customerId || '-'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div 
                key="stats"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">統計分析</h2>
                  <p className="text-gray-500">查看最常被比對的客戶資料</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">熱門比對客戶 (Top 10)</h3>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statsData} layout="vertical" margin={{ left: 40, right: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            tick={{ fontSize: 12, fill: '#666' }}
                          />
                          <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {statsData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#818cf8'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">最近比對紀錄</h3>
                    <div className="space-y-4">
                      {logs.slice(0, 8).map((log, i) => {
                        const customer = customers.find(c => c.customerId === log.customerId);
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{customer?.name || log.customerId}</p>
                              <p className="text-xs text-gray-500">
                                {log.matchedAt?.toDate().toLocaleString() || '剛剛'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
