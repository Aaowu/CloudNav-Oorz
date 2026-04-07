import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Bot, Key, Globe, Sparkles, PauseCircle, Wrench, Box, Copy, Check, LayoutTemplate, Info, Download, Sidebar, Keyboard, MousePointerClick, AlertTriangle, Package, Zap, Menu, Upload } from 'lucide-react';
import { AIConfig, LinkItem, Category, SiteSettings } from '../types';
import { generateLinkDescription } from '../services/geminiService';
import JSZip from 'jszip';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  siteSettings: SiteSettings;
  onSave: (config: AIConfig, siteSettings: SiteSettings) => void;
  links: LinkItem[];
  categories: Category[];
  onUpdateLinks: (links: LinkItem[]) => void;
  authToken: string | null;
}


const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, config, siteSettings, onSave, links, categories, onUpdateLinks, authToken 
}) => {
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'tools'>('site');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  
  const [localSiteSettings, setLocalSiteSettings] = useState<SiteSettings>(() => ({
      title: siteSettings?.title || 'CloudNav - 我的导航',
      navTitle: siteSettings?.navTitle || 'CloudNav',
      favicon: siteSettings?.favicon || '',
      cardStyle: siteSettings?.cardStyle || 'detailed',
      requirePasswordOnVisit: siteSettings?.requirePasswordOnVisit ?? false,
      passwordExpiryDays: siteSettings?.passwordExpiryDays ?? 7
  }));
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [browserType, setBrowserType] = useState<'chrome' | 'firefox'>('chrome');
  const [isZipping, setIsZipping] = useState(false);
  const faviconUploadRef = useRef<HTMLInputElement>(null);
  
  const [copiedStates, setCopiedStates] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      const safeSettings = {
          title: siteSettings?.title || 'CloudNav - 我的导航',
          navTitle: siteSettings?.navTitle || 'CloudNav',
          favicon: siteSettings?.favicon || '',
          cardStyle: siteSettings?.cardStyle || 'detailed',
          requirePasswordOnVisit: siteSettings?.requirePasswordOnVisit ?? false,
          passwordExpiryDays: siteSettings?.passwordExpiryDays ?? 7
      };
      setLocalSiteSettings(safeSettings);

      setIsProcessing(false);
      setIsZipping(false);
      setProgress({ current: 0, total: 0 });
      shouldStopRef.current = false;
      setDomain(window.location.origin);
      const storedToken = localStorage.getItem('cloudnav_auth_token');
      if (storedToken) setPassword(storedToken);
    }
  }, [isOpen, config, siteSettings]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSiteChange = async (key: keyof SiteSettings, value: any) => {
    setLocalSiteSettings(prev => {
        const next = { ...prev, [key]: value };
        
        // 如果是身份验证过期天数修改，立即保存到 KV 空间
        if (key === 'passwordExpiryDays' && authToken) {
            saveWebsiteConfigToKV(next);
        }
        
        return next;
    });
  };

  // 保存网站配置到 KV 空间
  const saveWebsiteConfigToKV = async (siteSettings: SiteSettings) => {
    try {
        const authIssuedAt = localStorage.getItem('lastLoginTime');
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': authToken || '',
                ...(authIssuedAt ? { 'x-auth-issued-at': authIssuedAt } : {})
            },
            body: JSON.stringify({
                saveConfig: 'website',
                config: siteSettings
            })
        });
        
        if (!response.ok) {
            console.error('Failed to save website config to KV:', response.statusText);
        }
    } catch (error) {
        console.error('Error saving website config to KV:', error);
    }
  };

  const handleSave = () => {
    onSave(localConfig, localSiteSettings);
    onClose();
  };

  const handleBulkGenerate = async () => {
    if (!localConfig.apiKey) {
        alert("请先配置并保存 API Key");
        return;
    }

    const missingLinks = links.filter(l => !l.description);
    if (missingLinks.length === 0) {
        alert("所有链接都已有描述！");
        return;
    }

    if (!confirm(`发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`)) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });
    
    let currentLinks = [...links];

    for (let i = 0; i < missingLinks.length; i++) {
        if (shouldStopRef.current) break;

        const link = missingLinks[i];
        try {
            const desc = await generateLinkDescription(link.title, link.url, localConfig);
            currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
            onUpdateLinks(currentLinks);
            setProgress({ current: i + 1, total: missingLinks.length });
        } catch (e) {
            console.error(`Failed to generate for ${link.title}`, e);
        }
    }

    setIsProcessing(false);
  };

  const handleCopy = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [key]: false }));
      }, 2000);
  };

  const handleLocalFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
          alert('请上传图片文件');
          e.target.value = '';
          return;
      }

      const reader = new FileReader();
      reader.onload = () => {
          if (typeof reader.result === 'string') {
              handleSiteChange('favicon', reader.result);
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const handleDownloadFile = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const getManifestJson = () => {
    const navName = localSiteSettings.navTitle || "CloudNav";
    const json: any = {
        manifest_version: 3,
        name: navName + " Pro",
        version: "7.6",
        minimum_chrome_version: "116",
        description: `${navName} - 侧边栏 + 弹窗双模式收藏助手`,
        permissions: ["activeTab", "scripting", "sidePanel", "storage", "favicon", "contextMenus", "notifications", "tabs"],
        background: {
            service_worker: "background.js"
        },
        action: {
            default_title: `打开 ${navName} 弹窗`
        },
        side_panel: {
            default_path: "sidebar.html"
        },
        icons: {
            "128": "icon.png"
        },
        commands: {
          "_execute_action": {
            "suggested_key": {
              "default": "Ctrl+Shift+E",
              "mac": "Command+Shift+E"
            },
            "description": `打开 ${navName} 弹窗`
          },
          "open_sidepanel": {
            "suggested_key": {
              "default": "Alt+Shift+E",
              "mac": "Option+Shift+E"
            },
            "description": `打开 ${navName} 侧边栏`
          }
        }
    };
    json.action.default_popup = "popup.html";
    
    if (browserType === 'firefox') {
        json.browser_specific_settings = {
            gecko: {
                id: "cloudnav@example.com",
                strict_min_version: "109.0"
            }
        };
    }
    
    return JSON.stringify(json, null, 2);
  };

const extBackgroundJs = `// background.js - ${localSiteSettings.navTitle || 'CloudNav'} Assistant v7.6
const CONFIG = {
  apiBase: "${domain}",
  password: "${password}",
  authTimestamp: "${localStorage.getItem('lastLoginTime') || ''}",
  siteName: "${(localSiteSettings.navTitle || 'CloudNav').replace(/"/g, '\\"')}"
};
const MODE_KEY = 'cloudnav_ui_mode';
const POPUP_PATH = 'popup.html';

let linkCache = [];
let categoryCache = [];

async function getUiMode() {
    const data = await chrome.storage.local.get(MODE_KEY);
    return data[MODE_KEY] === 'sidepanel' ? 'sidepanel' : 'popup';
}

async function setUiMode(mode) {
    await chrome.storage.local.set({ [MODE_KEY]: mode });
    await chrome.action.setPopup({ popup: mode === 'popup' ? POPUP_PATH : '' });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: mode === 'sidepanel' }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  setUiMode('popup').catch(() => {});
  refreshCache().then(buildMenus);
});

chrome.runtime.onStartup?.addListener(() => {
    getUiMode().then((mode) => setUiMode(mode)).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.cloudnav_data) {
        refreshCache().then(buildMenus);
    }
    if (area === 'local' && changes[MODE_KEY]) {
        setUiMode(changes[MODE_KEY].newValue === 'sidepanel' ? 'sidepanel' : 'popup').catch(() => {});
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'open-sidepanel') {
        const targetWindowId = message.windowId || sender.tab?.windowId;
        if (targetWindowId) {
            setUiMode('sidepanel').then(() => chrome.sidePanel.open({ windowId: targetWindowId })).then(() => {
                sendResponse({ ok: true });
            }).catch((error) => {
                console.error('Failed to open side panel', error);
                sendResponse({ ok: false });
            });
            return true;
        }
    }
    if (message?.type === 'switch-to-popup') {
        setUiMode('popup').then(() => {
            sendResponse({ ok: true });
        }).catch((error) => {
            console.error('Failed to switch to popup', error);
            sendResponse({ ok: false });
        });
        return true;
    }
    return false;
});

async function refreshCache() {
    const data = await chrome.storage.local.get('cloudnav_data');
    if (data && data.cloudnav_data) {
        linkCache = data.cloudnav_data.links || [];
        categoryCache = data.cloudnav_data.categories || [];
    }
    return;
}

const windowPorts = {};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cloudnav_sidebar') return;
  port.onMessage.addListener((msg) => {
    if (msg.type === 'init' && msg.windowId) {
      windowPorts[msg.windowId] = port;
      port.onDisconnect.addListener(() => {
        if (windowPorts[msg.windowId] === port) {
          delete windowPorts[msg.windowId];
        }
      });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.windowId) return;
        if (command === 'open_sidepanel') {
            await setUiMode('sidepanel');
            await chrome.sidePanel.open({ windowId: tab.windowId });
            return;
        }
        if (command === '_execute_action') {
            await setUiMode('popup');
            await chrome.action.openPopup();
        }
    } catch (e) {
        console.error('Failed to handle command', e);
    }
});

function buildMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "cloudnav_root",
            title: \`⚡ 保存到 \${CONFIG.siteName}\`,
            contexts: ["page", "link", "action"]
        });

        if (categoryCache.length > 0) {
            categoryCache.forEach(cat => {
                chrome.contextMenus.create({
                    id: \`save_to_\${cat.id}\`,
                    parentId: "cloudnav_root",
                    title: cat.name,
                    contexts: ["page", "link", "action"]
                });
            });
        } else {
            chrome.contextMenus.create({
                id: "save_to_common",
                parentId: "cloudnav_root",
                title: "默认分类",
                contexts: ["page", "link", "action"]
            });
        }
    });
}

function updateMenuTitle(url) {
    if (!url) return;
    const cleanUrl = url.replace(/\\/$/, '').toLowerCase();
    const exists = linkCache.some(l => l.url && l.url.replace(/\\/$/, '').toLowerCase() === cleanUrl);
    const newTitle = exists ? \`⚠️ 已存在 - 保存到 \${CONFIG.siteName}\` : \`⚡ 保存到 \${CONFIG.siteName}\`;
    chrome.contextMenus.update("cloudnav_root", { title: newTitle }, () => {
        if (chrome.runtime.lastError) { }
    });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
   try {
       const tab = await chrome.tabs.get(activeInfo.tabId);
       if (tab && tab.url) updateMenuTitle(tab.url);
   } catch(e){}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
   if (changeInfo.status === 'complete' && tab.active && tab.url) {
       updateMenuTitle(tab.url);
   }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (String(info.menuItemId).startsWith("save_to_")) {
        const catId = String(info.menuItemId).replace("save_to_", "");
        const title = tab.title;
        const url = info.linkUrl || tab.url;
        const cleanUrl = url.replace(/\\/$/, '').toLowerCase();
        const exists = linkCache.some(l => l.url.replace(/\\/$/, '').toLowerCase() === cleanUrl);
        saveLink(title, url, catId);
    }
});

async function saveLink(title, url, categoryId, icon = '') {
    if (!CONFIG.password) {
        notify('保存失败', '未配置密码，请先在侧边栏登录。');
        return;
    }

    if (!icon) {
        try {
            const u = new URL(url);
            icon = \`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=\${encodeURIComponent(u.origin)}&size=128\`;
        } catch(e){}
    }

    try {
        const domain = new URL(url).hostname;
        const iconRes = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': CONFIG.password,
                ...(CONFIG.authTimestamp ? { 'x-auth-issued-at': CONFIG.authTimestamp } : {})
            },
            body: JSON.stringify({
                saveConfig: 'favicon',
                domain,
                icon
            })
        });

        if (iconRes.ok) {
            const iconData = await iconRes.json();
            icon = iconData.icon || icon;
        }
    } catch (e) {}

    try {
        const res = await fetch(\`\${CONFIG.apiBase}/api/link\`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-password': CONFIG.password,
                ...(CONFIG.authTimestamp ? { 'x-auth-issued-at': CONFIG.authTimestamp } : {})
            },
            body: JSON.stringify({
                title: title || '未命名',
                url: url,
                categoryId: categoryId,
                icon: icon
            })
        });

        if (res.ok) {
            notify('保存成功', \`已保存到 \${CONFIG.siteName}\`);
            chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
            const newLink = { id: Date.now().toString(), title, url, categoryId, icon };
            linkCache.unshift(newLink);
            updateMenuTitle(url);
        } else {
            notify('保存失败', \`服务器错误: \${res.status}\`);
        }
    } catch (e) {
        notify('保存失败', '网络请求错误');
    }
}

function notify(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message,
        priority: 1
    });
}
`;

  const extSidebarHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        :root {
            --bg: #ffffff;
            --text: #1e293b;
            --border: #e2e8f0;
            --hover: #f1f5f9;
            --accent: #3b82f6;
            --muted: #64748b;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --text: #f1f5f9;
                --border: #334155;
                --hover: #1e293b;
                --accent: #60a5fa;
                --muted: #94a3b8;
            }
        }
        html, body { width: 100%; min-width: 0; max-width: 100%; overflow-x: hidden; }
        * { box-sizing: border-box; min-width: 0; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding-bottom: 20px; }
        
        .header { position: sticky; top: 0; padding: 10px 12px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 10; display: flex; gap: 8px; min-width: 0; }
        .search-input { flex: 1; min-width: 0; width: 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--hover); color: var(--text); outline: none; font-size: 13px; }
        .search-input:focus { border-color: var(--accent); }
        
        .refresh-btn { width: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: var(--hover); border-radius: 6px; color: var(--muted); cursor: pointer; transition: all 0.2s; }
        .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
        .refresh-btn:active { transform: scale(0.95); }
        .rotating { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .content { padding: 4px; min-width: 0; }
        .cat-group { margin-bottom: 2px; }
        .cat-header { 
            padding: 8px 10px; font-size: 13px; font-weight: 600; color: var(--text); 
            cursor: pointer; display: flex; items-center; gap: 8px; border-radius: 6px;
            user-select: none; transition: background 0.1s;
        }
        .cat-header span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-header:hover { background: var(--hover); }
        .cat-arrow { width: 14px; height: 14px; color: var(--muted); transition: transform 0.2s; }
        .cat-header.active .cat-arrow { transform: rotate(90deg); color: var(--accent); }
        
        .cat-links { display: none; padding-left: 8px; margin-bottom: 8px; }
        .cat-header.active + .cat-links { display: block; }
        
        .link-item { display: flex; items-center; gap: 8px; padding: 6px 8px; border-radius: 6px; text-decoration: none; color: var(--text); transition: background 0.1s; border-left: 2px solid transparent; }
        .link-item:hover { background: var(--hover); border-left-color: var(--accent); }
        .link-icon { width: 16px; height: 16px; flex-shrink: 0; display: flex; items-center; justify-content: center; overflow: hidden; }
        .link-icon img { width: 100%; height: 100%; object-fit: contain; }
        .link-info { min-width: 0; flex: 1; }
        .link-title { font-size: 13px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        
        .empty { text-align: center; padding: 20px; color: var(--muted); font-size: 12px; }
        .loading { display: flex; justify-content: center; padding: 40px; color: var(--accent); font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <input type="text" id="search" class="search-input" placeholder="搜索..." autocomplete="off">
        <button id="switchPopup" class="refresh-btn" title="切到小窗">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16"/></svg>
        </button>
        <button id="refresh" class="refresh-btn" title="同步最新数据">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        </button>
    </div>
    <div id="content" class="content">
        <div class="loading">初始化...</div>
    </div>
    <script src="sidebar.js"></script>
</body>
</html>`;

const extSidebarJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}",
  authTimestamp: "${localStorage.getItem('lastLoginTime') || ''}"
};
const CACHE_KEY = 'cloudnav_data';

let port = null;
try {
    port = chrome.runtime.connect({ name: 'cloudnav_sidebar' });
    chrome.windows.getCurrent((win) => {
        if (win && port) {
            port.postMessage({ type: 'init', windowId: win.id });
        }
    });

    port.onMessage.addListener((msg) => {
        if (msg.action === 'close_panel') {
            window.close();
        }
    });
} catch(e) {
    console.error('Connection failed', e);
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('content');
    const searchInput = document.getElementById('search');
    const refreshBtn = document.getElementById('refresh');
    const switchPopupBtn = document.getElementById('switchPopup');
    
    let allLinks = [];
    let allCategories = [];
    let expandedCats = new Set(); 

    const getArrowIcon = () => {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cat-arrow"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const getFaviconUrl = (pageUrl) => {
        try {
            const url = new URL(chrome.runtime.getURL("/_favicon/"));
            url.searchParams.set("pageUrl", pageUrl);
            url.searchParams.set("size", "32");
            return url.toString();
        } catch (e) {
            return '';
        }
    };

    const toggleCat = (id) => {
        const header = document.querySelector(\`.cat-header[data-id="\${id}"]\`);
        if (header) {
            header.classList.toggle('active');
            if (header.classList.contains('active')) {
                expandedCats.add(id);
            } else {
                expandedCats.delete(id);
            }
        }
    };

    container.addEventListener('click', (e) => {
        const header = e.target.closest('.cat-header');
        if (header) {
            toggleCat(header.dataset.id);
        }
    });

    const render = (filter = '') => {
        const q = filter.toLowerCase();
        let html = '';
        let hasContent = false;
        
        const isSearching = q.length > 0;

        allCategories.forEach(cat => {
            const catLinks = allLinks.filter(l => {
                const inCat = l.categoryId === cat.id;
                if (!inCat) return false;
                if (!q) return true;
                return l.title.toLowerCase().includes(q) || 
                       l.url.toLowerCase().includes(q) || 
                       (l.description && l.description.toLowerCase().includes(q));
            });

            if (catLinks.length === 0) return;
            hasContent = true;

            const isOpen = expandedCats.has(cat.id) || isSearching;
            const activeClass = isOpen ? 'active' : '';

            html += \`
            <div class="cat-group">
                <div class="cat-header \${activeClass}" data-id="\${cat.id}">
                    \${getArrowIcon()}
                    <span>\${cat.name}</span>
                </div>
                <div class="cat-links">
            \`;
            
            catLinks.forEach(link => {
                const iconSrc = getFaviconUrl(link.url);
                html += \`
                    <a href="\${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="link-item">
                        <div class="link-icon"><img src="\${escapeHtml(iconSrc)}" /></div>
                        <div class="link-info">
                            <div class="link-title">\${escapeHtml(link.title)}</div>
                        </div>
                    </a>
                \`;
            });

            html += \`</div></div>\`;
        });

        if (!hasContent) {
            container.innerHTML = filter ? '<div class="empty">无搜索结果</div>' : '<div class="empty">暂无数据</div>';
        } else {
            container.innerHTML = html;
        }
    };

    const loadData = async (forceRefresh = false) => {
        try {
            if (!forceRefresh) {
                const cached = await chrome.storage.local.get(CACHE_KEY);
                if (cached[CACHE_KEY]) {
                    const data = cached[CACHE_KEY];
                    allLinks = data.links || [];
                    allCategories = data.categories || [];
                    render(searchInput.value);
                    return;
                }
            }

            refreshBtn.classList.add('rotating');
            container.innerHTML = '<div class="loading">同步数据中...</div>';
            
            const res = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
                headers: {
                    'x-auth-password': CONFIG.password,
                    ...(CONFIG.authTimestamp ? { 'x-auth-issued-at': CONFIG.authTimestamp } : {})
                }
            });
            
            if (!res.ok) throw new Error("Sync failed");
            
            const data = await res.json();
            allLinks = data.links || [];
            allCategories = data.categories || [];
            
            await chrome.storage.local.set({ [CACHE_KEY]: data });
            
            render(searchInput.value);
        } catch (e) {
            container.innerHTML = \`<div class="empty" style="color:#ef4444">加载失败: \${escapeHtml(e.message)}<br>请点击右上角刷新</div>\`;
        } finally {
            refreshBtn.classList.remove('rotating');
        }
    };

    loadData();

    searchInput.addEventListener('input', (e) => render(e.target.value));
    refreshBtn.addEventListener('click', () => loadData(true));
    switchPopupBtn?.addEventListener('click', async () => {
        try {
            await chrome.runtime.sendMessage({ type: 'switch-to-popup' });
            window.close();
        } catch (e) {
            console.error('Switch to popup failed', e);
        }
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'refresh') {
            loadData(true);
        }
    });
});`;

const extPopupHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        :root {
            --bg: #f8fafc;
            --card: rgba(255,255,255,0.88);
            --text: #0f172a;
            --muted: #64748b;
            --line: rgba(148,163,184,0.22);
            --accent: #2563eb;
            --accent-soft: rgba(37,99,235,0.12);
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #020617;
                --card: rgba(15,23,42,0.86);
                --text: #e2e8f0;
                --muted: #94a3b8;
                --line: rgba(148,163,184,0.18);
                --accent: #60a5fa;
                --accent-soft: rgba(96,165,250,0.16);
            }
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 388px; min-width: 388px; max-width: 388px; background:
          radial-gradient(circle at top, rgba(59,130,246,0.16), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,0.4), transparent 40%),
          var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { padding: 14px; }
        .shell { display: flex; flex-direction: column; gap: 12px; max-height: 580px; }
        .hero { padding: 14px; border-radius: 18px; background: var(--card); backdrop-filter: blur(16px); border: 1px solid var(--line); box-shadow: 0 18px 60px rgba(15,23,42,0.10); }
        .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .hero h1 { margin: 0; font-size: 16px; line-height: 1.2; }
        .hero p { margin: 4px 0 0; font-size: 12px; color: var(--muted); }
        .refresh-btn { width: 34px; height: 34px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .refresh-btn:hover { color: var(--accent); border-color: rgba(37,99,235,0.28); background: var(--accent-soft); }
        .rotating { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .search { margin-top: 12px; width: 100%; border: 1px solid var(--line); background: rgba(255,255,255,0.58); color: var(--text); border-radius: 14px; padding: 11px 13px; outline: none; font-size: 13px; }
        @media (prefers-color-scheme: dark) { .search { background: rgba(15,23,42,0.8); } }
        .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 0; }
        .chip { white-space: nowrap; border: 1px solid var(--line); background: transparent; color: var(--muted); border-radius: 999px; padding: 7px 11px; font-size: 12px; cursor: pointer; }
        .chip.active { color: white; background: var(--accent); border-color: transparent; box-shadow: 0 10px 28px rgba(37,99,235,0.25); }
        .results { display: flex; flex-direction: column; gap: 10px; }
        .card { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); text-decoration: none; color: inherit; backdrop-filter: blur(12px); }
        .card:hover { transform: translateY(-1px); border-color: rgba(37,99,235,0.28); box-shadow: 0 14px 34px rgba(37,99,235,0.10); }
        .icon { width: 38px; height: 38px; border-radius: 12px; background: rgba(148,163,184,0.12); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
        .icon img { width: 100%; height: 100%; object-fit: cover; }
        .meta { min-width: 0; flex: 1; }
        .title { font-size: 13px; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .url { margin-top: 3px; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .badge { margin-top: 8px; display: inline-flex; padding: 4px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 11px; }
        .empty { text-align: center; color: var(--muted); padding: 28px 12px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="shell">
        <section class="hero">
            <div class="hero-top">
                <div>
                    <h1>${localSiteSettings.navTitle || 'CloudNav'} 扩展弹窗</h1>
                    <p>点这里能快速搜和存</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="openSidepanel" class="refresh-btn" title="打开侧边栏">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
                    </button>
                    <button id="refresh" class="refresh-btn" title="同步最新数据">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                    </button>
                </div>
            </div>
            <input id="search" class="search" type="text" placeholder="搜标题、网址、描述" autocomplete="off">
        </section>
        <div id="chips" class="chips"></div>
        <div id="content" class="results">
            <div class="empty">初始化中...</div>
        </div>
    </div>
    <script src="popup.js"></script>
</body>
</html>`;

const extPopupJs = `const CONFIG = {
  apiBase: "${domain}",
  password: "${password}",
  authTimestamp: "${localStorage.getItem('lastLoginTime') || ''}"
};
const CACHE_KEY = 'cloudnav_data';

document.addEventListener('DOMContentLoaded', async () => {
    const content = document.getElementById('content');
    const chips = document.getElementById('chips');
    const searchInput = document.getElementById('search');
    const refreshBtn = document.getElementById('refresh');
    const openSidepanelBtn = document.getElementById('openSidepanel');

    let allLinks = [];
    let allCategories = [];
    let activeCategory = 'all';

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const getFaviconUrl = (link) => {
        if (link.icon) return link.icon;
        try {
            const url = new URL(chrome.runtime.getURL('/_favicon/'));
            url.searchParams.set('pageUrl', link.url);
            url.searchParams.set('size', '64');
            return url.toString();
        } catch (e) {
            return '';
        }
    };

    const getHostname = (rawUrl) => {
        try {
            return new URL(rawUrl).hostname.replace(/^www\\./, '');
        } catch (e) {
            return rawUrl;
        }
    };

    const renderChips = () => {
        const fallbackCategories = allCategories.length > 0
            ? allCategories
            : Array.from(new Set(allLinks.map((link) => link.categoryId)))
                .filter(Boolean)
                .map((categoryId) => ({ id: categoryId, name: categoryId }));
        const items = [{ id: 'all', name: '全部' }, ...fallbackCategories];
        chips.innerHTML = items.map((category) => \`
            <button class="chip \${activeCategory === category.id ? 'active' : ''}" data-id="\${category.id}">
                \${escapeHtml(category.name)}
            </button>
        \`).join('');
    };

    const render = () => {
        const query = searchInput.value.trim().toLowerCase();
        const filteredLinks = allLinks.filter((link) => {
            if (activeCategory !== 'all' && link.categoryId !== activeCategory) return false;
            if (!query) return true;
            return link.title.toLowerCase().includes(query) ||
                link.url.toLowerCase().includes(query) ||
                (link.description && link.description.toLowerCase().includes(query));
        });

        if (filteredLinks.length === 0) {
            content.innerHTML = '<div class="empty">这里还没有符合条件的链接</div>';
            return;
        }

        content.innerHTML = filteredLinks.map((link) => {
            const category = allCategories.find((item) => item.id === link.categoryId);
            return \`
                <a class="card" href="\${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
                    <div class="icon"><img src="\${escapeHtml(getFaviconUrl(link))}" alt=""></div>
                    <div class="meta">
                        <div class="title">\${escapeHtml(link.title)}</div>
                        <div class="url">\${escapeHtml(getHostname(link.url))}</div>
                        <div class="badge">\${escapeHtml(category?.name || '未分类')}</div>
                    </div>
                </a>
            \`;
        }).join('');
    };

    searchInput.addEventListener('input', render);
    chips.addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        activeCategory = chip.dataset.id || 'all';
        renderChips();
        render();
    });
    openSidepanelBtn?.addEventListener('click', async () => {
        try {
            const currentWindow = await chrome.windows.getCurrent();
            await chrome.runtime.sendMessage({ type: 'open-sidepanel', windowId: currentWindow.id });
            window.close();
        } catch (e) {
            console.error('Open side panel failed', e);
        }
    });

    const loadData = async (forceRefresh = false) => {
        try {
            if (!forceRefresh) {
                const cached = await chrome.storage.local.get(CACHE_KEY);
                if (cached[CACHE_KEY]) {
                    allLinks = cached[CACHE_KEY].links || [];
                    allCategories = cached[CACHE_KEY].categories || [];
                    renderChips();
                    render();
                    return;
                }
            }

            refreshBtn.classList.add('rotating');
            const res = await fetch(\`\${CONFIG.apiBase}/api/storage\`, {
                headers: {
                    'x-auth-password': CONFIG.password,
                    ...(CONFIG.authTimestamp ? { 'x-auth-issued-at': CONFIG.authTimestamp } : {})
                }
            });
            if (!res.ok) throw new Error('同步失败');

            const data = await res.json();
            allLinks = data.links || [];
            allCategories = data.categories || [];
            await chrome.storage.local.set({ [CACHE_KEY]: data });
            renderChips();
            render();
        } catch (e) {
            content.innerHTML = \`<div class="empty" style="color:#ef4444">加载失败<br>\${escapeHtml(e.message)}</div>\`;
        } finally {
            refreshBtn.classList.remove('rotating');
        }
    };

    refreshBtn.addEventListener('click', () => loadData(true));

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'refresh') {
            loadData(true);
        }
    });

    loadData();
});`;

  const renderCodeBlock = (filename: string, code: string) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
        <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300">{filename}</span>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => handleDownloadFile(filename, code)}
                    className="text-xs flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    title="下载文件"
                >
                    <Download size={12}/>
                    Download
                </button>
                <div className="w-px h-3 bg-slate-300 dark:bg-slate-600"></div>
                <button 
                    onClick={() => handleCopy(code, filename)}
                    className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                >
                    {copiedStates[filename] ? <Check size={12}/> : <Copy size={12}/>}
                    {copiedStates[filename] ? 'Copied' : 'Copy'}
                </button>
            </div>
        </div>
        <div className="bg-slate-900 p-3 overflow-x-auto">
            <pre className="text-[10px] md:text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                {code}
            </pre>
        </div>
    </div>
  );

  const generateIconBlob = async (): Promise<Blob | null> => {
     const iconUrl = localSiteSettings.favicon;
     if (!iconUrl) return null;

     try {
         const img = new Image();
         img.crossOrigin = "anonymous";
         img.src = iconUrl;

         await new Promise((resolve, reject) => {
             img.onload = resolve;
             img.onerror = reject;
         });

         const canvas = document.createElement('canvas');
         canvas.width = 128;
         canvas.height = 128;
         const ctx = canvas.getContext('2d');
         if (!ctx) throw new Error('Canvas error');

         ctx.drawImage(img, 0, 0, 128, 128);

         return new Promise((resolve) => {
             canvas.toBlob((blob) => {
                 resolve(blob);
             }, 'image/png');
         });
     } catch (e) {
         console.error(e);
         return null;
     }
  };

  const handleDownloadIcon = async () => {
    const blob = await generateIconBlob();
    if (!blob) {
        alert("生成图片失败 (可能是跨域限制)。\n\n请尝试右键点击下方的预览图片，选择 '图片另存为...' 保存。");
        return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "icon.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
        const zip = new JSZip();
        
        zip.file("manifest.json", getManifestJson());
        zip.file("background.js", extBackgroundJs);
        zip.file("sidebar.html", extSidebarHtml);
        zip.file("sidebar.js", extSidebarJs);
        zip.file("popup.html", extPopupHtml);
        zip.file("popup.js", extPopupJs);
        
        const iconBlob = await generateIconBlob();
        if (iconBlob) {
            zip.file("icon.png", iconBlob);
        } else {
            console.warn("Could not generate icon for zip");
            zip.file("icon_missing.txt", "Icon generation failed due to CORS. Please save the icon manually.");
        }

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "CloudNav-Ext.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch(e) {
        console.error(e);
        alert("打包下载失败");
    } finally {
        setIsZipping(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'site', label: '网站设置', icon: LayoutTemplate },
    { id: 'ai', label: 'AI 设置', icon: Bot },
    { id: 'tools', label: '扩展工具', icon: Wrench },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 flex max-h-[90vh] flex-col md:flex-row">
        
        <div className="w-full md:w-48 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 flex flex-row md:flex-col p-2 gap-1 overflow-x-auto shrink-0">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                    <tab.icon size={18} />
                    {tab.label}
                </button>
            ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white dark:bg-slate-800">
             <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <h3 className="text-lg font-semibold dark:text-white">设置</h3>
                <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                    <X className="w-5 h-5 dark:text-slate-400" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 pb-12">
                
                {activeTab === 'site' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网页标题 (Title)</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.title}
                                    onChange={(e) => handleSiteChange('title', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">导航栏标题</label>
                                <input 
                                    type="text" 
                                    value={localSiteSettings.navTitle}
                                    onChange={(e) => handleSiteChange('navTitle', e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">网站图标 (Favicon URL)</label>
                                <div className="flex gap-3 items-center">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover rounded-xl"/> : <Globe size={20} className="text-slate-400"/>}
                                    </div>
                                    <input 
                                        type="text" 
                                        value={localSiteSettings.favicon}
                                        onChange={(e) => handleSiteChange('favicon', e.target.value)}
                                        placeholder="https://example.com/favicon.ico"
                                        className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        ref={faviconUploadRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleLocalFaviconUpload}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => faviconUploadRef.current?.click()}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    >
                                        <Upload size={12} />
                                        本地上传
                                    </button>
                                    <p className="text-xs text-slate-500">会直接存成图片数据，不用图床。</p>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">访问时先验密</label>
                                        <p className="text-xs text-slate-500 mt-1">打开后，访问网站就先输密码。关闭后，只有点设置这些操作才验密。</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleSiteChange('requirePasswordOnVisit', !localSiteSettings.requirePasswordOnVisit)}
                                        className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-all duration-200 ${
                                            localSiteSettings.requirePasswordOnVisit
                                              ? 'border-blue-500 bg-blue-600 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]'
                                              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                                        }`}
                                        aria-pressed={localSiteSettings.requirePasswordOnVisit}
                                    >
                                        <span
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                                localSiteSettings.requirePasswordOnVisit ? 'translate-x-7' : 'translate-x-1'
                                            }`}
                                        >
                                            <span className={`h-2.5 w-2.5 rounded-full ${localSiteSettings.requirePasswordOnVisit ? 'bg-blue-600' : 'bg-slate-400'}`} />
                                        </span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">身份验证过期天数</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        min="0"
                                        value={localSiteSettings.passwordExpiryDays}
                                        onChange={(e) => handleSiteChange('passwordExpiryDays', parseInt(e.target.value) || 0)}
                                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">设置为 0 表示永久不退出，默认 7 天后自动退出</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">AI 提供商</label>
                            <select 
                                value={localConfig.provider}
                                onChange={(e) => handleChange('provider', e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="gemini">Google Gemini</option>
                                <option value="openai">OpenAI Compatible (ChatGPT, DeepSeek, Claude...)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                            <div className="relative">
                                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="password" 
                                    value={localConfig.apiKey}
                                    onChange={(e) => handleChange('apiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full pl-10 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Key 仅存储在本地浏览器缓存中，不会发送到我们的服务器。</p>
                        </div>

                        {localConfig.provider === 'openai' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base URL (API 地址)</label>
                                <input 
                                    type="text" 
                                    value={localConfig.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">模型名称 (Model Name)</label>
                            <input 
                                type="text" 
                                value={localConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder={localConfig.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-sm font-semibold mb-2 dark:text-slate-200">批量操作</h4>
                            {isProcessing ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                                        <span>正在生成描述... ({progress.current}/{progress.total})</span>
                                        <button onClick={() => { shouldStopRef.current = true; setIsProcessing(false); }} className="text-red-500 flex items-center gap-1 hover:underline">
                                            <PauseCircle size={12}/> 停止
                                        </button>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    onClick={handleBulkGenerate}
                                    className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-3 py-2 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
                                >
                                    <Sparkles size={16} /> 一键补全所有缺失的描述
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        
                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">1</span>
                                扩展地址
                            </h4>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">API 域名 (自动获取)</label>
                                    <code className="block w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 font-mono truncate">
                                        {domain}
                                    </code>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">2</span>
                                选择浏览器类型
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setBrowserType('chrome')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'chrome' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Chrome / Edge</span>
                                </button>
                                <button 
                                    onClick={() => setBrowserType('firefox')}
                                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${browserType === 'firefox' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white dark:bg-slate-800'}`}
                                >
                                    <span className="font-semibold">Mozilla Firefox</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold">3</span>
                                配置步骤与代码
                            </h4>
                            
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h5 className="font-semibold text-sm mb-3 dark:text-slate-200">
                                    安装指南 ({browserType === 'chrome' ? 'Chrome/Edge' : 'Firefox'} / 双模式插件):
                                </h5>
                                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                                    <li>在电脑上新建文件夹 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">CloudNav-Pro</code>。</li>
                                    <li><strong>[重要]</strong> 将下方图标保存为 <code className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs">icon.png</code>。</li>
                                    <li>获取插件代码文件：
                                        <ul className="list-disc list-inside ml-4 mt-1 space-y-1 text-slate-500">
                                            <li><strong>方式一 (推荐)：</strong>点击下方的 <span className="text-blue-600 dark:text-blue-400 font-bold">"📦 一键下载所有文件"</span> 按钮，解压到该文件夹。</li>
                                            <li><strong>方式二 (备用)：</strong>分别点击下方代码块的 <Download size={12} className="inline"/> 按钮下载或复制 <code className="bg-white dark:bg-slate-900 px-1 rounded">manifest.json</code>, <code className="bg-white dark:bg-slate-900 px-1 rounded">background.js</code> 等文件到该文件夹。</li>
                                        </ul>
                                    </li>
                                    <li>
                                        打开浏览器扩展管理页面 
                                        {browserType === 'chrome' ? (
                                            <> (Chrome: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions</code>)</>
                                        ) : (
                                            <> (Firefox: <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">about:debugging</code>)</>
                                        )}。
                                    </li>
                                    <li className="text-blue-600 font-bold">操作关键点：</li>
                                    <li>1. 开启右上角的 "开发者模式" (Chrome)。</li>
                                    <li>2. 点击 "加载已解压的扩展程序"，选择包含上述文件的文件夹。</li>
                                    <li>3. 前往 <code className="select-all bg-white dark:bg-slate-900 px-1 rounded">chrome://extensions/shortcuts</code>。</li>
                                    <li>4. 点浏览器右上角插件图标，默认先弹出小窗。</li>
                                    <li>5. 在弹窗右上角点侧边栏按钮，就能切到侧边栏。</li>
                                    <li>6. <strong>[重要]</strong> 找到 "打开 CloudNav 弹窗" 和 "打开 CloudNav 侧边栏" 两个快捷键，按你习惯自己设。</li>
                                </ol>
                                
                                <div className="mt-4 mb-4">
                                    <button 
                                        onClick={handleDownloadZip}
                                        disabled={isZipping}
                                        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                                    >
                                        <Package size={20} />
                                        {isZipping ? '打包中...' : '📦 一键下载所有文件 (v7.6 Pro)'}
                                    </button>
                                </div>
                                
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded border border-green-200 dark:border-green-900/50 text-sm space-y-2">
                                    <div className="font-bold flex items-center gap-2"><Zap size={16}/> 当前方案 (双模式):</div>
                                    <ul className="list-disc list-inside text-xs space-y-1">
                                        <li><strong>点扩展图标:</strong> 直接弹出小窗。</li>
                                        <li><strong>弹窗右上角按钮:</strong> 一下切到侧边栏。</li>
                                        <li><strong>网页右键:</strong> 直接展示分类列表 (支持判重警告)。</li>
                                        <li><strong>图标右键:</strong> 同上，统一为级联菜单，直接保存。</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
                                        {localSiteSettings.favicon ? <img src={localSiteSettings.favicon} className="w-full h-full object-cover"/> : <Globe size={24} className="text-slate-400"/>}
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm dark:text-white">插件图标 (icon.png)</div>
                                        <div className="text-xs text-slate-500">请保存此图片为 icon.png</div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleDownloadIcon}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 rounded-lg transition-colors"
                                >
                                    <Download size={16} /> 下载图标
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Sidebar size={18} className="text-purple-500"/> 核心配置
                                </div>
                                {renderCodeBlock('manifest.json', getManifestJson())}
                                {renderCodeBlock('background.js', extBackgroundJs)}
                                
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Keyboard size={18} className="text-green-500"/> 扩展弹窗界面
                                </div>
                                {renderCodeBlock('popup.html', extPopupHtml)}
                                {renderCodeBlock('popup.js', extPopupJs)}

                                <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200 pt-2 border-t border-slate-100 dark:border-slate-700">
                                    <Sidebar size={18} className="text-purple-500"/> 侧边栏界面
                                </div>
                                {renderCodeBlock('sidebar.html', extSidebarHtml)}
                                {renderCodeBlock('sidebar.js', extSidebarJs)}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-slate-800/50 shrink-0">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Save size={18} /> 保存更改
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
