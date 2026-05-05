'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LogIn, LogOut, Settings, Share2, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import type { PublicUser, RolePermissions } from '@/lib/types/auth';

type AuthMode = 'login' | 'register';

export function AuthControls({ showPublish = true }: { readonly showPublish?: boolean }) {
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);

  const loadMe = async () => {
    const res = await fetch('/api/auth/me');
    const data = (await res.json()) as {
      user: PublicUser | null;
      permissions?: RolePermissions;
    };
    setUser(data.user);
    setPermissions(data.permissions || null);
  };

  useEffect(() => {
    loadMe().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!stage?.id) return;
    fetch(`/api/classroom?id=${encodeURIComponent(stage.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.classroom) setPublished(!!data.classroom.published);
      })
      .catch(() => undefined);
  }, [stage?.id]);

  const handleAuth = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        user?: PublicUser;
        permissions?: RolePermissions;
      };
      if (!res.ok || !data.success) throw new Error(data.error || '登录失败');
      setUser(data.user || null);
      setPermissions(data.permissions || null);
      window.dispatchEvent(new CustomEvent('openmaic-auth-changed'));
      setAuthOpen(false);
      setPassword('');
      toast.success(authMode === 'login' ? '已登录' : '注册成功');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setPermissions(null);
    window.dispatchEvent(new CustomEvent('openmaic-auth-changed'));
    toast.success('已退出');
  };

  const handlePublish = async () => {
    if (!user) {
      setAuthMode('login');
      setAuthOpen(true);
      return;
    }
    if (!stage || scenes.length === 0) {
      toast.error('当前课堂还没有可发布内容');
      return;
    }

    const toastId = toast.loading(published ? '正在下架作品' : '正在发布作品');
    setBusy(true);
    try {
      const saveRes = await fetch('/api/classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, scenes }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) throw new Error(saveData.error || '保存作品失败');

      const publishRes = await fetch('/api/classroom/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: saveData.id, published: !published }),
      });
      const publishData = await publishRes.json();
      if (!publishRes.ok || !publishData.success) {
        throw new Error(publishData.error || '发布状态更新失败');
      }

      setPublished(!published);
      toast.success(published ? '作品已下架' : '作品已发布', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布失败', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {showPublish && user && permissions?.canPublish && (
        <button
          onClick={handlePublish}
          disabled={busy || !stage}
          className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all disabled:opacity-50"
          title={published ? '下架作品' : '发布作品'}
        >
          <Share2 className="w-4 h-4" />
        </button>
      )}

      {user ? (
        <button
          onClick={handleLogout}
          className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          title={`${user.name}（${user.role === 'admin' ? '管理员' : '用户'}）`}
        >
          {user.role === 'admin' ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
        </button>
      ) : (
        <button
          onClick={() => {
            setAuthMode('login');
            setAuthOpen(true);
          }}
          className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          title="登录"
        >
          <LogIn className="w-4 h-4" />
        </button>
      )}

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {authMode === 'login' ? (
                <LogIn className="size-4" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {authMode === 'login' ? '登录' : '注册'}
            </DialogTitle>
            <DialogDescription>首个注册账号会自动成为管理员。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {authMode === 'register' && (
              <div className="space-y-1.5">
                <Label>昵称</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            >
              {authMode === 'login' ? '没有账号，去注册' : '已有账号，去登录'}
            </button>
          </div>
          <DialogFooter>
            <Button onClick={handleAuth} disabled={busy}>
              {authMode === 'login' ? '登录' : '注册'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminSettingsButton() {
  const [adminOpen, setAdminOpen] = useState(false);

  const handleClick = async () => {
    const res = await fetch('/api/auth/me');
    const data = (await res.json().catch(() => null)) as { user?: PublicUser | null } | null;
    const user = data?.user || null;
    if (!user) {
      toast.error('请先登录管理员账号');
      return;
    }
    if (user.role !== 'admin') {
      toast.error('需要管理员权限');
      return;
    }
    setAdminOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
        title="管理员模型配置"
      >
        <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
      </button>
      <AdminProviderDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </>
  );
}

export function AdminProviderDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const fetchServerProviders = useSettingsStore((s) => s.fetchServerProviders);
  const [llmProvider, setLlmProvider] = useState('deepseek');
  const [llmModel, setLlmModel] = useState('deepseek-v4-flash');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.deepseek.com/v1');
  const [llmKey, setLlmKey] = useState('');
  const [ttsProvider, setTtsProvider] = useState('qwen-tts');
  const [ttsModel, setTtsModel] = useState('qwen3-tts-flash');
  const [ttsBaseUrl, setTtsBaseUrl] = useState('https://dashscope.aliyuncs.com/api/v1');
  const [ttsKey, setTtsKey] = useState('');
  const [saving, setSaving] = useState(false);

  const saveEntry = async (
    section: 'providers' | 'tts',
    providerId: string,
    config: { apiKey?: string; baseUrl?: string; models?: string[] },
  ) => {
    const res = await fetch('/api/admin/provider-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, providerId, config }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (llmProvider) {
        await saveEntry('providers', llmProvider, {
          apiKey: llmKey || undefined,
          baseUrl: llmBaseUrl || undefined,
          models: llmModel ? [llmModel] : undefined,
        });
      }
      if (ttsProvider) {
        await saveEntry('tts', ttsProvider, {
          apiKey: ttsKey || undefined,
          baseUrl: ttsBaseUrl || undefined,
          models: ttsModel ? [ttsModel] : undefined,
        });
      }
      await fetchServerProviders();
      toast.success('服务端模型配置已更新');
      onOpenChange(false);
      setLlmKey('');
      setTtsKey('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>管理员模型配置</DialogTitle>
          <DialogDescription>配置会保存在服务端，API Key 不会下发给普通用户。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="font-medium">LLM</div>
            <Label>Provider ID</Label>
            <Input value={llmProvider} onChange={(event) => setLlmProvider(event.target.value)} />
            <Label>模型</Label>
            <Input value={llmModel} onChange={(event) => setLlmModel(event.target.value)} />
            <Label>Base URL</Label>
            <Input value={llmBaseUrl} onChange={(event) => setLlmBaseUrl(event.target.value)} />
            <Label>API Key</Label>
            <Input
              type="password"
              value={llmKey}
              placeholder="留空则保留原 Key"
              onChange={(event) => setLlmKey(event.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div className="font-medium">配音</div>
            <Label>Provider ID</Label>
            <Input value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value)} />
            <Label>模型</Label>
            <Input value={ttsModel} onChange={(event) => setTtsModel(event.target.value)} />
            <Label>Base URL</Label>
            <Input value={ttsBaseUrl} onChange={(event) => setTtsBaseUrl(event.target.value)} />
            <Label>API Key</Label>
            <Input
              type="password"
              value={ttsKey}
              placeholder="留空则保留原 Key"
              onChange={(event) => setTtsKey(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
