import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './ChatPage.css';

import VirtualClassPanel from '../components/VirtualClassPanel';
import { API_BASE } from '../config/api';
import { formatAfghanTime } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toTime = (value) => {
  return formatAfghanTime(value, { hour: '2-digit', minute: '2-digit' });
};

const fileUrl = (value = '') => {
  const normalized = String(value || '');
  if (!normalized) return '';
  if (normalized.startsWith('http')) return normalized;
  return `${API_BASE}/${normalized.replace(/^\//, '')}`;
};

const isImage = (url) => /\.(png|jpe?g|webp|gif)$/i.test(url || '');

const ROLE_LABELS = {
  parent: 'والد/سرپرست',
  student: 'شاگرد',
  instructor: 'استاد',
  admin: 'مدیر',
  finance_manager: 'مدیر مالی',
  finance_lead: 'مسئول مالی',
  school_manager: 'مدیر مکتب',
  academic_manager: 'مدیر تدریسی',
  head_teacher: 'سر معلم مکتب',
  general_president: 'ریاست عمومی'
};

const roleLabel = (user = {}) => {
  const orgRole = String(user?.orgRole || '').trim().toLowerCase();
  if (ROLE_LABELS[orgRole]) return ROLE_LABELS[orgRole];
  const role = String(user?.role || user || '').trim().toLowerCase();
  return ROLE_LABELS[role] || 'کاربر';
};

const appendUniqueMessages = (current = [], incoming = []) => {
  const seen = new Set(current.map((item) => String(item?._id || '')));
  const next = [...current];

  incoming.forEach((item) => {
    const key = String(item?._id || '');
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    next.push(item);
  });

  return next;
};

const bumpThreadActivity = (list = [], threadId, updatedAt) => {
  const targetId = String(threadId || '');
  if (!targetId) return list;

  const index = list.findIndex((item) => String(item?._id) === targetId);
  if (index === -1) return list;

  const next = [...list];
  const [matched] = next.splice(index, 1);
  next.unshift({ ...matched, updatedAt: updatedAt || matched.updatedAt });
  return next;
};

const CHAT_TABS = new Set(['live', 'direct', 'group']);

const normalizeChatTab = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CHAT_TABS.has(normalized) ? normalized : 'live';
};

const getInitialChatTab = () => {
  if (typeof window === 'undefined') return 'live';
  const params = new URLSearchParams(window.location.search || '');
  return normalizeChatTab(params.get('tab'));
};

const writeChatTabToUrl = (value = 'live') => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('tab', normalizeChatTab(value));
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

export default function ChatPage() {
  const role = localStorage.getItem('role') || 'student';
  const myId = localStorage.getItem('userId') || '';

  const [tab, setTab] = useState(getInitialChatTab);
  const [directThreads, setDirectThreads] = useState([]);
  const [groupThreads, setGroupThreads] = useState([]);
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineIds, setOnlineIds] = useState([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle');
  const messagesRef = useRef(null);
  const socketRef = useRef(null);
  const toastTimerRef = useRef(null);
  const selectedThreadIdRef = useRef('');
  const filePreviewUrlRef = useRef('');

  const activateTab = (nextTab) => {
    const normalized = normalizeChatTab(nextTab);
    setTab(normalized);
    writeChatTabToUrl(normalized);
  };

  const queueToast = (message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2500);
  };

  const joinThreadRealtime = (threadId) => {
    const socket = socketRef.current;
    if (!threadId) {
      setSyncStatus('idle');
      return;
    }
    if (!socket || !socket.connected) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('joining');
    socket.emit('chat:join', threadId, (ack = {}) => {
      if (String(selectedThreadIdRef.current) !== String(threadId)) return;
      setSyncStatus(ack?.ok ? 'ready' : 'error');
    });
  };

  const connectSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (socketRef.current) return;
    const socket = io(API_BASE, { auth: { token } });
    socketRef.current = socket;
    socket.on('connect', () => {
      if (selectedThreadIdRef.current) {
        joinThreadRealtime(selectedThreadIdRef.current);
      }
    });
    socket.on('disconnect', () => {
      setSyncStatus(selectedThreadIdRef.current ? 'offline' : 'idle');
    });
    socket.on('presence:update', (ids) => setOnlineIds(ids || []));
    socket.on('chat:new', (msg) => {
      const activeId = selectedThreadIdRef.current;
      const targetThreadId = String(msg?.thread || '');
      setDirectThreads((prev) => bumpThreadActivity(prev, targetThreadId, msg?.createdAt));
      setGroupThreads((prev) => bumpThreadActivity(prev, targetThreadId, msg?.createdAt));
      if (activeId && targetThreadId === String(activeId)) {
        setMessages((prev) => appendUniqueMessages(prev, [msg]));
        socket.emit('chat:seen', { threadId: activeId });
        scrollToBottom();
      } else {
        queueToast('پیام جدید دریافت شد');
      }
    });
    socket.on('chat:typing', ({ threadId, userId, typing }) => {
      if (!selectedThreadIdRef.current || String(threadId) !== String(selectedThreadIdRef.current)) return;
      setTypingUsers((prev) => ({ ...prev, [userId]: typing }));
    });
    socket.on('chat:seen', ({ threadId }) => {
      if (!selectedThreadIdRef.current || String(threadId) !== String(selectedThreadIdRef.current)) return;
      setMessages((prev) => prev.map((m) => ({ ...m, seen: true })));
    });
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    });
  };

  const loadThreads = async () => {
    try {
      const [directRes, groupRes] = await Promise.all([
        fetch(`${API_BASE}/api/chats/threads/direct`, { headers: { ...getAuthHeaders() } }),
        fetch(`${API_BASE}/api/chats/threads/group`, { headers: { ...getAuthHeaders() } })
      ]);
      const directData = await directRes.json();
      const groupData = await groupRes.json();
      const nextDirect = (directData?.items || []).map((item) => ({ ...item, type: 'direct' }));
      const nextGroup = (groupData?.items || []).map((item) => ({ ...item, type: 'group' }));
      setDirectThreads(nextDirect);
      setGroupThreads(nextGroup);
      setSelectedThread((current) => {
        const allThreads = [...nextDirect, ...nextGroup];
        if (current?._id) {
          const matched = allThreads.find((item) => String(item._id) === String(current._id));
          if (matched) return matched;
        }
        return nextDirect[0] || nextGroup[0] || null;
      });
    } catch {
      setError('خطا در دریافت فهرست گفتگوها');
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setUsers(data?.items || data?.users || []);
    } catch {
      setUsers([]);
    }
  };

  const loadMessages = async (threadId) => {
    if (!threadId) return;
    try {
      const res = await fetch(`${API_BASE}/api/chats/messages/${threadId}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      setMessages(data?.items || []);
      scrollToBottom();
      socketRef.current?.emit('chat:seen', { threadId });
    } catch {
      setMessages([]);
    }
  };

  const startDirect = async (userId) => {
    if (!userId) return;
    setSelectedUserId(userId);
    setError('');
    activateTab('direct');
    const existing = directThreads.find(t => String(t?.otherUser?._id) === String(userId));
    if (existing) {
      setSelectedThread(existing);
      setSelectedUserId('');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/chats/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data?.threadId) {
        const thread = {
          _id: data.threadId,
          type: 'direct',
          otherUser: users.find((u) => String(u._id) === String(userId)) || null,
          updatedAt: new Date().toISOString()
        };
        setDirectThreads(prev => {
          const exists = prev.some(p => String(p._id) === String(thread._id));
          return exists ? prev : [thread, ...prev];
        });
        setSelectedThread(thread);
        activateTab('direct');
        setError('');
        setSelectedUserId('');
        setTimeout(() => {
          document.querySelector('.chat-main')?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
      } else {
        const extra = data?.code || data?.name ? ` (${data.code || data.name})` : '';
        setError((data?.message || 'ایجاد چت مستقیم ناموفق بود.') + extra);
      }
    } catch {
      setError('خطا در ایجاد چت');
    }
  };

  const handleSend = async () => {
    if (!selectedThread) {
      setError('لطفاً ابتدا یک گفتگو را انتخاب کنید.');
      return;
    }
    setError('');
    if (!text.trim() && !file) {
      setError('پیام یا فایل را وارد کنید.');
      return;
    }
    try {
      const form = new FormData();
      if (text.trim()) form.append('text', text.trim());
      if (file) form.append('file', file);
      const res = await fetch(`${API_BASE}/api/chats/messages/${selectedThread._id}`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: form
      });
      const data = await res.json();
      if (data?.message) {
        setMessages((prev) => appendUniqueMessages(prev, [data.message]));
        setDirectThreads((prev) => bumpThreadActivity(prev, selectedThread._id, data.message?.createdAt));
        setGroupThreads((prev) => bumpThreadActivity(prev, selectedThread._id, data.message?.createdAt));
        setText('');
        setFile(null);
        socketRef.current?.emit('chat:typing', { threadId: selectedThread._id, typing: false });
        scrollToBottom();
      } else {
        setError(data?.message || 'ارسال پیام ناموفق بود.');
      }
    } catch {
      setError('خطا در ارسال پیام');
    }
  };

  useEffect(() => {
    selectedThreadIdRef.current = selectedThread?._id ? String(selectedThread._id) : '';
  }, [selectedThread?._id]);

  useEffect(() => {
    connectSocket();
    loadThreads();
    loadUsers();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedThread?._id) {
      setMessages([]);
      setTypingUsers({});
      setSyncStatus('idle');
      return;
    }

    setTypingUsers({});
    loadMessages(selectedThread._id);
    joinThreadRealtime(selectedThread._id);
  }, [selectedThread?._id]);

  useEffect(() => {
    if (tab === 'live') return;

    setSelectedThread((current) => {
      const source = tab === 'direct' ? directThreads : groupThreads;
      if (!source.length) return null;

      if (current?.type === tab && source.some((item) => String(item._id) === String(current._id))) {
        return current;
      }

      return source[0] || null;
    });
  }, [tab, directThreads, groupThreads]);

  useEffect(() => {
    if (!selectedThread?._id) return;
    socketRef.current?.emit('chat:typing', { threadId: selectedThread._id, typing: text.trim().length > 0 });
  }, [selectedThread?._id, text]);

  useEffect(() => {
    if (filePreviewUrlRef.current) {
      URL.revokeObjectURL(filePreviewUrlRef.current);
      filePreviewUrlRef.current = '';
    }
    if (file && isImage(file.name)) {
      filePreviewUrlRef.current = URL.createObjectURL(file);
    }
  }, [file]);

  const typingText = useMemo(() => {
    const active = Object.entries(typingUsers).filter(([, v]) => v);
    if (!active.length) return '';
    return 'در حال نوشتن...';
  }, [typingUsers]);

  const renderThreadLabel = (thread) => {
    if (thread.type === 'group' || thread.course) {
      return thread.course?.title || 'گروه صنف';
    }
    return thread.otherUser?.name || 'کاربر';
  };

  const switchTab = (nextTab) => {
    activateTab(nextTab);
  };

  const syncStatusMeta = {
    idle: { label: 'انتخاب گفتگو', tone: 'muted' },
    joining: { label: 'در حال وصل شدن', tone: 'pending' },
    ready: { label: 'همگام‌سازی زنده فعال', tone: 'live' },
    offline: { label: 'همگام‌سازی زنده غیرفعال', tone: 'muted' },
    error: { label: 'شروع همگام‌سازی ناموفق', tone: 'danger' }
  };
  const syncMeta = syncStatusMeta[syncStatus] || syncStatusMeta.idle;

  const currentList = tab === 'group' ? groupThreads : directThreads;
  const allowedUsers = users.filter(u => {
    if (String(u._id) === String(myId)) return false;
    if (role === 'admin') return true;
    if (role === 'instructor') return ['instructor', 'student'].includes(u.role);
    return ['instructor', 'admin'].includes(u.role);
  });
  const filteredUsers = allowedUsers.filter(u =>
    (u.name || '').toLowerCase().includes(userQuery.trim().toLowerCase())
  );

  return (
    <div className="chat-page">
      <div className="chat-card">
        {toast && <div className="chat-toast">{toast}</div>}
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <div className="chat-header">
          <div>
            <h2>سیستم مجازی و چت</h2>
            <p>صنف‌های آنلاین، چت مستقیم و گروه صنف همراه با فایل و آرشیف ضبط جلسات از همین بخش مدیریت می‌شود.</p>
          </div>
          <div className="chat-tabs">
            <button className={tab === 'live' ? 'active' : ''} onClick={() => switchTab('live')}>
              صنف‌های آنلاین
            </button>
            <button className={tab === 'direct' ? 'active' : ''} onClick={() => switchTab('direct')}>
              چت مستقیم
            </button>
            <button className={tab === 'group' ? 'active' : ''} onClick={() => switchTab('group')}>
              گروه صنف
            </button>
          </div>
        </div>

        {error && <div className="chat-empty">{error}</div>}

        {tab === 'live' ? (
          <VirtualClassPanel role={role} />
        ) : (
          <div className="chat-layout">
          <aside className="chat-sidebar">
            {tab === 'direct' && (
              <div className="chat-start">
                <input
                  type="text"
                  placeholder="جستجوی مخاطب..."
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
                <div className="chat-user-list">
                  {filteredUsers.map(u => (
                    <button
                      type="button"
                      key={u._id}
                      className={selectedUserId === u._id ? 'active' : ''}
                      onClick={() => startDirect(u._id)}
                    >
                      <span className="chat-user-name">{u.name}</span>
                      <span className="chat-user-role">{roleLabel(u)}</span>
                    </button>
                  ))}
                  {!filteredUsers.length && <div className="chat-empty">مخاطبی پیدا نشد.</div>}
                </div>
                <button type="button" className="chat-refresh" onClick={loadThreads}>به‌روزرسانی</button>
              </div>
            )}

            <div className="chat-list">
              {!currentList.length && <div className="chat-empty">گفتگویی ثبت نشده است.</div>}
              {currentList.map(thread => {
                const active = selectedThread && String(thread._id) === String(selectedThread._id);
                const label = renderThreadLabel(thread);
                const online = thread.otherUser && onlineIds.includes(String(thread.otherUser._id));
                return (
                  <button
                    key={thread._id}
                    className={active ? 'active' : ''}
                    onClick={() => {
                      setSelectedThread({ ...thread, type: thread.type || (thread.course ? 'group' : 'direct') });
                    }}
                  >
                    <div className="chat-user-line">
                      <span className={`status-dot ${online ? 'online' : ''}`} />
                      <strong>{label}</strong>
                    </div>
                    {thread.otherUser && <span>{roleLabel(thread.otherUser)}</span>}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="chat-main">
            {!selectedThread ? (
              <div className="chat-empty">یک گفتگو را انتخاب کنید.</div>
            ) : (
              <>
                <div className="chat-title">
                  <div>
                    <strong>{renderThreadLabel(selectedThread)}</strong>
                    {selectedThread.otherUser && (
                      <span className={`presence ${onlineIds.includes(String(selectedThread.otherUser._id)) ? 'online' : ''}`}>
                        {onlineIds.includes(String(selectedThread.otherUser._id)) ? 'آنلاین' : 'آفلاین'}
                      </span>
                    )}
                  </div>
                  <span className={`chat-sync-badge ${syncMeta.tone}`}>{syncMeta.label}</span>
                </div>

                <div className="chat-messages" ref={messagesRef}>
                  {messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`chat-message ${msg?.sender?._id === myId ? 'mine' : ''}`}
                    >
                      <div className="meta">
                        <span>{msg?.sender?.name || 'کاربر'}</span>
                        <span>{toTime(msg.createdAt)}</span>
                      </div>
                      {msg.text && <p>{msg.text}</p>}
                      {msg.file && (
                        <div className="chat-file">
                          {isImage(msg.file) ? (
                            <img src={fileUrl(msg.file)} alt="file" />
                          ) : (
                            <a href={fileUrl(msg.file)} target="_blank" rel="noreferrer">دانلود فایل</a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {typingText && <div className="chat-typing">{typingText}</div>}

              </>
            )}
            <div className="chat-input">
              <textarea
                rows="3"
                placeholder={selectedThread ? 'پیام خود را بنویسید...' : 'برای نوشتن پیام، یک گفتگو را انتخاب کنید.'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!selectedThread}
              />
              <div className="chat-actions">
                <label className={`file-btn ${!selectedThread ? 'disabled' : ''}`}>
                  انتخاب فایل
                  <input type="file" disabled={!selectedThread} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                <button type="button" onClick={handleSend} disabled={!selectedThread}>ارسال</button>
              </div>
              {file && (
                <div className="chat-preview">
                  {filePreviewUrlRef.current ? (
                    <img src={filePreviewUrlRef.current} alt="preview" />
                  ) : (
                    <div className="file-label">{file.name}</div>
                  )}
                </div>
              )}
            </div>
          </section>
          </div>
        )}
      </div>
    </div>
  );
}
