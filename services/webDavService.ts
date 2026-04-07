
import { Category, LinkItem, WebDavConfig, SearchConfig, AIConfig } from "../types";

type BackupPayload = {
    links: LinkItem[],
    categories: Category[],
    searchConfig?: SearchConfig,
    aiConfig?: AIConfig,
    webDavConfig?: WebDavConfig
};

// Helper to call our Cloudflare Proxy
// This solves the CORS issue by delegating the request to the backend
const callWebDavProxy = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any, filename?: string) => {
    try {
        const authToken = localStorage.getItem('cloudnav_auth_token');
        const authIssuedAt = localStorage.getItem('lastLoginTime');
        const response = await fetch('/api/webdav', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'x-auth-password': authToken } : {}),
                ...(authIssuedAt ? { 'x-auth-issued-at': authIssuedAt } : {}),
            },
            body: JSON.stringify({
                operation,
                config,
                payload,
                filename
            })
        });
        
        if (!response.ok) {
            console.error(`WebDAV Proxy Error: ${response.status}`);
            return null;
        }
        
        return await response.json();
    } catch (e) {
        console.error("WebDAV Proxy Network Error", e);
        return null;
    }
}

export const checkWebDavConnection = async (config: WebDavConfig): Promise<boolean> => {
    if (!config.url || !config.username || !config.password) return false;
    const result = await callWebDavProxy('check', config);
    return result?.success === true;
};

export const uploadBackup = async (config: WebDavConfig, data: BackupPayload): Promise<boolean> => {
    const result = await callWebDavProxy('upload', config, data);
    return result?.success === true;
};

export const uploadBackupWithTimestamp = async (config: WebDavConfig, data: BackupPayload): Promise<{ success: boolean; filename: string }> => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
    const filename = `cloudnav_backup_${timestamp}.json`;
    const result = await callWebDavProxy('upload', config, data, filename);
    return { success: result?.success === true, filename };
};

export const downloadBackup = async (config: WebDavConfig): Promise<BackupPayload | null> => {
    const result = await callWebDavProxy('download', config);
    
    // Check if the result looks like valid backup data
    if (result && Array.isArray(result.links) && Array.isArray(result.categories)) {
        return result as BackupPayload;
    }
    return null;
};
